# Sentinel

**Remote monitoring for outpatient CAR-T patients.**
Built at the YC × Medplum hackathon, 1 August 2026, by [Q-Immune](https://qimmune.com).

---

CAR-T works. The problem is where it has to happen. Because of two toxicities —
**CRS** and **ICANS** — patients are admitted for weeks after infusion, and that
inpatient requirement is the single biggest bottleneck on CAR-T access.

The field is moving outpatient. What's missing is the monitoring layer.

Sentinel watches the patient at home. It reads their vitals, and when something
starts to move it **decides to ask** — it starts an off-schedule spoken check-in
rather than waiting for tomorrow's slot. Then it answers one question:

> **How worried should we be right now, and what should happen next?**

Not a diagnosis. A triage decision — keep monitoring, call the nurse today, or go
in now — with the exact symptoms and readings that drove it, so a clinician can
overrule it in five seconds.

## The design decision that matters

**Nothing that guesses is allowed to decide.**

Speech recognition and answer scoring produce *observations*. A pure,
fully-tested function called `triage()` turns observations into a tier. The two
layers never mix:

```
patient speaks  →  transcript  →  structured symptom features
                                            │
                                            ▼
                        triage(features, vitals, riskTier)
                        deterministic · ASTCT-derived · unit-tested
                                            │
                                            ▼
                          ROUTINE · URGENT · EMERGENT
```

There is a test asserting the extraction layer cannot return a tier, a grade, a
severity or a recommendation. If it ever could, the project's central claim
would no longer be true.

## Why Q-Immune

Q-Immune's QMI platform reads protein-interaction networks in living cells to
predict which patients carry the most toxicity risk — *before* infusion. Sentinel
watches for that risk *after* infusion, and the two connect: **a patient's
pre-infusion risk profile sets how sensitively Sentinel watches them.** A
high-risk patient escalates one tier sooner.

## Quick start

```bash
cd app
npm install     # only if node_modules is missing
npm run dev     # http://localhost:3000
npm test        # 104 tests
```

Sign in with Medplum, then click **Seed demo cohort** — five synthetic patients,
24 hours of vitals each, written as real FHIR.

## Where to look

| | |
|---|---|
| **[HANDOVER.md](HANDOVER.md)** | **Start here.** What's real, what's simulated, what isn't built, and what not to break. |
| [SPEC.md](SPEC.md) | Clinical logic, sourced references, pitch, demo script. |
| [`app/src/clinical/triage.ts`](app/src/clinical/triage.ts) | The decision logic. Pure function, no I/O, no model. |
| [`app/src/clinical/thresholds.ts`](app/src/clinical/thresholds.ts) | Every clinical number, tagged by where it came from. |
| [`app/src/agent/agent.ts`](app/src/agent/agent.ts) | The agent loop. |

## Honest scope

This is a one-day hackathon build. Specifically:

- **All patient data is synthetic.** No real patient data has ever been in this
  system. No HIPAA claims.
- **The vitals stream is simulated** — a scripted time series, labelled as such
  in the UI. In production it would come from a wearable or a home cuff.
- **No phone call is placed.** The agent raises a FHIR `Task` and the patient's
  app shows a ringing overlay. Real telephony needs a server and a provider
  account — see [`app/src/voice/telephony.ts`](app/src/voice/telephony.ts).
- **No language model is involved.** Answers are scored deterministically
  against a fixed question set, and the handover note is composed from
  templates — labelled *auto-generated*, not AI-drafted.
- **Thresholds are ASTCT-*derived*, not ASTCT-validated.** The fever, ICE and
  neuro rules come from Lee et al. 2019. The home blood-pressure and oxygen
  thresholds are our own stand-ins for inpatient concepts the consensus criteria
  use, and they are tagged `[PROXY]` in the source. They need clinical sign-off
  before this is more than a prototype.

Built on [Medplum](https://www.medplum.com/) (FHIR) and
[Deepgram](https://deepgram.com/) (speech-to-text).
