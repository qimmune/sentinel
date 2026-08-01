# Runbook — Sat Aug 1

## Already done tonight (verified working)
- ✅ Node 26.5.1 + npm installed via Homebrew (you had neither)
- ✅ Medplum starter app cloned to `~/qimmune-hackathon/app`
- ✅ `npm install` clean, `npm run dev` serves HTTP 200 on http://localhost:3000
- ✅ `vite.config.ts` patched to expose `DEEPGRAM_` env vars
- ✅ `SPEC.md` (project + clinical logic + pitch) and `app/CLAUDE.md` (build contract)
- ✅ **Vitest installed and verified** (`npm test`), scoped so it doesn't try to
  run Medplum's ~870 test files. Tier 1 depends on tests, so this had to exist
  before tomorrow — installing it on venue wifi would have been a bad morning.

## Also done — pulled from your Drive (`MedPlum x YC`)
- ✅ **Deepgram API key** found and written to `app/.env` (verified git-ignored)
- ✅ **Medplum Project ID** `2fb68983-…` written to `app/.env`
- ✅ **CRS:ICANS.pdf** turned out to be the actual **Lee 2019 ASTCT consensus
  paper**. I verified my grading tables against it and found two errors worth
  fixing — SPEC.md §3 is now corrected and cites it. Full text saved offline to
  `reference/` so it works without venue wifi.

> **Never used Medplum? Read [GUIDE.md](GUIDE.md) first — 10 minutes, plain
> English.** It explains what Medplum and FHIR actually are, and how to check
> Claude's work with your own eyes instead of taking "done" on faith.

## Tonight, before bed — 10 minutes

### Medplum sign-in

**Good news: you don't actually need a Client ID.** `MEDPLUM_CLIENT_ID` is
optional — leave it blank and the app signs in with your normal Medplum
email/password against your project. It's currently blank, so **just try it**:

```bash
cd ~/qimmune-hackathon/app && npm run dev
```

Open http://localhost:3000 and confirm you can sign in and see your project.
**Do this tonight** — an auth problem found at 10am costs you the morning.

<details>
<summary>Why the Client ID you sent didn't work</summary>

`202cc49d-e87e-43a7-b03d-53c938460ea2` returns **"Client not found"** from
`api.medplum.com/oauth2/authorize` — byte-identical to what a randomly invented
UUID returns. So it isn't a `ClientApplication` id on hosted Medplum. It's
probably a different id from the admin UI (a ProjectMembership, a User, or a
Bot), or the client wasn't saved.

You only need one if you want programmatic/bot access later. To create one
properly: **Project Admin → Clients → New Client**, redirect URI
`http://localhost:3000`, then copy the id shown on the resulting
*ClientApplication* resource page into `MEDPLUM_CLIENT_ID`.
</details>

Then:
1. **Read [GUIDE.md](GUIDE.md)** (10 min, plain English — what Medplum is, how
   to verify work), then **SPEC.md §3 (clinical logic) and §8 (demo script).**
   You are the domain expert on this team — that's your edge, not the code.
2. **Skip the Apple Health export.** We're building on synthetic data. Real
   watch data is a stretch goal only — see SPEC.md §3b. Don't spend tonight on it.
