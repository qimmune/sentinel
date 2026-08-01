/**
 * Writes the synthetic cohort into Medplum as real FHIR.
 *
 * Runs from the browser against the signed-in session rather than as a Node
 * script: MEDPLUM_CLIENT_ID is intentionally blank (email/password sign-in), so
 * there are no client credentials for a headless script to use.
 *
 * WRITE STRATEGY — this bit is load-bearing, don't "optimise" it back
 * ------------------------------------------------------------------
 * Medplum runs *conditional* writes (upsert / conditional update) at
 * SERIALIZABLE isolation, because they have to search before they write. Fire a
 * batch of those concurrently against the same search index and Postgres aborts
 * one of them with "could not serialize access due to read/write dependencies
 * among transactions".
 *
 * So: conditional upserts are used only for the handful of resources that need
 * identity (the Questionnaire and the five Patients), strictly one at a time.
 * The couple of hundred Observations are purged and then written with plain
 * creates, which take no read dependency and can safely run concurrently.
 */

import type { MedplumClient } from '@medplum/core';
import { normalizeErrorString } from '@medplum/core';
import type { Patient, Reference, Resource } from '@medplum/fhirtypes';
import { buildCheckInResponse, symptomQuestionnaire } from './checkin';
import { EXT_INFUSION_DATE, EXT_RISK_TIER, SENTINEL_IDENTIFIER_SYSTEM, SYMPTOM_QUESTIONNAIRE_URL } from './codes';
import { SEED_PATIENTS, type SeedPatient } from './seedData';
import { generateVitalsStream } from './simulatedStream';
import { buildAntipyreticObservation, buildQuantityObservations } from './vitals';

/** Concurrency for the unconditional writes. Polite, not heroic. */
const WRITE_CONCURRENCY = 5;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Postgres serialization failure. Transient by definition — the fix is to try
 * again, not to change the data.
 */
function isSerializationFailure(error: unknown): boolean {
  return normalizeErrorString(error).includes('could not serialize access');
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isSerializationFailure(error)) {
        throw error;
      }
      await delay(120 * 2 ** attempt);
    }
  }
  throw lastError;
}

/** Run `fn` over every item, at most `limit` in flight. */
async function pooled<T>(items: T[], limit: number, fn: (item: T) => Promise<unknown>): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      await withRetry(() => fn(item));
    }
  });
  await Promise.all(workers);
}

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

function buildPatient(seed: SeedPatient): Patient {
  return {
    resourceType: 'Patient',
    identifier: [{ system: SENTINEL_IDENTIFIER_SYSTEM, value: seed.key }],
    name: [{ given: [seed.given], family: seed.family }],
    gender: seed.gender,
    birthDate: seed.birthDate,
    address: [{ city: seed.city, state: 'CA', country: 'US' }],
    extension: [
      { url: EXT_RISK_TIER, valueCode: seed.riskTier },
      { url: EXT_INFUSION_DATE, valueDate: isoDaysAgo(seed.dayPostInfusion) },
    ],
  };
}

/**
 * Everything one seed patient turns into, as plain FHIR: the full 24-hour
 * simulated stream, the antipyretic flag, and the check-in.
 *
 * Pure — no client, no network — so the tests can run the whole
 * seed -> read -> triage path without a server.
 */
export function buildSeedResources(seed: SeedPatient, subject: Reference<Patient>): Resource[] {
  const stream = generateVitalsStream(seed.key, seed.keyframes);

  const observations = stream.flatMap((sample) =>
    buildQuantityObservations(subject, sample, isoHoursAgo(sample.hoursAgo), `${seed.key}-h${sample.hoursAgo}`)
  );

  return [
    ...observations,
    buildAntipyreticObservation(subject, seed.antipyreticOrTociWithin6h, isoHoursAgo(0), `${seed.key}-now`),
    buildCheckInResponse(subject, seed.features, isoHoursAgo(0), seed.transcript, `${seed.key}-checkin`),
  ];
}

/** Remove the data a previous seed wrote for this patient. Ours only. */
async function purgeSeededData(medplum: MedplumClient, patientId: string): Promise<void> {
  const [observations, responses] = await Promise.all([
    medplum.searchResources('Observation', {
      subject: `Patient/${patientId}`,
      identifier: `${SENTINEL_IDENTIFIER_SYSTEM}|`,
      _count: 1000,
    }),
    medplum.searchResources('QuestionnaireResponse', {
      subject: `Patient/${patientId}`,
      identifier: `${SENTINEL_IDENTIFIER_SYSTEM}|`,
      _count: 100,
    }),
  ]);

  const stale = [...observations, ...responses];
  // Deleting by id takes no read dependency, so this is safe to run pooled.
  await pooled(stale, WRITE_CONCURRENCY, (resource) =>
    medplum.deleteResource(resource.resourceType, resource.id as string)
  );
}

export interface SeedProgress {
  message: string;
  done: number;
  total: number;
}

/**
 * Seed (or re-seed) the demo cohort.
 *
 * @param medplum - an authenticated client
 * @param onProgress - called as each patient lands, for the UI
 * @returns the created patients
 */
export async function seedDemoData(
  medplum: MedplumClient,
  onProgress?: (progress: SeedProgress) => void
): Promise<Patient[]> {
  const total = SEED_PATIENTS.length + 1;
  let done = 0;

  const report = (message: string): void => onProgress?.({ message, done, total });

  report('Creating the check-in questionnaire…');
  await withRetry(() => medplum.upsertResource(symptomQuestionnaire, { url: SYMPTOM_QUESTIONNAIRE_URL }));
  done++;

  const patients: Patient[] = [];

  // One patient at a time. The conditional upsert below is the exact operation
  // that cannot safely run concurrently.
  for (const seed of SEED_PATIENTS) {
    report(`Seeding ${seed.given} ${seed.family}…`);

    const patient = await withRetry(() =>
      medplum.upsertResource(buildPatient(seed), {
        identifier: `${SENTINEL_IDENTIFIER_SYSTEM}|${seed.key}`,
      })
    );
    const subject: Reference<Patient> = { reference: `Patient/${patient.id}` };

    await purgeSeededData(medplum, patient.id as string);

    const resources = buildSeedResources(seed, subject);
    report(`Writing ${resources.length} resources for ${seed.given} ${seed.family}…`);
    await pooled(resources, WRITE_CONCURRENCY, (resource) => medplum.createResource(resource));

    patients.push(patient);
    done++;
    report(`Seeded ${seed.given} ${seed.family}`);
  }

  report('Done');
  return patients;
}

/** Have we already seeded? Used to decide whether to offer the button. */
export async function countSeededPatients(medplum: MedplumClient): Promise<number> {
  const results = await medplum.searchResources('Patient', {
    identifier: `${SENTINEL_IDENTIFIER_SYSTEM}|`,
    _count: 20,
  });
  return results.length;
}
