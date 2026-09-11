# REDLINE current work

## 0.1.1 daily-use improvement pass

- Branch: `codex/redline-0.1.1-daily-use`
- Baseline: `bd52aa3a4f1c796e91ac88dde10c1352ef55e7ea`
- Release tag protected: `v0.1.0` -> `b775095666b45ce283d02e5875f7516bb936f83b`
- Accepted grammar baseline: `2bccc3cdade7f560fbc79ba228af1d5efc1ab31e`
- Status: 0.1.1B accepted; 0.1.1C developer corpus/evaluation harness verified on the working branch; not merged or released

### Active objective

Collect and classify exact or safely redacted real-world grammar misses from daily REDLINE use, then evaluate them through the development corpus harness before adding rules.

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

### Handoff

Use the structured intake in `REAL_WORLD_FINDINGS.md`. Record exact or redacted sentences; if a recollection is approximate, write `Needs Exact Example`. Reproduce and classify reports before creating fixtures or changing grammar behavior. Promote only focused cases and paired controls into the fast suite; use the optional research suite to rank gaps rather than inflate the release corpus.

The accepted branch is available for sequential Claude Code or Codex work. Do not merge, tag, release, build installers, or begin Tone, Voice, User Profiles, or a production dictation rewrite without owner approval.
