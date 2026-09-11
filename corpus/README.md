# REDLINE grammar corpus and evaluation harness

This is development-only evidence infrastructure. It does not run in the REDLINE application, collect writing, contact a network service, or change AXIOM behavior.

## Suites

- **Fast curated regression:** `benchmarks/axiom-corpus.json` remains the single source of truth. `pnpm benchmark:axiom` is the established release gate. `pnpm evaluate:grammar -- --gate` normalizes the same 265 cases and adds category, source, status, span, replacement, and mapping reports.
- **Large research evaluation:** pass local `.jsonl` or `.m2` paths to `pnpm evaluate:grammar -- <paths>`, or select one of the explicit upstream adapters below. This suite is exploratory, slower, source-aware, and never part of the release gate. Add `--source <manifest-id>` for M2 or adapter input and `--output <path>` for a JSON report.

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

Every case reports one of: `PASS`, `MISS`, `FALSE POSITIVE`, `KNOWN MISS`, `KNOWN LIMITATION`, `PROTECTED`, or `MAPPING FAILURE`. Each row retains its source case ID, exact manifest license, provenance link, source and corrected text, expected edits, raw Harper output, final AXIOM output, projected span, mapped editor span, and replacements. The summary reports per-category and per-source cases/caught/missed/unmatched issues, required detection rate, precision, known misses/limitations, protected failures, mapping failures, AXIOM additions, and AXIOM suppressions. Detection and precision stay separate; there is no blended score.

Raw Harper means the normalized output of pinned `harper.js` before AXIOM's canonical-term replacement, protected-span suppression, and dictionary filtering. Final AXIOM means the result after those controls and editor mapping. An unmatched issue in an external exact-target corpus is a research signal, not automatically proof that the suggestion is linguistically wrong; alternate valid corrections and corpus tokenization require manual review.

RobustGEC groups additionally report:

- **ROBUST PASS:** all six source variants match their target edits without unmatched issues or mapping/protection failures.
- **CONTEXT DROP:** the original variant is detected, but at least one context variant loses the issue.
- **CONTEXT FALSE POSITIVE:** a context variant gains an unmatched issue absent from the original.
- **RULE DRIFT:** the rule identity at the target edit changes between variants.
- **REPLACEMENT DRIFT:** a variant still detects the target range but stops offering the target replacement.

Duplicate detection uses normalized original text + corrected text + taxonomy category. Ordinary duplicates retain the first countable case and merge provenance. RobustGEC duplicates are reported but not removed because removing one variant would invalidate its six-case group.

## External material and licensing

No external corpus is committed by this pass. Before any ingestion:

1. Add or update a source entry in `manifests/sources.json` with project, version, author, exact license, retrieval date, source URL, redistribution status, bundle status, development-only status, and import policy.
2. Resolve redistribution rights. Public download access is not permission to redistribute.
3. Keep restricted material in ignored `corpus/external/`; use an explicit local path when running the research suite.
4. Store no private user text unless it has been explicitly approved, minimized, and safely redacted.

Harper is the primary upstream reference. `v2.7.0` at `dc1182cc2b33603748105df074d6bb47f0de3720` is Apache-2.0. Its 351 `.weir` files contain 1,838 machine-readable test lines. The installed `harper.js` package does not ship these source tests, so the research adapter reads an explicit local checkout and never vendors the upstream repository or bulk fixture text.

RobustGEC repository code is MIT at `1c5787b3c6288a45f0d99b883a501c02b54812a1`, but its benchmark text is derived from CoNLL-14, BEA-19, and TEM-8. The repository-level license does not establish that those underlying data rights are replaced. Its benchmark therefore remains local-only, untracked, unbundled, and non-redistributable through REDLINE.

ERRANT `v3.0.2` at `2840b84cf15c6a1d3f04e9d316aea1aa716e6000` is an MIT-licensed taxonomy reference only. REDLINE does not install or execute ERRANT, Python, spaCy, or an ERRANT model.

LanguageTool is reference-only because its core is LGPL and bundled resources can carry other licenses. Its paired should-warn/should-not-warn methodology is useful; its Java runtime, server, rules, tests, and datasets are not part of REDLINE.

