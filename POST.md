# LinkedIn draft — post AFTER the hackathon, not before

## Why wait

The event is tomorrow. A post tonight can only say "I'm going to a hackathon,"
which is the weakest version of this story. Post Saturday night or Sunday
morning and you get three things you don't have now:

1. **An outcome.** Even "we didn't place" is a stronger post than "I'm going."
2. **The demo video.** You're recording one at 4:30 anyway. Native video
   massively outperforms text on LinkedIn, and you'll already have it.
3. **A real narrative.** "I left Seattle Tech Week early to do X" only pays off
   once you can say what X produced.

Leaving Seattle Tech Week early is a genuinely good detail — it's a concrete
choice that signals conviction, not a humblebrag. But it only lands attached to
a result.

---

## Draft A — insight-led (works regardless of outcome)

> I left Seattle Tech Week a day early to sit in a room at Y Combinator and
> build software for 8 hours. Here's why.
>
> CAR-T works. It also puts patients in a hospital bed for two weeks, because of
> two toxicities — cytokine release syndrome and neurotoxicity. That inpatient
> requirement is the real bottleneck on access: it caps how many patients a
> center can treat and forces families to relocate to one of a few hundred
> certified sites.
>
> The field is moving outpatient. The monitoring layer to support it doesn't
> really exist yet.
>
> So at the YC × Medplum hackathon we built one: continuous monitoring that
> grades CRS and neurotoxicity against the ASTCT consensus criteria and escalates
> to the care team before a patient crosses a threshold. The neurotoxicity exam
> is a spoken cognitive test by design, so it runs by voice.
>
> One thing I didn't expect to matter so much: we deliberately kept the clinical
> grading as deterministic code, not a language model. The model handles speech.
> The published criteria decide the grade. In a room full of AI demos, that
> turned out to be the most important design decision we made.
>
> [RESULT SENTENCE]
>
> At Q-Immune we work on the other end of this timeline — reading protein
> networks in living cells to de-risk CAR-T constructs before they ever reach a
> patient. Predict the risk before infusion, detect it after. Same problem, both
> directions.
>
> Thanks to @Medplum and @Y Combinator for putting it on.

**Result sentence options:**
- Won: "We took [1st/2nd/3rd]."
- Didn't place: "We didn't place, but we shipped something real in 8 hours and I'd build on it again."
- Skip the line entirely if you'd rather not say.

---

## Draft B — shorter, lesson-led

> Spent Saturday at the YC × Medplum hackathon building a monitoring agent for
> outpatient CAR-T. Left Seattle Tech Week early for it. Worth it.
>
> The most interesting thing I learned had nothing to do with code.
>
> The consensus criteria for grading cytokine release syndrome require a fever.
> But there's a clause most people skip: once a patient has taken acetaminophen
> or received tocilizumab, fever is no longer required — you grade on blood
> pressure and oxygen alone.
>
> Outpatients medicate at home. So any monitoring system that gates on fever
> will quietly under-grade exactly the patients it exists to catch.
>
> That's not a coding problem. It's a domain problem, and it's the kind of thing
> you only catch if someone on the team has actually sat with the clinical
> literature.
>
> [RESULT SENTENCE]
>
> We're building Q-Immune to de-risk CAR-T from the other end — reading protein
> interaction networks in living cells before a construct ever reaches a patient.
> Predict it before infusion, detect it after.

**Draft B is the better post.** It teaches the reader something specific and
non-obvious, which is what actually travels on LinkedIn. Draft A is safer and
more conventional.

---

## Rules for whichever you pick

- **Attach the demo video.** Native upload, not a link. This matters more than
  the copy.
- **Don't claim a stat you can't source.** See the accuracy note below.
- **Tag deliberately:** Medplum, Y Combinator, Deepgram, and your teammates.
  Tag people who'll actually engage, not a wall of companies.
- **No "excited to announce."** No rocket emoji.
- **First comment** is where you put links (the hackathon page, qimmune.com) —
  LinkedIn suppresses reach on posts with outbound links in the body.

---

## Accuracy check before you post

Two things I could not verify and would not put in a public post:

1. **">90% CRS prediction accuracy."** This shows up in third-party summaries of
   Q-Immune but appears on neither qimmune.com nor your LSW executive summary.
   If it's real and sourced, great — but don't let a number into a public post
   that you can't point to a document for.

2. **What QMI stands for.** Your LSW executive summary expands it as *"Quantum
   Molecular Intelligence."* The scientific literature and other profiles use
   *"Quantitative Multiplex co-Immunoprecipitation"* — which is the actual
   published assay. These are very different claims, and a technical investor
   will notice. Worth reconciling across your materials regardless of the post.

Neither draft above uses either item, so both are safe as written.
