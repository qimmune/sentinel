# Sentinel — handover

Remote monitoring for outpatient CAR-T patients. Built at the YC × Medplum
hackathon, Sat 1 Aug 2026.

This document is for two audiences: whoever demos it today, and whoever picks up
the code afterwards.

---

## 1. What it actually does

A patient goes home after CAR-T infusion. Two toxicities — CRS and ICANS — are
the reason they'd normally stay in hospital for weeks. Sentinel watches for them
at home.

```
  simulated vitals stream            the agent                    clinician
  (temp, HR, BP, SpO₂)                                            worklist
          │                                                            ▲
          │  temp AND heart rate climbing for hours                    │
          ▼                                                            │
  ┌───────────────┐   asks for an      ┌──────────────┐   escalates    │
  │  DRIFT SEEN   │──  off-schedule ──▶│  CHECK-IN    │──  if the   ───┘
  └───────────────┘    check-in        │  (spoken)    │    tier rises
                                       └──────┬───────┘
                                              │ transcript
                                              ▼
                                    ┌──────────────────┐
                                    │ SCORE THE ANSWERS│  deterministic
                                    │ → SymptomFeatures│  no model
                                    └────────┬─────────┘
                                             ▼
                                    ┌──────────────────┐
                                    │  triage()        │  ASTCT-derived
                                    │  + Q-Immune risk │  rules only
                                    └────────┬─────────┘
                                             ▼
                                 ROUTINE · URGENT · EMERGENT
                          + RiskAssessment, Flag, Task, handover note
```

**The one thing to understand:** the system outputs a **triage tier** — how
worried to be — *not* a CRS or ICANS grade. It never diagnoses. The published
ASTCT criteria tell us which features matter and at what thresholds; they are
not the output.

**The second thing:** nothing that guesses is allowed to decide. Speech
recognition and scoring produce *observations*. A pure function called `triage()`
turns observations into a tier. That boundary is enforced by a test.

---

## 2. Running it

```bash
cd app
npm run dev
```

Open <http://localhost:3000>, sign in with your Medplum email and password.

First time only: click **Seed demo cohort**. That writes five synthetic patients,
24 hours of vitals each, and a check-in — all as real FHIR — into your Medplum
project. Re-seeding cleans up after itself.

```bash
npm test          # 104 tests, the clinical logic included
npm run build:bot # bundles the Medplum Bot to dist/bot/triageBot.js
```

---

## 3. The demo, click by click

1. **Cohort board** (`/`). Five patients, worst first. Maria and James are both
   EMERGENT for completely different reasons; Walter is amber *only* because of
   his Q-Immune risk tier; Aisha is green.
2. **Click Maria.** 24 hours of vitals. Flat overnight, then temperature and
   heart rate climbing from about six hours ago.
3. **Back to the board → Run agent.** It re-triages everyone, writes a
   RiskAssessment for each, raises a Flag + Task on anyone who worsened, and
   notices Maria drifting.
4. **Go to Voice check-in** (`/check-in`) with Maria selected. Within five
   seconds the screen goes red and rings: *"Incoming check-in from your care
   team."* **This is the money shot** — the agent decided to ask, rather than
   waiting for tomorrow's slot.
5. **Answer it.** Spoken questions, spoken answers, transcribed by Deepgram.
6. **The three panels at the end:** what she said, what was extracted, what tier
   that produced — with the exact reasons listed.

**The line to say on stage:** *"The model decides what she said. It never decides
how worried to be. That's deterministic, and it comes from the ASTCT consensus
criteria."*

---

## 4. The files that matter

Ranked by how much care they need.

| File | What it is |
|---|---|
| `app/src/clinical/triage.ts` | **The whole project.** Pure function, no I/O, no model. Decides the tier. |
| `app/src/clinical/thresholds.ts` | Every clinical number, tagged `[ASTCT]` (from the paper) or `[PROXY]` (our stand-in). **Read the header before changing one.** |
| `app/src/clinical/triage.test.ts` | Pins the two rules that are easy to get wrong. |
| `app/src/voice/extract.ts` | Turns spoken answers into structured features. Returns no tier — there's a test enforcing that. |
| `app/src/voice/checkInScript.ts` | The questions, and why voice can only score 8 of the 10 ICE points. |
| `app/src/agent/agent.ts` | The agent loop. Runs client-side today; is the body of the Bot. |
| `app/src/agent/handover.ts` | The handover note, and why it says "auto-generated". |
| `app/src/bots/triageBot.ts` | The Medplum Bot. Deployment steps are in the file header. |
| `app/src/voice/telephony.ts` | Where a real phone call attaches. Not implemented — read it before promising one. |
| `SPEC.md` | Clinical logic, sourced references, pitch, demo script. |

