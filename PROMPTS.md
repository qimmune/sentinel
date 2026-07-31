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
> building, the build order, and the two clinical rules that are easy to get
> wrong. Don't write any code yet.

**You are checking its answer.** If it can't name the antipyretic rule and the
ICANS five-domain max, it didn't read carefully — say "read SPEC.md section 3
again" before letting it touch code.

---

## Tier 1 — the core demo

> Build Tier 1 from SPEC.md section 5.
>
> Start with the clinical logic only: `src/clinical/crs.ts` with `gradeCRS`,
> as pure TypeScript with no React or Medplum imports. Write the unit tests
> first, including the antipyretic case from SPEC.md section 3 — a patient with
> no fever who took Tylenol two hours ago and is hypotensive must still grade.
>
> Show me the tests passing before you build any UI.

Then, separately:

> Now the FHIR layer: seed 5 synthetic patients at days 3–12 post-infusion with
> vitals as Observations using the LOINC codes in SPEC.md section 4. Then the
> clinician cohort board — five patient cards, colored by current CRS grade,
> worst first. Use Mantine components.
>
> When it's running, open it in the browser and show me.

---

## Tier 2 — voice

> Build Tier 2: the ICE assessment by voice with Deepgram.
>
> The key is in .env as DEEPGRAM_API_KEY. Capture mic audio in the browser,
> transcribe, and turn the spoken answers into a structured score. Remember from
> SPEC.md that the writing item can't be scored by voice — capture that one
> on-screen and score the other 9 by speech.
>
> Build the transcription working end to end first, before any scoring logic.
> Show me a raw transcript in the console before you go further.

---

## Tier 2b — wearable feed

> Build Tier 2b: a simulated wearable feed. A scripted time series of resting
> HR, HRV, respiratory rate and SpO2 writing into FHIR Observations, plotted on
> the patient detail page. Label it "simulated" in the UI. For Maria, script a
> deterioration curve overnight on day 7 — HR climbing, HRV falling — because
> that's the demo moment.

---

## Tier 3 — the agent

> Build Tier 3. Look at medplum-link/examples/medplum-demo-bots and
> medplum-link/examples/medplum-websocket-subscriptions-demo first and tell me
> the pattern you're going to follow before writing anything.
>
> Then: a Bot that fires on new Observations, recomputes both grades, and writes
> a RiskAssessment. On a threshold crossing, raise a Flag and a Task owned by
> Practitioner/202cc49d-e87e-43a7-b03d-53c938460ea2.
>
> If Bot deployment isn't working within 30 minutes, stop and tell me — we run
> the same function client-side instead.

Then the money feature:

> Now make the agent decide when to ask. When the wearable feed shows rising
> resting HR and falling HRV, have the agent trigger an off-schedule check-in
> rather than waiting for the next scheduled one. This is the most important
> feature of the demo — take the time to make it visible on screen.

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
- **Don't skip reading the grading code.** You're the only person in the room
  who can catch a wrong clinical threshold. Read `src/clinical/` yourself
  against SPEC.md section 3.

---

## If it's 15:30 and things are rough

> Stop adding features. Walk through what currently works end to end, fix only
> what's visibly broken in that path, and make it look clean. We're demoing in
> two hours.

This is a legitimate and often winning move. A polished Tier 1 with a strong
story beats a broken Tier 3 every time.
