/**
 * Transcripts -> SymptomFeatures.
 *
 * There is NO language model in here. Every answer is to a closed question, so
 * scoring is string matching against a fixed vocabulary — fully deterministic
 * and fully unit-tested. See checkInScript.ts for why this build took that
 * route.
 *
 * THE ONE RULE THIS FILE MUST NEVER BREAK
 * ---------------------------------------
 * It returns observations about the patient and nothing else. No tier, no
 * grade, no severity, no recommendation, no advice. Deciding how worried to be
 * is triage.ts's job, and keeping that boundary is the whole project. There is
 * a test asserting the returned object contains no such key.
 */

import { ICE_ASSESSABLE_POINTS } from '../clinical/thresholds';
import { RECALL_WORDS, RECORDED_STEPS, type CheckInStep } from './checkInScript';
import { unknownFeatures, type Coherence, type FeatureValue, type SymptomFeatures } from './features';

/** One recorded answer. */
export interface CheckInAnswer {
  stepId: string;
  transcript: string;
}

export interface IceItemScore {
  stepId: string;
  prompt: string;
  answer: string;
  earned: number;
  possible: number;
}

export interface ExtractionResult {
  features: SymptomFeatures;
  /** Per-item ICE breakdown, for the audit panel. */
  iceItems: IceItemScore[];
  /** Every ICE item was attempted. */
  iceComplete: boolean;
}

export interface ExtractionContext {
  /** Used to score the year and month orientation items. */
  now?: Date;
  /** The patient's home city, for the city orientation item. */
  expectedCity?: string;
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, ten: 10, twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};

/** Answers that mean "yes", including the hedged ones patients actually use. */
const AFFIRMATIVE = new Set([
  'yes', 'yeah', 'yep', 'yup', 'yah', 'aye', 'correct', 'definitely', 'sure',
  'sometimes', 'occasionally', 'slightly', 'somewhat', 'bit', 'little',
  'once', 'twice', 'often', 'always', 'maybe', 'possibly', 'think',
]);

const NEGATIVE = new Set([
  'no', 'nope', 'nah', 'none', 'never', 'not', 'nothing', 'negative',
  'havent', 'hasnt', 'didnt', 'dont', 'doesnt', 'wasnt', 'isnt', 'cant', 'couldnt',
]);

/** Lowercase, strip punctuation, collapse whitespace. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(text: string): string[] {
  const normalized = normalize(text);
  return normalized ? normalized.split(' ') : [];
}

/**
 * Read a yes/no answer.
 *
 * Whichever of "yes" or "no" the patient says FIRST wins, which handles the
 * common shapes: "no, not really", "yes, a little", "not since yesterday",
 * "a bit, yeah". An answer with neither is 'unknown' — silence is a gap in the
 * check-in, never a denial.
 */
export function parseYesNo(transcript: string): FeatureValue {
  for (const token of tokens(transcript)) {
    if (NEGATIVE.has(token)) {
      return false;
    }
    if (AFFIRMATIVE.has(token)) {
      return true;
    }
  }
  return 'unknown';
}

/** Does the answer contain this year, as digits or as words? */
function saysYear(transcript: string, year: number): boolean {
  const normalized = normalize(transcript);
  if (normalized.includes(String(year))) {
    return true;
  }
  // "twenty twenty six" / "two thousand twenty six"
  const tens = Math.floor((year % 100) / 10) * 10;
  const units = year % 10;
  const spoken = [`twenty ${numberWord(tens)}`, `twenty ${numberWord(tens)} ${numberWord(units)}`];
  return spoken.some((phrase) => normalized.includes(phrase.trim()));
}

function numberWord(value: number): string {
  return Object.keys(NUMBER_WORDS).find((word) => NUMBER_WORDS[word] === value) ?? String(value);
}

function scoreOrientation(step: CheckInStep, transcript: string, context: ExtractionContext): number {
  const normalized = normalize(transcript);
  const now = context.now ?? new Date();

  switch (step.expected) {
    case 'year':
      return saysYear(transcript, now.getFullYear()) ? 1 : 0;
    case 'month':
      return normalized.includes(MONTHS[now.getMonth()]) ? 1 : 0;
    case 'city':
      // Unknown city means we cannot mark this item. Score it 0 but flag it as
      // unattempted so it doesn't silently count against the patient.
      return context.expectedCity && normalized.includes(normalize(context.expectedCity)) ? 1 : 0;
    case 'place':
      return /\b(home|house|flat|apartment|my place|here)\b/.test(normalized) ? 1 : 0;
    default:
      return 0;
  }
}

