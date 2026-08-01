/**
 * Loads the monitored cohort out of FHIR and runs triage over it.
 *
 * Triage runs client-side here. Tier 3 moves the identical `triage()` call into
 * a Medplum Bot that writes a RiskAssessment; the function does not change, only
 * where it runs.
 */

import type { MedplumClient } from '@medplum/core';
import type { Observation, Patient, QuestionnaireResponse } from '@medplum/fhirtypes';
import { explainTriage, type RiskTier, type TriageResult, type TriageTier, type Vitals } from '../clinical/triage';
import { unknownFeatures, type SymptomFeatures } from '../voice/features';
import { getTranscript, toSymptomFeatures } from './checkin';
import { SENTINEL_IDENTIFIER_SYSTEM } from './codes';
import { getDayPostInfusion, getPatientName, getRiskTier } from './patient';
import { toVitals } from './vitals';

export interface CohortEntry {
  patient: Patient;
  name: string;
  dayPostInfusion?: number;
  riskTier: RiskTier;
  vitals: Vitals;
  features: SymptomFeatures;
  transcript?: string;
  lastCheckIn?: string;
  result: TriageResult;
  /** Most recent first — feed to toVitalsSeries() for the charts. */
  observations: Observation[];
}

const TIER_RANK: Record<TriageTier, number> = { EMERGENT: 0, URGENT: 1, ROUTINE: 2 };

/** Worst first — that is the entire point of the board. */
function byUrgency(a: CohortEntry, b: CohortEntry): number {
  const byTier = TIER_RANK[a.result.tier] - TIER_RANK[b.result.tier];
  if (byTier !== 0) {
    return byTier;
  }
  // Within a tier, more corroborating findings first, then alphabetically so
  // the board doesn't reshuffle on every refresh.
  const byReasons = b.result.reasons.length - a.result.reasons.length;
  return byReasons !== 0 ? byReasons : a.name.localeCompare(b.name);
}

async function loadEntry(medplum: MedplumClient, patient: Patient, observationCount = 60): Promise<CohortEntry> {
  const [observations, responses] = await Promise.all([
    medplum.searchResources('Observation', {
      subject: `Patient/${patient.id}`,
      _sort: '-date',
      _count: observationCount,
    }) as Promise<Observation[]>,
    medplum.searchResources('QuestionnaireResponse', {
      subject: `Patient/${patient.id}`,
      _sort: '-authored',
      _count: 1,
    }) as Promise<QuestionnaireResponse[]>,
  ]);

  const checkIn = responses[0];
  // No check-in yet means every symptom is 'unknown' — not 'absent'. The rules
  // will simply have nothing to escalate on, which is the honest answer.
  const features = checkIn ? toSymptomFeatures(checkIn) : unknownFeatures();
  const vitals = toVitals(observations);
  const riskTier = getRiskTier(patient);

  return {
    patient,
    name: getPatientName(patient),
    dayPostInfusion: getDayPostInfusion(patient),
    riskTier,
    vitals,
    features,
    transcript: checkIn ? getTranscript(checkIn) : undefined,
    lastCheckIn: checkIn?.authored,
    result: explainTriage(features, vitals, riskTier),
    observations,
  };
}

/** One patient, with the whole simulated stream for plotting. */
export async function loadPatientDetail(medplum: MedplumClient, patientId: string): Promise<CohortEntry> {
  const patient = await medplum.readResource('Patient', patientId);
  return loadEntry(medplum, patient, 400);
}

/** Every patient enrolled in Sentinel, triaged, worst first. */
export async function loadCohort(medplum: MedplumClient): Promise<CohortEntry[]> {
  const patients = await medplum.searchResources('Patient', {
    identifier: `${SENTINEL_IDENTIFIER_SYSTEM}|`,
    _count: 50,
  });

  const entries = await Promise.all(patients.map((patient) => loadEntry(medplum, patient)));
  return entries.sort(byUrgency);
}
