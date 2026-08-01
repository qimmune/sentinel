/**
 * The agent loop.
 *
 * One module, two homes: it runs client-side today (guaranteed to work, no
 * deployment step) and it is the body of the Medplum Bot in src/bots/. Sharing
 * the module rather than copying it is the point — the clinical logic must
 * never fork between where it runs and where it's tested.
 *
 * Per patient, per run:
 *   1. read the last 24h of Observations and the latest check-in
 *   2. run triage() — the same function the tests pin
 *   3. write a RiskAssessment, every time, escalation or not
 *   4. if the tier got worse, raise a Flag + a Task owned by a real clinician,
 *      and attach a handover note
 *   5. if the vitals are drifting, ask the patient for an off-schedule check-in
 *
 * Step 4's note is composed AFTER step 2 has decided, and is never an input to
 * it. See handover.ts.
 */

import type { MedplumClient } from '@medplum/core';
import type { Observation, Patient, QuestionnaireResponse, Reference, RiskAssessment, Task } from '@medplum/fhirtypes';
import { explainTriage, type TriageResult, type TriageTier } from '../clinical/triage';
import { getTranscript, toSymptomFeatures } from '../fhir/checkin';
import { SENTINEL_CHECK_IN_REQUEST, SENTINEL_CODE_SYSTEM } from '../fhir/codes';
import { getDayPostInfusion, getPatientName, getRiskTier } from '../fhir/patient';
import { SENTINEL_IDENTIFIER_SYSTEM } from '../fhir/codes';
import { detectVitalsDrift, toVitals, toVitalsSeries, type DriftResult } from '../fhir/vitals';
import { unknownFeatures } from '../voice/features';
import { composeHandoverNote } from './handover';
import {
  buildCheckInRequestTask,
  buildEscalationFlag,
  buildEscalationTask,
  buildHandoverCommunication,
  buildRiskAssessment,
} from './resources';

const RANK: Record<TriageTier, number> = { ROUTINE: 0, URGENT: 1, EMERGENT: 2 };

export interface AgentOutcome {
  patientId: string;
  name: string;
  tier: TriageTier;
  previousTier?: TriageTier;
  worsened: boolean;
  drift: DriftResult;
  /** A check-in request was raised on this run. */
  checkInRequested: boolean;
  /** An escalation Flag + Task was raised on this run. */
  escalated: boolean;
  note?: string;
}

/**
 * Did this get worse?
 *
 * With no prior assessment, anything above ROUTINE counts as worsening — a
 * patient who is already EMERGENT the first time the agent sees them still
 * needs a human, and "no history" is not a reason to stay quiet.
 */
export function hasWorsened(previous: TriageTier | undefined, current: TriageTier): boolean {
  return previous === undefined ? current !== 'ROUTINE' : RANK[current] > RANK[previous];
}

/** The tier recorded on a RiskAssessment, if it was one of ours. */
export function tierFromRiskAssessment(assessment: RiskAssessment | undefined): TriageTier | undefined {
  const code = assessment?.prediction?.[0]?.qualitativeRisk?.coding?.find(
    (coding) => coding.system === SENTINEL_CODE_SYSTEM
  )?.code;
  return code && code in RANK ? (code as TriageTier) : undefined;
}

/** Is there already an open check-in request, so we don't ring twice? */
async function hasOpenCheckInRequest(medplum: MedplumClient, patientId: string): Promise<boolean> {
  // `patient`, not `for`. FHIR R4 defines Task.for's search parameters as
  // `patient` (Task.for where it resolves to a Patient) and `subject`; there is
  // no `for` parameter, and Medplum rejects it outright.
  const open = await medplum.searchResources('Task', {
    patient: `Patient/${patientId}`,
    status: 'requested,in-progress',
    _count: 10,
  });
  return open.some((task) =>
    task.code?.coding?.some(
      (coding) => coding.system === SENTINEL_CODE_SYSTEM && coding.code === SENTINEL_CHECK_IN_REQUEST
    )
  );
}

