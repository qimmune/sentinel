# Sentinel — the agentic safety net for outpatient CAR-T

**YC × Medplum Hackathon, Sat Aug 1 2026 @ YC SF**
Submission deadline **5:00pm**. Presentations 6pm, awards 7pm.

---

## 1. The pitch (60 seconds)

CAR-T works. The problem is where it has to happen.

Because of two toxicities — **CRS** (cytokine release syndrome) and **ICANS**
(immune effector cell-associated neurotoxicity syndrome) — patients are
admitted for 1–4 weeks after infusion. That inpatient requirement is the
single biggest bottleneck on CAR-T access: it caps how many patients a center
can treat, it drives most of the cost, and it forces patients to relocate to
one of ~200 certified centers.

The field is already moving outpatient. What's missing is the monitoring
layer. Today "outpatient CAR-T" means a nurse calls you, or you drive in daily
for a neuro exam.

**Sentinel is the agent that watches the patient at home.** Every day it calls
the patient, listens to how they describe their symptoms, combines that with
their vitals and wearable data, and answers one question:

> **How worried should we be right now — and what should happen next?**

Not a diagnosis. A **triage decision**: keep monitoring, call the nurse today,
or go to the ED now. Every recommendation cites the specific symptoms and
readings behind it, so a clinician can overrule it in five seconds.

**Why us — and this is the whole reason the project is ours to build:**

Q-Immune's QMI platform reads protein-interaction networks in living cells to
predict which CAR-T products and patients carry the most toxicity risk —
**before infusion**. Sentinel watches for that risk **after infusion**.

And the two connect directly: **a patient's pre-infusion risk profile sets how
sensitively Sentinel watches them.** A patient flagged high-risk gets a lower
escalation threshold — a symptom that's "call us tomorrow" for one patient is
"come in now" for another.

> **Predict who's at risk before infusion. Tune the monitoring to match. Catch
> it early after.**

That's not a biotech founder doing a hackathon project. It's the same company
closing the loop on the same failure mode from both ends — the
bench-to-bedside-to-bench story Q-Immune already tells, made concrete.

*(In the demo this is one field on the Patient resource — a risk tier that
shifts thresholds. Cheap to build, and it's the thing that makes the whole
project ours rather than generic.)*

---

## 2. Why this is the right project for this room

| Judge / sponsor | What lands |
|---|---|
| **Cody Ebberson** (Medplum CTO) | Real FHIR modeling — Observation, Questionnaire/QuestionnaireResponse, RiskAssessment, Flag, Task, Subscription — plus a Medplum **Bot** doing the grading server-side. Not a CRUD demo with a FHIR logo on it. |
| **Deepgram** (2 of 6 judges) | The **ICE score is literally a spoken cognitive exam**. Voice isn't bolted on — it *is* the assessment. Best Deepgram fit in the room. |
| **Diana Hu** (YC Partner) | Clear wedge, obvious buyer (CAR-T centers under capacity pressure), real market, founder has domain authority. |
| **"Agentic healthcare" theme** | An agent that observes → grades → decides → acts, on a clinical protocol, with a human in the loop. Exactly the theme. |

---

## 3. Clinical logic (this is the moat — get it right)

### The split that makes this defensible

**We do not output a clinical grade. We output a triage decision.** That
distinction does a lot of work: it's honest about what an 8-hour build can
claim, it avoids implying we're a diagnostic device, and it matches what
patients actually do — describe symptoms in their own words, not answer a
structured exam.

The pipeline has a hard boundary in the middle, and it's the single most
important design decision in the project:

```
  patient speaks freely
        │
        ▼
  Deepgram transcript
        │
        ▼
  ┌─────────────────────────┐
  │ LLM: EXTRACT FEATURES   │   "I've been shaky and I couldn't
  │ (subjective → structured)│    remember my daughter's name"
  │                         │        ↓
  │ NEVER decides urgency   │   { confusion: true, tremor: true,
  └─────────────────────────┘     wordFinding: true, fever: unknown }
        │
        ▼
  ┌─────────────────────────┐
  │ RULES: DECIDE TIER      │   deterministic. thresholds derived
  │ features + vitals       │   from ASTCT criteria. modulated by
  │ + Q-Immune risk tier    │   the patient's pre-infusion risk.
  └─────────────────────────┘
        │
        ▼
  ROUTINE · URGENT · EMERGENT   + the exact features that drove it
```