3. Charge laptop. Pack charger, **headphones with a mic** (you're demoing
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
| 10:15 | In parallel: Claude Code builds Tier 1 (seed data, vitals, `triage()` + tests, cohort board). |
| 12:30 | Lunch. **Tier 1 must be demoable by now.** If Deepgram isn't working, cut to typed input and move on. |
| 12:45 | Tier 1b — simulated vitals stream (20 min). |
| 1:00 | Tier 2 — voice check-in, feature extraction, triage side-by-side panel. |
| 3:00 | **Go to Deepgram office hours** even if things work. Two of six judges are Deepgram; being memorable to them is worth 20 minutes. |
| 3:00 | Tier 3 — Medplum Bot + agent-triggered check-in + LLM handover note. Ask Medplum staff directly. |
| 3:30 | **Stretch goals only if Tier 3 is done and committed.** Otherwise: polish. |
| 4:00 | **Feature freeze.** Whatever works, works. |
| 4:30 | **Record the 2-minute demo video.** Non-negotiable — see the section below. |
| 4:45 | Submit the Google Form — don't wait until 4:59. |
| 5:00 | Deadline. |
| 5:00–6:00 | **Rehearse the demo out loud, 3× minimum.** This is the highest-ROI hour of the day. |

## Recording the demo video (4:30pm — non-negotiable)

**Do a 30-second test recording tonight.** Not tomorrow. The gotcha below only
bites you once, and you don't want it to be at 4:30pm.

### The tool
`Cmd + Shift + 5` opens the built-in recorder.
1. Click **Options** → under *Microphone*, pick your mic (built-in, or your
   headset). **If you skip this, there is no audio at all.**
2. Choose **Record Selected Portion** and drag a box around just the browser
   window — full-screen recordings show your desktop clutter and menu bar.
3. Click **Record**. Stop from the ■ in the menu bar, or `Cmd + Ctrl + Esc`.
4. It saves to your **Desktop** as a `.mov`.

### ⚠️ The gotcha that will break your video
**macOS screen recording does NOT capture your computer's own audio.** It
records the microphone only. So if Sentinel speaks through your speakers, or you
play back the patient's voice clip, **none of it lands in the recording** — you
get silence over your most important moment.

Two ways to handle it, pick one tonight:

- **Simplest (recommended): play the app's audio out loud through the laptop
  speakers, and let the microphone pick it up.** Slightly echoey, completely
  fine for a demo, zero setup. Do NOT wear headphones while recording — the mic
  won't hear the app.
- **Or: narrate everything yourself.** Don't rely on app audio at all. When the
  voice check-in plays, say out loud what she's saying. Also fine, and you
  control the pacing.

Either way — **test it tonight and play it back with the volume up.**

### What to record
Follow SPEC.md §8, straight through, in one take. Two minutes.
- Don't fix mistakes by starting over more than twice. A slightly rough take you
  actually have beats a perfect one you ran out of time for.
- Speak slower than feels natural. Everyone rushes on camera.
- End on the Q-Immune line. Don't trail off.

### If the form asks for a code link

Your repo is **local only — no GitHub remote.** If the submission form wants a
repo URL, you'd be stuck at 4:45. `gh` is installed; sorting this takes 3 min:

```bash
gh auth login          # browser flow, do this once — tonight is ideal
```

Then tomorrow, whenever you want it public:

```bash
cd ~/qimmune-hackathon && gh repo create qimmune-sentinel --public --source=. --push
```

`.env` is gitignored, so your keys don't go up. **Double-check that** before
pushing: `git ls-files | grep .env` should show only `.env.defaults`.

A public repo is also worth having regardless — YC partners do look.

### Getting it submitted
The `.mov` may be large. Fastest reliable path:
1. Upload to Google Drive
2. Right-click → Share → **Anyone with the link → Viewer**
3. Paste that link into the submission form

**Test the link in a private/incognito window before you submit.** A permission
error on the judges' side is a silent zero. YouTube-unlisted works too if you'd
rather.

---

## How to work with Claude Code tomorrow

**Copy-paste prompts for every tier are in [PROMPTS.md](PROMPTS.md).** Use them
rather than composing under time pressure.

You don't need to code. You need to describe and verify. Open a terminal:

```bash
cd ~/qimmune-hackathon/app && claude
```

Start it **in the `app` folder** so it picks up `CLAUDE.md` automatically, and
start a **fresh session per tier** — long threads drift, which is Medplum's own
warning in their AI guide. Then:

- **Ask in outcomes, not code.** "Build the clinician dashboard from Tier 1 —
  five patients as cards, colored by triage tier, worst first." Not "write a
  React component."
- **One tier at a time.** Finish and *see it working in the browser* before
  moving on. Say "show me it running" — it can drive the browser itself.
- **You are the clinical reviewer.** When it writes `triage()`, read the
  thresholds against SPEC.md §3 yourself. That's the check only you can do.
- **Watch the boundary.** If `extract.ts` ever returns a tier or a
  recommendation instead of plain booleans, stop and have it fixed.
- **When stuck, say what you see:** "the page is blank and the console says X."
- **Commit often** so you can always get back to something that worked:
  `git add -A && git commit -m "tier 1 working"`

## If everything breaks

Fall back to a working Tier 1 and a clear story. A clean, honest demo of
symptoms + vitals → deterministic ASTCT-derived triage → clinician board, plus a
compelling pitch about why outpatient CAR-T is the bottleneck, will beat a broken
agent demo. Judges score what they understand.
