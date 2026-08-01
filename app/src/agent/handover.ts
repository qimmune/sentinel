/**
 * The clinical handover note.
 *
 * WHY THIS IS NOT AI-DRAFTED
 * --------------------------
 * SPEC.md §4 has an LLM writing this note. There is no model API key configured
 * in this build, so the note is composed deterministically from the same facts
 * a model would have been handed.
 *
 * It is labelled "auto-generated" rather than "AI-drafted", and that wording is
 * deliberate: putting "AI-drafted" on a clinical record that no model touched
 * would be a false provenance claim, and provenance on a clinical record is not
 * a detail worth fudging for a demo.
 *
 * To make it genuinely AI-drafted, replace `composeHandoverNote` with a model
 * call and switch AUTHORING_METHOD. Everything else — the Communication
 * resource, the ordering, the labelling — already assumes it might be.
 *
 * THE ORDERING RULE, WHICHEVER WAY IT IS GENERATED
 * -----------------------------------------------
 * This runs strictly AFTER triage() has decided. The note explains the
 * decision; it is never an input to it. That is why it takes an already-decided
 * TriageResult rather than the features and vitals it was derived from.
 */

import type { TriageResult } from '../clinical/triage';
import type { DriftResult, VitalsPoint } from '../fhir/vitals';

export type AuthoringMethod = 'auto-generated' | 'ai-drafted';

/** What actually wrote the note. Change this only when that changes. */
export const AUTHORING_METHOD: AuthoringMethod = 'auto-generated';

export const AUTHORING_LABEL: Record<AuthoringMethod, string> = {
  'auto-generated': 'Auto-generated summary — not written by a clinician',
  'ai-drafted': 'AI-drafted summary — not written by a clinician',
};

export interface HandoverInput {
  patientName: string;
  dayPostInfusion?: number;
  riskTier: string;
  result: TriageResult;
  drift: DriftResult;
  temperature: VitalsPoint[];
  heartRate: VitalsPoint[];
  /** The patient's own words from the most recent check-in, if there is one. */
  transcript?: string;
}

function trendSentence(input: HandoverInput): string | undefined {
  const { drift } = input;
  if (!drift.drifting || drift.tempRiseC === undefined || drift.heartRateRiseBpm === undefined) {
    return undefined;
  }
  const latestTemp = input.temperature.at(-1)?.value;
  const latestHr = input.heartRate.at(-1)?.value;
  return (
    `Over the last ${drift.windowHours} hours temperature has risen ${drift.tempRiseC.toFixed(1)} °C ` +
    `to ${latestTemp?.toFixed(1)} °C and heart rate ${Math.round(drift.heartRateRiseBpm)} bpm to ${latestHr}.`
  );
}

/** The first thing a nurse needs: who, how worried, and why. */
function headlineSentence(input: HandoverInput): string {
  const { patientName, dayPostInfusion, result, riskTier } = input;
  const day = dayPostInfusion !== undefined ? `, day +${dayPostInfusion} post-infusion,` : '';
  const drivers = result.reasons
    .filter((reason) => reason.kind === 'finding' && reason.tier !== 'ROUTINE')
    .map((reason) => reason.detail.toLowerCase());

  const because = drivers.length > 0 ? ` on ${joinWithAnd(drivers)}` : ' on the current reading';
  const shifted = result.riskTierApplied
    ? `, raised from ${result.baseTier} by a Q-Immune ${riskTier}-risk profile`
    : '';

  return `${patientName}${day} is ${result.tier}${because}${shifted}.`;
}

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) {
    return items[0] ?? '';
  }
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function quoteSentence(transcript?: string): string | undefined {
  if (!transcript) {
    return undefined;
  }
  // Keep the patient's own words — that's the bit a nurse actually reads.
  const cleaned = transcript.replace(/\s+/g, ' ').trim();
  const trimmed = cleaned.length > 180 ? `${cleaned.slice(0, 177)}…` : cleaned;
  return `They said: “${trimmed}”`;
}

/**
 * Two sentences, plus the patient's own words when there are any.
 *
 * @param input - the already-decided triage result and the data behind it
 */
export function composeHandoverNote(input: HandoverInput): string {
  const sentences = [headlineSentence(input), trendSentence(input), quoteSentence(input.transcript)].filter(
    (sentence): sentence is string => sentence !== undefined
  );

  return sentences.join(' ');
}
