/**
 * The seam where a real outbound phone call attaches.
 *
 * WHAT THIS BUILD DOES TODAY
 * --------------------------
 * Nothing rings a phone. The agent raises a FHIR Task (`status: 'requested'`,
 * owner = the Patient), the patient's app polls for it, and shows the
 * full-screen IncomingCheckIn overlay. That is SPEC.md §4's actual architecture
 * — the patient is on a PWA, not a phone line — and it needs no telephony
 * account, no phone numbers and no publicly reachable server.
 *
 * WHAT A REAL CALL WOULD NEED (for whoever picks this up)
 * ------------------------------------------------------
 * Three things this build deliberately does not have:
 *
 *   1. A telephony account (Twilio / Vonage / Telnyx) and a purchased number.
 *   2. A SERVER. Outbound calls cannot be placed from a browser: the API
 *      credentials would be exposed to anyone who opens devtools, and the
 *      provider has to reach a public webhook to drive the call. A Medplum Bot
 *      is a reasonable host for the trigger, but the media leg needs a real
 *      endpoint.
 *   3. A media path into Deepgram. The browser path here records a clip and
 *      posts it to Deepgram's pre-recorded endpoint. A phone call is a live
 *      audio stream, so it would use Deepgram's streaming API bridged to the
 *      provider's media stream instead.
 *
 * IMPLEMENTING IT
 * ---------------
 * Implement `CallProvider` against your telephony vendor and pass it where the
 * app currently raises a Task. Nothing else in the pipeline changes:
 * `extract.ts` still turns transcripts into features, and `triage.ts` still
 * makes every decision. Telephony is a delivery mechanism, not clinical logic.
 *
 * Do NOT put provider credentials in `.env` here — this app is a browser
 * bundle, and anything in `import.meta.env` ships to the client. The Deepgram
 * key is exposed on purpose for a hackathon demo; a telephony key with billing
 * attached is a different matter.
 */

import type { Patient, Reference, Task } from '@medplum/fhirtypes';

export interface CallRequest {
  patient: Reference<Patient>;
  /** E.164, e.g. +14155550123. Read from Patient.telecom in a real build. */
  toNumber: string;
  /** Why the agent is calling — spoken as the greeting, or shown in-app. */
  reason: string;
  /** The Task that authorised the call, for the audit trail. */
  task?: Task;
}

export interface CallResult {
  /** Provider-side identifier, so the call can be reconciled later. */
  callId: string;
  status: 'queued' | 'ringing' | 'answered' | 'no-answer' | 'failed';
}

export interface CallProvider {
  placeCall: (request: CallRequest) => Promise<CallResult>;
}

/**
 * What this build actually uses: the in-app overlay.
 *
 * It reports 'queued' rather than pretending a phone rang, because the caller
 * that reads this status should not be able to record "we called the patient"
 * when no call was placed.
 */
export const inAppCallProvider: CallProvider = {
  placeCall: async (request: CallRequest): Promise<CallResult> => ({
    callId: `in-app:${request.task?.id ?? 'unknown'}`,
    status: 'queued',
  }),
};

/**
 * Sketch of the Twilio shape, for whoever wires this up. Intentionally not
 * implemented — it must run server-side, and this file ships to the browser.
 *
 * On the server:
 *   const call = await twilio.calls.create({
 *     to: request.toNumber,
 *     from: YOUR_NUMBER,
 *     url: 'https://your-server/sentinel/call-flow',   // returns TwiML
 *     statusCallback: 'https://your-server/sentinel/call-status',
 *   });
 *
 * The call-flow endpoint drives the same question script that lives in
 * `checkInScript.ts` — reuse it rather than rewriting the questions, or the
 * spoken exam and the scored exam will drift apart.
 */
export const twilioCallProviderNotImplemented: CallProvider = {
  placeCall: async () => {
    throw new Error(
      'Telephony is not configured. Outbound calls need a server and provider credentials — see the notes in telephony.ts.'
    );
  },
};