JFLEG is CC BY-NC-SA 4.0. W&I+LOCNESS is distributed under non-commercial corpus terms. NUCLE requires a signed NUS non-commercial license. FCE and Lang-8 also remain subject to their source-data terms. All five are optional user-supplied local research inputs only; this pass did not download or evaluate them.

## Importers

- Native REDLINE JSON is normalized in memory.
- JSONL accepts the normalized schema above.
- M2 supports separate annotators, noop controls, replacements, removals, insertions, and ERRANT category labels. M2 text remains tokenized as supplied; corpus-specific detokenization is deliberately not guessed, so tokenization punctuation may appear in research results.
- `harper-weir` recursively reads `harper-core/src/linting/weir_rules/**/*.weir`, validates the two-string test form, and retains file/line provenance.
- `robustgec` reads an explicit local `benchmark/*/para.txt`, preserves all `O`/`A1`–`A5` groups, and labels uncategorized pair-only edits `OTHER` rather than installing ERRANT.
- CSV/TSV is intentionally deferred until an approved source actually needs it.

Run parser, manifest, duplicate, taxonomy, and one-case AXIOM integration checks with `pnpm test:grammar-corpus`.

Example development commands:

```powershell
git clone --depth 1 --branch v2.7.0 https://github.com/Automattic/harper.git corpus/external/harper-v2.7.0
pnpm evaluate:grammar -- --adapter harper-weir --source harper-2.7.0-upstream corpus/external/harper-v2.7.0/harper-core/src/linting/weir_rules --output corpus/reports/harper-v2.7.0.json
pnpm evaluate:grammar -- --adapter robustgec --source robustgec-2023-upstream <local-conll14-para.txt> <local-bea19-para.txt> <local-tem8-para.txt> --output corpus/reports/robustgec-2023.json
```

The Harper fetch is an explicit development action. RobustGEC has no automated fetch command because its mixed benchmark-data rights require the evaluator to provide a reviewed local checkout.

## 0.1.1D research snapshot

- Harper exposed 1,838 test lines; 11 exact duplicates produced 1,827 unique cases with 1,588 target edits. Raw Harper matched 1,537; final AXIOM matched 1,476. AXIOM suppressed 87 raw issues, including 26 unmatched extras, and added no expected findings in this upstream set. Mapping and protected-span integrity failures remained zero.
- The local RobustGEC snapshot contained 1,312 CoNLL-14 groups, 2,503 BEA-19 groups, and 1,181 TEM-8 groups: 4,996 groups / 29,976 variants in total. The evaluator detected 178 duplicate sentence/correction/category combinations but preserved every group member.
- Robustness signals were 16 strict robust passes, two context drops, 17 context false positives, three rule drifts, zero replacement drifts, and zero incomplete groups.
- RobustGEC's tokenized punctuation produces many unmatched `Spaces` issues. Its aggregate exact-target precision and recall are therefore diagnostic only and must not be used as REDLINE release quality numbers without a separately reviewed source-specific normalization policy.
- The highest-count Harper research candidates were `SendAnEmailTo` (13 misses, six cases with unmatched-issue concerns), `IncludingButNotLimitedToPunctuation` (eight, zero), and `TheirToTheyre` (seven, seven). Counts nominate manual review; they do not authorize enabling or reimplementing a rule.

## Promoting findings

A human-readable finding stays in `docs/engineering/REAL_WORLD_FINDINGS.md` until it is exact or safely redacted and reproducible. Then follow:

Real-world miss → reproduce → identify grammatical class → test Harper/current AXIOM → add should-warn fixtures → add should-not-warn controls → evaluate a deterministic fix → run a focused benchmark → run the full benchmark → review false-positive risk → promote only if precision remains acceptable.

The release gate remains zero unexplained false positives. Never create a phrase-specific regex for one report. Objective grammar belongs to AXIOM; valid-word alternatives and synonyms remain advisory future Word Tools.

Rank future gaps by user relevance, confidence in the intended correction, deterministic detectability, false-positive risk, Harper coverage, and implementation complexity—in that order. Protected technical spans and editor mapping are invariant gates, not recall tradeoffs.
