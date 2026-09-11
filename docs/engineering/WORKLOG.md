# REDLINE engineering worklog

Append entries; do not rewrite earlier evidence.

## 2026-08-21 — 0.1.1 daily-use pass started

- Verified local `main` and `origin/main` at `bd52aa3a4f1c796e91ac88dde10c1352ef55e7ea` after fetching Gitea.
- Verified `v0.1.0` still resolves to `b775095666b45ce283d02e5875f7516bb936f83b`.
- Preserved `probes/transform-engine/` as the only approved untracked path.
- Created `codex/redline-0.1.1-daily-use` from the verified baseline.
- Captured the pinned Harper 2.7.0 default configuration: nine rules are disabled by default; none detects the observed malformed `where we are classes` syntax class.
- Re-ran the 183-case AXIOM baseline: 47/47 expected findings, zero unexplained false positives or misses, eight documented known false positives, zero protection or mapping failures.
- Chose benchmark-visible known misses and paired controls over a narrow regex or broad rule enablement.

## 2026-08-21 — bounded implementation verified

- Aligned package, Tauri, Rust, lockfile, and visible app versions at `0.1.1` on the working branch.
- Renamed the persistent spelling action to **Always allow word** and clarified the management dialog without changing storage or suppression scope.
- Expanded the AXIOM corpus from 183 to 193 cases: four documented malformed-syntax misses and six paired grammatical controls.
- Final AXIOM result: 47/47 required findings, zero unexplained false positives or misses, four documented known misses, eight existing known false positives, zero mapping or protected-span failures.
- `pnpm check`: passed TypeScript, Biome, foundation, editor, dictation mapping, Transform safety, AXIOM, and 15 native tests; three release benchmarks remained intentionally ignored.
- Rust formatting and Clippy with warnings denied passed. Production Vite build passed.
- Rendered QA passed at 1024x720, 1366x768, 1440x900, and 1920x1080 with no horizontal overflow or console errors; Dark, Light, and System remained functional.
- Verified no capability, command, permission, CSP, dependency, or external-request expansion. Gitleaks 8.30.1 scanned 11 commits with no findings.
- Ponytail removed one redundant benchmark counter; the full regression and 193-case benchmark passed again afterward.

## 2026-08-23 — 0.1.1A accepted for handoff

- Owner accepted `f61f44db201c57b16bd36f5731f798e0fa9acb05` (`feat: prepare REDLINE 0.1.1 daily-use pass`).
- Published `codex/redline-0.1.1-daily-use` to origin for sequential Claude Code or Codex handoff; no merge, tag, release, installer, or artifact was created.
- Kept local and remote `main` at the accepted post-0.1.0 state and preserved the protected `v0.1.0` release tag.
- Set the next priority to evidence from daily use: grammatical classes and paired fixtures with Harper evaluated first, real personal-vocabulary cases before broader allowances, and current entries in `REAL_WORLD_FINDINGS.md`.
- Retained `where we are classes` as a representative known miss, not a phrase-specific rule.

## 2026-09-04 — 0.1.1B AXIOM real-world coverage verified

- Audited Harper 2.7.0 across spelling, canonical capitalization, subject-verb agreement, punctuation, contextual wrong words, word forms, and broader malformed syntax.
- Expanded the corpus from 193 to 265 cases with paired warning, clean, casual, technical, contraction, ambiguous, and documented-miss fixtures.
- Added one AXIOM-owned `CanonicalTerm` rule for exact multiword capitalization of `Facebook Marketplace` and `LinkedIn Learning`; no Harper configuration, dependency, profile, native command, permission, or CSP changed.
- Preserved protected spans. All-uppercase product phrases remain documented conservative misses instead of bypassing identifier protection.
- Final benchmark: 75/75 required findings, zero unexplained false positives or misses, 22 documented known misses, nine documented known limitations, and zero protected-span or mapping failures.
- Kept noun agreement, broad punctuation, broader confusion sets, morphology, malformed-sentence repair, and Word Tools out of production until real examples establish safe semantics.
- Published the verified update to `codex/redline-0.1.1-daily-use`; `main`, `v0.1.0`, releases, installers, and artifacts remain unchanged.

## 2026-09-04 — 0.1.1B accepted; findings loop prepared

