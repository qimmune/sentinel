# ELI5 — what all this actually is

You don't need to write code tomorrow. But you do need to understand enough to
tell whether the thing on your screen is real. This is that.

Read it once tonight. Ten minutes.

---

## The two windows you'll have open

**1. Your app — `http://localhost:3000`**
This is the thing you built. It only exists on your laptop. "localhost" just
means "this computer." When you close the terminal, it stops.

**2. Medplum — `https://app.medplum.com`**
This is where the data actually lives, on their servers. It's a website you log
into to look at your data directly.

> **Your app is the front of the restaurant. Medplum is the kitchen and the
> walk-in fridge.** When you want to know whether something really got saved,
> you go look in the fridge.

---

## What Medplum is

Medplum is **a database for medical records, plus a website to look inside it.**

That's genuinely it. It's not AI, it's not a monitoring product. It's storage
that already knows what a patient chart is supposed to look like, so you don't
have to invent one.

Why it matters for the pitch: because Medplum stores things in the standard
format hospitals use, an app built on it could actually plug into a real health
system. A weekend project with its own homemade database could never.

## What FHIR is

**FHIR (say "fire") is the standard format for healthcare data.**

Think of it as a set of official government forms. Everyone in healthcare —
Epic, Cerner, Medplum — has agreed on what fields go on each form. So a "Patient"
record means the same thing everywhere.

Each filled-in form is called a **resource**. The ones we use:

| Resource | Plain English | In our app |
|---|---|---|
| **Patient** | one person | Maria, and 4 others |
| **Observation** | one measurement, at one moment | a single temperature reading. 100 readings = 100 Observations |
| **QuestionnaireResponse** | someone's answers to a set of questions | the symptoms we pulled out of what she said |
| **RiskAssessment** | a saved conclusion | "this patient is URGENT, here's why" |
| **Flag** | a warning sticker on a chart | the red banner on Maria |
| **Task** | a to-do assigned to a person | "call Maria" landing on your nurse |
| **Communication** | a message | the AI-drafted handover note |

**The one that trips people up:** an Observation is *one* measurement, not a
category. Her temperature at 2am and her temperature at 3am are two separate
Observations. That's why a chart is thousands of them.

## What a "Bot" is

**A Bot is a small program that runs on Medplum's servers when something
happens.** Like an email rule: *when a message arrives from my boss, flag it.*

Ours is: *when a new Observation arrives, re-run the triage, and if it got
worse, create a Task for the nurse.*

The rule that connects "something happened" to "run the Bot" is called a
**Subscription**. That's all that word means.

This matters because it's what makes the project an *agent* rather than a form.
Nobody clicked anything. The data arrived and the system acted.

## What "seeding" means

**Seeding = putting fake starter data in so the app isn't empty.**

Tomorrow Claude will "seed 5 synthetic patients." That means it creates 5 fake
Patient records with fake vitals so you have something to demo. Nothing real,
nobody's actual health data.

---

## How to check Claude's work with your own eyes

This is the important part. **Don't take "done" on faith.** You don't need to
read code to verify — you just look in the fridge.

1. Go to `https://app.medplum.com` and sign in
2. In the left sidebar, click a resource type — **Patient**
3. You should see the 5 seeded patients listed
4. Click one. You'll see the raw record — the same JSON shape you saw earlier
   with your Practitioner record

**Do this after every tier.** It takes 20 seconds and it's the difference
between "Claude says it works" and "I can see it works."

| After this step | Look for this in Medplum |
|---|---|
| Seeding | 5 Patients |
| Vitals stream | lots of Observations, with times |
| Voice check-in | a QuestionnaireResponse with the symptoms |
| Triage | a RiskAssessment saying ROUTINE / URGENT / EMERGENT |
| Escalation | a Task, owned by *your* Practitioner record |

If the app shows something but Medplum is empty, **the app is faking it** —
it's holding data in the browser instead of saving it. That's a real bug and
worth catching. Say: *"the dashboard shows patients but I don't see any Patient
resources in Medplum — is this actually persisting?"*

---

## Words you'll hear tomorrow

| Word | What it means |
|---|---|
| **resource** | one record (a Patient, an Observation) |
| **endpoint / API** | the door your app knocks on to read or write data |
| **seed / fixture** | fake starter data |
| **schema** | what fields a record is allowed to have |
| **deploy** | put code somewhere it can run |
| **repo** | the project folder |
| **commit** | a save point you can go back to |
| **localhost** | this computer |
| **console** | the hidden text log where errors show up |
| **state** | what the app is currently remembering |
| **hardcoded** | typed in directly instead of computed — usually a shortcut |
| **mock / stub** | a fake stand-in for something not built yet |

If someone uses a word you don't know, **ask.** At a hackathon that reads as
engaged, not ignorant. You're the clinical expert in the room; nobody expects
you to be the engineer too.

---

## When something goes wrong

**The single most useful thing you can do is describe what you see.**

Not: *"it's broken."*
But: *"the page is white and there's red text in the console that says
`Cannot read property 'name' of undefined`."*

**How to find the console:** in Chrome, `Cmd + Option + J`. Red lines are
errors. Copy the first red line — that's usually the real problem, and the rest
is noise.

Three prompts that fix most things:

> The page is blank and the console says [paste]. Fix it.

> This was working ten minutes ago and now it isn't. What changed?

> Stop. Explain what you think is happening and what you've already tried.

That last one is your cue to walk over to Medplum or Deepgram staff.

---

## Your actual job tomorrow

Not coding. Three things, and only you can do them:

1. **Check the clinical logic.** When Claude writes `triage()`, read the
   thresholds against SPEC.md §3 yourself. A wrong number there is invisible to
   everyone else in the building.
2. **Verify things are real.** After each tier, look in Medplum.
3. **Tell the story.** Rehearse the demo out loud, three times, between 5 and 6.

Everything else is typing, and Claude does typing.
