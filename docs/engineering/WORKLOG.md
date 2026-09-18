# REDLINE engineering worklog

Append entries; do not rewrite earlier evidence.

## 2026-09-18 — AXIOM 2.0 Stage A: contracts + Writing Context fix

- Verified repository pre-flight against Gitea: `origin` is
  `[private-git-server]`; local and remote `main` are
  `a172d006decece1b72e5ffbc2a9b7f1c75877019`; annotated `v0.2.0` resolves to
  `b8ba8999ce8b6777a6adab743c95fa70e65d7c72` and `v0.1.0` to
  `b775095666b45ce283d02e5875f7516bb936f83b`, both present on origin.
- Confirmed the previously blocked 0.2.0 release publication is now reflected
  remotely (tags and all `codex/*` branches exist on origin); did not mutate
  any release or artifact.
- Created `opencode/redline-axiom-2-research` from `main`.
- Fixed the bounded Writing Context width defect: the `.profile` control
  stacked the "Writing Context" caption above the selector and made the
  selector fill its column (`width: 100%`), so General/Professional/Academic
  no longer clip. CSS-only; no top-bar grid change, no redesign. Committed
  separately.
- Stage A contracts written under `docs/engineering/axiom-2/`: architecture,
  American English standard, source registry, evaluation, contextual GEC,
  licensing, and a compact pre-build planning gate. Covers the rule provenance
  schema, Finding contract, Correction/Suggestion/Hidden classes, Writing
  Context contract, and evaluation taxonomy.
- Validation: `tsc --noEmit` and `vite build` pass; CSS lint passes; the
  existing AXIOM/terminology/corpus behavior is untouched (CSS-only UI change).
- Environment note: global git `core.autocrlf=true` yields CRLF working-tree
  files, so `biome check`'s formatter reports line-ending differences on every
  file (including untouched sources); this is a pre-existing environment
  artifact, not a code regression. Live rendered/responsive QA of the Writing
  Context fix at the full matrix is a pending follow-up (no browser harness in
  this environment).
- No production grammar, Harper configuration, dependency, Tauri authority,
  CSP, model asset, or release-package change. Live Dictation 2.0 remains
  deferred. REDLINE remains single-user.

## 2026-09-17 — 0.2.0 Humanizer release candidate verified

- Aligned package, Rust, Tauri, lockfile, visible UI, model-package copy, and
  release documentation at `0.2.0`; preserved `v0.1.0` unchanged.
- Passed rendered checks at 720×480, 800×540, 800×1200, 960×540, 960×1000,
  1024×720, 1366×768, 1440×900, and 1920×1080 with contained internal scroll,
  focus restoration, all themes, no application overflow, no console errors,
  and no external requests.
- Passed isolated native WebView2/Qwen smoke for Natural, Professional, and
  Academic previews, source-untouched Cancel, explicit Accept, one-step
  undo/redo, touched-source refusal, settings/document reload persistence, and
  independent Writing Context.
- Restored the exact accepted Transform v1 prompt payload after its new
  redundant mode field changed the deterministic stream and exposed a
  protected-version mutation. Added a regression assertion and reran the full
  40-case corpus with zero protected-token or injection failures.
- Passed the 24-case Humanizer corpus again and the unchanged 26-case production
  dictation corpus at WER 0.215 with safe silence/noise/no-speech behavior.
- Passed the 290-case AXIOM/grammar gates at 94/94 with zero unexplained false
  positives/misses and the 377-record terminology tests/benchmark.
- The production audit found GHSA-j95f-988m-3j2f in Tiptap 3.30.0. Updated only
  the existing approved Tiptap set and its two menu transitive packages to exact
  3.30.5. Peer checks and the production pnpm audit are now clean; notices were
  regenerated and the full editor/rendered regression passed afterward.
- Verified one bounded new Tauri command, unchanged CSP/Permissions Policy, no
  new dependency or network authority, Rust fmt/Clippy, production frontend,
  and a successful 0.2.0 NSIS preflight build.
- Ponytail review retained the two small editor-neutral workflow types and the
  singleton settings row because removing them would weaken required safety or
  conflate Transform with My Voice. No speculative profile/trait system exists.
