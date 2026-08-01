/**
 * The FHIR layer has to survive a round trip: what we write as Observations and
 * a QuestionnaireResponse has to read back as the same Vitals and
 * SymptomFeatures that triage() consumes. A shape bug here is silent — the
 * board just quietly stops escalating.
 *
 * These run without a server, which also means the demo cohort can be verified
 * before it is ever written to Medplum.
 */

import { describe, expect, it } from 'vitest';
import type { Observation, Patient, QuestionnaireResponse, Reference } from '@medplum/fhirtypes';
import { triage, type Vitals } from '../clinical/triage';
import { noFindings } from '../voice/features';
import { buildCheckInResponse, getTranscript, toSymptomFeatures } from './checkin';
import { buildSeedResources } from './seed';
import { SEED_PATIENTS, currentVitals } from './seedData';
import { generateVitalsStream } from './simulatedStream';
import { buildQuantityObservations, buildVitalsObservations, isHeartRateTrendingUp, toVitals, toVitalsSeries } from './vitals';

const subject: Reference<Patient> = { reference: 'Patient/test' };

describe('vitals <-> Observations', () => {
  it('round-trips a full reading', () => {
    const original: Vitals = {
      tempC: 38.4,
      heartRate: 104,
      systolicBP: 108,
      diastolicBP: 70,
      spo2: 96,
      antipyreticOrTociWithin6h: false,
    };

    const observations = buildVitalsObservations(subject, original, new Date().toISOString());
    const readBack = toVitals(observations);

    expect(readBack.tempC).toBe(38.4);
    expect(readBack.heartRate).toBe(104);
    expect(readBack.systolicBP).toBe(108);
    expect(readBack.diastolicBP).toBe(70);
    expect(readBack.spo2).toBe(96);
    expect(readBack.antipyreticOrTociWithin6h).toBe(false);
  });

  it('round-trips the antipyretic flag — the one that must not get lost', () => {
    const observations = buildVitalsObservations(
      subject,
      { tempC: 37.1, systolicBP: 86, antipyreticOrTociWithin6h: true },
      new Date().toISOString()
    );

    expect(toVitals(observations).antipyreticOrTociWithin6h).toBe(true);
    // And the whole point: it still escalates through the FHIR round trip.
    expect(triage(noFindings(), toVitals(observations), 'standard')).toBe('EMERGENT');
  });

  it('leaves absent vitals undefined rather than zero', () => {
    const observations = buildVitalsObservations(subject, { antipyreticOrTociWithin6h: false }, new Date().toISOString());
    const readBack = toVitals(observations);

    expect(readBack.tempC).toBeUndefined();
    expect(readBack.systolicBP).toBeUndefined();
  });

  it('detects a rising resting heart rate', () => {
    // Timestamps must be explicit and distinct. Stamping every reading with
    // `new Date()` at construction time makes the test depend on whether the
    // clock happens to tick mid-loop: toVitals() sorts by effectiveDateTime, so
    // identical timestamps only preserve the intended order by accident.
    const hr = (value: number, hoursAgo: number): Observation =>
      buildQuantityObservations(
        subject,
        { heartRate: value },
        new Date(Date.now() - hoursAgo * 3_600_000).toISOString()
      )[0];

    expect(isHeartRateTrendingUp([hr(104, 0), hr(88, 2), hr(84, 4), hr(82, 6)])).toBe(true);
    expect(isHeartRateTrendingUp([hr(80, 0), hr(78, 2), hr(80, 4), hr(79, 6)])).toBe(false);
    // Not enough history to call a trend.
    expect(isHeartRateTrendingUp([hr(110, 0), hr(70, 2)])).toBe(false);
  });

  it('reads the latest heart rate regardless of the order it was handed', () => {
    // The real guard: the same readings shuffled must give the same answer.
    const hr = (value: number, hoursAgo: number): Observation =>
      buildQuantityObservations(
        subject,
        { heartRate: value },
        new Date(Date.now() - hoursAgo * 3_600_000).toISOString()
      )[0];

    const readings = [hr(104, 0), hr(88, 2), hr(84, 4), hr(82, 6)];

    expect(isHeartRateTrendingUp(readings)).toBe(true);
    expect(isHeartRateTrendingUp([...readings].reverse())).toBe(true);
    expect(toVitals(readings).heartRate).toBe(104);
    expect(toVitals([...readings].reverse()).heartRate).toBe(104);
  });
});

