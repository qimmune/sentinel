# Sentinel — build context

Read `../SPEC.md` first. It has the clinical logic, scope tiers, and demo script.
This file is the engineering contract.

## What this is
Remote monitoring for **outpatient CAR-T patients**, detecting **CRS** and
**ICANS** toxicity. Built on Medplum (hosted FHIR) + React/Vite/Mantine +
Deepgram (voice). One-day hackathon build, Aug 1 2026, deadline 5:00pm.

## Stack (already installed and verified)
- Node 26.5.1 via Homebrew, npm 11.17
- Vite 8 + React 19 + TypeScript 6
- `@medplum/core`, `@medplum/react`, `@medplum/fhirtypes` v5.1.27
- Mantine 8 for UI (already wired — use Mantine components, don't add a UI lib)
- `npm run dev` → http://localhost:3000

## Non-negotiable design rules

1. **Clinical grading is deterministic TypeScript. Never an LLM call.**
   Put it in `src/clinical/` as pure functions with no I/O:
   - `gradeCRS(vitals, { antipyreticOrTociWithin6h }): 0|1|2|3|4`
   - `scoreICE(answers): number` (0–10)
   - `gradeICANS(iceScore, { consciousness, seizure, motor, icp }): 0|1|2|3|4`
   These must be unit-testable and have zero React/Medplum imports. The LLM
   only turns speech into structured answers.

   **Build these from SPEC.md §3, which is transcribed from the actual ASTCT
   consensus paper (full text in `../reference/`). Do not grade from memory.**
   Two rules that are easy to get wrong and are both encoded in §3:
   - CRS: fever is **not** required once the patient has had an antipyretic or
     tocilizumab — grade on hypotension/hypoxia alone. Outpatients take Tylenol,
     so a fever-gated grader silently misses the patients that matter most.
   - ICANS: the grade is the **max across five domains**, not the ICE score alone.

   Write the unit tests for both of these edge cases first.

2. **Everything persists as real FHIR.** No app-specific database, no
   localStorage as source of truth. Observations for vitals,
   QuestionnaireResponse for ICE, RiskAssessment for computed grades, Flag +
   Task for escalations. Use the LOINC codes in SPEC.md §4.

3. **Build in tier order (SPEC.md §5).** Tier 1 complete and polished beats
   Tier 3 half-broken. Every tier must be independently demoable.

4. **Synthetic data only.** Five patients, Day +3 to +12 post-infusion. No real
   PHI ever, no HIPAA claims in the UI or the pitch.

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
  clinical/          ← pure grading logic, no imports from react/medplum
    crs.ts  ice.ts  icans.ts  *.test.ts
  fhir/              ← FHIR read/write helpers, LOINC constants, seed script
  voice/             ← Deepgram capture + transcript → structured answers
  pages/
    ClinicianDashboard.tsx   ← cohort triage board
    PatientDetail.tsx        ← vitals + ICE trends, escalation timeline
    CheckIn.tsx              ← patient-facing daily check-in
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
| Tier 2 — ICE questionnaire UI + scoring hooks | `medplum-link/examples/medplum-questionnaire-hooks` |
| Tier 3 — the grading Bot | `medplum-link/examples/medplum-demo-bots` |
| Tier 3 — Subscriptions firing on new data | `medplum-link/examples/medplum-websocket-subscriptions-demo` |
| Tier 3 — escalation Tasks | `medplum-link/examples/medplum-task-demo` |
| General clinical workflow / dashboard patterns | `medplum-link/examples/medplum-provider` |
| Docs source | `medplum-link/packages/docs` |

Note their guide's own warning: agents "hallucinate fields, mix FHIR versions,
and produce plausible-but-wrong code." Check generated FHIR against
`@medplum/fhirtypes` — if it type-checks, the resource shape is probably right.

## Known gotchas
- The ICE **writing** item cannot be scored by voice. Capture it on-screen.
  This is a known, disclosed limitation — see SPEC.md §3.
- Medplum Bots need a deployed Bot resource + a Subscription with a criteria
  string. If this fights you past ~30 min, run the identical grading function
  client-side. Same demo, less risk.
- Vite is pinned to port 3000; Medplum OAuth redirect URIs must match exactly.
