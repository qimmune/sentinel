/**
 * The clinical decision layer.
 *
 * Pure deterministic TypeScript: no I/O, no React, no Medplum, no LLM calls.
 * The only import is the `SymptomFeatures` contract, which is types and
 * constructors with no runtime dependencies of its own.
 *
 * This module answers exactly one question — "how worried should we be right
 * now?" — and it answers it with a TRIAGE TIER, not a clinical grade. There is
 * deliberately no `gradeCRS()` or `gradeICANS()` here. The ASTCT consensus
 * criteria tell us which features matter and at what thresholds; they are not
 * the output. See SPEC.md §3.
 *
 * The language model decides what the patient said. It never decides how
 * worried to be. That happens here.
 */

import { present, type SymptomFeatures } from '../voice/features';
import {
  FEVER_C,
  HYPOTENSION_SBP,
  HYPOXIA_SPO2,
  LOW_GRADE_TEMP_C,
  SEVERE_HYPOTENSION_SBP,
  SEVERE_HYPOXIA_SPO2,
} from './thresholds';

/** Q-Immune's pre-infusion risk prediction, carried on the Patient resource. */
export type RiskTier = 'standard' | 'elevated' | 'high';

export type TriageTier = 'ROUTINE' | 'URGENT' | 'EMERGENT';

export interface Vitals {
  tempC?: number;
  heartRate?: number;
  systolicBP?: number;
  diastolicBP?: number;
  spo2?: number;
  /**
   * Antipyretic (paracetamol/ibuprofen) or tocilizumab/steroids within the last
   * 6 hours. Deliberately one boolean — one field on the vitals form, one coded
   * Observation. No MedicationAdministration graph, no medication search.
   *
   * Required, not optional: a caller that hasn't thought about this is a caller
   * about to ship the fever-gate bug.
   */
  antipyreticOrTociWithin6h: boolean;
  /** From the simulated vitals trend — resting HR climbing over recent hours. */
  restingHrTrendingUp?: boolean;
}

export interface TriageReason {
  /** Stable identifier, safe to switch on in the UI. */
  code: string;
  /** One human sentence, for the card, the timeline and the handover note. */
  detail: string;
  /** The tier this single observation argues for, on its own. */
  tier: TriageTier;
  /**
   * `finding` — an observed abnormality in this patient.
   * `context`  — a modifier or a process event, not a clinical finding.
   *
   * Only findings can trigger the high-risk tier shift, so a well patient who
   * happens to have taken Tylenol, or one who simply missed a call, does not
   * get escalated for it.
   */
  kind: 'finding' | 'context';
}

export interface TriageResult {
  /** The answer. */
  tier: TriageTier;
  /** What the rules said before the Q-Immune risk tier was applied. */
  baseTier: TriageTier;
  /** Whether the high-risk shift actually changed the answer. */
  riskTierApplied: boolean;
  /** Everything that drove the decision, worst first. The audit trail. */
  reasons: TriageReason[];
}

const RANK: Record<TriageTier, number> = { ROUTINE: 0, URGENT: 1, EMERGENT: 2 };

/**
 * How worried should we be right now?
 *
 * @param features - what the patient said, already extracted and structured
 * @param vitals - what we measured
 * @param riskTier - Q-Immune's pre-infusion risk prediction
 */
export function triage(features: SymptomFeatures, vitals: Vitals, riskTier: RiskTier): TriageTier {
  return explainTriage(features, vitals, riskTier).tier;
}

/**
 * The same decision, with its reasoning. Every escalation has to be able to
 * cite the symptoms and readings behind it, so a clinician can overrule it in
 * five seconds.
 */
