# AXIOM 2.0 — Stage C: Evaluation System + Corpus Expansion

Status: measurement infrastructure. No production grammar behavior changed.

## 1. What this is

Stage C turns the AXIOM benchmark into a language-engineering evaluation
system: a structured corpus with four suites, an ERRANT-aligned taxonomy,
per-suite and per-category metrics, and a documented known-miss inventory that
separates current capability from future target capability.

The goal is measurement, not production correction. Stage D (contextual GEC)
will consume this system to answer: does contextual GEC actually make REDLINE
better?

## 2. Files

- `benchmarks/axiom-corpus.json` — the pre-existing 290-case regression floor
  (single source of truth; unchanged).
- `benchmarks/axiom-2-corpus.json` — the Stage C expansion (205 cases, fully
  tagged with suite/errant/classification/context/sourceType/notes).
- `scripts/benchmark-axiom.mts` — extended to load both files and report
  per-suite, per-category, and known-miss metrics. `pnpm benchmark:axiom`.

## 3. Case schema

```text
id                     stable string (CORR-SVA-001, MISS-DET-003, NEG-..., REG-..., VOICE-..., PROT-..., TERM-..., DICT-...)
text                   input sentence
expected[]             required findings: { originalText, category?, ruleId? }
knownMisses[]          future-target findings current AXIOM misses (tracked, not regressions)
knownLimitations[]     documented limitations (consumed, not false positives)
dictionary[]           personal-dictionary terms for the case
profile                general | academic | professional
protected              true when the whole text must be silent
protectedSpans         expected count of protected spans detected
suite                  correctness | negative-control | register | voice-preservation
errant                 ERRANT or REDLINE-specific category
classification         correction | suggestion | hidden
context                general | professional | academic | all
sourceType             authored-test | anonymized-real-world | research-derived-principle
notes                  optional rationale / future-stage pointer
```

The pre-existing 290 cases are untagged (`suite` defaults to `correctness`
in the report); they remain the release gate. New cases carry the full schema.

## 4. Four suites

| Suite | Meaning | Expected AXIOM output |
| --- | --- | --- |
| correctness | objective American-English errors | required finding (or tracked known-miss) |
| negative-control | valid writing REDLINE must leave alone | silence |
| register | valid writing whose advisability varies by context | silence for AXIOM Core/Context (future Tier-4 suggestion) |
| voice-preservation | valid personal/natural constructions | silence (must not be flattened) |

## 5. Taxonomy

ERRANT-aligned: `SPELL`, `ORTH`, `NOUN`, `NOUN:NUM`, `VERB`, `VERB:FORM`,
`VERB:SVA`, `VERB:TENSE`, `DET`, `PREP`, `PRON`, `CONJ`, `PUNCT`, `WO`,
`MORPH`, `OTHER`.

REDLINE-specific: `CanonicalTerm`, `ProtectedSpan`, `ContextualWordChoice`,
`Register`, `VoicePreservation`, `PersonalDictionary`, `Dialect`,
`StylePreference`.

## 6. Metrics

Reported overall and per-category: case count, positives, true positives,
false positives, false negatives, precision, recall, F0.5, known misses.

F0.5 (not F1) is the primary combined metric because REDLINE weights precision
over recall. Raw precision, recall, and false-positive count are always
exposed. A model with better F0.5 but unacceptable false positives may still
be rejected.

## 7. ERRANT status

ERRANT `v3.0.2` (MIT) remains a **taxonomy reference only**, consistent with
the pre-existing decision: REDLINE does not install or execute ERRANT, Python,
spaCy, or an ERRANT model. The equivalent approach is the ERRANT-aligned
internal taxonomy in `scripts/grammar-corpus.mts`, which maps AXIOM rule IDs to
ERRANT categories without running ERRANT. If ERRANT classifies an edit
differently from REDLINE's product semantics, both are recorded; ERRANT is
never REDLINE's definition of English.

## 8. Corpus composition

Total 495 cases = 290 legacy + 205 expansion.

Expansion (205):

| Suite | Cases |
| --- | --- |
| correctness | 112 (71 required findings + 39 known-miss + 2 known-limitation) |
| negative-control | 47 |
| register | 29 |
| voice-preservation | 17 |

Expansion category highlights: SPELL 22, VERB:SVA 16, CanonicalTerm 14,
ProtectedSpan 17, PREP 8, DET 9, PUNCT 8, ContextualWordChoice 7, Dialect 6.

Classification: 112 correction, 85 hidden, 8 suggestion.

## 9. Current floor (measured, unchanged)

- 495 cases, 165 required findings, 165 true positives.
- 0 unexplained false positives, 0 unexplained misses, 0 mapping failures,
  0 protected-span failures.
- 60 known misses (22 legacy + 38 expansion), 12 known limitations
  (9 legacy + 3 expansion).
- Terminology: 377 records verified.
- Overall precision/recall/F0.5 = 1.0 / 1.0 / 1.0 on required findings.

## 10. Current production weaknesses (ranked by evidence)

Deterministic AXIOM currently misses these measured classes (all present as
known-miss fixtures; candidates for AXIOM Context, Stage D):

1. Subject-verb agreement across intervening nouns / coordinated / collective
   subjects (`report from the analysts are`, `Alice and Bob is`).
2. Contextual real-word errors (`I except`, `principle`, `compliment`,
   `bare`, `site`).
3. Preposition collocation (`interested for`, `depends of`, `waiting since`).
4. Tense and verb form beyond Harper's rules (`If I was you`,
   `By the time he arrived, we left`).
5. Missing/extra words (`report ready`, `for on Monday`).
6. Word order / adverb placement (`always is`, `know not`).
7. Punctuation: comma splice, missing commas after introductory/dependent
   clauses, nonrestrictive clauses.
8. Determiner edge cases (missing article, unnecessary article, mass/count).
9. Sentence-initial capitalization beyond `i`.

## 11. Documented limitations (current AXIOM false positives on valid input)

- Harper flags `config` (ExpandConfiguration) and `toml` (SpellCheck) on the
  bare filename `config.toml` — bare filenames are not yet protected spans.
- Harper flags the UK form `centre` even inside source/quoted text — dialect
  handling does not yet respect source-preservation boundaries.
- Harper misses short/common typos `teh` and `alot` (Stage B finding).

## 12. Restricted data

No restricted corpus passages were committed. All expansion cases are
originally authored. No third-party sentences were copied.

## 13. Stage D handoff requirements

Stage D receives a measurement system that can report, per candidate:

- overall precision / recall / F0.5 (required findings only)
- per-category precision / recall / F0.5
- false-positive list with case ID, category, engine, replacement, reason
- known-miss recovery (do candidates close the 60 known-miss gaps?)
- protected-span failures
- natural-writing preservation (negative-control FP count)

Candidates must be scored against the tagged corpus without being tuned
directly against the same cases. The known-miss set is the primary
evidence for "does contextual GEC actually help"; the negative-control and
voice suites are the primary evidence for "does it hurt".
