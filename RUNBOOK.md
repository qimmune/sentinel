# Runbook — Sat Aug 1

## Already done tonight (verified working)
- ✅ Node 26.5.1 + npm installed via Homebrew (you had neither)
- ✅ Medplum starter app cloned to `~/qimmune-hackathon/app`
- ✅ `npm install` clean, `npm run dev` serves HTTP 200 on http://localhost:3000
- ✅ `vite.config.ts` patched to expose `DEEPGRAM_` env vars
- ✅ `SPEC.md` (project + clinical logic + pitch) and `app/CLAUDE.md` (build contract)

## Also done — pulled from your Drive (`MedPlum x YC`)
- ✅ **Deepgram API key** found and written to `app/.env` (verified git-ignored)
- ✅ **Medplum Project ID** `2fb68983-…` written to `app/.env`
- ✅ **CRS:ICANS.pdf** turned out to be the actual **Lee 2019 ASTCT consensus
  paper**. I verified my grading tables against it and found two errors worth
  fixing — SPEC.md §3 is now corrected and cites it. Full text saved offline to
  `reference/` so it works without venue wifi.

## Tonight, before bed — 10 minutes

**One thing still missing.** The `2fb68983-…` you pasted is your Medplum
**Project ID**, which is not the same as a **Client ID** — the app needs the
latter to sign in:

1. https://app.medplum.com → **Project Admin → Clients** → **New Client**
2. Name it `Sentinel`, set redirect URI to `http://localhost:3000`
3. Copy the **Client ID** into `MEDPLUM_CLIENT_ID` in `~/qimmune-hackathon/app/.env`
4. Verify it works end to end:
   ```bash
   cd ~/qimmune-hackathon/app && npm run dev
   ```
   Open http://localhost:3000 and confirm you can actually sign in. **Do this
   tonight** — an auth problem discovered at 10am costs you the morning.

Then:
5. **Read SPEC.md §3 (clinical logic) and §8 (demo script).** You are the
   domain expert on this team — that's your edge, not the code.
6. Charge laptop. Pack charger, **headphones with a mic** (you're demoing
   voice in a loud room — this matters more than it sounds), phone.

## Morning-of

**Verify the environment still works before you leave the house:**
```bash
cd ~/qimmune-hackathon/app && npm run dev
```

Then at the venue:

| Time | Do |
|---|---|
| 9:00 | Breakfast. Open `SPEC.md` on your laptop. |
| 10:00 | Opening remarks — note any judging criteria they announce and adjust. |
| 10:15 | **Spike the Deepgram mic → transcript pipeline first.** Timebox 90 min. It's the only real unknown. |
| 10:15 | In parallel: Claude Code builds Tier 1 (seed data, vitals, CRS grader, cohort board). |
| 12:30 | Lunch. **Tier 1 must be demoable by now.** If Deepgram isn't working, cut to typed input and move on. |
| 1:00 | Tier 2 — voice ICE assessment. |
| 3:00 | **Go to Deepgram office hours** even if things work. Two of six judges are Deepgram; being memorable to them is worth 20 minutes. |
| 3:00 | Tier 3 — Medplum Bot + escalation. Ask Medplum staff directly. |
| 4:00 | **Feature freeze.** Whatever works, works. |
| 4:30 | **Record the 2-minute demo video.** Non-negotiable. |
| 4:45 | Submit the Google Form — don't wait until 4:59. |
| 5:00 | Deadline. |
| 5:00–6:00 | **Rehearse the demo out loud, 3× minimum.** This is the highest-ROI hour of the day. |

## How to work with Claude Code tomorrow

You don't need to code. You need to describe and verify. Open a terminal:

```bash
cd ~/qimmune-hackathon/app && claude
```

It will read `CLAUDE.md` and `../SPEC.md` automatically. Then:

- **Ask in outcomes, not code.** "Build the clinician dashboard from Tier 1 —
  five patients as cards, colored by CRS grade, worst first." Not "write a
  React component."
- **One tier at a time.** Finish and *see it working in the browser* before
  moving on. Say "show me it running" — it can drive the browser itself.
- **You are the clinical reviewer.** When it writes the CRS grader, read the
  thresholds against SPEC.md §3 yourself. That's the check only you can do.
- **When stuck, say what you see:** "the page is blank and the console says X."
- **Commit often** so you can always get back to something that worked:
  `git add -A && git commit -m "tier 1 working"`

## If everything breaks

Fall back to a working Tier 1 and a clear story. A clean, honest demo of vitals
→ deterministic ASTCT grading → clinician board, plus a compelling pitch about
why outpatient CAR-T is the bottleneck, will beat a broken agent demo. Judges
score what they understand.