- Exact-tag artifact builds, hashes, install smoke, private Gitea publication,
  and download readback remain. Live Dictation 2.0 remains deferred.

## 2026-09-16 — single-owner My Voice implementation validated

- Created `codex/redline-1.0-humanizer` from exact accepted baseline
  `d6243a71fd53f91e1954c139104bd3a20c474c08`; multi-user Profile experiments
  remain separate research history and were not merged.
- Confirmed the product model is one implicit local owner with no Guest,
  accounts, named profiles, switching UX, or profile-owned documents.
- Renamed the user-facing AXIOM selector to Writing Context while preserving its
  General, Professional, and Academic behavior and internal persistence.
- Added My Voice with exactly Natural, Professional, and Academic lanes using
  the existing local llama.cpp/Qwen service, preview, cancellation, mapped
  target, stale-source, invariant, formatting, undo, autosave, and AXIOM paths.
- Added one bounded SQLite singleton for enabled state, default lane, and voice
  specification version; no user IDs, new dependency, network authority, or CSP
  expansion was introduced.
- Added exact built-in/personal terminology preservation, high-confidence
  instruction-like source refusal, and an evidence-backed Academic grandiosity
  refusal. Every refusal leaves the document unchanged.
- Verified the 24-case CPU corpus: 20 usable local suggestions, three prompt
  injection inputs safely refused, one repeatedly grandiose Academic result
  safely refused, and zero deterministic/protected-term mutations. Cold load
  was about 2.3 seconds and warm cases about 2.1–2.8 seconds at 22–29 tokens/s.
- `pnpm check` passed TypeScript, Biome, foundation, editor, production
  dictation, Transform, Humanizer, AXIOM, 377-record terminology, grammar-corpus,
  persistence, and 16 native tests. Four heavyweight benchmarks remained
  explicitly ignored by that fast suite.
- Rendered/native QA, complete release gates, packaging, and private release are
  the remaining active work. Live Dictation 2.0 remains deferred.

## 2026-09-15 — REDLINE 1.0 refactor and terminology production pass

- Created `codex/redline-1.0-refactor-terminology` from foundation checkpoint
  `fe519ac9d70761e8c40fade1459743ad88a65ed5` without changing main or tags.
- Extracted editor construction, Transform workflow coordination, and Tauri
  startup/command registration without changing product behavior. The verified
  structural checkpoint is `739b2f739357c20b0b467c8dffe097a7258afaca`.
- Replaced the 26-record terminology seed with a dependency-free offline
  generator, reviewed source manifest, and 377-record runtime snapshot: 203
  high-confidence, 158 multiword-high-confidence, and 16 context-required.
- Added deterministic snapshot/source hashing, collision rejection, required
  coverage checks, all-record canonical/lowercase checks, paired ambiguity
  controls, protected-span tests, longest-match tests, and bounded performance
  checks to `pnpm check`.
- Expanded the AXIOM fast corpus from 265 to 290 cases. The current gate is
  94/94 required findings, zero unexplained false positives or misses, zero
  mapping failures, and zero protected-span failures; 22 known misses and nine
  known limitations remain documented.
- Suppressed provider spelling/orthography duplicates only when they overlap a
  canonical terminology issue; other grammar overlaps remain intact.
- Added no package, runtime networking, Tauri authority, CSP change, database
  change, terminology UI, User Profile, Humanizer, or Dictation production
  change.
- Dictation 2.0 remains **PAUSED / CONDITIONAL / AWAITING LAPTOP LIVE-MIC
  GATE**. Its probe evidence and outstanding 20-cycle live gate are unchanged.

## 2026-09-15  REDLINE 1.0 foundation evaluated

- Created `codex/redline-1.0-foundation` from verified 0.1.1 candidate
  `6b0a55e149d83ad86c8104d32f83d60cc671baeb`; main and `v0.1.0` remained
  unchanged, and no `v0.1.1` release existed.
- Preserved production dictation and added a development-only Rust comparison
  harness using the existing 26 WAV fixtures.
