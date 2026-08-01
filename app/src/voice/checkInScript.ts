/**
 * The structured check-in script.
 *
 * This is SPEC.md §5's documented fallback: a fixed question set with
 * deterministic scoring, and no language model anywhere in the pipeline. The
 * patient still speaks — Deepgram still transcribes — but each answer is to a
 * closed question, so scoring it is string matching rather than inference.
 *
 * WHAT VOICE CANNOT ASSESS
 * ------------------------
 * The ICE score is 10 points (ASTCT Table 5). Two of them cannot be collected
 * over a phone call at all:
 *
 *   - Following commands ("show me two fingers") — needs someone watching.
 *   - Writing ("our national bird is the bald eagle") — needs paper.
 *
 * SPEC.md §3 already calls this out. So a voice check-in tops out at **8 of 10
 * points**, and the raw ASTCT bands (7-9 grade 1, 3-6 grade 2, 0-2 grade 3)
 * cannot be applied to it directly — an 8/8 patient would look like grade 1 if
 * you scored them against the 10-point scale. The score is reported out of the
 * assessable maximum, and thresholds.ts defines the bands used against it.
 */

import type { SymptomFeatures } from './features';

/** The keys a yes/no question can fill. */
export type SymptomQuestionKey = Extract<
  keyof SymptomFeatures,
  'fever' | 'confusion' | 'wordFinding' | 'tremor' | 'headache' | 'dizziness' | 'dizzinessOnStanding' | 'drowsiness' | 'seizure' | 'motorWeakness'
>;

export type StepKind = 'statement' | 'symptom' | 'orientation' | 'recall' | 'attention';

export interface CheckInStep {
  id: string;
  prompt: string;
  kind: StepKind;
  /** 'symptom' steps only: the feature an affirmative answer sets. */
  feature?: SymptomQuestionKey;
  /** 'orientation' steps only: what the answer is checked against. */
  expected?: 'year' | 'month' | 'city' | 'place';
  /** ICE points this step contributes when answered correctly. */
  points?: number;
}

/** The three words the patient is asked to hold and recall. ASTCT Table 5. */
export const RECALL_WORDS = ['clock', 'pen', 'button'] as const;

/** ICE points collectable by voice. Two of the ten need someone in the room. */
export const ASSESSABLE_ICE_POINTS = 8;

export const CHECK_IN_SCRIPT: CheckInStep[] = [
  {
    id: 'intro',
    kind: 'statement',
    prompt: `Before we start, please remember these three words — ${RECALL_WORDS.join(', ')}. I'll ask you for them at the end.`,
  },

  // Symptoms. Closed questions, so "yes"/"no" is the whole answer.
  { id: 'fever', kind: 'symptom', feature: 'fever', prompt: 'Have you felt feverish, or had chills, since yesterday?' },
  { id: 'headache', kind: 'symptom', feature: 'headache', prompt: 'Have you had a headache?' },
  {
    id: 'dizzinessOnStanding',
    kind: 'symptom',
    feature: 'dizzinessOnStanding',
    prompt: 'Do you feel dizzy or light-headed when you stand up?',
  },
  { id: 'tremor', kind: 'symptom', feature: 'tremor', prompt: 'Have your hands been shaky or trembling?' },
  { id: 'drowsiness', kind: 'symptom', feature: 'drowsiness', prompt: 'Have you been unusually sleepy or hard to rouse?' },
  {
    id: 'wordFinding',
    kind: 'symptom',
    feature: 'wordFinding',
    prompt: 'Have you had trouble finding words, or lost your thread in the middle of a sentence?',
  },
  { id: 'confusion', kind: 'symptom', feature: 'confusion', prompt: 'Have you felt confused or muddled at all?' },
  {
    id: 'seizure',
    kind: 'symptom',
    feature: 'seizure',
    prompt: 'Have you had a fit or a seizure — or has anyone told you that you had one?',
  },

  // ICE: orientation, 4 points.
  { id: 'ice-year', kind: 'orientation', expected: 'year', points: 1, prompt: 'What year is it?' },
  { id: 'ice-month', kind: 'orientation', expected: 'month', points: 1, prompt: 'And what month are we in?' },
  { id: 'ice-city', kind: 'orientation', expected: 'city', points: 1, prompt: 'What city are you in?' },
  {
    id: 'ice-place',
    kind: 'orientation',
    expected: 'place',
    points: 1,
    prompt: 'And where are you right now — at home, or somewhere else?',
  },

  // ICE: naming/recall, 3 points.
  { id: 'ice-recall', kind: 'recall', points: 3, prompt: 'What were the three words I asked you to remember?' },

  // ICE: attention, 1 point.
  { id: 'ice-attention', kind: 'attention', points: 1, prompt: 'Starting at one hundred, count backwards by ten.' },
];

/** The steps that actually record audio. */
export const RECORDED_STEPS = CHECK_IN_SCRIPT.filter((step) => step.kind !== 'statement');
