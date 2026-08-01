# How to drive Claude Code tomorrow

Copy-paste these. Don't compose prompts under time pressure.

---

## Starting up

**Start a fresh session, in the `app` folder.** Not this one — a new one.

```bash
cd ~/qimmune-hackathon/app && claude
```

Why the `app` folder specifically: Claude Code auto-loads `CLAUDE.md` from the
directory you start in. Start anywhere else and it begins with no idea what
you're building.

**Then start a new session for each tier.** This is Medplum's own advice in the
doc in your Drive: *"quality degrades over a long session… strong early answers,
then subtle regressions later in the same thread."* One tier per conversation.
When a tier is done and committed, type `/clear` and start the next one clean.

---

## Prompt 0 — orientation (30 seconds, do it once)

> Read CLAUDE.md and ../SPEC.md. Summarize back to me in 5 bullets: what we're
> building, the build order, the boundary between what the LLM does and what the
> deterministic rules do, and the two clinical rules that are easy to get wrong.
> Don't write any code yet.

**You are checking its answer.** It must say that the LLM extracts symptom
features and *never* decides the triage tier. If it describes the LLM deciding
urgency, or talks about outputting a CRS grade, it misread — say "read SPEC.md
section 3 again, especially the pipeline diagram" before letting it touch code.

---

## Tier 1 — the core demo

> Build Tier 1 from SPEC.md section 5.
>
> Start with the deterministic logic only: `src/clinical/triage.ts` exporting
> `triage(features, vitals, riskTier)` returning ROUTINE, URGENT or EMERGENT.
> Pure TypeScript, no React, no Medplum, no LLM calls.
>
> Write the unit tests first. Cover: (1) the antipyretic case — no fever, took
> Tylenol two hours ago, low blood pressure, must still escalate. **Model the
> recent antipyretic as a simple boolean — one field on the vitals form or one
> coded Observation. Do NOT build MedicationAdministration/MedicationStatement
> resources or any medication graph search; that's an hour of work for zero
> demo value.** (2) a high-risk patient escalating a tier sooner than a
> standard-risk patient on identical symptoms; (3) any reported seizure going
> straight to EMERGENT.
>
> Show me the tests passing before you build any UI. Vitest is already
> installed — just run `npm test`. Delete `src/clinical/setup.test.ts` once your
> real tests exist.

Then, separately:

> Now the FHIR layer: seed 5 synthetic patients at days 3–12 post-infusion,
> each with a Q-Immune pre-infusion risk tier (standard/elevated/high), and
> vitals as Observations using the LOINC codes in SPEC.md section 4. Then the
> clinician cohort board — five patient cards, colored by current triage tier,
> worst first, showing the risk tier on each card. Use Mantine components.
>
> When it's running, open it in the browser and show me.

---

## Tier 1b — the vitals stream

> Build Tier 1b: a simulated vitals stream. A scripted time series of
> temperature, heart rate, blood pressure and SpO2 per patient, written as FHIR
> Observations and plotted on the patient detail page. Label it "simulated" in
> the UI.
>
> For Maria, script an overnight drift on day 7 — temperature and heart rate
> climbing — because that's what the agent reacts to in the demo.
>
> Pure synthetic data. No device integration, no HealthKit, no file parsing.

---

## Tier 2 — voice

> Build Tier 2: the voice symptom check-in with Deepgram.
>
> The key is in .env as DEEPGRAM_API_KEY. Use the browser's `MediaRecorder` API
> plus the `@deepgram/sdk` live/WebSocket client for streaming transcription.
> **Get a raw transcript printing to the console and show me that working
> before you write anything else.**
>
> If live streaming fights you for more than 30 minutes, switch to recording a
> short clip and sending it to Deepgram's pre-recorded REST endpoint instead.
> It looks identical in a demo and it's far more reliable in a loud room.

Then, only once transcription works:

