/**
 * The Medplum Bot.
 *
 * This is the SAME agent that runs client-side — it imports `runAgentForPatient`
 * rather than reimplementing it, so the clinical logic can never drift between
 * the two. Only the trigger differs.
 *
 * DEPLOYING THIS (your team, not the demo)
 * ----------------------------------------
 * 1. Bots must be enabled on the Medplum project. They are OFF by default on
 *    hosted accounts — contact info@medplum.com. Nothing below works until then.
 * 2. Bundle to a single file:  npm run build:bot
 *    Output: dist/bot/triageBot.js. `@medplum/core` stays external — the Medplum
 *    bot layer provides it.
 * 3. In app.medplum.com → Project Admin → "Create new Bot". Do NOT attach an
 *    AccessPolicy: Bots get read/write on all resources by default, and this one
 *    needs to search each patient's historical Observations. An AccessPolicy
 *    would take that access away, not grant it. A `forbidden` OperationOutcome
 *    means something restricted it.
 * 4. Paste the bundle into the Bot's Editor tab, Save, then Deploy.
 * 5. Create a Subscription to fire it:
 *      {
 *        "resourceType": "Subscription",
 *        "status": "active",
 *        "reason": "Sentinel triage on new vitals",
 *        "criteria": "Observation",
 *        "channel": { "type": "rest-hook", "endpoint": "Bot/<the-bot-id>" }
 *      }
 *    Add a second one with "criteria": "QuestionnaireResponse" so a completed
 *    check-in re-triages too.
 *
 * Until that is done, the identical logic runs from the browser and the demo is
 * unchanged. That is a deliberate fallback, not an accident — see CLAUDE.md.
 */

import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Observation, Patient, QuestionnaireResponse } from '@medplum/fhirtypes';
import { runAgentForPatient, type AgentOutcome } from '../agent/agent';

type TriggerResource = Observation | QuestionnaireResponse;

/** Pull the patient reference off whichever resource woke us up. */
function patientIdFrom(resource: TriggerResource | undefined): string | undefined {
  const reference = resource?.subject?.reference;
  return reference?.startsWith('Patient/') ? reference.slice('Patient/'.length) : undefined;
}

export async function handler(
  medplum: MedplumClient,
  event: BotEvent<TriggerResource>
): Promise<AgentOutcome | undefined> {
  const patientId = patientIdFrom(event.input);
  if (!patientId) {
    // Not a patient-scoped resource. Nothing to do, and not an error.
    return undefined;
  }

  const patient = await medplum.readResource('Patient', patientId);
  const outcome = await runAgentForPatient(medplum, patient as Patient);

  console.log(
    `[Sentinel] ${outcome.name}: ${outcome.previousTier ?? 'none'} -> ${outcome.tier}` +
      `${outcome.escalated ? ' (escalated)' : ''}${outcome.checkInRequested ? ' (check-in requested)' : ''}`
  );

  return outcome;
}
