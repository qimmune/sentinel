import { describe, expect, it } from 'vitest';
import type { Observation, Patient, Reference } from '@medplum/fhirtypes';
import { explainTriage } from '../clinical/triage';
import { buildSeedResources } from '../fhir/seed';
import { SEED_PATIENTS } from '../fhir/seedData';
import { detectVitalsDrift, toVitals, toVitalsSeries } from '../fhir/vitals';
import { toSymptomFeatures } from '../fhir/checkin';
import { noFindings } from '../voice/features';
import { hasWorsened, tierFromRiskAssessment } from './agent';
import { composeHandoverNote } from './handover';
import {
  buildCheckInRequestTask,
  buildEscalationTask,
  buildHandoverCommunication,
  buildRiskAssessment,
} from './resources';

const subject: Reference<Patient> = { reference: 'Patient/test' };
const NOW = '2026-08-01T09:00:00.000Z';

function observationsFor(key: string): Observation[] {
  const seed = SEED_PATIENTS.find((candidate) => candidate.key === key);
  return buildSeedResources(seed!, subject).filter((r): r is Observation => r.resourceType === 'Observation');
}

describe('hasWorsened', () => {
  it('escalates on a rising tier', () => {
    expect(hasWorsened('ROUTINE', 'URGENT')).toBe(true);
    expect(hasWorsened('URGENT', 'EMERGENT')).toBe(true);
  });

  it('stays quiet when the tier is unchanged or improving', () => {
    expect(hasWorsened('URGENT', 'URGENT')).toBe(false);
    expect(hasWorsened('EMERGENT', 'URGENT')).toBe(false);
  });

  it('escalates a first sighting that is already above ROUTINE', () => {
    // "We have never seen this patient before" is not a reason to stay silent.
    expect(hasWorsened(undefined, 'EMERGENT')).toBe(true);
    expect(hasWorsened(undefined, 'URGENT')).toBe(true);
    expect(hasWorsened(undefined, 'ROUTINE')).toBe(false);
  });
});

describe('tierFromRiskAssessment', () => {
  it('round-trips the tier through the resource the agent writes', () => {
    const result = explainTriage({ ...noFindings(), seizure: true }, { antipyreticOrTociWithin6h: false }, 'standard');
    const assessment = buildRiskAssessment(subject, result, NOW);

    expect(tierFromRiskAssessment(assessment)).toBe('EMERGENT');
  });

  it('ignores an assessment that is not one of ours', () => {
    expect(tierFromRiskAssessment(undefined)).toBeUndefined();
    expect(
      tierFromRiskAssessment({
        resourceType: 'RiskAssessment',
        status: 'final',
        subject,
        prediction: [{ qualitativeRisk: { coding: [{ system: 'http://example.com', code: 'high' }] } }],
      })
    ).toBeUndefined();
  });

  it('carries the reasoning onto the resource', () => {
    const result = explainTriage({ ...noFindings(), confusion: true }, { antipyreticOrTociWithin6h: false }, 'standard');
    const assessment = buildRiskAssessment(subject, result, NOW);

    expect(assessment.note?.some((note) => note.text?.includes('New confusion'))).toBe(true);
  });
});

describe('drift detection', () => {
  it('fires on Maria — temperature and heart rate climbing together', () => {
    const drift = detectVitalsDrift(observationsFor('sentinel-maria'));

    expect(drift.drifting).toBe(true);
    expect(drift.tempRiseC).toBeGreaterThan(0.6);
    expect(drift.heartRateRiseBpm).toBeGreaterThan(10);
  });

  it('stays quiet on everyone else', () => {
    for (const seed of SEED_PATIENTS.filter((candidate) => candidate.key !== 'sentinel-maria')) {
      expect(detectVitalsDrift(observationsFor(seed.key)).drifting, `${seed.given} should not be drifting`).toBe(false);
    }
  });

  it("does not fire on James, whose temperature is falling as his BP drops", () => {
    // He is EMERGENT for other reasons. Drift is about deciding to *ask*, and
    // a falling temperature is not a reason to ring someone.
    const drift = detectVitalsDrift(observationsFor('sentinel-james'));
    expect(drift.drifting).toBe(false);
    expect(drift.tempRiseC).toBeLessThan(0);
  });

  it('needs both signals, not just one', () => {
    const heartRateOnly = observationsFor('sentinel-maria').filter(
      (o) => !o.code?.coding?.some((c) => c.code === '8310-5')
    );
    expect(detectVitalsDrift(heartRateOnly).drifting).toBe(false);
  });
});

