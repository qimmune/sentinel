/**
 * The five synthetic patients. Day +3 to +12 post-infusion.
 *
 * Synthetic data only — this is the plan, not a fallback. No real PHI.
 *
 * Each patient is here to exercise a different rule, so the cohort board tells
 * the whole clinical story at a glance:
 *
 *   Maria   EMERGENT  fever + new neuro symptoms, lifted by the high-risk shift
 *   James   EMERGENT  afebrile on Tylenol with a low BP — the fever-gate bug
 *   Priya   URGENT    fever alone (ASTCT grade 1)
 *   Walter  URGENT    mild findings only, lifted purely by the high-risk shift
 *   Aisha   ROUTINE   well
 *
 * Vitals are authored as KEYFRAMES over the last 24 hours, oldest first. The
 * full stream is interpolated from these — see simulatedStream.ts. The keyframe
 * at `hoursAgo: 0` is the reading triage() acts on, so it is written exactly,
 * with no jitter.
 */

import type { Patient } from '@medplum/fhirtypes';
import type { RiskTier, Vitals } from '../clinical/triage';
import { noFindings, type SymptomFeatures } from '../voice/features';

export interface VitalsKeyframe {
  hoursAgo: number;
  tempC: number;
  heartRate: number;
  systolicBP: number;
  diastolicBP: number;
  spo2: number;
}

export interface SeedPatient {
  key: string;
  given: string;
  family: string;
  gender: Patient['gender'];
  birthDate: string;
  /** Home city — the ground truth for the ICE orientation item. */
  city: string;
  dayPostInfusion: number;
  riskTier: RiskTier;
  /** Oldest first. The last entry (hoursAgo 0) is the current reading. */
  keyframes: VitalsKeyframe[];
  antipyreticOrTociWithin6h: boolean;
  features: SymptomFeatures;
  transcript: string;
  /** Why this patient is in the demo — shown on the seed screen only. */
  demoNote: string;
}

function features(overrides: Partial<SymptomFeatures>): SymptomFeatures {
  return { ...noFindings(), ...overrides };
}

/** The reading triage() acts on: the newest keyframe, plus the med flag. */
export function currentVitals(seed: SeedPatient): Vitals {
  const now = seed.keyframes[seed.keyframes.length - 1];
  return {
    tempC: now.tempC,
    heartRate: now.heartRate,
    systolicBP: now.systolicBP,
    diastolicBP: now.diastolicBP,
    spo2: now.spo2,
    antipyreticOrTociWithin6h: seed.antipyreticOrTociWithin6h,
  };
}