**The line for the judges:** *"The language model decides what the patient
said. It never decides how worried to be. That's deterministic, and it's
derived from the ASTCT consensus criteria."*

This keeps the strongest thing about the original design — no LLM in the
safety-critical decision — while making voice genuinely central instead of a
narration layer over a form.

### Escalation tiers

| Tier | Meaning | Example trigger |
|---|---|---|
| **ROUTINE** | Log it, keep watching | mild fatigue, stable vitals |
| **URGENT** | Care team contacts today | temp ≥38 °C; new confusion or word-finding trouble; resting HR trending up |
| **EMERGENT** | Go in now | any seizure; unarousable/very drowsy; temp ≥38 °C **with** SpO₂ drop or dizziness on standing |

**High-risk patients shift down a tier.** A Q-Immune high-risk patient with a
ROUTINE feature set gets URGENT. That's the integration, and it's one `if`.

### Where ASTCT still does the work

The consensus criteria stop being the *output* and become the source of **which
features matter and at what thresholds** — which is the part that's hard to get
right and that no other team will have. Keep the tables below; they define the
feature set. The two nuances in §3's callouts still apply and still matter.

**Source of truth:** Lee DW et al., *ASTCT Consensus Grading for Cytokine
Release Syndrome and Neurologic Toxicity Associated with Immune Effector
Cells*, Biol Blood Marrow Transplant 2019;25:625–638. The PDF is in the
Drive folder (`MedPlum x YC/CRS:ICANS.pdf`). Tables 4, 5, 6 are transcribed
below verbatim-accurate — **derive your thresholds from these, not from memory.**

### ASTCT CRS grading (Table 4)
Fever (≥38.0 °C, not attributable to another cause) is required for grade 1.
Grade is then set by **the more severe of hypotension or hypoxia**.

| Grade | Fever | Hypotension | Hypoxia |
|---|---|---|---|
| 1 | ≥38 °C | none | none |
| 2 | ≥38 °C | not requiring vasopressors | low-flow nasal cannula (≤6 L/min) or blow-by |
| 3 | ≥38 °C | requiring **one** vasopressor (± vasopressin) | high-flow cannula (>6 L/min), facemask, nonrebreather, Venturi |
| 4 | ≥38 °C | requiring **multiple** vasopressors (*excluding* vasopressin) | positive pressure — CPAP, BiPAP, intubation |

> **The nuance that makes this grader clinically real — and it matters most in
> exactly our setting:** *"In patients who have CRS then receive antipyretic or
> anticytokine therapy such as tocilizumab or steroids, fever is no longer
> required to grade subsequent CRS severity. In this case, CRS grading is
> driven by hypotension and/or hypoxia."*
>
> Outpatients take Tylenol at home. A naive grader that requires fever will
> **silently downgrade a patient who just took an antipyretic** — the exact
> patient you most need to catch. So `gradeCRS()` must take a
> `antipyreticOrTociWithin6h` flag and skip the fever gate when it's set.
>
> This is a genuine safety bug that most teams would ship. Call it out on
> stage — it's concrete proof you understand the clinical setting, not just
> the table.

Organ toxicities may be graded by CTCAE v5.0 but **do not** influence CRS grade.

At home we can observe fever, BP, SpO₂, HR. Pressors/ventilation are inpatient
concepts — so **Sentinel's job is detecting the grade 1 → grade 2 transition
early**, which is exactly the decision point for outpatient tocilizumab vs.
admission. Say this out loud in the demo; it shows you understand the setting.

### ICE score (Table 5) — 10 points
- **Orientation** — year, month, city, hospital → 4 pts
- **Naming** — name 3 objects (e.g. point to clock, pen, button) → 3 pts
- **Following commands** — e.g. "show me 2 fingers" → 1 pt
- **Writing** — write a standard sentence ("Our national bird is the bald eagle") → 1 pt
- **Attention** — count backward from 100 by 10 → 1 pt

Scoring: **10** = no impairment · **7–9** = grade 1 · **3–6** = grade 2 ·
**0–2** = grade 3 · **0 and unarousable** = grade 4.

