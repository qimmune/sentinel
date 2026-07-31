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

**Sentinel is the agent that watches the patient at home.** It ingests vitals,
runs the neurotoxicity exam by voice, grades toxicity against the ASTCT
consensus criteria on every new data point, and escalates to the care team the
moment a patient crosses a threshold — with the evidence attached.

**Why us:** Q-Immune is building safer, more effective immunotherapies. Safer
cell products are what make outpatient CAR-T possible. Sentinel is the
monitoring layer that has to exist on the other side of that. We're building
the future our own therapeutics require.

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

### ASTCT CRS grading
Grading is driven by fever plus hypotension and hypoxia. Fever (≥38.0 °C) is
required for grade 1; higher grades are set by the *worse* of the hypotension
or hypoxia column.

| Grade | Fever | Hypotension | Hypoxia |
|---|---|---|---|
| 1 | ≥38 °C | none | none |
| 2 | ≥38 °C | responds to fluids, no pressors | low-flow O₂ ≤6 L/min |
| 3 | ≥38 °C | one vasopressor | high-flow O₂ >6 L/min |
| 4 | ≥38 °C | multiple vasopressors | positive pressure ventilation |

At home we can observe fever, BP, SpO₂, HR. Pressors/ventilation are inpatient
concepts — so **Sentinel's job is detecting the grade 1 → grade 2 transition
early**, which is exactly the decision point for outpatient tocilizumab vs.
admission. Say this out loud in the demo; it shows you understand the setting.

### ICE score (ICANS) — 10 points
- **Orientation** — year, month, city, hospital → 4 pts
- **Naming** — name 3 objects → 3 pts
- **Following commands** — e.g. "show me 2 fingers" → 1 pt
- **Writing** — write a standard sentence → 1 pt
- **Attention** — count backward from 100 by 10 → 1 pt

Grade: ICE 7–9 = **1** · 3–6 = **2** · 0–2 = **3** · 0 and unarousable = **4**
(higher grades also driven by seizure, motor findings, depressed consciousness,
cerebral edema).

**Honest limitation to name on stage:** the *writing* item can't be scored by
voice. Sentinel captures it on-screen (finger/stylus) and scores the other 9
by voice. Judges reward candor about this more than they'd reward hiding it.

**The demo money shot:** a patient whose ICE drops 10 → 7 overnight while their
temp climbs to 38.4 °C, and Sentinel escalates *before* anyone would have
called them.

---

## 4. Architecture

```
Patient PWA (phone)                  Clinician dashboard
  ├── daily voice check-in             ├── cohort triage board
  │     └── Deepgram STT ──┐           │     (green / amber / red)
  └── vitals entry          │          └── patient drill-down:
        (or simulated       │                vitals trend, ICE trend,
         wearable feed)     │                escalation timeline
             │              │
             ▼              ▼
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
         │  2. ASTCT CRS grade  │
         │  3. ICE → ICANS grade│
         │  4. trend delta      │
         │  5. → RiskAssessment │
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
1. Medplum project seeded with 5 synthetic patients, Day +3 to +12 post-infusion.
2. Vitals entry form → writes FHIR Observations.
3. Deterministic ASTCT CRS grader (pure TypeScript function, unit-tested).
4. Clinician cohort board: 5 patients, colored by current grade, sorted by risk.

### Tier 2 — the differentiator, by ~3:00pm
5. Voice ICE assessment via Deepgram: app speaks/shows the 5 prompts, patient
   answers aloud, transcript → structured scoring → QuestionnaireResponse.
6. ICE → ICANS grade, plotted as a trend.

### Tier 3 — the "agentic" proof, by ~4:00pm
7. Medplum Bot + Subscription: fires on every new Observation/QuestionnaireResponse,
   recomputes both grades, writes RiskAssessment, raises Flag + Task on threshold crossing.
8. Escalation timeline on the patient drill-down.

### Tier 4 — only if time remains
9. Trend-based early warning (grade 1 + rising temp slope + falling ICE = amber).
10. Draft escalation note for the care team, LLM-generated from the structured data.

### Explicitly NOT doing
Auth beyond Medplum's built-in · real wearable integrations · Stedi/claims ·
mobile native · multi-tenancy · anything HIPAA-real. Say "synthetic data only"
once and move on.

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
> because of two toxicities we know exactly how to grade — we just can't watch
> for them at home.
>
> This is Maria. Day 6 after infusion, at home. Every morning Sentinel calls
> her. *[play voice check-in — Sentinel asks the ICE questions, Maria answers,
> score appears live: 10/10]*
>
> Her nurse sees this. *[cohort board — five patients, all green]*
>
> Now it's day 7. *[advance]* Her temp is 38.4. Her ICE score came back 7, down
> from 10. Neither of those alone triggers a call. Together, Sentinel grades her
> CRS 1, ICANS 1, flags the downward trend, and pages the on-call team — with
> the vitals, the transcript, and the grading rationale attached.
> *[escalation appears on the board, Maria goes amber]*
>
> That's a patient who gets tocilizumab this afternoon instead of an ICU bed
> tomorrow.
>
> We're Q-Immune. We build safer immunotherapies. Safer products are what let
> CAR-T leave the hospital — and this is the layer that has to exist when it
> does."

---

## 9. References

According to PubMed:

- Reddy M, et al. *Implementation of CAR-T cell therapy in outpatient settings: a critical review.* Postgrad Med. 2026. [DOI](https://doi.org/10.1080/00325481.2026.2639107) — "Continued development in CAR-T product design and remote monitoring technologies is of crucial importance." This sentence is your thesis, from a review, in print.
- Majhail NS, et al. *Outpatient Administration of CAR T-Cell Therapy Using Remote Patient Monitoring.* JCO Oncol Pract. 2025. [DOI](https://doi.org/10.1200/OP-25-00062) — RPM scales outpatient programs cost-effectively across sites.
- Moore SL, et al. *Using technology for patient-centered care at home after CAR T-cell therapy or stem cell transplant.* Front Immunol. 2025. [DOI](https://doi.org/10.3389/fimmu.2025.1403249) — 10 patients, wearables + SMS chatbot, 219 alerts, 26 needed care-team follow-up. Direct precedent — and notably *not* agentic.
- Dholaria B, et al. *Feasibility of axicabtagene ciloleucel in the outpatient setting.* Bone Marrow Transplant. 2025. [DOI](https://doi.org/10.1038/s41409-025-02551-z) — 20 patients outpatient with remote monitoring; 19 still admitted for CRS. Use this to size the problem.
- Furqan F, et al. *Outpatient administration of CAR T-cell therapies using early CRS intervention.* Blood Adv. 2024. [DOI](https://doi.org/10.1182/bloodadvances.2024013239) — **early tocilizumab for grade ≥1 CRS prevented hospitalization in 15 of 35 patients.** This is the strongest number in your deck: catching grade 1 early keeps ~43% of patients out of the hospital. That is precisely what Sentinel automates.