> Now `src/voice/extract.ts`: take the transcript and return a SymptomFeatures
> object — fever, confusion, wordFinding, tremor, headache, dizziness,
> drowsiness, seizure.
>
> CRITICAL: force structured output — use tool/function calling or strict JSON
> mode so the model returns a validated JSON object, never prose you have to
> regex. Validate the shape before using it.
>
> It must return ONLY those booleans. No tier, no severity, no recommendation,
> no free-text advice — that's triage.ts's job.
>
> Then wire it up: transcript in, features out, run triage(), and show all three
> on screen side by side — what she said, what was extracted, what tier it
> produced. That audit trail is the demo, so make it look good.

---

## Tier 3 — the agent

> Build Tier 3. Look at medplum-link/examples/medplum-demo-bots and
> medplum-link/examples/medplum-websocket-subscriptions-demo first and tell me
> the pattern you're going to follow before writing anything.
>
> Then: a Bot that fires on new Observations, re-runs triage(), and writes a
> RiskAssessment with the resulting tier. When the tier worsens, raise a Flag
> and a Task owned by Practitioner/202cc49d-e87e-43a7-b03d-53c938460ea2.
>
> The Bot has to search each patient's historical Observations to see the trend,
> so make sure it runs with permissions that allow that. Check how the bots in
> medplum-link/examples/medplum-demo-bots are granted access before you write
> it.
>
> Then — only after the tier is already decided — have the LLM synthesize the
> transcript plus the vitals trend into a 2-sentence clinical handover
> note, saved on a Communication resource. Label it clearly as AI-drafted. The
> note explains the decision; it must never influence it.
>
> If Bot deployment isn't working within 30 minutes, stop and tell me — we run
> the same function client-side instead.

Then the money feature:

> Now make the agent decide when to ask. When the vitals stream shows
> temperature and heart rate climbing overnight, the Bot should create a FHIR
> Task for the patient with status 'requested'. Have the React app poll for that Task and pop an
> "Incoming check-in from your care team" overlay when it appears.
>
> This is the most important feature of the demo — make it big and obvious on
> screen. Polling is fine; don't spend time on websockets.

---

## The four prompts you'll reuse all day

**When something looks wrong:**
> The page is blank and the console says [paste the exact error]. Fix it.

Paste the *actual* error text. "It's broken" wastes a round trip.

**When you want to see it:**
> Open it in the browser and show me it working.

It can drive a browser. Make it prove things run — don't take "done" on faith.

**When a tier is finished:**
> Commit this with a clear message.

Do this at every working state. It's your undo button for the whole day.

**When you see `forbidden` or an access error:**
> This is a permissions problem, not a logic problem. Don't change the triage
> code — fix how the Bot is granted access to search Observations.

**When it's going in circles** (twice on the same bug is the signal):
> Stop. Explain what you think is happening and what you've already tried.

Then take that explanation to the Medplum or Deepgram staff in the room.

---

## Things that will cost you the day

- **Don't let it build multiple tiers in one prompt.** One thing, verified
  running, committed. Then the next.
- **Don't accept "done" without seeing it.** Ask it to show you.
- **Don't debug alone past 15 minutes.** Sponsor engineers are right there and
  they want you to use their product successfully.
- **Don't refactor after 16:00.** Freeze means freeze.
- **Don't skip reading `src/clinical/triage.ts`.** You're the only person in
  the room who can catch a wrong clinical threshold. Read it yourself against
  SPEC.md section 3.
- **Don't let the LLM creep into the decision.** If you ever see extract.ts
  returning a tier, severity, or "recommendation", stop and have it fixed. That
  boundary is the whole pitch.

---

## If it's 15:30 and things are rough

> Stop adding features. Walk through what currently works end to end, fix only
> what's visibly broken in that path, and make it look clean. We're demoing in
> two hours.

This is a legitimate and often winning move. A polished Tier 1 with a strong
story beats a broken Tier 3 every time.
