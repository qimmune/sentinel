/**
 * Codes and canonical URLs used across the FHIR layer.
 * LOINC codes are the ones listed in SPEC.md §4.
 */

export const LOINC = 'http://loinc.org';
export const UCUM = 'http://unitsofmeasure.org';
export const OBSERVATION_CATEGORY = 'http://terminology.hl7.org/CodeSystem/observation-category';

/** Vitals. SPEC.md §4. */
export const LOINC_BODY_TEMPERATURE = '8310-5';
export const LOINC_SYSTOLIC_BP = '8480-6';
export const LOINC_DIASTOLIC_BP = '8462-4';
export const LOINC_HEART_RATE = '8867-4';
export const LOINC_SPO2 = '59408-5';

/**
 * Q-Immune / Sentinel local codes, for the things LOINC does not cover.
 */
export const SENTINEL_CODE_SYSTEM = 'https://qimmune.com/fhir/CodeSystem/sentinel';

/**
 * "Antipyretic or tocilizumab in the last 6 hours", as a single boolean
 * Observation. Deliberately not a MedicationAdministration or a medication
 * graph search — see CLAUDE.md's scope guard.
 */
export const SENTINEL_ANTIPYRETIC = 'antipyretic-or-toci-6h';

/** Extensions carried on the Patient resource. */
export const EXT_RISK_TIER = 'https://qimmune.com/fhir/StructureDefinition/pre-infusion-risk-tier';

/**
 * Day 0 of the infusion. In production this comes off the CarePlan / Procedure
 * (SPEC.md §4); as a Tier 1 shortcut it lives on the Patient so the cohort
 * board can render "Day +7" without a second search per patient.
 */
export const EXT_INFUSION_DATE = 'https://qimmune.com/fhir/StructureDefinition/infusion-date';

/** Marks everything this build creates, so a reseed can find its own records. */
export const SENTINEL_IDENTIFIER_SYSTEM = 'https://qimmune.com/fhir/sentinel-id';

/** The voice check-in questionnaire. */
export const SYMPTOM_QUESTIONNAIRE_URL = 'https://qimmune.com/fhir/Questionnaire/sentinel-symptom-checkin';