export const SEED_PATIENTS: SeedPatient[] = [
  {
    key: 'sentinel-maria',
    city: 'San Francisco',
    given: 'Maria',
    family: 'Delgado',
    gender: 'female',
    birthDate: '1968-04-12',
    dayPostInfusion: 7,
    riskTier: 'high',
    // The demo. Flat all day, then temp and heart rate climb from about six
    // hours ago — the overnight drift the agent reacts to.
    keyframes: [
      { hoursAgo: 24, tempC: 36.9, heartRate: 80, systolicBP: 118, diastolicBP: 74, spo2: 98 },
      { hoursAgo: 10, tempC: 37.0, heartRate: 81, systolicBP: 116, diastolicBP: 74, spo2: 98 },
      { hoursAgo: 6, tempC: 37.4, heartRate: 88, systolicBP: 114, diastolicBP: 72, spo2: 97 },
      { hoursAgo: 3, tempC: 37.9, heartRate: 96, systolicBP: 110, diastolicBP: 71, spo2: 97 },
      { hoursAgo: 0, tempC: 38.4, heartRate: 104, systolicBP: 108, diastolicBP: 70, spo2: 96 },
    ],
    antipyreticOrTociWithin6h: false,
    features: features({ tremor: true, wordFinding: true, confusion: true }),
    transcript:
      "I slept alright I think. I've been a bit shaky this morning — my hands mostly. And this morning I couldn't remember my daughter's name for a moment, which frightened me. I feel warm.",
    demoNote: 'The demo case. Overnight drift, then fever + new neuro symptoms. High-risk shift takes URGENT to EMERGENT.',
  },
  {
    key: 'sentinel-james',
    city: 'Oakland',
    given: 'James',
    family: 'Okafor',
    gender: 'male',
    birthDate: '1955-11-30',
    dayPostInfusion: 4,
    riskTier: 'standard',
    // Fever peaked overnight, Tylenol brought it down — and the blood pressure
    // kept falling the whole time. The temperature curve looks reassuring and
    // is the exact reason a fever-gated rule would miss him.
    keyframes: [
      { hoursAgo: 24, tempC: 36.9, heartRate: 80, systolicBP: 120, diastolicBP: 76, spo2: 98 },
      { hoursAgo: 14, tempC: 37.3, heartRate: 86, systolicBP: 108, diastolicBP: 68, spo2: 97 },
      { hoursAgo: 10, tempC: 37.8, heartRate: 88, systolicBP: 98, diastolicBP: 62, spo2: 96 },
      { hoursAgo: 6, tempC: 38.2, heartRate: 90, systolicBP: 92, diastolicBP: 58, spo2: 96 },
      { hoursAgo: 2, tempC: 37.4, heartRate: 91, systolicBP: 88, diastolicBP: 56, spo2: 95 },
      { hoursAgo: 0, tempC: 37.1, heartRate: 92, systolicBP: 86, diastolicBP: 54, spo2: 95 },
    ],
    antipyreticOrTociWithin6h: true,
    features: features({ dizziness: true }),
    transcript:
      "I felt hot last night so I took two Tylenol around six this morning. Temperature's come down since. I do feel a bit light-headed when I get up.",
    demoNote: 'Afebrile only because of the Tylenol, and his BP has been falling all night. A fever-gated rule reads this as ROUTINE. It is EMERGENT.',
  },
  {
    key: 'sentinel-priya',
    city: 'San Jose',
    given: 'Priya',
    family: 'Raman',
    gender: 'female',
    birthDate: '1979-02-18',
    dayPostInfusion: 5,
    riskTier: 'elevated',
    keyframes: [
      { hoursAgo: 24, tempC: 37.0, heartRate: 88, systolicBP: 116, diastolicBP: 74, spo2: 98 },
      { hoursAgo: 14, tempC: 37.2, heartRate: 90, systolicBP: 114, diastolicBP: 74, spo2: 98 },
      { hoursAgo: 6, tempC: 37.6, heartRate: 92, systolicBP: 113, diastolicBP: 73, spo2: 97 },
      { hoursAgo: 0, tempC: 38.1, heartRate: 96, systolicBP: 112, diastolicBP: 72, spo2: 97 },
    ],
    antipyreticOrTociWithin6h: false,
    features: features({ headache: true }),
    transcript:
      "Bit of a headache since yesterday evening, nothing severe. No confusion, I don't think. I took my temperature and it was up a little.",
    demoNote: 'Fever alone — ASTCT grade 1. URGENT, and elevated risk does not shift it.',
  },
  {
    key: 'sentinel-walter',
    city: 'Berkeley',
    given: 'Walter',
    family: 'Chen',
    gender: 'male',
    birthDate: '1961-07-05',
    dayPostInfusion: 11,
    riskTier: 'high',
    keyframes: [
      { hoursAgo: 24, tempC: 37.1, heartRate: 80, systolicBP: 126, diastolicBP: 80, spo2: 98 },
      { hoursAgo: 12, tempC: 37.2, heartRate: 79, systolicBP: 125, diastolicBP: 79, spo2: 98 },
      { hoursAgo: 0, tempC: 37.6, heartRate: 82, systolicBP: 124, diastolicBP: 78, spo2: 98 },
    ],
    antipyreticOrTociWithin6h: false,
    features: features({ headache: true, tremor: true }),
    transcript:
      "Mostly fine. Slight headache, and my hands have been a little unsteady holding a cup. No fever that I've noticed.",
    demoNote: 'Nothing here is URGENT on its own. The Q-Immune high-risk shift is the only reason he is amber.',
  },
  {
    key: 'sentinel-aisha',
    city: 'Daly City',
    given: 'Aisha',
    family: 'Bello',
    gender: 'female',
    birthDate: '1986-09-22',
    dayPostInfusion: 3,
    riskTier: 'standard',
    keyframes: [
      { hoursAgo: 24, tempC: 36.8, heartRate: 75, systolicBP: 118, diastolicBP: 76, spo2: 99 },
      { hoursAgo: 12, tempC: 36.9, heartRate: 76, systolicBP: 119, diastolicBP: 75, spo2: 99 },
      { hoursAgo: 0, tempC: 36.8, heartRate: 74, systolicBP: 118, diastolicBP: 76, spo2: 99 },
    ],
    antipyreticOrTociWithin6h: false,
    features: features({}),
    transcript: 'Honestly I feel fine today. Slept well, ate breakfast, no headache, no shaking, nothing like that.',
    demoNote: 'Well. Stays green — which is what makes the other four mean something.',
  },
];