- Accepted `2bccc3cdade7f560fbc79ba228af1d5efc1ab31e` as the current 0.1.1 daily-use grammar baseline, including the 265-case, 75/75, zero-unexplained-regression result.
- Recorded `CanonicalTerm` as the only 0.1.1B AXIOM rule and `Facebook Marketplace` plus `LinkedIn Learning` as its first entries.
- Set the active objective to collecting and classifying exact or redacted real-world grammar misses before adding rules.
- Added a reusable findings schema, controlled statuses, the evidence-to-rule promotion path, the zero-unexplained-false-positive gate, and the advisory-only Word Tools boundary.
- Changed documentation only; no production source, grammar behavior, dependency, native boundary, tag, installer, or release was modified.

## 2026-09-10 — 0.1.1C findings and evaluation harness verified

- Backfilled the current real-world findings without inventing missing sentences: Facebook Marketplace and LinkedIn Learning are fixed/benchmarked, `where we are classes` remains a known miss with controls, the approximate `propel`/`propelling` report and other unavailable observations say `Needs Exact Example`, and synonyms remain deferred Word Tools work.
- Added a development-only grammar corpus evaluator around the existing 265-case source of truth; no production code, grammar rule, Harper configuration, dependency, native boundary, or release state changed.
- Added validated normalized JSONL and M2 imports, ERRANT-aligned plus REDLINE product taxonomy, provenance/license manifests, external duplicate detection with retained provenance, and per-case/category/source reports.
- Audited external sources before ingestion. Harper remains the Apache-2.0 primary reference. LanguageTool is methodology-only. JFLEG, W&I+LOCNESS, and NUCLE remain restricted optional local research inputs; no external dataset was downloaded or committed.
- `pnpm test:grammar-corpus` passed malformed-input, JSONL, M2, duplicate, license/provenance, taxonomy, and AXIOM integration checks.
- The normalized gated report preserved all 265 cases and the accepted floor: 75/75 required findings, zero unexplained false positives or misses, 22 known misses, nine known limitations, and zero protected-span or mapping failures.
- `pnpm check`, `pnpm benchmark:axiom`, Rust formatting, Clippy with warnings denied, and `pnpm build` passed. Dictation and Transform release benchmarks were not run because neither implementation nor their shared command/editor path changed.
- Ponytail kept the native corpus authoritative, used Node standard-library parsing, added no dependency, skipped CSV/TSV until a real source requires it, and generated no committed report or external-corpus copy.

## 2026-09-11 — 0.1.1D external grammar research evaluated

- Started from `c942471e0951bcee4ca13cc4e027fb9f2b9ee8f4` on `codex/redline-0.1.1-daily-use`; local and origin matched, and `probes/transform-engine/` remained the only intentional untracked path.
- Pinned Harper `v2.7.0` at `dc1182cc2b33603748105df074d6bb47f0de3720` (Apache-2.0), parsed all 1,838 tests from 351 `.weir` files, and evaluated 1,827 unique cases after 11 duplicate removals.
- Harper research result: raw 1,537/1,588 target edits; final AXIOM 1,476/1,588; 87 raw issues and 26 unmatched extras suppressed; zero mapping or protected-span integrity failures.
- Pinned RobustGEC at `1c5787b3c6288a45f0d99b883a501c02b54812a1`. Kept its mixed-provenance benchmark local-only despite the repository's MIT code license.
- Evaluated all 4,996 available groups / 29,976 variants: 1,312 CoNLL-14, 2,503 BEA-19, and 1,181 TEM-8 groups. Detected 178 duplicates without collapsing group members.
- Robustness result: 16 strict robust passes, two context drops, 17 context false-positive signals, three rule drifts, zero replacement drifts, and zero incomplete groups. Recorded tokenized `Spaces` output as a limitation rather than a release precision claim.
- Added source-aware raw-Harper/final-AXIOM reporting, exact provenance, duplicate evidence, a bounded candidate backlog, and explicit Harper/RobustGEC adapters using only Node standard library and existing dependencies.
- Left JFLEG, W&I+LOCNESS, NUCLE, FCE, and Lang-8 external/local-only. Added ERRANT `v3.0.2` as an MIT taxonomy reference without Python or spaCy.
- Re-ran the gated 265-case suite: 75/75 required findings, zero unexplained false positives or misses, 22 known misses, nine known limitations, and zero mapping/protected-span failures.
- Made no production grammar, Harper configuration, dependency, permission, CSP, native command, user-data, release, tag, installer, or main-branch change.
- Final gates passed: `pnpm check`, `pnpm benchmark:axiom`, Rust formatting, Clippy with warnings denied, and `pnpm build`. The established Vite chunk-size warning remained non-blocking.
- Ponytail reused one Harper analysis per case, kept the research suite explicit/non-blocking, removed an unused accumulator, and rejected a speculative detokenizer or new dependency.
