/**
 * Vitals <-> FHIR Observations.
 *
 * Note on blood pressure: SPEC.md §4 lists systolic and diastolic as separate
 * LOINC-coded rows, so that is what we write. Production would normally use the
 * 85354-9 BP panel with the two as components; the codes are the same either
 * way and the panel is a five-minute change if a reviewer asks for it.
 */

import type { Observation, Reference, Patient } from '@medplum/fhirtypes';
import type { Vitals } from '../clinical/triage';
import {
  LOINC,
  LOINC_BODY_TEMPERATURE,
  LOINC_DIASTOLIC_BP,
  LOINC_HEART_RATE,
  LOINC_SPO2,
  LOINC_SYSTOLIC_BP,
  OBSERVATION_CATEGORY,
  SENTINEL_ANTIPYRETIC,
  SENTINEL_CODE_SYSTEM,
  SENTINEL_IDENTIFIER_SYSTEM,
  UCUM,
} from './codes';

/** The measurable part of a reading — no medication flag. */
export interface Measurements {
  tempC?: number;
  heartRate?: number;
  systolicBP?: number;
  diastolicBP?: number;
  spo2?: number;
}

interface QuantitySpec {
  code: string;
  display: string;
  value: number;
  unit: string;
  ucum: string;
}

function quantitySpecs(measurements: Measurements): QuantitySpec[] {
  const specs: QuantitySpec[] = [];
  if (measurements.tempC !== undefined) {
    specs.push({ code: LOINC_BODY_TEMPERATURE, display: 'Body temperature', value: measurements.tempC, unit: '°C', ucum: 'Cel' });
  }
  if (measurements.heartRate !== undefined) {
    specs.push({ code: LOINC_HEART_RATE, display: 'Heart rate', value: measurements.heartRate, unit: '/min', ucum: '/min' });
  }
  if (measurements.systolicBP !== undefined) {
    specs.push({ code: LOINC_SYSTOLIC_BP, display: 'Systolic blood pressure', value: measurements.systolicBP, unit: 'mmHg', ucum: 'mm[Hg]' });
  }
  if (measurements.diastolicBP !== undefined) {
    specs.push({ code: LOINC_DIASTOLIC_BP, display: 'Diastolic blood pressure', value: measurements.diastolicBP, unit: 'mmHg', ucum: 'mm[Hg]' });
  }
  if (measurements.spo2 !== undefined) {
    specs.push({ code: LOINC_SPO2, display: 'Oxygen saturation', value: measurements.spo2, unit: '%', ucum: '%' });
  }
  return specs;
}

/**
 * The measured vitals as Observations. Used for both one-off readings and every
 * point in the simulated stream.
 *
 * @param subject - the patient
 * @param measurements - the reading
 * @param effectiveDateTime - when it was taken (ISO)
 * @param seedKey - optional stable key, so seeded data can be recognised later
 */
export function buildQuantityObservations(
  subject: Reference<Patient>,
  measurements: Measurements,
  effectiveDateTime: string,
  seedKey?: string
): Observation[] {
  return quantitySpecs(measurements).map((spec) => ({
    resourceType: 'Observation',
    status: 'final',
    category: [{ coding: [{ system: OBSERVATION_CATEGORY, code: 'vital-signs', display: 'Vital Signs' }] }],
    code: { coding: [{ system: LOINC, code: spec.code, display: spec.display }], text: spec.display },
    subject,
    effectiveDateTime,
    valueQuantity: { value: spec.value, unit: spec.unit, system: UCUM, code: spec.ucum },
    ...(seedKey ? { identifier: [{ system: SENTINEL_IDENTIFIER_SYSTEM, value: `${seedKey}-${spec.code}` }] } : {}),
  }));
}

/**
 * The antipyretic flag: one coded boolean Observation, nothing more. No
 * MedicationAdministration, no medication graph search.
 *
 * Category is `survey`, not `vital-signs` — a vital-signs Observation is
 * required to carry a Quantity, and this is a yes/no.
 */
export function buildAntipyreticObservation(
  subject: Reference<Patient>,
  taken: boolean,
  effectiveDateTime: string,
  seedKey?: string
): Observation {
  return {
    resourceType: 'Observation',
    status: 'final',
    category: [{ coding: [{ system: OBSERVATION_CATEGORY, code: 'survey', display: 'Survey' }] }],
    code: {
      coding: [
        {
          system: SENTINEL_CODE_SYSTEM,
          code: SENTINEL_ANTIPYRETIC,
          display: 'Antipyretic or tocilizumab within 6 hours',
        },
      ],
      text: 'Antipyretic or tocilizumab within 6 hours',
    },
    subject,
    effectiveDateTime,
    valueBoolean: taken,
    ...(seedKey
      ? { identifier: [{ system: SENTINEL_IDENTIFIER_SYSTEM, value: `${seedKey}-${SENTINEL_ANTIPYRETIC}` }] }
      : {}),
  };
}

