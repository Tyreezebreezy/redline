# REDLINE grammar corpus and evaluation harness

This is development-only evidence infrastructure. It does not run in the REDLINE application, collect writing, contact a network service, or change AXIOM behavior.

## Suites

- **Fast curated regression:** `benchmarks/axiom-corpus.json` remains the single source of truth. `pnpm benchmark:axiom` is the established release gate. `pnpm evaluate:grammar -- --gate` normalizes the same 265 cases and adds category, source, status, span, replacement, and mapping reports.
- **Large research evaluation:** pass local `.jsonl` or `.m2` paths to `pnpm evaluate:grammar -- <paths>`. This suite is exploratory and is not part of every build. Add `--source <manifest-id>` for M2 input and `--output <path>` for a JSON report.

Do not copy the 265 fast cases into another file. Generated reports belong under the ignored `corpus/reports/` directory or another local path. Reports include input sentences, so review or redact them before sharing and never commit private source text.

## Normalized JSONL case

Each line is one object:

```json
{"id":"example-1","source":"Real User","source_id":"approved-source-manifest","source_case_id":"RW-001","license":"Private project corpus","category":"VERB:SVA","original":"Exact or safely redacted text.","corrected":"Expected correction.","expected":[{"originalText":"are","from":5,"to":8,"replacement":"is"}],"rule_id":"PronounVerbAgreement","should_warn":true,"expected_span":{"from":5,"to":8},"expected_replacement":"is","tags":["real-world"],"notes":"No identifying context.","redistribution":"restricted","provenance":["docs/engineering/REAL_WORLD_FINDINGS.md#RW-001"],"benchmark_status":"required"}
```

Required fields are validated. A case cannot run unless `source_id`, source kind, license, and redistribution agree with an entry in `manifests/sources.json`. Supported sources are `Real User`, `REDLINE Corpus`, `Harper`, `External Corpus`, and `Synthetic Control`. Benchmark status is `required`, `control`, `known-miss`, `known-limitation`, or `protected`.

## Taxonomy

The development taxonomy is ERRANT-aligned without adding ERRANT as a runtime or development dependency:

`SPELL`, `ORTH`, `NOUN`, `NOUN:NUM`, `VERB`, `VERB:FORM`, `VERB:SVA`, `VERB:TENSE`, `ADJ`, `ADV`, `DET`, `PREP`, `PRON`, `CONJ`, `PUNCT`, `WO`, `MORPH`, and `OTHER`.

REDLINE-specific classes are `CanonicalTerm`, `ProtectedSpan`, `SentenceBoundary`, `ContextualWrongWord`, and `Terminology`. The harness maps known AXIOM rule IDs to this taxonomy and retains the emitted AXIOM rule ID in every result. Unmapped or ambiguous cases remain `OTHER`; a label is never guessed merely to improve coverage statistics.

## Status and reports

Every case reports one of: `PASS`, `MISS`, `FALSE POSITIVE`, `KNOWN MISS`, `KNOWN LIMITATION`, `PROTECTED`, or `MAPPING FAILURE`. Each row includes expected issues and actual AXIOM rule/category, projected span, mapped editor span, and replacements. The summary reports per-category cases/caught/missed/false positives, source breakdown, required detection rate, precision, known misses/limitations, protected failures, and mapping failures. Detection and precision stay separate; there is no blended score.

Duplicate detection uses normalized original text + corrected text + taxonomy category. The first case remains countable while later provenance is retained on it.

## External material and licensing

No external corpus is committed by this pass. Before any ingestion:

1. Add or update a source entry in `manifests/sources.json` with project, version, author, exact license, retrieval date, source URL, redistribution status, bundle status, development-only status, and import policy.
2. Resolve redistribution rights. Public download access is not permission to redistribute.
3. Keep restricted material in ignored `corpus/external/`; use an explicit local path when running the research suite.
4. Store no private user text unless it has been explicitly approved, minimized, and safely redacted.

Harper is the primary upstream reference. Its package and source are Apache-2.0, but the installed `harper.js` package does not ship upstream rule tests. Reference rules/tests by URL and version; import only focused, attributed examples that cover a measured REDLINE gap. Do not duplicate hundreds of upstream tests.

LanguageTool is reference-only because its core is LGPL and bundled resources can carry other licenses. Its paired should-warn/should-not-warn methodology is useful; its Java runtime, server, rules, tests, and datasets are not part of REDLINE.

JFLEG is CC BY-NC-SA 4.0. W&I+LOCNESS is distributed under non-commercial corpus terms. NUCLE requires a signed NUS non-commercial license. These remain optional local research inputs and are never redistributed here.

## Importers

- Native REDLINE JSON is normalized in memory.
- JSONL accepts the normalized schema above.
- M2 supports separate annotators, noop controls, replacements, removals, insertions, and ERRANT category labels. M2 text remains tokenized as supplied; corpus-specific detokenization is deliberately not guessed, so tokenization punctuation may appear in research results.
- CSV/TSV is intentionally deferred until an approved source actually needs it.

Run parser, manifest, duplicate, taxonomy, and one-case AXIOM integration checks with `pnpm test:grammar-corpus`.

## Promoting findings

A human-readable finding stays in `docs/engineering/REAL_WORLD_FINDINGS.md` until it is exact or safely redacted and reproducible. Then follow:

Real-world miss → reproduce → identify grammatical class → test Harper/current AXIOM → add should-warn fixtures → add should-not-warn controls → evaluate a deterministic fix → run a focused benchmark → run the full benchmark → review false-positive risk → promote only if precision remains acceptable.

The release gate remains zero unexplained false positives. Never create a phrase-specific regex for one report. Objective grammar belongs to AXIOM; valid-word alternatives and synonyms remain advisory future Word Tools.

Rank future gaps by user relevance, confidence in the intended correction, deterministic detectability, false-positive risk, Harper coverage, and implementation complexity—in that order. Protected technical spans and editor mapping are invariant gates, not recall tradeoffs.