- Evaluated whisper-rs 0.16.0 cumulative two-second decoding: 0.221 WER, 6.502 s
  median estimated first visible text, 2.72 corpus RTF, zero no-speech
  hallucinations, and 348.9 MiB representative peak working set.
- Its 36.975-second long-form probe took 145.493 seconds (3.94 RTF) despite
  improving to 0.095 WER, making longer cumulative-window runs impractical.
- Evaluated sherpa-onnx 1.13.8 with the Apache-2.0 English streaming Zipformer
  20M int8 model: 0.360 WER, 1.147 s median first partial, 0.032 corpus RTF, zero
  no-speech hallucinations, and 97.1 MiB representative peak working set.
- Recorded conservative median start-to-final proxies of 18.274 seconds for
  cumulative Whisper and 4.829 seconds for sherpa; true endpoint-to-editor
  commit latency remains a required hybrid follow-up measurement.
- Verified sherpa long sessions at 36.975, 147.900, and 345.100 seconds stayed
  near 0.03-0.04 RTF. Accuracy remained weaker at approximately 0.40-0.41 WER.
- Found the official sherpa static Windows archive incompatible with REDLINE's
  Whisper CRT linkage (`LNK2038`/`LNK1169`); official shared mode built and
  ran both wrappers in one process.
- Added and passed an isolated live-transcript state prototype covering
  partial/final separation, duplicate prevention, user-edit ownership,
  pause/resume, cancel, microphone loss, and document isolation.
- Replaced the two-item CanonicalTerm array with a local 26-record terminology
  snapshot and dependency-free matcher. Added high-confidence, multiword,
  ambiguous-word, URL, filename, identifier, and protected-span controls.
- Measured median terminology index startup from 0.0529 ms at 100 records to 15.6558 ms at
  50,000; median short-text lookup remained below 0.01 ms. Chose a reviewed
  initial target of at most 10,000 aliases.
- Confirmed Wikidata structured data is CC0 and documented a dated, offline,
  line-streamed, curated snapshot pipeline. No full dump or runtime request was
  added.
- Recommended one bounded hybrid Dictation follow-up rather than replacing the
  current engine: sherpa partials and endpointing, Whisper finalization before
  one user-owned editor insertion.
- Preserved the regression floor: probe tests/clippy, live-state self-check,
  terminology benchmark, `pnpm check`, 265-case AXIOM benchmark, grammar gate,
  production Rust fmt/clippy, production build, diff check, and redacted
  Gitleaks scan all passed. Rendered/native UI QA was not run because production
  UI, dictation, capabilities, and commands did not change.

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

## 2026-09-11 — 0.1.1D Windows responsive caveat verified

- Reproduced the fixed-width defect at 960x1000 half-screen, 800x1200 portrait, and the 911x512 logical viewport representative of a 1366x768 laptop at 150% scaling: the 1024-pixel root/window floor clipped navigation and top-right controls.
- Lowered the justified Tauri and CSS minimum to 720x480, let the existing three-column shell contract, tightened narrow/short spacing, and removed internal horizontal pane scrolling. No component, navigation, or visual redesign was introduced.
- Passed deterministic rendered checks at 1366x768, 1093x614 at 125%, 911x512 at 150%, 1440x900, 1920x1080, 960x1000, 960x540, 720x720, 1200x560, 800x1200, and 720x480. Essential controls and the dictionary dialog remained reachable with no page overflow or console errors.
- Ran the Tauri/WebView2 application under a fresh `com.tyree.redline.qa20260911` identifier so no user document was touched. Typed and saved a benchmark-proven grammar case, received one AXIOM issue, preserved text across every resize plus maximize/restore, cycled Dark/Light/System, closed and reopened the application, and reloaded the saved QA document.
- Verified native movement on the connected 3440x1440 secondary and 1080x1920 portrait displays. All three connected displays report 100% effective DPI; 125% and 150% were deterministic logical-viewport/device-scale simulations rather than physical Windows setting changes.
- Observed zero console errors and zero external requests; local `ipc.localhost` traffic remained inside the bounded Tauri command path.
- Recorded laptop, desktop, portrait, snapping, resizing, multi-monitor, and common-DPI coverage as a reusable Forge product requirement for a separately approved Forge checklist update.