describe('symptom features <-> QuestionnaireResponse', () => {
  it('round-trips a check-in', () => {
    const original = { ...noFindings(), confusion: true as const, wordFinding: true as const, tremor: true as const };
    const response = buildCheckInResponse(subject, original, new Date().toISOString(), 'transcript here');

    expect(toSymptomFeatures(response)).toEqual(original);
    expect(getTranscript(response)).toBe('transcript here');
  });

  it('keeps "not mentioned" distinct from "denied"', () => {
    const partial = { ...noFindings(), seizure: 'unknown' as const };
    const response = buildCheckInResponse(subject, partial, new Date().toISOString());

    // Absent from the resource entirely...
    expect(response.item?.some((i) => i.linkId === 'seizure')).toBe(false);
    // ...and still 'unknown' on the way back, not false.
    expect(toSymptomFeatures(response).seizure).toBe('unknown');
    expect(toSymptomFeatures(response).headache).toBe(false);
  });

  it('round-trips consciousness and coherence', () => {
    const original = { ...noFindings(), consciousness: 'wakesToVoice' as const, coherence: 'incoherent' as const };
    const response = buildCheckInResponse(subject, original, new Date().toISOString());

    expect(toSymptomFeatures(response).consciousness).toBe('wakesToVoice');
    expect(toSymptomFeatures(response).coherence).toBe('incoherent');
  });
});

/**
 * The board has to look right. Verify each seeded patient lands on the tier
 * they were written to demonstrate — through the real FHIR round trip, not
 * from the seed literals.
 */
describe('the demo cohort triages as designed', () => {
  const expected: Record<string, string> = {
    'sentinel-maria': 'EMERGENT',
    'sentinel-james': 'EMERGENT',
    'sentinel-priya': 'URGENT',
    'sentinel-walter': 'URGENT',
    'sentinel-aisha': 'ROUTINE',
  };

  for (const seed of SEED_PATIENTS) {
    it(`${seed.given} ${seed.family} is ${expected[seed.key]}`, () => {
      const resources = buildSeedResources(seed, subject);
      const observations = resources.filter((r): r is Observation => r.resourceType === 'Observation');
      const checkIn = resources.find((r): r is QuestionnaireResponse => r.resourceType === 'QuestionnaireResponse');

      const tier = triage(toSymptomFeatures(checkIn!), toVitals(observations), seed.riskTier);
      expect(tier).toBe(expected[seed.key]);
    });
  }

  it("computes Maria's heart-rate trend from her Observations, not a hardcoded flag", () => {
    const maria = SEED_PATIENTS.find((p) => p.key === 'sentinel-maria');
    const observations = buildSeedResources(maria!, subject).filter(
      (r): r is Observation => r.resourceType === 'Observation'
    );

    // Nothing in the seed data asserts the trend — it falls out of the stream.
    expect(toVitals(observations).restingHrTrendingUp).toBe(true);
  });

  it('does not trip the trend detector on the patients who are not drifting', () => {
    for (const seed of SEED_PATIENTS.filter((p) => p.key !== 'sentinel-maria')) {
      const observations = buildSeedResources(seed, subject).filter(
        (r): r is Observation => r.resourceType === 'Observation'
      );
      expect(toVitals(observations).restingHrTrendingUp, `${seed.given} should not be trending`).toBe(false);
    }
  });

  it('reads the current vitals back exactly as authored', () => {
    for (const seed of SEED_PATIENTS) {
      const observations = buildSeedResources(seed, subject).filter(
        (r): r is Observation => r.resourceType === 'Observation'
      );
      const readBack = toVitals(observations);
      const authored = currentVitals(seed);

      expect(readBack.tempC, seed.given).toBe(authored.tempC);
      expect(readBack.heartRate, seed.given).toBe(authored.heartRate);
      expect(readBack.systolicBP, seed.given).toBe(authored.systolicBP);
      expect(readBack.spo2, seed.given).toBe(authored.spo2);
      expect(readBack.antipyreticOrTociWithin6h, seed.given).toBe(authored.antipyreticOrTociWithin6h);
    }
  });
});

