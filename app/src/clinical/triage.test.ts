import { describe, expect, it } from 'vitest';
import { noFindings, type SymptomFeatures } from '../voice/features';
import { explainTriage, triage, type Vitals } from './triage';

/** A patient with entirely unremarkable vitals and no antipyretic on board. */
function vitals(overrides: Partial<Vitals> = {}): Vitals {
  return {
    tempC: 36.8,
    heartRate: 78,
    systolicBP: 118,
    diastolicBP: 74,
    spo2: 98,
    antipyreticOrTociWithin6h: false,
    ...overrides,
  };
}

function features(overrides: Partial<SymptomFeatures> = {}): SymptomFeatures {
  return { ...noFindings(), ...overrides };
}

describe('triage — baseline', () => {
  it('is ROUTINE when the patient is well and the vitals are normal', () => {
    expect(triage(noFindings(), vitals(), 'standard')).toBe('ROUTINE');
  });

  it('is URGENT on fever alone (ASTCT grade 1 — care team contacts today)', () => {
    expect(triage(noFindings(), vitals({ tempC: 38.1 }), 'standard')).toBe('URGENT');
  });

  it('is EMERGENT on fever plus hypoxia (the grade 1 -> 2 transition)', () => {
    expect(triage(noFindings(), vitals({ tempC: 38.4, spo2: 90 }), 'standard')).toBe('EMERGENT');
  });
});

/**
 * CASE 1 — the antipyretic rule.
 *
 * ASTCT: "In patients who have CRS then receive antipyretic or anticytokine
 * therapy such as tocilizumab or steroids, fever is no longer required to grade
 * subsequent CRS severity. In this case, CRS grading is driven by hypotension
 * and/or hypoxia."
 *
 * Outpatients take Tylenol at home. A fever-gated rule silently downgrades
 * exactly the patient you most need to catch.
 */
describe('triage — fever is not required once an antipyretic is on board', () => {
  it('escalates to EMERGENT on hypotension alone when the patient took Tylenol 2h ago', () => {
    const afebrileOnTylenol = vitals({
      tempC: 37.1, // afebrile *because* of the antipyretic
      systolicBP: 86,
      antipyreticOrTociWithin6h: true,
    });

    expect(triage(noFindings(), afebrileOnTylenol, 'standard')).toBe('EMERGENT');
  });

  it('proves the flag is what does the work — same vitals without it read lower', () => {
    const sameVitalsNoAntipyretic = vitals({
      tempC: 37.1,
      systolicBP: 86,
      antipyreticOrTociWithin6h: false,
    });

    // Still escalated — an SBP of 86 is never ROUTINE — but one tier lower.
    // The gap between these two assertions is the safety bug most graders ship.
    expect(triage(noFindings(), sameVitalsNoAntipyretic, 'standard')).toBe('URGENT');
  });

  it('applies the same waiver to hypoxia', () => {
    const afebrileOnToci = vitals({ tempC: 37.4, spo2: 91, antipyreticOrTociWithin6h: true });
    expect(triage(noFindings(), afebrileOnToci, 'standard')).toBe('EMERGENT');
  });

  it('does not invent a finding — an antipyretic with normal vitals is still ROUTINE', () => {
    const wellButMedicated = vitals({ antipyreticOrTociWithin6h: true });
    expect(triage(noFindings(), wellButMedicated, 'standard')).toBe('ROUTINE');
  });

  it('cites the waiver in the reasons so a clinician can see why', () => {
    const result = explainTriage(
      noFindings(),
      vitals({ tempC: 37.1, systolicBP: 86, antipyreticOrTociWithin6h: true }),
      'standard'
    );

    expect(result.tier).toBe('EMERGENT');
    expect(result.reasons.map((r) => r.code)).toContain('feverRequirementWaived');
    expect(result.reasons.map((r) => r.code)).toContain('hypotension');
  });
});

/**
 * CASE 2 — the Q-Immune pre-infusion risk tier.
 * A `high` patient escalates one tier sooner on identical input.
 */
describe('triage — Q-Immune risk tier modulation', () => {
  it('escalates a high-risk patient one tier above a standard-risk patient on identical symptoms', () => {
    const f = features({ confusion: true });
    const v = vitals();

    expect(triage(f, v, 'standard')).toBe('URGENT');
    expect(triage(f, v, 'high')).toBe('EMERGENT');
  });

  it('lifts mild findings out of ROUTINE for a high-risk patient', () => {
    const f = features({ headache: true, tremor: true });
    const v = vitals({ tempC: 37.6 });

    expect(triage(f, v, 'standard')).toBe('ROUTINE');
    expect(triage(f, v, 'high')).toBe('URGENT');
  });

  it('does NOT bump a high-risk patient who has no findings at all', () => {
    // Otherwise every high-risk patient sits permanently amber on the board and
    // the signal is worthless.
    expect(triage(noFindings(), vitals(), 'high')).toBe('ROUTINE');
  });

  it('treats elevated risk like standard for now (only `high` shifts a tier)', () => {
    const f = features({ confusion: true });
    expect(triage(f, vitals(), 'elevated')).toBe('URGENT');
  });

  it('cannot escalate past EMERGENT', () => {
    const f = features({ seizure: true });
    expect(triage(f, vitals(), 'high')).toBe('EMERGENT');
  });

  it('records whether the risk tier changed the answer', () => {
    const f = features({ confusion: true });

    expect(explainTriage(f, vitals(), 'high')).toMatchObject({
      baseTier: 'URGENT',
      tier: 'EMERGENT',
      riskTierApplied: true,
    });
    expect(explainTriage(f, vitals(), 'standard')).toMatchObject({
      baseTier: 'URGENT',
      tier: 'URGENT',
      riskTierApplied: false,
    });
  });
});

