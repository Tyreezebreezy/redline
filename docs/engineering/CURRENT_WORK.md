# REDLINE current work

## 0.1.1 daily-use improvement pass

- Branch: `codex/redline-0.1.1-daily-use`
- Baseline: `bd52aa3a4f1c796e91ac88dde10c1352ef55e7ea`
- Release tag protected: `v0.1.0` -> `b775095666b45ce283d02e5875f7516bb936f83b`
- Accepted grammar baseline: `2bccc3cdade7f560fbc79ba228af1d5efc1ab31e`
- Research-harness baseline: `c942471e0951bcee4ca13cc4e027fb9f2b9ee8f4`
- Status: 0.1.1D external research evaluation and final Windows responsive QA complete on the working branch; no grammar behavior changed; not merged or released

### Active objective

Use daily REDLINE findings to choose a small, user-relevant subset of the external research signals for paired-fixture review. Do not add or enable a rule until an exact/reproducible finding establishes the grammatical class and the zero-unexplained-false-positive gate can be preserved.

Priority categories:

1. General noun/subject-verb agreement
2. Missing punctuation and commas
3. Context-sensitive wrong-word errors
4. Word-form errors
5. Broader malformed sentence syntax
6. Canonical capitalization/terminology misses

### Baseline and guardrails

- AXIOM corpus: 265 cases; 75/75 required findings; zero unexplained false positives or misses; 22 documented known misses; nine documented limitations; zero mapping or protected-span failures.
- `CanonicalTerm` is the only AXIOM rule added in 0.1.1B. Its first entries are `Facebook Marketplace` and `LinkedIn Learning`.
- A report must follow the promotion policy in `REAL_WORLD_FINDINGS.md`; never add a phrase-specific regex for one sentence.
- Objective grammar belongs to AXIOM. Stylistic alternatives and synonyms remain advisory future Word Tools.
- Do not add Tone, Voice, live dictation, User Profiles, terminology UI, dependencies, native authority, or release work in this loop.

### Development corpus harness

- `benchmarks/axiom-corpus.json` remains the authoritative fast suite; no duplicate 265-case dataset was created.
- `pnpm test:grammar-corpus` verifies manifest/schema rejection, JSONL and M2 parsing, multi-source duplicate handling, taxonomy mapping, and a real AXIOM integration case.
- `pnpm evaluate:grammar -- --gate` runs the normalized fast suite and reports per-case expected/actual rules, projected and editor spans, replacements, statuses, category coverage, sources, precision, and required detection rate.
- Optional large research inputs are local JSONL or M2 files. They are not part of every build and must pass the provenance/license manifest gate before ingestion.
- The first normalized fast-suite report preserved all 265 cases: 75/75 required findings, zero unexplained false positives or misses, 22 known misses, nine known limitations, and zero protected-span or mapping failures.
- No external corpus was copied. Harper is referenced first; LanguageTool is methodology-only; JFLEG, W&I+LOCNESS, and NUCLE remain restricted optional local research inputs.

### 0.1.1D external research evidence

- Harper `v2.7.0` was pinned at `dc1182cc2b33603748105df074d6bb47f0de3720` (Apache-2.0). Its 351 `.weir` rule files exposed 1,838 parseable tests; 11 duplicates yielded 1,827 unique research cases.
- Raw Harper matched 1,537/1,588 target edits. Final AXIOM matched 1,476/1,588 after its existing protection and filtering controls, suppressed 87 raw issues, and added no target findings in this source. No mapping or protected-span integrity failure occurred.
- RobustGEC was evaluated locally at `1c5787b3c6288a45f0d99b883a501c02b54812a1`. Repository code is MIT, but benchmark data rights remain mixed because the text derives from CoNLL-14, BEA-19, and TEM-8; no benchmark text or report is committed.
- The checked snapshot contains 4,996 complete six-variant groups / 29,976 variants: 1,312 CoNLL-14, 2,503 BEA-19, and 1,181 TEM-8 groups. It produced two context drops, 17 context false-positive signals, three rule drifts, zero replacement drifts, and zero incomplete groups.
- RobustGEC's tokenized punctuation makes `Spaces` dominate unmatched-issue totals. Those totals are exploratory signals, not REDLINE release precision/recall.
- Ranked Harper review leads are `SendAnEmailTo`, `IncludingButNotLimitedToPunctuation`, and `TheirToTheyre`; none is approved for product behavior. The two RobustGEC context drops are source IDs `bea19:251` and `bea19:1631`; source text remains local-only.
- Existing findings remain the authority. The closest cross-references are RW-006 (punctuation), RW-007 (word form), RW-008 (contextual wrong word), and RW-011 (broader malformed syntax), all of which still require exact user evidence before promotion.

### Final Windows responsive QA

- Reproduced clipping from the old 1024-pixel root/window minimum at a 960-pixel half-screen, 800-pixel portrait viewport, and 911x512 logical laptop viewport.
- Set 720x480 as the practical supported minimum and kept the existing sidebar, editor, and analysis regions visible through bounded CSS grid/spacing changes. Horizontal page and pane overflow is absent at the supported matrix; vertical pane scrolling remains available where content is dense.
- Passed rendered checks at laptop, desktop, large, half-screen, quarter-screen, narrow, short, portrait, and minimum sizes. The personal dictionary dialog remained contained.
- Passed an isolated native Tauri/WebView2 smoke: create/type/save, AXIOM detection, content preservation during resizing, maximize/restore, theme cycling, restart/reopen, and movement across this machine's 3440x1440 secondary and 1080x1920 portrait displays. No console errors or external requests occurred.
- Physical host displays report 100% effective DPI. Deterministic logical viewport/device-scale checks passed for representative 125% and 150% laptop conditions; physical Windows 125%/150% switching was not performed.
- Recorded responsive/resizable Windows QA as a future Forge golden-path requirement without changing The Forge repository.

### Handoff

Use the structured intake in `REAL_WORLD_FINDINGS.md`. Record exact or redacted sentences; if a recollection is approximate, write `Needs Exact Example`. First review the two measured context drops and the top three Harper candidates only at the class/fixture level, then wait for a matching real-world report before proposing a product rule. Promote only focused cases and paired controls into the fast suite; use the optional research suite to rank gaps rather than inflate the release corpus.

The accepted branch is available for sequential Claude Code or Codex work. Do not merge, tag, release, build installers, or begin Tone, Voice, User Profiles, or a production dictation rewrite without owner approval.