describe('the handover note', () => {
  function noteFor(key: string): string {
    const seed = SEED_PATIENTS.find((candidate) => candidate.key === key)!;
    const resources = buildSeedResources(seed, subject);
    const observations = resources.filter((r): r is Observation => r.resourceType === 'Observation');
    const checkIn = resources.find((r) => r.resourceType === 'QuestionnaireResponse');
    const series = toVitalsSeries(observations);

    return composeHandoverNote({
      patientName: `${seed.given} ${seed.family}`,
      dayPostInfusion: seed.dayPostInfusion,
      riskTier: seed.riskTier,
      result: explainTriage(toSymptomFeatures(checkIn as never), toVitals(observations), seed.riskTier),
      drift: detectVitalsDrift(observations),
      temperature: series.temperature,
      heartRate: series.heartRate,
      transcript: seed.transcript,
    });
  }

  it("leads with who, how worried, and why", () => {
    const note = noteFor('sentinel-maria');

    expect(note).toContain('Maria Delgado');
    expect(note).toContain('day +7');
    expect(note).toContain('EMERGENT');
  });

  it('names the Q-Immune shift when it changed the answer', () => {
    expect(noteFor('sentinel-maria')).toContain('raised from URGENT');
    expect(noteFor('sentinel-walter')).toContain('raised from ROUTINE');
  });

  it('includes the overnight trend when there is one', () => {
    const note = noteFor('sentinel-maria');
    expect(note).toMatch(/temperature has risen/i);
    expect(note).toContain('heart rate');
  });

  it('omits the trend sentence for a patient who is not drifting', () => {
    expect(noteFor('sentinel-priya')).not.toMatch(/temperature has risen/i);
  });

  it("keeps the patient's own words", () => {
    expect(noteFor('sentinel-maria')).toContain("couldn't remember my daughter's name");
  });

  it('stays to a readable length', () => {
    for (const seed of SEED_PATIENTS) {
      expect(noteFor(seed.key).length, `${seed.given}'s note`).toBeLessThan(600);
    }
  });
});

/**
 * The note explains the decision. It must never be able to change it.
 */
describe('the note cannot influence the decision', () => {
  it('is built from an already-decided TriageResult', () => {
    const result = explainTriage({ ...noFindings(), confusion: true }, { antipyreticOrTociWithin6h: false }, 'standard');
    const before = result.tier;

    composeHandoverNote({
      patientName: 'Test',
      riskTier: 'standard',
      result,
      drift: { drifting: false, windowHours: 8 },
      temperature: [],
      heartRate: [],
    });

    expect(result.tier).toBe(before);
  });

  it('labels its provenance honestly and leads the payload with it', () => {
    const communication = buildHandoverCommunication(subject, 'Some note text.', NOW);
    const payload = communication.payload?.[0]?.contentString ?? '';

    // No model wrote this, so it must not claim one did.
    expect(payload).toContain('Auto-generated summary');
    expect(payload).not.toContain('AI-drafted');
    expect(payload.indexOf('Auto-generated')).toBeLessThan(payload.indexOf('Some note text.'));
  });
});

describe('the resources the agent writes', () => {
  it('assigns escalations to a named clinician, not a placeholder', () => {
    const result = explainTriage({ ...noFindings(), seizure: true }, { antipyreticOrTociWithin6h: false }, 'standard');
    const task = buildEscalationTask(subject, result, 'ROUTINE', NOW);

    expect(task.owner?.reference).toBe('Practitioner/202cc49d-e87e-43a7-b03d-53c938460ea2');
    expect(task.status).toBe('requested');
    expect(task.priority).toBe('stat');
    expect(task.description).toContain('ROUTINE → EMERGENT');
  });

  it('addresses a check-in request to the patient, not the clinician', () => {
    const task = buildCheckInRequestTask(subject, 'Temperature up 1.4 °C.', NOW);

    expect(task.owner?.reference).toBe('Patient/test');
    expect(task.status).toBe('requested');
    expect(task.intent).toBe('proposal');
  });
});
