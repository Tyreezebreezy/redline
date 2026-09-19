# AXIOM 2.0 — Stage D/E: Contextual GEC Bakeoff + Resolver

Status: research evidence + a narrow deterministic production integration. No
neural model was shipped.

## 1. Candidate research

### Candidate A — GECToR-style sequence tagging
- Architecture: Transformer encoder (BERT/RoBERTa/XLNet) + linear
  classification over token-edit tags ("tag, not rewrite").
- Code: Apache-2.0 (`grammarly/gector`). Runtime: Python/PyTorch + AllenNLP +
  transformers; no official ONNX path; Windows CPU would require a non-trivial
  ONNX export.
- Weights: pretrained encoders fine-tuned on BEA-2019 / Lang-8 / W&I+LOCNESS
  style corpora (restricted redistribution); no confirmed clean weights
  license for a distributed desktop app.
- Verdict: not shippable tonight (weights licensing + Python/ONNX runtime).

### Candidate B — small seq2seq GEC
- Representative: BART-based `oliverguhr/spelling-correction-english-base`
  (MIT weights), ~0.1B params, F32 (~400 MB), ONNX available.
- Limitations: "experimental / proof of concept", spelling-only, produces
  unbounded text2text rewrites; does not target agreement/determiner/
  preposition/precision classes and would formalize valid writing.
- Verdict: not shippable (unbounded rewriting + wrong task + precision).

### Candidate C — deterministic context classifier
- Implemented and benchmarked (`probes/axiom-context/candidate-c.mts`): five
  high-confidence confusion-set/context rules plus a head-noun agreement
  heuristic.
- Result vs Stage C corpus: recovers 7/61 known misses at **0 false positives
  across 261 control cases**.

### Candidate D — none
No clearly superior, cleanly-shippable modern GEC architecture was identified
that differs meaningfully from A/B/C while meeting the licensing/runtime bar.

## 2. Bakeoff outcome

The neural candidates cannot be legally or reliably distributed locally with
REDLINE's precision requirements. The deterministic candidate (C) is the only
one that is precision-clean, explainable, offline, and zero-cost. This
confirms REDLINE's precision-first philosophy: deterministic rules beat a
noisy neural model for this product.

## 3. Production integration (narrow)

Integrated five deterministic context rules (Tier 1) into `src/axiom/contextRules.ts`:

- `AcceptExcept` — "except" -> "accept" after subject/please/to.
- `LooseLose` — "loose" -> "lose" after a modal.
- `ItsContraction` — "its" -> "It's" before a gerund.
- `YourContraction` — "your" -> "you're" before a gerund.
- `CiteSite` — "site" -> "cite" before a source word.

Deliberately NOT integrated: the head-noun agreement heuristic (needs
quantifier-aware negative controls before it is safe) and no neural model.

## 4. Stage E resolver proof

The existing `analyzeText` pipeline already implements the resolver authority
order (protected spans, terminology, deterministic rules, dictionary, sort).
Added resolver conflict cases to the corpus:

- `PROT-CONTEXT-001` — "its" inside a protected URL is not flagged.
- `COEXIST-001` — a context rule and `CanonicalTerm` coexist without
  overriding each other.
- Terminology authority, personal-dictionary suppression of Harper SpellCheck,
  and protected-span filtering remain intact.

## 5. Result

| Metric | Before | After |
| --- | --- | --- |
| Cases | 495 | 505 |
| Required findings | 165 | 172 |
| True positives | 165 | 172 |
| Unexplained false positives | 0 | 0 |
| Unexplained misses | 0 | 0 |
| Known misses | 60 | 53 (7 recovered) |
| Protected/mapping failures | 0 | 0 |

The seven recovered misses are common real-world word-choice/contraction
errors: accept/except, loose/lose, its/it's, your/you're, cite/site.

## 6. Recommendation

No neural contextual GEC model is justified for REDLINE at this time: the
weights are not cleanly redistributable and the precision/rewrite risk is
unacceptable. The deterministic context rules are a safe, incremental
improvement consistent with REDLINE's product model. Future Tier 2 work
should revisit sequence-tagging only if a permissively licensed, ONNX-ready,
high-precision en-US model becomes available; otherwise deterministic rules
remain the correct engine for REDLINE.
