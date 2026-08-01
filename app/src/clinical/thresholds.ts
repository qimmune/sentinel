/**
 * Thresholds for triage().
 *
 * Source: Lee DW et al., ASTCT Consensus Grading for Cytokine Release Syndrome
 * and Neurologic Toxicity Associated with Immune Effector Cells,
 * Biol Blood Marrow Transplant 2019;25:625-638. Transcribed in SPEC.md §3,
 * full text in ../reference/.
 *
 * READ THIS BEFORE CHANGING A NUMBER
 * ----------------------------------
 * Two kinds of constant live in this file and they are not equally solid:
 *
 *   [ASTCT]  Transcribed directly from the consensus tables.
 *   [PROXY]  NOT in ASTCT. The consensus criteria grade hypotension by
 *            vasopressor requirement and hypoxia by oxygen delivery device —
 *            both inpatient concepts we cannot observe at home. These are
 *            home-monitoring stand-ins chosen for this build. They are the
 *            numbers a clinician needs to sign off on before this is real.
 *
 * Every [PROXY] value is deliberately conservative: at home, Sentinel's job is
 * catching the grade 1 -> grade 2 transition early (SPEC.md §3), so it should
 * err toward calling a human.
 */

/** [ASTCT] Table 4. Fever is >=38.0 C, not attributable to another cause. */
export const FEVER_C = 38.0;

/**
 * Below fever, but worth noting on the board and worth a risk-tier bump for a
 * high-risk patient. [PROXY] — not an ASTCT concept.
 */
export const LOW_GRADE_TEMP_C = 37.5;

/**
 * [PROXY] Hypotension. ASTCT grade 2 is "hypotension not requiring
 * vasopressors"; at home we have a cuff, not a pressor. SBP < 90 mmHg is the
 * conventional adult hypotension line and is the trigger to bring the patient
 * in.
 */
export const HYPOTENSION_SBP = 90;

/** [PROXY] Hypotension bad enough to act on with no other context at all. */
export const SEVERE_HYPOTENSION_SBP = 85;

/**
 * [PROXY] Hypoxia. ASTCT grade 2 is "requires low-flow nasal cannula"; at home
 * we have a pulse oximeter. <92% on room air is the conventional trigger for
 * supplemental oxygen.
 */
export const HYPOXIA_SPO2 = 92;

/** [PROXY] Hypoxia bad enough to act on with no other context at all. */
export const SEVERE_HYPOXIA_SPO2 = 88;

/**
 * The window in which an antipyretic or tocilizumab lifts the fever
 * requirement. ASTCT states the rule but sets no clock; 6h covers the duration
 * of action of acetaminophen. [PROXY] on the number, [ASTCT] on the rule.
 */
export const ANTIPYRETIC_WINDOW_HOURS = 6;