/** CASE 3 — any reported seizure goes straight to EMERGENT. */
describe('triage — seizure', () => {
  it('is EMERGENT on a reported seizure with nothing else wrong', () => {
    expect(triage(features({ seizure: true }), vitals(), 'standard')).toBe('EMERGENT');
  });

  it('is EMERGENT on a caregiver-reported seizure even for a standard-risk patient', () => {
    const f = features({ seizure: true, consciousness: 'alert', coherence: 'coherent' });
    expect(triage(f, vitals(), 'standard')).toBe('EMERGENT');
  });
});

/**
 * Neuro severity is the MAXIMUM across domains, never a single signal
 * (ASTCT Table 6). Getting this wrong is the most likely clinical bug.
 */
describe('triage — neuro severity is the worst of several domains', () => {
  it('takes the seizure domain over a milder confusion domain', () => {
    const f = features({ confusion: true, seizure: true });
    const result = explainTriage(f, vitals(), 'standard');

    expect(result.tier).toBe('EMERGENT');
    // Both domains are cited, but the worst one sets the tier.
    expect(result.reasons.map((r) => r.code)).toEqual(expect.arrayContaining(['confusion', 'seizure']));
  });

  it('is EMERGENT when the patient is unarousable', () => {
    expect(triage(features({ consciousness: 'unarousable' }), vitals(), 'standard')).toBe('EMERGENT');
  });

  it('is EMERGENT when the patient wakes only to tactile stimulus', () => {
    expect(triage(features({ consciousness: 'wakesToTactile' }), vitals(), 'standard')).toBe('EMERGENT');
  });

  it('is URGENT when the patient wakes to voice', () => {
    expect(triage(features({ consciousness: 'wakesToVoice' }), vitals(), 'standard')).toBe('URGENT');
  });

  it('is EMERGENT on deep focal motor weakness', () => {
    expect(triage(features({ motorWeakness: true }), vitals(), 'standard')).toBe('EMERGENT');
  });

  it('is URGENT on new word-finding difficulty', () => {
    expect(triage(features({ wordFinding: true }), vitals(), 'standard')).toBe('URGENT');
  });

  it('does NOT count tremor toward neuro severity', () => {
    // Tremor and myoclonus are explicitly excluded (SPEC.md §3).
    expect(triage(features({ tremor: true }), vitals(), 'standard')).toBe('ROUTINE');
  });
});

/**
 * The caregiver loop. "Do not say no answer equals grade 4." A missed call is
 * not the same as unarousable.
 */
describe('triage — engaged-but-incoherent vs. no answer', () => {
  it('is EMERGENT when the patient engages but cannot answer coherently', () => {
    expect(triage(features({ coherence: 'incoherent' }), vitals(), 'standard')).toBe('EMERGENT');
  });

  it('is URGENT — not EMERGENT — when the patient simply did not answer', () => {
    const missed = { ...features(), coherence: 'noResponse' as const };
    expect(triage(missed, vitals(), 'standard')).toBe('URGENT');
  });
});

/** The demo money shot (SPEC.md §8) — this exact case must come out EMERGENT. */
describe('triage — Maria, day 7', () => {
  it('escalates the demo case to EMERGENT', () => {
    const maria = features({
      tremor: true, // "I've been a bit shaky"
      wordFinding: true, // "couldn't remember my daughter's name"
      confusion: true,
    });
    const mariaVitals = vitals({ tempC: 38.4, heartRate: 104, restingHrTrendingUp: true });

    // Fever + new neuro symptoms in a Q-Immune high-risk patient.
    expect(triage(maria, mariaVitals, 'high')).toBe('EMERGENT');

    const result = explainTriage(maria, mariaVitals, 'high');
    expect(result.baseTier).toBe('URGENT');
    expect(result.riskTierApplied).toBe(true);
    expect(result.reasons.map((r) => r.code)).toEqual(
      expect.arrayContaining(['fever', 'confusion', 'wordFinding', 'restingHrTrendingUp'])
    );
  });
});

describe('triage — missing data', () => {
  it('does not escalate on absent vitals', () => {
    const noVitals: Vitals = { antipyreticOrTociWithin6h: false };
    expect(triage(noFindings(), noVitals, 'standard')).toBe('ROUTINE');
  });

  it('treats an unmentioned symptom as unknown, not as a finding', () => {
    const f = features({ confusion: 'unknown', seizure: 'unknown' });
    expect(triage(f, vitals(), 'standard')).toBe('ROUTINE');
  });

  it('is URGENT on reported feverishness with no thermometer reading', () => {
    const f = features({ fever: true });
    const v: Vitals = { antipyreticOrTociWithin6h: false };
    expect(triage(f, v, 'standard')).toBe('URGENT');
  });
});