describe('the simulated vitals stream', () => {
  const maria = SEED_PATIENTS.find((p) => p.key === 'sentinel-maria')!;

  it('samples temp and HR every 2 hours over 24 hours', () => {
    const stream = generateVitalsStream(maria.key, maria.keyframes);

    expect(stream).toHaveLength(13);
    expect(stream[0].hoursAgo).toBe(24);
    expect(stream.at(-1)?.hoursAgo).toBe(0);
    expect(stream.every((s) => s.tempC !== undefined && s.heartRate !== undefined)).toBe(true);
  });

  it('samples BP and SpO₂ less often — nobody cuffs themselves hourly', () => {
    const stream = generateVitalsStream(maria.key, maria.keyframes);
    const cuffed = stream.filter((s) => s.systolicBP !== undefined);

    expect(cuffed).toHaveLength(5);
    expect(cuffed.map((s) => s.hoursAgo)).toEqual([24, 18, 12, 6, 0]);
  });

  it('writes the current reading exactly, with no jitter', () => {
    const now = generateVitalsStream(maria.key, maria.keyframes).at(-1);
    const authored = maria.keyframes.at(-1);

    // triage() acts on this point, so it must be the designed value.
    expect(now?.tempC).toBe(authored?.tempC);
    expect(now?.heartRate).toBe(authored?.heartRate);
    expect(now?.systolicBP).toBe(authored?.systolicBP);
  });

  it('is deterministic across runs', () => {
    expect(generateVitalsStream(maria.key, maria.keyframes)).toEqual(
      generateVitalsStream(maria.key, maria.keyframes)
    );
  });

  it("scripts Maria's overnight drift — temp and HR climbing over the last six hours", () => {
    const stream = generateVitalsStream(maria.key, maria.keyframes);
    const at = (hoursAgo: number) => stream.find((s) => s.hoursAgo === hoursAgo)!;

    // Flat through the night...
    expect(at(24).tempC).toBeLessThan(37.1);
    expect(at(12).tempC).toBeLessThan(37.2);
    // ...then climbing.
    expect(at(6).tempC).toBeGreaterThan(at(12).tempC);
    expect(at(2).tempC).toBeGreaterThan(at(6).tempC);
    expect(at(0).tempC).toBeGreaterThan(at(2).tempC);

    expect(at(0).heartRate).toBeGreaterThan(at(6).heartRate);
    expect(at(6).heartRate).toBeGreaterThan(at(24).heartRate);
  });

  it("keeps James's temperature falling while his blood pressure keeps dropping", () => {
    // The curve that makes a fever-gated rule look reassuring.
    const james = SEED_PATIENTS.find((p) => p.key === 'sentinel-james')!;
    const stream = generateVitalsStream(james.key, james.keyframes);
    const at = (hoursAgo: number) => stream.find((s) => s.hoursAgo === hoursAgo)!;

    expect(at(6).tempC).toBeGreaterThan(at(0).tempC);
    expect(at(24).systolicBP!).toBeGreaterThan(at(12).systolicBP!);
    expect(at(12).systolicBP!).toBeGreaterThan(at(0).systolicBP!);
  });

  it('plots as a time series, oldest first', () => {
    const observations = buildSeedResources(maria, subject).filter(
      (r): r is Observation => r.resourceType === 'Observation'
    );
    const series = toVitalsSeries(observations);

    expect(series.temperature).toHaveLength(13);
    expect(series.systolic).toHaveLength(5);
    expect(series.temperature.map((p) => p.time)).toEqual([...series.temperature.map((p) => p.time)].sort());
    expect(series.temperature.at(-1)?.value).toBe(38.4);
  });

  it('escalates Walter only because of his Q-Immune risk tier', () => {
    const walter = SEED_PATIENTS.find((p) => p.key === 'sentinel-walter');
    const resources = buildSeedResources(walter!, subject);
    const observations = resources.filter((r): r is Observation => r.resourceType === 'Observation');
    const checkIn = resources.find((r): r is QuestionnaireResponse => r.resourceType === 'QuestionnaireResponse');

    const features = toSymptomFeatures(checkIn!);
    const vitals = toVitals(observations);

    expect(triage(features, vitals, 'high')).toBe('URGENT');
    expect(triage(features, vitals, 'standard')).toBe('ROUTINE');
  });
});
