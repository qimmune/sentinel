/**
 * Reading Sentinel's own fields off a Patient resource.
 */

import type { Patient } from '@medplum/fhirtypes';
import type { RiskTier } from '../clinical/triage';
import { EXT_INFUSION_DATE, EXT_RISK_TIER } from './codes';

const RISK_TIERS: RiskTier[] = ['standard', 'elevated', 'high'];

/**
 * The Q-Immune pre-infusion risk tier. Defaults to `standard` for any patient
 * that predates the QMI prediction — never assume `high` from missing data.
 */
export function getRiskTier(patient: Patient): RiskTier {
  const value = patient.extension?.find((e) => e.url === EXT_RISK_TIER)?.valueCode;
  return RISK_TIERS.includes(value as RiskTier) ? (value as RiskTier) : 'standard';
}

/** ISO date of the CAR-T infusion — day 0. */
export function getInfusionDate(patient: Patient): string | undefined {
  return patient.extension?.find((e) => e.url === EXT_INFUSION_DATE)?.valueDate;
}

/** Whole days since infusion. "Day +7". */
export function getDayPostInfusion(patient: Patient, now = new Date()): number | undefined {
  const infusionDate = getInfusionDate(patient);
  if (!infusionDate) {
    return undefined;
  }
  const day0 = new Date(`${infusionDate}T00:00:00Z`);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.floor((today.getTime() - day0.getTime()) / 86_400_000);
}

/** "Maria Delgado", or a sensible fallback. */
export function getPatientName(patient: Patient): string {
  const name = patient.name?.[0];
  if (!name) {
    return 'Unnamed patient';
  }
  return [name.given?.join(' '), name.family].filter(Boolean).join(' ') || 'Unnamed patient';
}
