# AXIOM 2.0 — Contextual GEC

Status: research contract for the contextual grammatical-error-correction
bakeoff (Stage D). No production integration is authorized by this document.

## 1. Mission

Detect mistakes deterministic rules struggle with:

- subject-verb agreement across intervening phrases
- verb tense and verb form
- noun number
- articles/determiners
- prepositions
- contextual spelling
- wrong-but-valid words (homophones, plausible substitutions)
- missing words / extra words
- word order
- contextual punctuation
- morphology
- sentence-context relationships

Prefer **localized edits**. Do not start by asking a general-purpose LLM to
rewrite every sentence.

## 2. Candidate families (bakeoff)

At minimum evaluate three architecture families where technically feasible:

- **Candidate A** — modern sequence-tagging GEC (GECToR-style localized edit
  prediction).
- **Candidate B** — small seq2seq grammatical-error-correction model.
- **Candidate C** — deterministic + n-gram/context classifier approach.

If current research exposes a clearly better additional candidate, document
and include it if feasible. Do not include models purely for quantity.

## 3. Candidate documentation

For every candidate document: architecture, model, publication/source,
maintenance, license, training-data license concerns, model size, runtime,
Windows viability, CPU viability, ONNX possibility, quantization, edit
localization, confidence availability, explanation potential, packaging
complexity. Do not select on reputation alone.

## 4. GECToR baseline

Use Grammarly's published GECToR architecture/research as an important
baseline. Research: original architecture, current forks/descendants, modern
encoders, Windows inference options, ONNX export, quantization, licensing,
transformation vocabulary, confidence calibration. Its primary value is the
concept: **localized contextual edits rather than unrestricted rewriting**.
The historical implementation is not assumed to become production REDLINE
unchanged.

## 5. Generative model boundary

Do NOT reuse the Qwen Transform model as the default AXIOM Context engine
merely because it is installed. Transform is generative rewriting; AXIOM
Context is bounded correction detection. If Qwen is benchmarked it must
compete fairly and produce structured/localized edits — never silent sentence
rewriting.

## 6. Performance preference

Favor models that plausibly run locally on ordinary Windows desktop hardware
without sluggish typing, with bounded memory, in debounced/background
analysis. Prefer small and predictable over large and marginally more
accurate unless evidence strongly favors the larger model. No arbitrary hard
production thresholds before measuring.

## 7. Confidence

Calibrate confidence on the REDLINE evaluation corpus with per-category
thresholds. Raw probability is not truth. A noisy category may stay advisory
or hidden.

## 8. Wrong-but-valid words

Dedicated attention and tests for contextual lexical errors: real word wrong
context, homophones, morphology producing a valid-but-wrong word, plausible
transcription substitutions. Build dedicated positive + negative controls.

## 9. Windows-first penalty

Any candidate that only works conveniently on Linux without a realistic
Windows deployment path receives a significant penalty. Research may use
Python; the production recommendation must account for Windows (native
runtime, ONNX Runtime, Rust/C++ integration, packaging).

## 10. Winner decision

At the end of the bakeoff recommend one winner, specific contextual
categories only, stay deterministic, or "more research." **No model is a
valid result.** A specialized model must materially improve on
Harper + deterministic REDLINE without unacceptable false positives or
resource cost.

## 11. Probe isolation

Experimental language/model code lives outside production paths (e.g.
`probes/axiom-context/` or a conventional equivalent). Keep dependencies
isolated; do not add Python/model dependencies to production REDLINE to run
evaluation experiments. If Python is required, use an isolated development
environment and document Python version, dependencies, license, setup, and
commands. Do not embed arbitrary Python runtime into production.

## 12. Hard stop

STOP before production AXIOM Context integration unless there is a separate
explicit owner instruction. Allowed now: docs, registry, tooling, generators,
corpus expansion, benchmarks, probes, experimental resolver, model runners
isolated under probes/tools. Not allowed now: shipping a GEC model, replacing
Harper, changing production correction behavior, adding model files to the
installer, altering release packaging for AXIOM Context, or making Tier-2
suggestions visible in normal REDLINE.