## 2026-09-15 — Dictation 2.0 hybrid probe measured; live laptop gate pending

**STATUS: CONDITIONAL / AWAITING LAPTOP LIVE-MIC GATE**

- Added a probe-only hybrid path: sherpa-onnx 1.13.8 supplies ephemeral partials and endpoints; whisper-rs 0.16.0 finalizes each bounded segment once.
- Selected the Balanced endpoint profile after Responsive prematurely split a paragraph and Patient added about 600 ms of silence without an accuracy gain.
- Final 26-case result: 1.135 s median first visible partial; 4.863 s median, 5.562 s p95, and 6.439 s worst endpoint-to-final latency; sherpa 0.360 WER versus Whisper/hybrid 0.221 WER; zero no-speech commits.
- Restored punctuation from zero sherpa marks to 46 Whisper/hybrid marks against 40 references. Recorded REDLINE and AXIOM casing misses without adding terminology replacement.
- Measured 239.1 MiB ready and 435.1 MiB peak working set with both models. Lazy Whisper saved about 147 MiB before the first endpoint but added 415 ms and did not reduce peak memory.
- Completed two-, five-, and ten-minute replay tests. No duplicate/lost segments or retained-memory growth occurred, but the ten-minute run drifted to 8.699 s p95 / 11.249 s worst and made the desktop sluggish.
- A 20-phrase rapid test queued five segments, with 1.268 s maximum queue delay and 7.667 s p95 endpoint-to-final latency. Duplicate commits remained zero.
- Replaced the abstract state-only check with an actual Tiptap/ProseMirror mapping probe covering user-edit ownership, mapped targets, touched-range refusal, wrong-document refusal, cursor independence, pause/resume, cancel, failure, and one-step undo/redo.
- Added a bounded WebView2 live-capture probe that passes PCM only through local IPC/stdin, closes tracks on normal and setup-failure paths, and never persists audio. It awaits the owner-run microphone/laptop test.
- Kept production REDLINE unchanged. Mapping and deterministic regressions are clean. Hybrid WER is 0.221, median first partial is 1.135 seconds, and median endpoint-to-final is 4.863 seconds.
- The real laptop microphone gate and 20-cycle live stability gate are **NOT YET RUN**. This is an experimental checkpoint, not a passed Dictation 2.0 result; do not begin production integration until those gates and the latency/backlog blockers are reviewed.

## 2026-09-17 — 0.2.0 release artifacts built; publication authorization pending

- Fast-forwarded local `main` to the verified release commit
  `b8ba8999ce8b6777a6adab743c95fa70e65d7c72` and created annotated tag
  `v0.2.0` at that exact commit. Protected `v0.1.0` remains unchanged.
- Passed the exact release-commit Gitleaks scan and built both NSIS variants plus
  the offline Transform/My Voice model package from the tagged source.
- Recorded SHA-256 identities: optional-model installer
  `78EF5FC5ACEEE8CF295F5C4A5FC75BE5DB14FC111AABC2478DA358E898CE0F1F`,
  bundled-model installer
  `94624A9FCCE781849BCD6D1853B1CB59CD5B60DC170373CD7E2CD2ECA8B85E5C`,
  and offline model package
  `7290A7F209226001E50ACDAF52F3DC1E9CF766632BDAA4B954F6951F03017406`.
- Both NSIS archives passed non-installing integrity checks. The lightweight
  package excludes Qwen; the all-in-one package and offline ZIP contain the
  exact pinned 1,117,320,736-byte Qwen model. Qwen and Whisper source resources
  match their runtime-pinned hashes.
- Did not launch the production-identifier artifact because this workstation
  contains real REDLINE app data. The same source already passed isolated
  native launch/reopen QA, and the exact artifacts passed archive/resource
  checks.
- Private Gitea push/release/upload was blocked by the execution environment as
  an external write. Do not retry until the owner gives fresh explicit
  authorization after being informed. No force-push, retag, release mutation,
  or artifact upload occurred.
- Live Dictation 2.0 remains deferred; the laptop live-microphone and 20-cycle
  stability gates remain outstanding.
