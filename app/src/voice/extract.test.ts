import { describe, expect, it } from 'vitest';
import { ICE_ASSESSABLE_POINTS } from '../clinical/thresholds';
import { triage } from '../clinical/triage';
import { RECORDED_STEPS } from './checkInScript';
import { extractFeatures, normalize, parseYesNo, type CheckInAnswer } from './extract';

const NOW = new Date('2026-08-01T09:00:00Z');
const CONTEXT = { now: NOW, expectedCity: 'San Francisco' };

/** A full, perfect check-in. Override individual answers per test. */
function answers(overrides: Record<string, string> = {}): CheckInAnswer[] {
  const perfect: Record<string, string> = {
    fever: 'No, not at all.',
    headache: 'No.',
    dizzinessOnStanding: 'No, I feel steady.',
    tremor: 'No.',
    drowsiness: 'No, I slept well.',
    wordFinding: 'No, no trouble.',
    confusion: 'No.',
    seizure: 'No, nothing like that.',
    'ice-year': "It's 2026.",
    'ice-month': "August, isn't it?",
    'ice-city': "I'm in San Francisco.",
    'ice-place': 'At home, in my kitchen.',
    'ice-recall': 'Clock, pen and button.',
    'ice-attention': '100, 90, 80, 70, 60.',
  };
  const merged = { ...perfect, ...overrides };
  return Object.entries(merged).map(([stepId, transcript]) => ({ stepId, transcript }));
}

describe('parseYesNo', () => {
  it('reads plain answers', () => {
    expect(parseYesNo('Yes')).toBe(true);
    expect(parseYesNo('No')).toBe(false);
  });

  it('reads the hedged answers patients actually give', () => {
    expect(parseYesNo('A little bit, yeah')).toBe(true);
    expect(parseYesNo('Sometimes')).toBe(true);
    expect(parseYesNo('Yes, once or twice')).toBe(true);
  });

  it('takes whichever of yes or no comes first', () => {
    expect(parseYesNo('No, not really')).toBe(false);
    expect(parseYesNo('Not since yesterday')).toBe(false);
    expect(parseYesNo("No, I haven't had any")).toBe(false);
    expect(parseYesNo('Yeah, but no worse than before')).toBe(true);
  });

  it("returns unknown when the answer doesn't contain one", () => {
    // Silence is a gap in the check-in, never a denial.
    expect(parseYesNo('')).toBe('unknown');
    expect(parseYesNo('Um.')).toBe('unknown');
    expect(parseYesNo('Could you repeat that?')).toBe('unknown');
  });

  it('is not fooled by "no" inside another word', () => {
    expect(parseYesNo('I know what you mean, I have had them')).toBe('unknown');
  });
});

describe('normalize', () => {
  it('strips punctuation, case and apostrophes', () => {
    expect(normalize("Yes — I've had a HEADACHE!")).toBe('yes ive had a headache');
  });
});

describe('extractFeatures — symptoms', () => {
  it('maps each answer onto its feature', () => {
    const { features } = extractFeatures(
      answers({ headache: 'Yes, since last night.', tremor: 'Yeah, my hands.' }),
      CONTEXT
    );

    expect(features.headache).toBe(true);
    expect(features.tremor).toBe(true);
    expect(features.fever).toBe(false);
    expect(features.seizure).toBe(false);
  });

  it('leaves unanswered questions unknown rather than false', () => {
    const partial = answers().filter((answer) => answer.stepId !== 'seizure');
    const { features } = extractFeatures(partial, CONTEXT);

    expect(features.seizure).toBe('unknown');
    expect(features.headache).toBe(false);
  });

  it('records no answers at all as noResponse, not as denials', () => {
    const { features } = extractFeatures([], CONTEXT);

    expect(features.coherence).toBe('unknown');
    expect(features.fever).toBe('unknown');
    expect(features.seizure).toBe('unknown');
  });

  it('flags a patient who was engaged but silent throughout', () => {
    const silent = answers().map((answer) => ({ ...answer, transcript: '' }));
    expect(extractFeatures(silent, CONTEXT).features.coherence).toBe('noResponse');
  });
});