/** Run the agent over one patient. */
export async function runAgentForPatient(medplum: MedplumClient, patient: Patient): Promise<AgentOutcome> {
  const patientId = patient.id as string;
  const subject: Reference<Patient> = { reference: `Patient/${patientId}` };
  const now = new Date().toISOString();

  const [observations, responses, priorAssessments] = await Promise.all([
    medplum.searchResources('Observation', {
      subject: `Patient/${patientId}`,
      _sort: '-date',
      _count: 400,
    }) as Promise<Observation[]>,
    medplum.searchResources('QuestionnaireResponse', {
      subject: `Patient/${patientId}`,
      _sort: '-authored',
      _count: 1,
    }) as Promise<QuestionnaireResponse[]>,
    medplum.searchResources('RiskAssessment', {
      subject: `Patient/${patientId}`,
      _sort: '-date',
      _count: 1,
    }) as Promise<RiskAssessment[]>,
  ]);

  const checkIn = responses[0];
  const features = checkIn ? toSymptomFeatures(checkIn) : unknownFeatures();
  const vitals = toVitals(observations);
  const riskTier = getRiskTier(patient);
  const result: TriageResult = explainTriage(features, vitals, riskTier);

  const previousTier = tierFromRiskAssessment(priorAssessments[0]);
  const worsened = hasWorsened(previousTier, result.tier);
  const drift = detectVitalsDrift(observations);

  // 3 — always record what the agent concluded.
  await medplum.createResource(buildRiskAssessment(subject, result, now));

  let note: string | undefined;
  let escalated = false;

  // 4 — escalate to a human, with the note attached.
  if (worsened) {
    const series = toVitalsSeries(observations);
    note = composeHandoverNote({
      patientName: getPatientName(patient),
      dayPostInfusion: getDayPostInfusion(patient),
      riskTier,
      result,
      drift,
      temperature: series.temperature,
      heartRate: series.heartRate,
      transcript: checkIn ? getTranscript(checkIn) : undefined,
    });

    await medplum.createResource(buildEscalationFlag(subject, result, now));
    await medplum.createResource(buildEscalationTask(subject, result, previousTier, now));
    await medplum.createResource(buildHandoverCommunication(subject, note, now));
    escalated = true;
  }

  // 5 — the money feature: decide to ask, rather than wait for tomorrow.
  let checkInRequested = false;
  if (drift.drifting && !(await hasOpenCheckInRequest(medplum, patientId))) {
    const reason =
      `Temperature up ${drift.tempRiseC?.toFixed(1)} °C and heart rate up ` +
      `${Math.round(drift.heartRateRiseBpm ?? 0)} bpm over ${drift.windowHours} hours.`;
    await medplum.createResource(buildCheckInRequestTask(subject, reason, now));
    checkInRequested = true;
  }

  return {
    patientId,
    name: getPatientName(patient),
    tier: result.tier,
    previousTier,
    worsened,
    drift,
    checkInRequested,
    escalated,
    note,
  };
}

/** Run the agent over the whole monitored cohort. */
export async function runAgent(medplum: MedplumClient): Promise<AgentOutcome[]> {
  const patients = await medplum.searchResources('Patient', {
    identifier: `${SENTINEL_IDENTIFIER_SYSTEM}|`,
    _count: 50,
  });

  const outcomes: AgentOutcome[] = [];
  // Sequential: these are writes, and Medplum aborts concurrent conditional
  // work at SERIALIZABLE isolation. Five patients, so this costs nothing.
  for (const patient of patients) {
    outcomes.push(await runAgentForPatient(medplum, patient));
  }
  return outcomes;
}

/** The open check-in request for a patient, if the agent has raised one. */
export async function findCheckInRequest(medplum: MedplumClient, patientId: string): Promise<Task | undefined> {
  const tasks = await medplum.searchResources('Task', {
    patient: `Patient/${patientId}`,
    status: 'requested',
    _count: 10,
  });
  return tasks.find((task) =>
    task.code?.coding?.some(
      (coding) => coding.system === SENTINEL_CODE_SYSTEM && coding.code === SENTINEL_CHECK_IN_REQUEST
    )
  );
}