### ICANS grading (Table 6) — ICE is only one of five domains

**The ICANS grade is the MAXIMUM across five domains, not the ICE score alone.**
A patient with ICE 3 (would be grade 2) who has a generalized seizure is
**grade 3**. Getting this wrong is the most likely clinical bug in the build.

| Domain | G1 | G2 | G3 | G4 |
|---|---|---|---|---|
| ICE score | 7–9 | 3–6 | 0–2 | 0 + unarousable |
| Depressed consciousness | wakes spontaneously | wakes to voice | wakes only to tactile | unarousable / stupor / coma |
| Seizure | — | — | any clinical seizure that resolves rapidly, or NCS resolving with intervention | prolonged (>5 min) or repetitive without return to baseline |
| Motor findings | — | — | — | deep focal weakness (hemi-/paraparesis) |
| Elevated ICP / edema | — | — | focal edema on imaging | diffuse edema, posturing, CN VI palsy, papilledema, Cushing's triad |

So the signature is `gradeICANS(iceScore, { consciousness, seizure, motor, icp })`
returning the max. At home we can realistically observe **ICE**, **level of
consciousness**, and a caregiver-reported **seizure** flag — which is enough to
reach grade 3. Tremors/myoclonus do **not** influence ICANS grade.

Edge case worth encoding: ICE 0 is grade **3** if the patient is awake with
global aphasia, but grade **4** if unarousable.

*(Note: the ICE writing item can't be done by voice — one more reason free-text
symptom triage is the better primary path. Keep ICE as the structured fallback
only.)*

**The demo money shot:** a patient who says "I've been a bit shaky and I
couldn't remember my daughter's name this morning" while their temp reads 38.4 °C
— and Sentinel escalates *before* anyone would have called them.

---

## 3b. Wearables — passive sensing as the *trigger*, not the grader

**Be precise about this or a clinician judge will take it apart.** Match what a
watch actually measures against what ASTCT grading actually needs:

| ASTCT needs | Apple Watch | Verdict |
|---|---|---|
| Temp ≥38 °C (core) | wrist temp — *overnight only*, reported as **deviation from personal baseline**, not core °C | ⚠️ trend signal only, **cannot** satisfy the fever criterion |
| Hypotension | **no blood pressure at all** | ❌ needs a paired BP cuff |
| Hypoxia / SpO₂ | blood oxygen (spot + background) | ✅ usable |
| — | HR, HRV, respiratory rate | ✅ strong early-warning signals; not in the grading table |

So the honest and *stronger* framing is:

> **The watch doesn't grade. The watch decides when to ask.**

Passive signals (rising resting HR, falling HRV, elevated wrist-temp deviation,
rising respiratory rate) are exactly the physiology that moves *hours before* a
patient feels sick enough to report — but none of them are gradeable criteria.
So they trigger the active assessment that produces gradeable data:

```
passive wearable drift  →  agent initiates voice check-in early
                        →  ICE score (ICANS) + "take your temp and BP now"
                        →  deterministic ASTCT grade on real criteria
                        →  escalate with the full trail
```

This is a **better** agentic story than a fixed daily check-in: the agent
decides *when* to intervene based on continuous data, rather than waiting for a
scheduled slot. It also closes the honest gap in the pitch — resting HR climbing
at 2am is precisely the signal a once-daily nurse call misses.

