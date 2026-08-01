# The phone call

    phone call → ask questions → record in Medplum → dashboard updates

**Status: untested end to end.** No call has ever been placed through this — I
had no Twilio account to test with. The Deepgram and Medplum halves are the same
code the app runs; the Twilio half is not. Budget time to debug it.

---

## Setup — six steps, ~20 minutes

### 1. Twilio (free trial is fine)

Sign up at [twilio.com](https://www.twilio.com/try-twilio), then:

- **Get a phone number.** Console → Phone Numbers → Buy a number. Trial credit
  covers it. It must support **Voice**.
- **Verify the phone you want called.** Console → Phone Numbers → Verified
  Caller IDs → add your mobile. *A trial account can only call verified numbers.*
- **Create an API key.** Console → Account → API keys & tokens → Create API key
  (Standard). **Copy the secret now — it is shown once.**
- **Note your Account SID** (starts `AC…`) from the console home page.

### 2. Medplum client credentials

The app signs in with your email and password. A server can't do that, so it
needs its own credential:

app.medplum.com → **Project Admin → Client Applications → new**. Copy the
Client ID and Client Secret.

Leave the access policy blank — the server needs to read Patients and
Observations and write RiskAssessments, Flags and Tasks.

### 3. Make your laptop reachable

Twilio has to call *you* back over the internet.

```bash
brew install ngrok        # once
ngrok http 8080
```

Copy the `https://….ngrok-free.app` URL it prints. **It changes every restart** —
re-run setup if you restart ngrok.

### 4. Build the shared logic and configure

```bash
cd app
npm run build:core
./server/setup.sh
```

`setup.sh` asks for each value and writes `server/.env` on your machine, secrets
hidden as you type. Nothing is printed or committed — `server/.env` is
gitignored.

### 5. Start it

```bash
npm run telephony
```

It warns about anything still missing.

### 6. Call yourself

Get a patient id from the cohort board URL (click a patient — it's in the
address bar), then:

```bash
curl -X POST http://localhost:8080/call \
  -H 'Content-Type: application/json' \
  -d '{"patientId":"PASTE_ID","toNumber":"+1YOURMOBILE","reason":"Overnight vitals drift"}'
```

Your phone rings. Answer it, and answer the questions out loud.

**Watch the cohort board while you talk** — it polls every five seconds, so the
patient's tier changes on screen as soon as you hang up. That's the demo.

---

## What happens on the call

| Step | Endpoint | What it does |
|---|---|---|
| 1 | `POST /call` | Places the outbound call |
| 2 | `POST /twiml` | Greeting + the three recall words |
| 3 | `POST /ask?i=N` | Deepgram Aura speaks question N, records the answer |
| 4 | `POST /answer?i=N` | Deepgram transcribes it, stores it, moves on |
| 5 | `POST /finish` | Scores the answers, writes a QuestionnaireResponse, runs the agent |

Step 5 is what changes the dashboard: the agent writes a RiskAssessment, and
raises a Flag and a Task on a real clinician if the tier got worse.

---

## When it doesn't work

| Symptom | Cause |
|---|---|
| Call never arrives | Trial account calling an unverified number, or wrong `TWILIO_FROM_NUMBER` |
| Rings, then silence, then hangs up | `PUBLIC_URL` is stale — ngrok restarted. Re-run `setup.sh` |
| Robot voice instead of Deepgram | `/tts` is failing — check the server log for a Deepgram error |
| Every answer transcribes empty | Twilio recording not ready. The server retries 5×; if it still fails, raise the delays in `fetchRecording` |
| `401` in the log | Medplum client credentials, not the app's blank client ID |
| Questions work but nothing appears in Medplum | Client Application has an access policy restricting writes |

Twilio trial accounts play a short "you have a trial account" message before your
audio. It's unavoidable without upgrading — trim it in the video edit.

---

## The rule this server must not break

It owns **no clinical logic**. The questions, the scoring, the triage and the
FHIR writing all come from `../dist/core/core.js`, built from the same source as
the app and the tests.

If you find yourself editing a question or a threshold in this directory, stop —
change it in `app/src/voice/checkInScript.ts` or
`app/src/clinical/thresholds.ts` and rebuild. Otherwise the phone exam and the
scored exam drift apart, and the ICE score stops meaning anything.
