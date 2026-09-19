# AXIOM 2.0 — Evaluation

Status: evaluation methodology and taxonomy contract. Defines how AXIOM
correctness is measured and how the corpus evolves.

## 1. Current authoritative corpus

- `benchmarks/axiom-corpus.json` — fast, authoritative suite.
- 290 cases; 94/94 required findings; zero unexplained false positives or
  misses; zero mapping failures; zero protected-span failures; 22 documented
  known misses; nine documented limitations.
- Stage C expansion (`benchmarks/axiom-2-corpus.json`, +205 cases) brings the
  combined evaluation to 495 cases with 165 required findings, four formal
  suites, and per-category metrics. See `stage-c-evaluation-corpus.md`.

The corpus is an **evaluation corpus**, not a neural training corpus. That
distinction is important and remains.

## 2. ERRANT-aligned taxonomy

Use ERRANT-style categories to standardize evaluation, while preserving
REDLINE-specific categories.

ERRANT categories:

- `SPELL`, `ORTH`, `NOUN`, `NOUN:NUM`, `VERB`, `VERB:FORM`, `VERB:SVA`,
  `VERB:TENSE`, `DET`, `PREP`, `PRON`, `CONJ`, `PUNCT`, `WO`, `MORPH`,
  `OTHER`

REDLINE-specific categories:

- `CanonicalTerm`, `ProtectedSpan`, `ContextualWordChoice`, `Register`,
  `VoicePreservation`

ERRANT is development/evaluation tooling, not a required runtime dependency.

## 3. Four conceptual evaluation suites

### A. Correctness

Actual errors: subject-verb agreement, verb tense/form, noun number,
articles/determiners, prepositions, pronouns, conjunctions, word order,
spelling, contextual spelling, punctuation, morphology, missing words, extra
words, wrong-but-valid words.

### B. Negative controls

Valid writing likely to trigger overcorrection: contractions, first person,
conversational fragments, intentional repetition, passive voice, technical
terminology, unusual legitimate vocabulary, proper names, quotes, commands,
code, URLs, filenames, version numbers, identifiers.

### C. Register

Valid expressions across General / Professional / Academic. Expected output
distinguishes correction vs advisory refinement vs no finding.

### D. Voice preservation

Optional improvements must not unnecessarily erase personal phrasing.

## 4. Corpus quality target

Expand toward ~500-750 high-quality cases during this work, but 300 excellent
cases with strong negative controls beat 1,000 weak synthetic cases. Every
new rule/model behavior needs positive examples AND adversarial/negative
controls.

## 5. Metrics

Primary:

- precision
- recall
- F0.5 (weights precision over recall)

Category-level (report separately; do not hide poor categories in an
aggregate):

- category precision / recall
- unexplained false positives
- false negatives
- mapping failures
- protected-span failures
- natural-writing preservation

## 6. Benchmark environment

Record Windows version, CPU, RAM, GPU (if used), model/runtime versions,
thread settings, warm/cold state.

Per-candidate runtime metrics: latency p50 / p90 / p95, RAM, CPU, startup /
model load, package/model size.

## 7. Regression gate

Existing floors must not regress:

- `pnpm benchmark:axiom`
- `pnpm evaluate:grammar -- --gate`
- terminology tests/benchmark

The release gate remains **zero unexplained false positives**.

## 8. Rule/model failure log

Systematically record findings: false positive, false negative, ambiguous,
context insufficient, model disagreement, protected-span failure, terminology
conflict, meaning-changing correction. These become future corpus candidates.

## 9. Dashboard / report

Research tooling generates a human-readable report showing: total cases,
required findings, precision, recall, F0.5, false positives/negatives, known
limitations, mapping failures, protected failures, category breakdown, engine
breakdown, contextual-model performance, runtime performance. Developer
report is sufficient; no product UI required.

## 10. Restricted inputs

No external restricted corpus text (JFLEG, W&I+LOCNESS, NUCLE, BEA-19,
CoNLL-14, FCE, Lang-8) may be committed. Local-only optional inputs must pass
the provenance/license manifest gate before ingestion.
