/**
 * The simulated vitals stream.
 *
 * A scripted time series per patient — temperature, heart rate, blood pressure
 * and SpO₂ over the last 24 hours — expanded from a handful of keyframes and
 * written into FHIR as ordinary Observations.
 *
 * This is the plan, not a fallback. No device, no HealthKit, no file parsing.
 * What matters for the demo is that the agent sees a *trend* and acts on it;
 * where the numbers originate is a production detail. Everything this produces
 * is labelled "simulated" in the UI.
 */

import type { VitalsKeyframe } from './seedData';

/** One moment in the stream. BP and SpO₂ are sampled less often than temp/HR. */
export interface VitalsSample {
  hoursAgo: number;
  tempC: number;
  heartRate: number;
  systolicBP?: number;
  diastolicBP?: number;
  spo2?: number;
}

/** Temperature and heart rate: every 2 hours over the last 24. */
const CORE_INTERVAL_HOURS = 2;
/** Blood pressure and SpO₂: every 6 hours — nobody cuffs themselves hourly. */
const CUFF_INTERVAL_HOURS = 6;
const WINDOW_HOURS = 24;

/**
 * Deterministic jitter in [-1, 1), derived from the patient key, the hour and
 * the field name. Deterministic so the chart is stable across reloads and the
 * tests don't flake.
 */
function jitter(key: string, hoursAgo: number, field: string): number {
  const input = `${key}:${hoursAgo}:${field}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 0xffffffff) * 2 - 1;
}

/** Linear interpolation between the two keyframes bracketing `hoursAgo`. */
function interpolate(keyframes: VitalsKeyframe[], hoursAgo: number, field: keyof Omit<VitalsKeyframe, 'hoursAgo'>): number {
  // Keyframes are authored oldest-first, so `hoursAgo` runs DESCENDING.
  // `older` is the tightest bracket above, `newer` the tightest below.
  const older = [...keyframes].reverse().find((k) => k.hoursAgo >= hoursAgo) ?? keyframes[0];
  const newer = keyframes.find((k) => k.hoursAgo <= hoursAgo) ?? keyframes[keyframes.length - 1];

  if (older === newer || older.hoursAgo === newer.hoursAgo) {
    return newer[field];
  }

  // hoursAgo counts backwards, so `older` has the larger value.
  const span = older.hoursAgo - newer.hoursAgo;
  const progress = (older.hoursAgo - hoursAgo) / span;
  return older[field] + (newer[field] - older[field]) * progress;
}

/**
 * Expand a patient's keyframes into the full stream, oldest first.
 *
 * The reading at `hoursAgo === 0` is exact — no jitter — so the vitals triage()
 * sees are precisely the ones the cohort was designed around.
 */
export function generateVitalsStream(key: string, keyframes: VitalsKeyframe[]): VitalsSample[] {
  const samples: VitalsSample[] = [];

  for (let hoursAgo = WINDOW_HOURS; hoursAgo >= 0; hoursAgo -= CORE_INTERVAL_HOURS) {
    const exact = hoursAgo === 0;
    const noise = (field: keyof Omit<VitalsKeyframe, 'hoursAgo'>, amount: number): number =>
      exact ? 0 : jitter(key, hoursAgo, field) * amount;

    const sample: VitalsSample = {
      hoursAgo,
      tempC: round(interpolate(keyframes, hoursAgo, 'tempC') + noise('tempC', 0.08), 1),
      heartRate: Math.round(interpolate(keyframes, hoursAgo, 'heartRate') + noise('heartRate', 1.5)),
    };

    if (hoursAgo % CUFF_INTERVAL_HOURS === 0) {
      sample.systolicBP = Math.round(interpolate(keyframes, hoursAgo, 'systolicBP') + noise('systolicBP', 2));
      sample.diastolicBP = Math.round(interpolate(keyframes, hoursAgo, 'diastolicBP') + noise('diastolicBP', 2));
      sample.spo2 = Math.min(100, Math.round(interpolate(keyframes, hoursAgo, 'spo2') + noise('spo2', 0.5)));
    }

    samples.push(sample);
  }

  return samples;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
