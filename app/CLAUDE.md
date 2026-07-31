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
   - `gradeCRS(vitals): 0|1|2|3|4`
   - `scoreICE(answers): number` (0–10)
   - `gradeICANS(iceScore, flags): 0|1|2|3|4`
   These must be unit-testable and have zero React/Medplum imports. The LLM
   only turns speech into structured answers.

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

Needed:
```
MEDPLUM_BASE_URL=https://api.medplum.com/
MEDPLUM_CLIENT_ID=<from app.medplum.com → Project Admin → Clients>
DEEPGRAM_API_KEY=<from console.deepgram.com>
```

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

## Known gotchas
- The ICE **writing** item cannot be scored by voice. Capture it on-screen.
  This is a known, disclosed limitation — see SPEC.md §3.
- Medplum Bots need a deployed Bot resource + a Subscription with a criteria
  string. If this fights you past ~30 min, run the identical grading function
  client-side. Same demo, less risk.
- Vite is pinned to port 3000; Medplum OAuth redirect URIs must match exactly.
