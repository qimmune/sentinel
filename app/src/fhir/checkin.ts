/**
 * Symptom check-ins <-> FHIR Questionnaire / QuestionnaireResponse.
 *
 * The extracted features are the QuestionnaireResponse. The transcript rides
 * along on the same resource so the audit trail — what the patient actually
 * said, next to what was extracted from it — is one read.
 */

import type { Questionnaire, QuestionnaireResponse, QuestionnaireResponseItem, Reference, Patient } from '@medplum/fhirtypes';
import type { ConsciousnessLevel, Coherence, FeatureValue, SymptomFeatures } from '../voice/features';
import { unknownFeatures } from '../voice/features';
import { SENTINEL_IDENTIFIER_SYSTEM, SYMPTOM_QUESTIONNAIRE_URL } from './codes';

/** linkId -> the SymptomFeatures key it carries. */
const BOOLEAN_ITEMS = [
  ['fever', 'Feeling feverish'],
  ['confusion', 'Confusion'],
  ['wordFinding', 'Trouble finding words'],
  ['tremor', 'Tremor or shakiness'],
  ['headache', 'Headache'],
  ['dizziness', 'Dizziness'],
  ['dizzinessOnStanding', 'Dizziness on standing'],
  ['drowsiness', 'Drowsiness'],
  ['seizure', 'Seizure (patient or caregiver reported)'],
  ['motorWeakness', 'New focal weakness'],
] as const;

type BooleanFeatureKey = (typeof BOOLEAN_ITEMS)[number][0];

/**
 * The check-in questionnaire. Note this is the *shape of the extracted data*,
 * not a script the patient is read: the patient speaks freely and the LLM fills
 * this in. It doubles as the structured fallback question set if free-text
 * extraction proves flaky (SPEC.md §5).
 */
export const symptomQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  url: SYMPTOM_QUESTIONNAIRE_URL,
  name: 'SentinelSymptomCheckIn',
  title: 'Sentinel daily symptom check-in',
  status: 'active',
  subjectType: ['Patient'],
  item: [
    ...BOOLEAN_ITEMS.map(([linkId, text]) => ({ linkId, text, type: 'boolean' as const })),
    {
      linkId: 'consciousness',
      text: 'Level of consciousness',
      type: 'choice' as const,
      answerOption: (['alert', 'wakesToVoice', 'wakesToTactile', 'unarousable'] as const).map((code) => ({
        valueString: code,
      })),
    },
    {
      linkId: 'coherence',
      text: 'Could the patient answer coherently?',
      type: 'choice' as const,
      answerOption: (['coherent', 'incoherent', 'noResponse'] as const).map((code) => ({ valueString: code })),
    },
    { linkId: 'transcript', text: 'Verbatim transcript', type: 'text' as const },
  ],
};

/**
 * Build the QuestionnaireResponse for one check-in.
 *
 * A feature that is 'unknown' is written as an ABSENT item, not as `false`.
 * "The patient never mentioned it" and "the patient denied it" have to stay
 * distinguishable all the way through the record.
 */
export function buildCheckInResponse(
  subject: Reference<Patient>,
  features: SymptomFeatures,
  authored: string,
  transcript?: string,
  seedKey?: string
): QuestionnaireResponse {
  const item: QuestionnaireResponseItem[] = [];

  for (const [linkId, text] of BOOLEAN_ITEMS) {
    const value = features[linkId];
    if (value !== 'unknown') {
      item.push({ linkId, text, answer: [{ valueBoolean: value }] });
    }
  }

  if (features.consciousness !== 'unknown') {
    item.push({ linkId: 'consciousness', answer: [{ valueString: features.consciousness }] });
  }
  if (features.coherence !== 'unknown') {
    item.push({ linkId: 'coherence', answer: [{ valueString: features.coherence }] });
  }
  if (transcript) {
    item.push({ linkId: 'transcript', answer: [{ valueString: transcript }] });
  }

  return {
    resourceType: 'QuestionnaireResponse',
    questionnaire: SYMPTOM_QUESTIONNAIRE_URL,
    status: 'completed',
    subject,
    authored,
    item,
    ...(seedKey ? { identifier: { system: SENTINEL_IDENTIFIER_SYSTEM, value: seedKey } } : {}),
  };
}

function booleanAnswer(response: QuestionnaireResponse, linkId: string): FeatureValue {
  const answer = response.item?.find((i) => i.linkId === linkId)?.answer?.[0]?.valueBoolean;
  return answer === undefined ? 'unknown' : answer;
}

function stringAnswer(response: QuestionnaireResponse, linkId: string): string | undefined {
  return response.item?.find((i) => i.linkId === linkId)?.answer?.[0]?.valueString;
}

/** Read a stored check-in back into the structure triage() consumes. */
export function toSymptomFeatures(response: QuestionnaireResponse): SymptomFeatures {
  const features = unknownFeatures();

  for (const [linkId] of BOOLEAN_ITEMS) {
    features[linkId as BooleanFeatureKey] = booleanAnswer(response, linkId);
  }

  const consciousness = stringAnswer(response, 'consciousness');
  if (consciousness) {
    features.consciousness = consciousness as ConsciousnessLevel;
  }
  const coherence = stringAnswer(response, 'coherence');
  if (coherence) {
    features.coherence = coherence as Coherence;
  }

  return features;
}

/** The verbatim transcript, if this check-in came from the voice layer. */
export function getTranscript(response: QuestionnaireResponse): string | undefined {
  return stringAnswer(response, 'transcript');
}