**How to demo it in one day.** HealthKit needs a native iOS app + a real device
(it doesn't work meaningfully in the simulator) — that is a bad trade for a
hackathon. Two viable paths, in order of preference:

1. **Simulated wearable feed** *(recommended)* — a scripted time series
   replaying a real deterioration curve into FHIR Observations. Label it
   "simulated" in the UI. Judges accept this without blinking; nobody expects a
   device integration in 8 hours.
2. **Apple Health export** *(nice bonus, ~30 min)* — on your iPhone, Health app
   → profile → Export All Health Data → `export.xml`. Parse it and seed real
   HR/HRV/respiratory-rate history for one patient. No native app required, and
   "this is my actual watch data" is a genuinely good line on stage.

Do #2 tonight if you have 10 minutes — start the export before bed, it's slow.

Both land in FHIR the same way, so the app can't tell the difference:
resting HR `40443-4` · HRV SDNN `80404-7` · respiratory rate `9279-1` ·
body temp delta `8310-5` (use a `Component` for baseline deviation) · SpO₂ `59408-5`.

## 4. Architecture

```
Wearable feed (simulated /            Clinician dashboard
  Apple Health export)                  ├── cohort triage board
  HR · HRV · resp rate · SpO2           │     (green / amber / red)
  · wrist temp deviation                └── patient drill-down:
             │                                wearable + vitals trends,
             │  drift detected                ICE trend, escalation
             ▼  → agent initiates             timeline
Patient PWA (phone)                             ▲
  ├── voice check-in (ICE) ─┐                   │
  │     └── Deepgram STT    │                   │
  └── prompted temp + BP    │                   │
        entry               │                   │
             │              │                   │
             ▼              ▼                   │
      ┌────────────────────────────────┐
      │      Medplum (hosted FHIR)     │
      │  Patient · Observation         │
      │  Questionnaire(Response)       │
      │  RiskAssessment · Flag · Task  │
      └───────────┬────────────────────┘
                  │ Subscription fires on new Observation/QR
                  ▼
         ┌──────────────────────┐
         │  Medplum Bot         │  ← the "agent"
         │  1. gather last 24h  │
         │  2. symptom features │
         │  3. + vitals + trend │
         │  4. + Q-Immune risk  │
         │  5. triage() -> tier │
         │  6. → RiskAssessment │
         │     + Flag + Task    │
         └──────────────────────┘
```

**Deliberate design call:** the grading rules are **deterministic code, not an
LLM**. The LLM/voice layer handles transcription and turning free speech into
structured answers; the clinical grade comes from the published criteria. Say
this on stage — "we don't let a language model decide if you have grade 3 CRS"
is a line that will land with clinicians and with Cody.

### FHIR resources & codes
| Thing | Resource | Code |
|---|---|---|
| Body temperature | Observation | LOINC `8310-5` |
| Systolic BP | Observation | LOINC `8480-6` |
| Diastolic BP | Observation | LOINC `8462-4` |
| Heart rate | Observation | LOINC `8867-4` |
| SpO₂ | Observation | LOINC `59408-5` |
| ICE assessment | Questionnaire + QuestionnaireResponse | custom |
| Computed CRS/ICANS grade | RiskAssessment | custom |
| Escalation | Flag + Task | — |
| Day-0 infusion, care protocol | CarePlan | — |

---

## 5. Scope — what we build, in order

**Build in this order and stop wherever 4:00pm finds you.** Every tier below is
independently demoable.

### Tier 1 — must have by ~1:00pm (this alone is a complete demo)
1. Medplum project seeded with 5 synthetic patients, Day +3 to +12 post-infusion,
   each carrying a **Q-Immune pre-infusion risk tier** (standard / elevated / high).
2. Vitals entry form → writes FHIR Observations.
3. **`triage(features, vitals, riskTier) → ROUTINE | URGENT | EMERGENT`** — pure
   deterministic TypeScript, unit-tested, thresholds from §3.
4. Clinician cohort board: 5 patients, colored by triage tier, worst first.

### Tier 2 — the differentiator, by ~3:00pm
5. **Voice symptom check-in via Deepgram.** The agent asks open questions
   ("How are you feeling today? Any trouble finding words?"), the patient
   answers in their own words, Deepgram transcribes.
6. **Feature extraction** from the transcript into the structured symptom set
   (fever reported, confusion, word-finding difficulty, tremor, headache,
   dizziness, drowsiness, seizure). Store as a QuestionnaireResponse so it's
   real FHIR. Then run `triage()` on it.
7. Show the transcript **next to** the extracted features and the resulting
   tier — the audit trail is the demo. A clinician can see exactly what the
   patient said and why the system reacted.

> The 10-point ICE score is still in §3 and is worth keeping as a **structured
> fallback** if free-text extraction proves flaky — it's a fixed question set
> with deterministic scoring. Don't build it first; build it only if extraction
> fights you.

### Tier 2b — wearable feed, ~30 min (do it right after Tier 2)
6b. Simulated wearable time series (HR, HRV, resp rate, SpO₂, wrist-temp
    deviation) streaming into FHIR Observations, plotted on the patient
    drill-down. Cheap to build, and it's what makes the escalation *look*
    continuous rather than form-driven. See §3b.

### Tier 3 — the "agentic" proof, by ~4:00pm
7. Medplum Bot + Subscription: fires on every new Observation/QuestionnaireResponse,
   re-runs `triage()`, writes a RiskAssessment with the tier, and raises Flag +
   Task when the tier worsens.
8. **Wearable drift → agent initiates an off-schedule check-in.** This is the
   money feature: the Bot sees resting HR climbing + HRV falling, and *triggers
   the voice assessment on its own* rather than waiting for tomorrow's slot.
   That's the difference between a form and an agent — build this before #9.
9. Escalation timeline on the patient drill-down.

### Tier 4 — only if time remains
10. Draft escalation note for the care team, LLM-generated from the structured data.
11. Apple Health export parser to seed one patient with your real watch data.
12. **Stedi eligibility check — the business-model slide.** Only if Tier 3 is done.

    Stedi is a clearinghouse: eligibility (270/271), claims, claim status. It has
    nothing to do with CRS/ICANS, so it's not on the critical path — and there
    are **zero Stedi judges** on the 6-person panel. But there's one angle that
    earns its 20 minutes: **"is this patient covered for remote monitoring?"**

    RPM has real billing codes (CPT 99453 setup / 99454 device supply /
    99457 first 20 min of management). Running an eligibility check at enrollment
    turns the pitch from "nice clinical tool" into "here's who pays." The whole
    outpatient CAR-T thesis is economic, so this is the piece that makes the
    money argument concrete — a **Diana Hu** point, not a clinical one.

    Setup: portal.stedi.com → API Keys → Generate, type **Test**, name prefixed
    `test`. Sandbox accounts are test-mode-only, which is all we need. Mock
    payers: Aetna, Cigna, UHC, CMS. Free, no PHI. Endpoint and sample payload
    are in the Drive doc "# Developer Docs Stedi". Skip their MCP server — it
    needs a production account; just call the REST API.

    Their docs pitch the MCP server for "voice agents that need to verify
    benefits in real time" — same stack as ours, if you want the sponsor nod.

### Explicitly NOT doing
Auth beyond Medplum's built-in · real wearable/HealthKit integrations · claims
submission · mobile native · multi-tenancy · anything HIPAA-real. Say "synthetic
data only" once and move on.

---

## 6. Feasibility

**Green.** The environment is already built and verified (see RUNBOOK.md).
Tier 1 is a few hours of Claude Code work. The genuinely uncertain part is
Tier 2 — browser mic capture → Deepgram streaming → structured scoring. That's
the one thing to spike *first thing* in the morning, before it's on the
critical path.

**Risks, ranked:**
1. **Deepgram voice pipeline eats the day.** Mitigation: timebox to 90 min. If
   it's not working by 12:30, fall back to typed ICE answers and keep Deepgram
   for a single scripted voice moment in the demo. The Deepgram staff are *in
   the room at 3pm for office hours* — go to them early, don't debug alone.
2. **Medplum Bot deployment is unfamiliar.** Mitigation: Tier 3 is third for a
   reason. If Bots fight you, run the identical grading function client-side.
   The demo looks the same. Cody will notice, so mention it honestly if asked.
3. **Demo fails live.** Mitigation: **record a 2-minute screen capture by
   4:30pm.** Non-negotiable. Present the recording, then go live if it's healthy.
4. **You're a non-coder.** Mitigation: you drive Claude Code, and your real job
   is the clinical logic, the demo script, and the pitch — which are the parts
   that actually win.

---

## 7. Honest odds

**Top 3: realistic. 1st place: a real shot but not the base case.**

What's genuinely in your favor:
- Domain authority no other team will have. Most hackathon healthcare projects
  are built by people guessing at the clinical workflow. Yours won't be.
- Two of six judges are Deepgram, and this is the most natural voice-AI use
  case at the event — a cognitive exam that is *spoken by design*.
- It's a real company thesis, not a weekend toy. Diana Hu will hear that.

What could sink you:
- **Execution risk.** A rough demo from a non-coder loses to a polished demo
  from a strong engineer. Ship Tier 1 clean rather than Tier 3 broken.
- **Narrowness.** Someone will say "this is only for CAR-T." Have the answer
  ready: *the same engine grades any protocol-driven toxicity — bispecifics,
  checkpoint inhibitors, transplant. CAR-T is the wedge because it's where the
  inpatient cost is highest.*

**The single highest-leverage thing you can do:** rehearse a 2-minute demo
script out loud, three times, before 5pm. Most teams don't, and it's the whole
difference at the 6pm presentations. Judges score what they *see and
understand*, not what you built.

---

## 8. Demo script (draft — rehearse this)

> "CAR-T cures people. It also puts them in a hospital bed for two weeks,
> because of two toxicities we know how to recognize — we just can't watch for
> them at home.
>
> This is Maria. Day 6 after infusion, at home. Every morning Sentinel calls
> her and just asks how she's doing. *[voice check-in plays — she says she
> slept fine, feels okay]* Nothing to act on. *[cohort board, all green]*
>
> Now it's 2am on day 7. Maria is asleep. *[wearable chart]* Her resting heart
> rate has climbed 18 beats over six hours and her HRV is falling. That's not a
> diagnosis — a watch has no blood pressure and can't read a core temperature.
> But it's enough to know something is changing.
>
> So Sentinel doesn't wait for morning. *[agent triggers check-in]* It calls her.
>
> *[play the audio]* She says: **'I've been a bit shaky, and this morning I
> couldn't remember my daughter's name.'**
>
> Watch what happens to that sentence. *[transcript → features panel]* The
> language model pulls out three things: new tremor, word-finding difficulty,
> confusion. Then it asks her to take her temperature — 38.4.
>
> And here's the part that matters: **the model doesn't decide what to do
> next.** Those features go into deterministic rules derived from the ASTCT
> consensus criteria. Fever plus new neuro symptoms in a patient Q-Immune
> flagged as high-risk before infusion — that's EMERGENT.
> *[escalation fires, Maria goes red, Task lands on the on-call nurse]*
>
> The model decides what she said. It never decides how worried to be.
>
> That's a patient who gets tocilizumab this afternoon instead of an ICU bed
> tomorrow. In a published series, catching CRS that early kept 15 of 35
> patients out of the hospital entirely.
>
> We're Q-Immune. Our platform reads protein networks in living cells to predict
> which patients carry the most toxicity risk — before infusion. This is the
> other half: it takes that prediction and decides how closely to watch them
> after. Predict who's at risk, tune the monitoring, catch it early."

