/**
 * The FHIR resources the agent writes. Pure builders — no client, no network —
 * so they can be unit-tested and so the Bot and the browser produce byte-for-
 * byte identical output.
 */

import type { Communication, Flag, Patient, Reference, RiskAssessment, Task } from '@medplum/fhirtypes';
import type { TriageResult, TriageTier } from '../clinical/triage';
import { AUTHORING_LABEL, AUTHORING_METHOD } from './handover';
import {
  ESCALATION_PRACTITIONER_ID,
  SENTINEL_CHECK_IN_REQUEST,
  SENTINEL_CODE_SYSTEM,
  SENTINEL_ESCALATION_FLAG,
  SENTINEL_ESCALATION_REVIEW,
  SENTINEL_HANDOVER_NOTE,
  SENTINEL_IDENTIFIER_SYSTEM,
  SENTINEL_TRIAGE_METHOD,
} from '../fhir/codes';

const practitioner = { reference: `Practitioner/${ESCALATION_PRACTITIONER_ID}` };

/** EMERGENT needs a person now; URGENT needs one today. */
function taskPriority(tier: TriageTier): Task['priority'] {
  return tier === 'EMERGENT' ? 'stat' : 'urgent';
}

/**
 * The computed tier, as a RiskAssessment. This is the agent's primary output —
 * every run writes one, escalation or not, so the record shows what the agent
 * thought at every point rather than only when it acted.
 */
export function buildRiskAssessment(
  subject: Reference<Patient>,
  result: TriageResult,
  occurrenceDateTime: string
): RiskAssessment {
  return {
    resourceType: 'RiskAssessment',
    status: 'final',
    subject,
    occurrenceDateTime,
    method: {
      coding: [{ system: SENTINEL_CODE_SYSTEM, code: SENTINEL_TRIAGE_METHOD, display: 'Sentinel deterministic triage' }],
      text: 'Sentinel deterministic triage (ASTCT-derived)',
    },
    prediction: [
      {
        outcome: { text: 'CAR-T toxicity requiring escalation' },
        qualitativeRisk: {
          coding: [{ system: SENTINEL_CODE_SYSTEM, code: result.tier, display: result.tier }],
          text: result.tier,
        },
      },
    ],
    // The audit trail travels with the assessment, so the reasoning is on the
    // record rather than only on our screen.
    note: result.reasons.map((reason) => ({ text: `[${reason.tier}] ${reason.detail}` })),
  };
}

/** A visible marker on the patient's chart. */
export function buildEscalationFlag(
  subject: Reference<Patient>,
  result: TriageResult,
  now: string
): Flag {
  return {
    resourceType: 'Flag',
    status: 'active',
    category: [{ coding: [{ system: SENTINEL_CODE_SYSTEM, code: SENTINEL_ESCALATION_FLAG }], text: 'Sentinel' }],
    code: {
      text: `${result.tier} — ${result.reasons.find((reason) => reason.tier === result.tier)?.detail ?? 'escalation'}`,
    },
    subject,
    period: { start: now },
    author: practitioner,
  };
}

/**
 * The escalation, as work assigned to a named clinician.
 *
 * This is the resource that answers the "yet another dashboard" objection: it's
 * a native FHIR Task, so it lands in whatever worklist the on-call nurse
 * already uses. Our board is a convenience, not the product.
 */
export function buildEscalationTask(
  subject: Reference<Patient>,
  result: TriageResult,
  previousTier: TriageTier | undefined,
  now: string
): Task {
  const transition = previousTier ? `${previousTier} → ${result.tier}` : result.tier;

  return {
    resourceType: 'Task',
    status: 'requested',
    intent: 'order',
    priority: taskPriority(result.tier),
    code: {
      coding: [{ system: SENTINEL_CODE_SYSTEM, code: SENTINEL_ESCALATION_REVIEW }],
      text: 'Review Sentinel escalation',
    },
    for: subject,
    owner: practitioner,
    authoredOn: now,
    description: `${transition}. ${result.reasons
      .filter((reason) => reason.tier !== 'ROUTINE')
      .map((reason) => reason.detail)
      .join('; ')}`,
  };
}

/**
 * The agent asking the patient for an off-schedule check-in.
 *
 * `status: 'requested'` and `owner` pointing at the PATIENT rather than a
 * clinician — this is work for them, and it's what the patient app polls for.
 */
export function buildCheckInRequestTask(
  subject: Reference<Patient>,
  reason: string,
  now: string
): Task {
  return {
    resourceType: 'Task',
    status: 'requested',
    intent: 'proposal',
    priority: 'urgent',
    code: {
      coding: [{ system: SENTINEL_CODE_SYSTEM, code: SENTINEL_CHECK_IN_REQUEST }],
      text: 'Check-in requested by care team',
    },
    for: subject,
    owner: subject,
    authoredOn: now,
    description: reason,
    identifier: [{ system: SENTINEL_IDENTIFIER_SYSTEM, value: `checkin-request-${Date.now()}` }],
  };
}

/** The handover note, addressed to the clinician who owns the escalation. */
export function buildHandoverCommunication(
  subject: Reference<Patient>,
  note: string,
  now: string
): Communication {
  return {
    resourceType: 'Communication',
    status: 'completed',
    category: [
      {
        coding: [{ system: SENTINEL_CODE_SYSTEM, code: SENTINEL_HANDOVER_NOTE }],
        text: AUTHORING_LABEL[AUTHORING_METHOD],
      },
    ],
    subject,
    recipient: [practitioner],
    sent: now,
    // The provenance label leads the payload, so it is impossible to read the
    // note without reading how it was produced.
    payload: [{ contentString: `${AUTHORING_LABEL[AUTHORING_METHOD]}.\n\n${note}` }],
  };
}
