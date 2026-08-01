# Demo production outline

Follow this top to bottom. Total: ~60 minutes including two takes.

---

## Phase 0 — Environment (10 min, do once)

```bash
cd /Users/cameronmccann/qimmune-hackathon/app
npm test          # expect 105 passed
npm run dev       # if not already running
```

Open two browser windows and arrange them **before** you record:

| Window | URL | Purpose |
|---|---|---|
| A | `http://localhost:3000/slides.html` | Pitch deck. Press `f` for fullscreen. |
| B | `http://localhost:3000` | The app. |

Cmd+Tab switches between them. Practise the switch — fumbling for a tab on
camera is the most common way a demo video looks amateur.

**Silence everything:** Slack, Mail, Messages, calendar alerts. Do Not Disturb
on. Close every other tab.

---

## Phase 1 — Audio check (5 min, do not skip)

macOS won't record system audio natively, so the agent's voice reaches the
recording through your **speakers → microphone**. That works fine and sounds
like a speakerphone, but you must verify it.

1. `Cmd+Shift+5` → **Record Entire Screen**, Options → **Microphone: MacBook
   Microphone**
2. Record 15 seconds: say something, then trigger any check-in question so the
   agent speaks
3. **Play it back.** You must hear both your voice and the agent's.

If the agent is inaudible: raise system volume, move closer, and don't wear
headphones — headphones route the agent's voice away from the mic.

---

## Phase 2 — Reset the data (2 min, immediately before each take)

This is the step that breaks demos when skipped.

1. In window B → **Re-seed**. Wait for it to finish (~30–60s).
   - Resets Maria's drift to "six hours ago" **relative to now**
   - Clears check-in Tasks left over from testing
2. **Run agent** → the summary should say Maria is drifting
3. Confirm the board looks right: Maria and James red, Priya and Walter amber,
   Aisha green

> **If the ringing overlay doesn't fire later, it's because you skipped this.**
> An open check-in Task from a previous run suppresses the next one.

---

## Phase 3 — Dry run (10 min)

Walk the entire path **without recording**. You need to know where the pauses
are, how long seeding takes, and how the agent's voice paces.

Full click path:

1. Board → click **Maria Delgado**
2. Look at the vitals charts (temp and HR climbing over the last 6h)
3. Back to cohort → **Run agent**
4. Left nav → **Voice check-in**, Maria selected
5. Wait up to 5 seconds → the screen goes red and rings
6. **Answer** → the agent greets, gives three words to remember, asks question 1
7. Answer 2–3 questions out loud, then **Skip** repeatedly to the end
8. Review the three panels
9. Back to cohort → the board reflects the new check-in

---

## Phase 4 — Record the safe take (20 min)

**Record the in-app version first, before attempting the phone integration.**
It has no external dependencies — no ngrok, no Twilio trial, no expiring URL.
Get a complete take in the can, then upgrade if there's time. Nearly every demo
disaster is a team with one take and no fallback.

### Shot list — target 2:00

| Time | Window | On screen | Say |
|---|---|---|---|
| 0:00 | A | Slide 1 — Sentinel | The hook: *"Science fiction promised machines that hunt disease from the inside. What we built was stranger — we take a patient's own immune cells, engineer them to recognise their cancer, and put them back. It works. The problem is where it has to happen."* |
| 0:15 | A | Slide 2 — 19 days | *"Median nineteen days in a hospital bed after infusion. Not because the therapy fails — because of what might happen next."* |
| 0:25 | A | Slide 3 — two toxicities | *"CRS and neurotoxicity. We know how to recognise them. We just can't watch for them at home, so we admit everyone for weeks to be sure. That's the bottleneck on CAR-T access."* |
| 0:38 | B | Cohort board | *"These five patients are all at home, days three to twelve after infusion."* |
| 0:48 | B | Click Maria → charts | *"Maria, day seven. It's 2am. Her temperature and heart rate have been climbing for six hours. That's not a diagnosis — but something is changing."* |
| 1:02 | B | Voice check-in → **ring** | *"So Sentinel doesn't wait for morning. It calls her."* — **then stop talking for two full seconds and let it ring.** |
| 1:10 | B | Answer, 2–3 questions | Say nothing. Let the agent's voice carry it. Then Skip to the end. |
| 1:35 | B | Three panels | *"What she said. What was extracted. What tier that produced."* |
| 1:45 | B | — | *"And here's what matters: there is no language model in this decision. Voice is how we collect it. Deterministic rules from the ASTCT consensus criteria are how we decide. We don't let a model decide how worried to be about a cancer patient."* |
| 1:55 | B | Board / Task | *"EMERGENT. A Task lands on the on-call nurse as native FHIR — in the worklist they already use. A separate dashboard is a demo convenience, not the product."* |
| 2:05 | A | Slide 6 — the numbers | *"In a published series, catching grade one CRS early kept fifteen of thirty-five patients out of hospital entirely. That's roughly forty thousand dollars a patient in the first month."* |
| 2:15 | A | Slide 8 — close | *"We predict the risk before infusion, catch the complication at home, and every event we catch makes the prediction sharper. That's the loop."* |

**If you have 20 seconds spare, spend them on James** — the Tylenol case. It's
the most persuasive thing in the build and no other team will have it:

> *"This patient looks fine — 37.1 and falling all night. A naive system says
> routine. He took Tylenol at six this morning, and his blood pressure has been
> dropping the whole time. ASTCT is explicit: once a patient has had an
> antipyretic, fever is no longer required to grade CRS. Most implementations
> gate on fever and miss him. He's EMERGENT."*

### Record it twice

The second take is always better and you'll still have time.

---

## Phase 5 — Recovery, if something breaks mid-take

Keep rolling. Most of these are recoverable on camera.

| Problem | Fix |
|---|---|
| Overlay doesn't ring | Open Task from a previous run. Stop, re-seed, Run agent, restart the take. |
| No voice from the agent | Browser blocked autoplay. The question is on screen — narrate it yourself and continue. |
| Microphone fails | Hit **Skip** on every question. The check-in still completes and still produces a tier; the panels show "not asked". |
| Board doesn't update | It polls every 5s. Wait a beat before clicking anything. |
| Seeding errors | Click **Re-seed** again. It's idempotent. |

---

## Phase 6 — Post (15 min)

1. **Trim the head and tail** — QuickTime: `Cmd+T`, drag the handles, `Enter`,
   then File → Export As → 1080p.
2. **Cut any dead air** longer than ~2 seconds.
3. **Watch it once, muted.** If the story doesn't read from the visuals alone,
   your cuts are wrong.
4. **Watch it once at half volume** on laptop speakers — that's how a judge will
   watch it.

---

## Hard stops

| Time | What |
|---|---|
| 3:30 | Stop building. Anything not working now isn't going to be. |
| 4:00 | Final take recorded. |
| 4:30 | Exported and watched end to end. |
| 5:00 | **Submitted.** |

Submit the video even if you think you can do better. A submitted good video
beats an unsubmitted great one.

---

## What you can and cannot claim

Keep the pitch survivable under a follow-up question:

- **"triages against ASTCT-derived criteria"** — not "grades", not "validated"
- **"shortens the inpatient stay"** — not "eliminates" (86–93% of outpatients
  are still admitted; your own source says so)
- **"~$40,000 per patient in the first 30 days"** — not "hundreds of thousands"
- If the telephony leg isn't live: *"the telephony leg lands today; what you're
  seeing is the patient app receiving the same agent-initiated request."*

Getting caught overclaiming one feature makes a clinician judge doubt your
clinical claims too — and those are the ones that win the room.