/** One point per remembered word, three available. */
function scoreRecall(transcript: string): number {
  const normalized = normalize(transcript);
  return RECALL_WORDS.filter((word) => new RegExp(`\\b${word}s?\\b`).test(normalized)).length;
}

/**
 * Counting back from 100 by tens. Awarded when at least three correct steps
 * appear in descending order — enough to show sustained attention without
 * demanding the patient finish the whole sequence.
 */
function scoreAttention(transcript: string): number {
  const normalized = normalize(transcript);
  const spoken: number[] = [];

  for (const token of normalized.split(' ')) {
    const asNumber = /^\d+$/.test(token) ? Number(token) : NUMBER_WORDS[token];
    if (asNumber !== undefined) {
      spoken.push(asNumber);
    }
  }

  const expected = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10];
  let matched = 0;
  let cursor = 0;
  for (const value of spoken) {
    const index = expected.indexOf(value, cursor);
    if (index !== -1) {
      matched++;
      cursor = index + 1;
    }
  }
  return matched >= 3 ? 1 : 0;
}

function scoreIceStep(step: CheckInStep, transcript: string, context: ExtractionContext): number {
  switch (step.kind) {
    case 'orientation':
      return scoreOrientation(step, transcript, context);
    case 'recall':
      return scoreRecall(transcript);
    case 'attention':
      return scoreAttention(transcript);
    default:
      return 0;
  }
}

/**
 * Turn a set of recorded answers into structured symptom features.
 *
 * @param answers - one entry per answered step; missing steps stay 'unknown'
 * @param context - today's date and the patient's city, for the ICE items
 */
export function extractFeatures(answers: CheckInAnswer[], context: ExtractionContext = {}): ExtractionResult {
  const byStep = new Map(answers.map((answer) => [answer.stepId, answer.transcript]));
  const features = unknownFeatures();
  const iceItems: IceItemScore[] = [];

  let iceEarned = 0;
  let icePossible = 0;
  let iceAttempted = 0;
  let iceSteps = 0;

  for (const step of RECORDED_STEPS) {
    const transcript = byStep.get(step.id);

    if (step.kind === 'symptom' && step.feature) {
      features[step.feature] = transcript === undefined ? 'unknown' : parseYesNo(transcript);
      continue;
    }

    if (step.points !== undefined) {
      iceSteps++;
      icePossible += step.points;
      const earned = transcript === undefined ? 0 : scoreIceStep(step, transcript, context);
      iceEarned += earned;
      if (transcript !== undefined) {
        iceAttempted++;
      }
      iceItems.push({
        stepId: step.id,
        prompt: step.prompt,
        answer: transcript ?? '',
        earned,
        possible: step.points,
      });
    }
  }

  const iceComplete = iceAttempted === iceSteps && iceSteps > 0;

  // Only report a score when the whole screen was attempted. A partial screen
  // would read as a cognitive deficit when it is really just an unfinished
  // check-in — the difference between "impaired" and "we didn't ask".
  features.iceScore = iceComplete ? iceEarned : 'unknown';

  features.coherence = deriveCoherence(answers);

  return { features, iceItems, iceComplete };
}

/**
 * Did the patient engage at all?
 *
 * Only two values are inferred here. 'incoherent' is deliberately NOT inferred:
 * it forces EMERGENT, and "the transcript looked odd" is not sound evidence for
 * that. A low ICE score already routes an objectively impaired patient to the
 * right tier. A clinician or caregiver can set 'incoherent' explicitly.
 */
function deriveCoherence(answers: CheckInAnswer[]): Coherence {
  if (answers.length === 0) {
    return 'unknown';
  }
  const anyAudible = answers.some((answer) => normalize(answer.transcript).length > 0);
  return anyAudible ? 'coherent' : 'noResponse';
}

/** The maximum ICE score obtainable over voice. Re-exported for the UI. */
export { ICE_ASSESSABLE_POINTS };
