# Sentinel — build context

Read `../SPEC.md` first. It has the clinical logic, scope tiers, and demo script.
This file is the engineering contract.

## What this is
Remote monitoring for **outpatient CAR-T patients**. The agent calls the
patient, listens to how they describe their symptoms, combines that with vitals
and a simulated vitals trend, and produces an **escalation triage decision** —
ROUTINE / URGENT / EMERGENT — not a clinical grade. Built on Medplum (hosted
FHIR) + React/Vite/Mantine + Deepgram (voice). One-day build, deadline 5:00pm.

## Stack (already installed and verified)
- Node 26.5.1 via Homebrew, npm 11.17
- Vite 8 + React 19 + TypeScript 6
- `@medplum/core`, `@medplum/react`, `@medplum/fhirtypes` v5.1.27
- Mantine 8 for UI (already wired — use Mantine components, don't add a UI lib)
- `npm run dev` → http://localhost:3000

## Non-negotiable design rules

1. **The LLM extracts. Rules decide. This boundary is the whole project.**

   We output a **triage tier**, not a clinical grade. See SPEC.md §3 for the
   full diagram. Two separate layers, and they must stay separate:

   - `src/voice/extract.ts` — LLM turns a free-text transcript into a
     structured `SymptomFeatures` object. **It never returns a tier, a grade, a
     severity, or a recommendation.** If it does, that's a bug.
   - `src/clinical/triage.ts` — pure deterministic TypeScript:
     `triage(features, vitals, riskTier): 'ROUTINE' | 'URGENT' | 'EMERGENT'`
     No I/O, no React, no Medplum imports, no LLM calls. Fully unit-tested.

   Thresholds come from SPEC.md §3, which is transcribed from the actual ASTCT
   consensus paper (full text in `../reference/`). **Do not derive them from
   memory.** Two rules that are easy to get wrong:
   - Fever is **not** required once the patient has had an antipyretic or
     tocilizumab — escalate on hypotension/hypoxia alone. Outpatients take
     Tylenol, so a fever-gated rule silently misses the patients that matter most.
   - Neuro severity is the **worst of several domains** (confusion, consciousness,
     seizure, motor), never a single signal.

   Write unit tests for both edge cases **first**, before any UI.

   **Scope guard:** model "patient took an antipyretic recently" as a single
   boolean — one field on the vitals form or one coded Observation. Do **not**
   build MedicationAdministration / MedicationStatement resources or a
   medication graph search. It's an hour of work for zero demo value.

2. **Q-Immune risk tier modulates the thresholds.** Every Patient carries a
   pre-infusion risk tier (`standard | elevated | high`). A `high` patient
   escalates one tier sooner. This is one `if` — and it's the thing that makes
   the project Q-Immune's rather than generic. Don't skip it.

3. **Everything persists as real FHIR.** No app-specific database, no
   localStorage as source of truth. Observations for vitals (simulated stream),
   QuestionnaireResponse for the extracted symptom features, RiskAssessment for
   the computed triage tier, Flag + Task for escalations. LOINC codes in §4.

4. **Build in tier order (SPEC.md §5).** Tier 1 complete and polished beats
   Tier 3 half-broken. Every tier must be independently demoable.

5. **Synthetic data only — this is the plan, not a fallback.** Five patients,
   Day +3 to +12 post-infusion, with a scripted vitals time series. No device
   integrations, no HealthKit, no Apple Health XML. Real wearable data is a
   stretch goal gated behind a finished Tier 3 (SPEC.md §3b). No real PHI ever,
   no HIPAA claims in the UI or the pitch.

## Env vars
`.env` is gitignored and auto-created from `.env.defaults` on first `vite` run.
`vite.config.ts` exposes prefixes `MEDPLUM_`, `GOOGLE_`, `RECAPTCHA_`,
`DEEPGRAM_`. Access as `import.meta.env.MEDPLUM_CLIENT_ID`.

Already populated:
```
MEDPLUM_BASE_URL=https://api.medplum.com/
MEDPLUM_CLIENT_ID=        # intentionally blank — email/password sign-in
MEDPLUM_PROJECT_ID=2fb68983-…      # Q-Immune, Inc.
MEDPLUM_PRACTITIONER_ID=202cc49d-… # Cameron McCann
DEEPGRAM_API_KEY=…
```

`MEDPLUM_PRACTITIONER_ID` is the real Practitioner in the project — **assign
escalation `Task.owner` and `Flag.author` to this reference** so the demo shows
work landing on a named clinician rather than a placeholder.

> A browser-exposed Deepgram key is fine for a hackathon demo. Don't ship it,
> and don't commit `.env`.

## Suggested layout
```
src/
  clinical/          ← deterministic rules only. no react/medplum/LLM imports
    triage.ts        ← triage(features, vitals, riskTier) -> tier
    thresholds.ts    ← ASTCT-derived constants
    triage.test.ts   ← write this FIRST
  voice/
    capture.ts       ← browser mic -> Deepgram
    extract.ts       ← transcript -> SymptomFeatures (LLM). returns NO tier.
    features.ts      ← the SymptomFeatures type
  fhir/              ← FHIR read/write helpers, LOINC constants, seed script
  pages/
    ClinicianDashboard.tsx   ← cohort board, colored by triage tier
    PatientDetail.tsx        ← vitals trends, symptom history, escalation timeline
    CheckIn.tsx              ← patient voice check-in + transcript/features panel
```

The cloned starter's demo pages under `src/pages/` are scaffolding — replace
freely, but keep `SignInPage.tsx` and the `MedplumProvider` setup in
`src/main.tsx` / `src/App.tsx`.

## Reference implementations — copy, don't invent

The full Medplum monorepo is cloned and symlinked at `./medplum-link`
(→ `../medplum-src`). This is Medplum's own #1 recommendation for AI-assisted
builds: read their real source instead of relying on generic FHIR knowledge.
**Before writing anything non-trivial, look for the pattern here first.**

Directly relevant to our tiers:

| Need | Look at |
|---|---|
| Tier 2 — storing symptom features as FHIR | `medplum-link/examples/medplum-questionnaire-hooks` |
| Tier 3 — the triage Bot | `medplum-link/examples/medplum-demo-bots` |
| Tier 3 — Subscriptions firing on new data | `medplum-link/examples/medplum-websocket-subscriptions-demo` |
| Tier 3 — escalation Tasks | `medplum-link/examples/medplum-task-demo` |
| General clinical workflow / dashboard patterns | `medplum-link/examples/medplum-provider` |
| Docs source | `medplum-link/packages/docs` |

Note their guide's own warning: agents "hallucinate fields, mix FHIR versions,
and produce plausible-but-wrong code." Check generated FHIR against
`@medplum/fhirtypes` — if it type-checks, the resource shape is probably right.

## Known gotchas
- If free-text feature extraction proves flaky, fall back to the structured
  10-point ICE question set in SPEC.md §3 — fixed questions, deterministic
  scoring. Don't build it first; it's the safety net, not the plan.
- Medplum Bots need a deployed Bot resource + a Subscription with a criteria
  string. If this fights you past ~30 min, run the identical triage function
  client-side. Same demo, less risk.
- A Bot that searches a patient's historical Observations needs permission to
  do so. If you get a `forbidden` OperationOutcome, that's an access-policy
  problem, **not** a bug in the code — don't rewrite the logic. See how
  `medplum-link/examples/medplum-demo-bots` grants bot access.
- Vite is pinned to port 3000; Medplum OAuth redirect URIs must match exactly.