---

## 5. What's real, what isn't

**Real:** the FHIR modelling (Patient, Observation, Questionnaire /
QuestionnaireResponse, RiskAssessment, Flag, Task, Communication), the ASTCT-derived
rules, the Deepgram transcription, the deterministic scoring, the agent loop.

**Simulated on purpose:** the vitals stream. A scripted time series written as
Observations and labelled "simulated" in the UI. Say once on stage — *"this is
simulated today; in production it streams from a wearable or a home cuff"* — and
move on.

**Synthetic:** all five patients. No real patient data has ever been in this
system. Don't claim HIPAA compliance.

**Not built — do not imply otherwise:**

- **No phone call.** The agent raises a FHIR Task and the patient's app shows a
  ringing overlay. That *is* SPEC §4's architecture (the patient is on a PWA),
  but it is not a PSTN call. See `telephony.ts` for what a real one needs.
- **No LLM anywhere.** No model API key was available. Answers are scored by
  string matching against closed questions, and the handover note is composed
  deterministically. It is labelled **"auto-generated"**, not "AI-drafted",
  because no model wrote it — don't relabel it without wiring one in.
- **The Bot is written but not deployed.** Medplum disables Bots by default on
  hosted accounts. The identical function runs client-side instead, which is a
  sanctioned fallback, not a workaround.

---

## 6. For the team picking this up

**Three things, roughly in order of value.**

### a. Turn the Bot on

The agent currently runs when someone clicks "Run agent". Making it fire
automatically on every new Observation is the difference between a dashboard and
an agent.

1. Email info@medplum.com to enable Bots on the project — **they're off by
   default, and nothing else here works until that's done.**
2. `npm run build:bot`, paste `dist/bot/triageBot.js` into the Bot's Editor tab
   in the Medplum admin panel, Deploy.
3. Create the Subscription (exact JSON in `src/bots/triageBot.ts`).
4. **Do not attach an AccessPolicy to the Bot.** Bots get read/write on all
   resources by default and this one needs to search each patient's historical
   Observations. An AccessPolicy would take that away. A `forbidden`
   OperationOutcome means something restricted it — it is not a bug in the code.

### b. Make the note actually AI-drafted

`src/agent/handover.ts` composes it deterministically today. Replace
`composeHandoverNote` with a model call and flip `AUTHORING_METHOD` to
`'ai-drafted'`. The Communication resource and the labelling already assume you
might.

**Keep the ordering.** The note is generated *after* `triage()` has decided and
takes an already-decided result as input. It explains the decision; it must never
become an input to it. There's a test on this.

Put the key on the **server** (the Bot), not in `.env` — this app is a browser
bundle and anything in `import.meta.env` ships to the client.

### c. Real telephony

Read `src/voice/telephony.ts` first. It needs a provider account, a server, and a
streaming media path into Deepgram — the browser path posts a recorded clip,
which a live call can't do. Implement the `CallProvider` interface and pass it
where the app currently raises the Task.

**Reuse `checkInScript.ts` for the spoken questions** rather than rewriting them
in TwiML, or the spoken exam and the scored exam will drift apart.

---

## 7. Things not to break

1. **`extract.ts` must never return a tier, grade, severity or recommendation.**
   That boundary is the project's central claim. A test enforces it.
2. **The handover note is generated after the decision, never before.**
3. **Fever is not required once an antipyretic or tocilizumab is on board.**
   Outpatients take Tylenol; a fever-gated rule silently downgrades exactly the
   patient you most need to catch. James in the demo cohort exists to show this.
4. **Neuro severity is the worst of several domains**, never a single signal.
   Tremor doesn't count toward it.
5. **A missed check-in is not "unarousable".** It pages a human; it doesn't
   dispatch an ambulance.
6. **`[PROXY]` thresholds need clinical sign-off** before anyone treats this as
   more than a prototype. ASTCT grades hypotension by vasopressor requirement
   and hypoxia by oxygen delivery device — both inpatient concepts. The numbers
   we use at home are our own.
