/**
 * The structured symptom set — the ONLY thing the voice/LLM layer is allowed to
 * produce.
 *
 * `extract.ts` (Tier 2) turns a Deepgram transcript into one of these objects.
 * It must never return a tier, a grade, a severity, or a recommendation.
 * Those come from `src/clinical/triage.ts`, deterministically. See SPEC.md §3.
 *
 * This file is types + constructors only — no runtime dependencies — so
 * `clinical/` can `import type` from it without taking on any coupling.
 */

/**
 * Tri-state. "The patient didn't mention it" is not the same as "the patient
 * denied it", and the difference matters: an unmentioned symptom is a gap in
 * the check-in, not a negative finding.
 */
export type FeatureValue = true | false | 'unknown';

/** ASTCT Table 6, "depressed level of consciousness" domain. */
export type ConsciousnessLevel = 'alert' | 'wakesToVoice' | 'wakesToTactile' | 'unarousable' | 'unknown';

/**
 * How the check-in itself went. SPEC.md §3, the caregiver loop:
 *  - `incoherent` — engaged but word salad / can't follow the prompt. That IS
 *    the ICANS signal.
 *  - `noResponse` — never picked up. Explicitly NOT the same thing. Patients
 *    shower, sleep, and let phones die. This pages a human; it is not grade 4.
 */
export type Coherence = 'coherent' | 'incoherent' | 'noResponse' | 'unknown';

export interface SymptomFeatures {
  /** Patient *reports* feeling feverish. Not a measurement — see Vitals.tempC. */
  fever: FeatureValue;
  confusion: FeatureValue;
  /** Word-finding difficulty / aphasia. */
  wordFinding: FeatureValue;
  /** Tremor and myoclonus do NOT count toward neuro severity (SPEC.md §3). */
  tremor: FeatureValue;
  headache: FeatureValue;
  dizziness: FeatureValue;
  /** Orthostatic dizziness — our home proxy for hypotension. */
  dizzinessOnStanding: FeatureValue;
  drowsiness: FeatureValue;
  /** Caregiver-reported is enough. */
  seizure: FeatureValue;
  /** Deep focal weakness (hemi-/paraparesis). ASTCT Table 6 motor domain. */
  motorWeakness: FeatureValue;
  consciousness: ConsciousnessLevel;
  coherence: Coherence;
}

/**
 * A check-in where nothing has been established yet. Everything is 'unknown'
 * rather than false — extraction fills in what the patient actually said.
 */
export function unknownFeatures(): SymptomFeatures {
  return {
    fever: 'unknown',
    confusion: 'unknown',
    wordFinding: 'unknown',
    tremor: 'unknown',
    headache: 'unknown',
    dizziness: 'unknown',
    dizzinessOnStanding: 'unknown',
    drowsiness: 'unknown',
    seizure: 'unknown',
    motorWeakness: 'unknown',
    consciousness: 'unknown',
    coherence: 'unknown',
  };
}

/**
 * A check-in where the patient engaged and denied everything. Useful as a test
 * baseline and as the "all clear" case.
 */
export function noFindings(): SymptomFeatures {
  return {
    fever: false,
    confusion: false,
    wordFinding: false,
    tremor: false,
    headache: false,
    dizziness: false,
    dizzinessOnStanding: false,
    drowsiness: false,
    seizure: false,
    motorWeakness: false,
    consciousness: 'alert',
    coherence: 'coherent',
  };
}

/** Only an explicit `true` counts as a positive finding. 'unknown' never does. */
export function present(value: FeatureValue): boolean {
  return value === true;
}