/** A complete reading from the vitals form: measurements plus the med flag. */
export function buildVitalsObservations(
  subject: Reference<Patient>,
  vitals: Vitals,
  effectiveDateTime: string,
  seedKey?: string
): Observation[] {
  return [
    ...buildQuantityObservations(subject, vitals, effectiveDateTime, seedKey),
    buildAntipyreticObservation(subject, vitals.antipyreticOrTociWithin6h, effectiveDateTime, seedKey),
  ];
}

/**
 * Everything matching a code, newest first.
 *
 * Sorted here rather than trusting the caller: a search that came back in a
 * different order would otherwise make triage() silently read a stale vital,
 * and nothing would look wrong.
 */
function matching(observations: Observation[], system: string, code: string): Observation[] {
  return observations
    .filter((o) => o.code?.coding?.some((c) => c.system === system && c.code === code))
    .sort((a, b) => (b.effectiveDateTime ?? '').localeCompare(a.effectiveDateTime ?? ''));
}

function valueOf(observations: Observation[], system: string, code: string): number | undefined {
  return matching(observations, system, code)[0]?.valueQuantity?.value;
}

/**
 * Collapse a patient's Observations into the latest reading of each vital.
 *
 * @param observations - the patient's Observations, in any order
 */
export function toVitals(observations: Observation[]): Vitals {
  const antipyretic = matching(observations, SENTINEL_CODE_SYSTEM, SENTINEL_ANTIPYRETIC)[0];

  return {
    tempC: valueOf(observations, LOINC, LOINC_BODY_TEMPERATURE),
    heartRate: valueOf(observations, LOINC, LOINC_HEART_RATE),
    systolicBP: valueOf(observations, LOINC, LOINC_SYSTOLIC_BP),
    diastolicBP: valueOf(observations, LOINC, LOINC_DIASTOLIC_BP),
    spo2: valueOf(observations, LOINC, LOINC_SPO2),
    // Absent means "not asked". Treat that as false rather than escalating on a
    // gap, but note that the vitals form always writes this field.
    antipyreticOrTociWithin6h: antipyretic?.valueBoolean === true,
    restingHrTrendingUp: isHeartRateTrendingUp(observations),
  };
}

/**
 * Crude trend detector for the simulated stream: is the most recent resting HR
 * meaningfully above the earlier readings in the window?
 *
 * @param observations - the patient's Observations, in any order
 */
export function isHeartRateTrendingUp(observations: Observation[]): boolean {
  const readings = matching(observations, LOINC, LOINC_HEART_RATE)
    .map((o) => o.valueQuantity?.value)
    .filter((v): v is number => v !== undefined);

  if (readings.length < 3) {
    return false;
  }

  const latest = readings[0];
  const earlier = readings.slice(1);
  const baseline = earlier.reduce((sum, v) => sum + v, 0) / earlier.length;
  return latest - baseline >= 15;
}

export interface VitalsPoint {
  /** ISO instant. */
  time: string;
  value: number;
}

/** The plottable stream, each series sorted OLDEST FIRST. */
export interface VitalsSeries {
  temperature: VitalsPoint[];
  heartRate: VitalsPoint[];
  systolic: VitalsPoint[];
  diastolic: VitalsPoint[];
  spo2: VitalsPoint[];
}

function seriesFor(observations: Observation[], code: string): VitalsPoint[] {
  return observations
    .filter((o) => o.code?.coding?.some((c) => c.system === LOINC && c.code === code))
    .flatMap((o) => {
      const time = o.effectiveDateTime;
      const value = o.valueQuantity?.value;
      return time !== undefined && value !== undefined ? [{ time, value }] : [];
    })
    .sort((a, b) => a.time.localeCompare(b.time));
}

/** Pull the chartable time series out of a patient's Observations. */
export function toVitalsSeries(observations: Observation[]): VitalsSeries {
  return {
    temperature: seriesFor(observations, LOINC_BODY_TEMPERATURE),
    heartRate: seriesFor(observations, LOINC_HEART_RATE),
    systolic: seriesFor(observations, LOINC_SYSTOLIC_BP),
    diastolic: seriesFor(observations, LOINC_DIASTOLIC_BP),
    spo2: seriesFor(observations, LOINC_SPO2),
  };
}