---

## 9. References

According to PubMed:

- Reddy M, et al. *Implementation of CAR-T cell therapy in outpatient settings: a critical review.* Postgrad Med. 2026. [DOI](https://doi.org/10.1080/00325481.2026.2639107) — "Continued development in CAR-T product design and remote monitoring technologies is of crucial importance." This sentence is your thesis, from a review, in print.
- Majhail NS, et al. *Outpatient Administration of CAR T-Cell Therapy Using Remote Patient Monitoring.* JCO Oncol Pract. 2025. [DOI](https://doi.org/10.1200/OP-25-00062) — RPM scales outpatient programs cost-effectively across sites.
- Moore SL, et al. *Using technology for patient-centered care at home after CAR T-cell therapy or stem cell transplant.* Front Immunol. 2025. [DOI](https://doi.org/10.3389/fimmu.2025.1403249) — 10 patients, wearables + SMS chatbot, 219 alerts, 26 needed care-team follow-up. Direct precedent — and notably *not* agentic.
- Dholaria B, et al. *Feasibility of axicabtagene ciloleucel in the outpatient setting.* Bone Marrow Transplant. 2025. [DOI](https://doi.org/10.1038/s41409-025-02551-z) — 20 patients outpatient with remote monitoring; 19 still admitted for CRS. Use this to size the problem.
- Furqan F, et al. *Outpatient administration of CAR T-cell therapies using early CRS intervention.* Blood Adv. 2024. [DOI](https://doi.org/10.1182/bloodadvances.2024013239) — **early tocilizumab for grade ≥1 CRS prevented hospitalization in 15 of 35 patients.** This is the strongest number in your deck: catching grade 1 early keeps ~43% of patients out of the hospital. That is precisely what Sentinel automates.