export function explainTriage(features: SymptomFeatures, vitals: Vitals, riskTier: RiskTier): TriageResult {
  const reasons: TriageReason[] = [];

  const finding = (tier: TriageTier, code: string, detail: string): void => {
    reasons.push({ tier, code, detail, kind: 'finding' });
  };
  const context = (tier: TriageTier, code: string, detail: string): void => {
    reasons.push({ tier, code, detail, kind: 'context' });
  };

  // ---------------------------------------------------------------------
  // CRS-shaped signals: fever, hypotension, hypoxia
  // ---------------------------------------------------------------------

  const measuredFever = vitals.tempC !== undefined && vitals.tempC >= FEVER_C;
  const reportedFever = present(features.fever);

  if (measuredFever) {
    finding('URGENT', 'fever', `Temperature ${vitals.tempC?.toFixed(1)} °C (at or above ${FEVER_C} °C)`);
  } else if (reportedFever) {
    finding('URGENT', 'reportedFever', 'Reports feeling feverish — no measured temperature on file');
  } else if (vitals.tempC !== undefined && vitals.tempC >= LOW_GRADE_TEMP_C) {
    finding('ROUTINE', 'lowGradeTemp', `Temperature ${vitals.tempC.toFixed(1)} °C — below fever, worth watching`);
  }

  /**
   * The rule that makes this grader clinically real, and it matters most in
   * exactly our setting.
   *
   * ASTCT: "In patients who have CRS then receive antipyretic or anticytokine
   * therapy such as tocilizumab or steroids, fever is no longer required to
   * grade subsequent CRS severity. In this case, CRS grading is driven by
   * hypotension and/or hypoxia."
   *
   * Outpatients take Tylenol at home. Gate escalation on fever and you
   * silently downgrade the patient you most need to catch.
   */
  if (vitals.antipyreticOrTociWithin6h) {
    context(
      'ROUTINE',
      'feverRequirementWaived',
      'Antipyretic or tocilizumab in the last 6h — fever is not required to escalate (ASTCT)'
    );
  }

  const crsPathwayActive = measuredFever || reportedFever || vitals.antipyreticOrTociWithin6h;

  if (vitals.systolicBP !== undefined && vitals.systolicBP < HYPOTENSION_SBP) {
    const severe = vitals.systolicBP < SEVERE_HYPOTENSION_SBP;
    finding(
      crsPathwayActive || severe ? 'EMERGENT' : 'URGENT',
      'hypotension',
      `Systolic BP ${vitals.systolicBP} mmHg (below ${HYPOTENSION_SBP})`
    );
  }

  if (vitals.spo2 !== undefined && vitals.spo2 < HYPOXIA_SPO2) {
    const severe = vitals.spo2 < SEVERE_HYPOXIA_SPO2;
    finding(
      crsPathwayActive || severe ? 'EMERGENT' : 'URGENT',
      'hypoxia',
      `SpO₂ ${vitals.spo2}% (below ${HYPOXIA_SPO2}%)`
    );
  }

  if (crsPathwayActive && present(features.dizzinessOnStanding)) {
    finding('EMERGENT', 'dizzinessOnStanding', 'Dizziness on standing alongside fever — possible hypotension');
  }

  if (vitals.restingHrTrendingUp) {
    finding('URGENT', 'restingHrTrendingUp', 'Resting heart rate trending up');
  }

  // ---------------------------------------------------------------------
  // Neuro signals.
  //
  // ASTCT Table 6: severity is the MAXIMUM across domains, never one signal.
  // Every domain below is scored independently and the worst one wins — which
  // falls out of taking the max over `reasons` at the end.
  // ---------------------------------------------------------------------

  if (present(features.seizure)) {
    finding('EMERGENT', 'seizure', 'Seizure reported — by the patient or the caregiver');
  }

  if (features.consciousness === 'unarousable') {
    finding('EMERGENT', 'unarousable', 'Unarousable');
  } else if (features.consciousness === 'wakesToTactile') {
    finding('EMERGENT', 'wakesToTactile', 'Wakes only to tactile stimulus');
  } else if (features.consciousness === 'wakesToVoice') {
    finding('URGENT', 'wakesToVoice', 'Wakes to voice rather than spontaneously');
  }

  if (present(features.motorWeakness)) {
    finding('EMERGENT', 'motorWeakness', 'Deep focal weakness reported');
  }

  if (features.coherence === 'incoherent') {
    // Engaged but cannot answer coherently. That is the ICANS signal itself.
    finding('EMERGENT', 'incoherent', 'Engaged with the check-in but could not answer coherently');
  } else if (features.coherence === 'noResponse') {
    // Explicitly NOT the same as unarousable. Patients shower, sleep, and let
    // phones die. Silence isn't reassuring — it's unverified. Page a human;
    // don't dispatch an ambulance, and don't let the high-risk shift turn this
    // into one.
    context('URGENT', 'noResponse', 'No answer to the check-in — page the caregiver to confirm the patient is well');
  }

  if (present(features.confusion)) {
    finding('URGENT', 'confusion', 'New confusion');
  }
  if (present(features.wordFinding)) {
    finding('URGENT', 'wordFinding', 'New word-finding difficulty');
  }

  // Recorded, but deliberately non-escalating on their own.
  if (present(features.tremor)) {
    // Tremor and myoclonus do not count toward neuro severity (SPEC.md §3).
    finding('ROUTINE', 'tremor', 'Tremor — noted, does not count toward neuro severity');
  }
  if (present(features.headache)) {
    finding('ROUTINE', 'headache', 'Headache');
  }
  if (present(features.dizziness)) {
    finding('ROUTINE', 'dizziness', 'Dizziness');
  }
  if (present(features.drowsiness)) {
    finding('ROUTINE', 'drowsiness', 'Drowsiness');
  }

  // ---------------------------------------------------------------------
  // Worst domain wins, then the Q-Immune risk tier shifts it.
  // ---------------------------------------------------------------------

  const baseTier = reasons.reduce<TriageTier>(
    (worst, reason) => (RANK[reason.tier] > RANK[worst] ? reason.tier : worst),
    'ROUTINE'
  );

  // A high-risk patient escalates one tier sooner — the Q-Immune integration,
  // and it is one `if`.
  //
  // It only fires when there is something to escalate. Applied to a clean
  // check-in it would park every high-risk patient permanently on amber, and a
  // board where the worst patients are always amber tells a nurse nothing.
  const hasFinding = reasons.some((reason) => reason.kind === 'finding');
  const shouldShift = riskTier === 'high' && hasFinding && baseTier !== 'EMERGENT';
  const tier = shouldShift ? escalate(baseTier) : baseTier;

  reasons.sort((a, b) => RANK[b.tier] - RANK[a.tier]);

  return { tier, baseTier, riskTierApplied: shouldShift, reasons };
}

function escalate(tier: TriageTier): TriageTier {
  return tier === 'ROUTINE' ? 'URGENT' : 'EMERGENT';
}