describe('extractFeatures — ICE scoring', () => {
  it('gives full marks for a perfect screen', () => {
    const { features, iceComplete } = extractFeatures(answers(), CONTEXT);

    expect(iceComplete).toBe(true);
    expect(features.iceScore).toBe(ICE_ASSESSABLE_POINTS);
  });

  it('scores orientation against the real date and the patient city', () => {
    const { features } = extractFeatures(
      answers({ 'ice-year': "It's 2019 I think.", 'ice-month': 'March?' }),
      CONTEXT
    );

    // Lost both orientation points.
    expect(features.iceScore).toBe(ICE_ASSESSABLE_POINTS - 2);
  });

  it('accepts a spoken year as well as digits', () => {
    const spoken = extractFeatures(answers({ 'ice-year': 'Twenty twenty six.' }), CONTEXT);
    expect(spoken.features.iceScore).toBe(ICE_ASSESSABLE_POINTS);
  });

  it('scores recall one point per remembered word', () => {
    const two = extractFeatures(answers({ 'ice-recall': 'A clock and a pen. I forget the last one.' }), CONTEXT);
    expect(two.features.iceScore).toBe(ICE_ASSESSABLE_POINTS - 1);

    const none = extractFeatures(answers({ 'ice-recall': "I can't remember any of them." }), CONTEXT);
    expect(none.features.iceScore).toBe(ICE_ASSESSABLE_POINTS - 3);
  });

  it('accepts counting backwards spoken as words or digits', () => {
    const digits = extractFeatures(answers({ 'ice-attention': '100 90 80' }), CONTEXT);
    expect(digits.features.iceScore).toBe(ICE_ASSESSABLE_POINTS);

    const words = extractFeatures(answers({ 'ice-attention': 'A hundred, ninety, eighty, seventy.' }), CONTEXT);
    expect(words.features.iceScore).toBe(ICE_ASSESSABLE_POINTS);
  });

  it('does not award attention for a wrong or too-short sequence', () => {
    const wrong = extractFeatures(answers({ 'ice-attention': '100, 95, 90.' }), CONTEXT);
    expect(wrong.features.iceScore).toBe(ICE_ASSESSABLE_POINTS - 1);
  });

  it('reports unknown rather than a low score when the screen is unfinished', () => {
    // A half-done check-in must not read as a cognitive deficit.
    const partial = answers().filter((answer) => !answer.stepId.startsWith('ice-recall'));
    const { features, iceComplete } = extractFeatures(partial, CONTEXT);

    expect(iceComplete).toBe(false);
    expect(features.iceScore).toBe('unknown');
  });

  it('breaks the score down per item for the audit panel', () => {
    const { iceItems } = extractFeatures(answers({ 'ice-recall': 'Clock and button.' }), CONTEXT);
    const recall = iceItems.find((item) => item.stepId === 'ice-recall');

    expect(recall).toMatchObject({ earned: 2, possible: 3, answer: 'Clock and button.' });
    expect(iceItems.reduce((sum, item) => sum + item.possible, 0)).toBe(ICE_ASSESSABLE_POINTS);
  });
});

/**
 * The boundary. extract.ts observes; triage.ts decides. If this test ever
 * fails, the project's central claim is no longer true.
 */
describe('extract.ts never decides urgency', () => {
  it('returns no tier, severity, grade or recommendation', () => {
    const { features } = extractFeatures(answers({ seizure: 'Yes, this morning.' }), CONTEXT);
    const keys = Object.keys(features).map((key) => key.toLowerCase());

    for (const forbidden of ['tier', 'severity', 'grade', 'urgency', 'recommendation', 'advice', 'action']) {
      expect(keys.some((key) => key.includes(forbidden)), `features must not expose "${forbidden}"`).toBe(false);
    }

    const serialised = JSON.stringify(features);
    for (const forbidden of ['ROUTINE', 'URGENT', 'EMERGENT']) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  it('produces features that only become a tier once triage() runs', () => {
    const { features } = extractFeatures(answers({ seizure: 'Yes, this morning.' }), CONTEXT);
    const vitals = { antipyreticOrTociWithin6h: false };

    expect(features.seizure).toBe(true);
    expect(triage(features, vitals, 'standard')).toBe('EMERGENT');
  });
});

describe('the script and the extractor agree', () => {
  it('has an extraction path for every recorded step', () => {
    for (const step of RECORDED_STEPS) {
      const handled = step.kind === 'symptom' ? step.feature !== undefined : step.points !== undefined;
      expect(handled, `step "${step.id}" is recorded but never scored`).toBe(true);
    }
  });

  it('offers exactly the ICE points voice can assess', () => {
    const total = RECORDED_STEPS.reduce((sum, step) => sum + (step.points ?? 0), 0);
    expect(total).toBe(ICE_ASSESSABLE_POINTS);
  });
});
