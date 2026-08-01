/**
 * Everything a server needs from the app, in one bundle.
 *
 * The telephony server is plain JavaScript and imports the build of this file
 * (`npm run build:core`). The point is that the phone call runs the SAME
 * question script, the SAME scoring and the SAME triage as the browser. If the
 * two ever diverge, the ICE score means one thing on the phone and another in
 * the app, and the whole audit trail becomes fiction.
 *
 * Nothing here may touch a browser API — no window, no Audio, no
 * import.meta.env — or the bundle will throw the moment Node loads it.
 */

export { CALL_GREETING, RECALL_WORDS, RECORDED_STEPS, CHECK_IN_SCRIPT } from '../voice/checkInScript';
export type { CheckInStep } from '../voice/checkInScript';

export { extractFeatures } from '../voice/extract';
export type { CheckInAnswer, ExtractionResult } from '../voice/extract';

export { buildCheckInResponse } from '../fhir/checkin';
export { getPatientCity, getPatientName } from '../fhir/patient';
export { SENTINEL_IDENTIFIER_SYSTEM } from '../fhir/codes';

export { runAgentForPatient, findCheckInRequest } from '../agent/agent';
export type { AgentOutcome } from '../agent/agent';

export { explainTriage } from '../clinical/triage';
export { ICE_ASSESSABLE_POINTS } from '../clinical/thresholds';
