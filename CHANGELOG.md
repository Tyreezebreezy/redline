# Changelog

## 0.5.0 — 2026-09-19

### Added

- Word Tools: on-demand lexical lookup for a selected word, showing senses
  grouped by part of speech with definitions, synonyms, antonyms, and related
  terms from the Open English WordNet 2025 Edition (CC BY 4.0). Choosing an
  alternative replaces the selected word with one-step undo.
- Integrated the Open English WordNet 2025 Edition as a lazy-loaded compact
  snapshot (`src/wordTools/lexicon.v1.json`, ~18.9 MB) produced by a
  deterministic, versioned, offline generator (`pnpm generate:lexicon`). The
  lexicon is never loaded in the typing/keystroke path.
- Added Open English WordNet attribution to the bundled third-party notices.

### Fixed

- Corrected the version-consistency check in the foundation gate, which had
  been pinned to an obsolete version string.

## 0.4.0 — 2026-09-19

### Changed

- Added structural subject-verb agreement checks to AXIOM: head-noun
  agreement across intervening phrases, simple subject/verb number, each /
  every / everyone / one agreement, and coordinated proper-name subjects.
  These recover twelve previously documented known misses with zero new false
  positives and remain subject to protected-span, personal-dictionary, and
  canonical-terminology authority. Collective nouns and neither/either
  constructions remain conservative.
- Expanded the AXIOM evaluation corpus to 519 cases with 14 additional
  subject-verb agreement negative controls (quantifiers, collectives, mass
  nouns, and singular compound nouns).

### Deferred

- Verb-form, tense, determiner, preposition, missing/extra-word, and
  punctuation corrections require lexical or clause-level evidence and remain
  evidence-gated. Clarity, Tone, Word Tools, and streaming Dictation 2.0
  remain deferred.

## 0.3.0 — 2026-09-19

### Changed

- Added high-confidence deterministic contextual word-choice and contraction
  checks to AXIOM: accept/except, loose/lose, its/it's, your/you're, and
  cite/site. These recover seven previously documented known misses with zero
  new false positives and remain subject to protected-span and canonical
  terminology authority.
- Fixed the Writing Context selector so General, Professional, and Academic
  display fully at supported window sizes.
- Expanded the AXIOM evaluation corpus from 290 to 505 cases with four formal
  suites (correctness, negative controls, register, voice preservation) and
  per-category precision/recall/F0.5 reporting.

### Deferred

- A local contextual grammatical-error-correction model (Tier 2) remains
  research-only; current evidence does not support shipping one. Clarity,
  Tone, Writing Goals, Word Tools, and streaming Dictation 2.0 remain
  evidence-gated.

## 0.2.0 — 2026-09-17

### Changed

- Clarified REDLINE as a single-owner local app and renamed the user-facing
  AXIOM selector from Profile to Writing Context.
- Added preview-first local My Voice rewrites with Natural, Professional, and
  Academic lanes on the existing verified Transform runtime.
- Added single-owner My Voice enable/default-lane settings without accounts,
  Guests, profile switching, or user-scoped data.
- Protected canonical/personal terminology during My Voice acceptance and
  retained existing stale-range, invariant, undo, autosave, and AXIOM safety.
- Updated the existing Tiptap editor packages together to the security-patched
  3.30.5 release without changing the approved schema or feature scope.
- Clarified the persistent personal-dictionary action as **Always allow word**.
- Added shared engineering handoff and real-world finding records.
- Extended AXIOM benchmark reporting to separate documented grammar-engine misses from unexplained regressions.

### Deferred

- Always Allow Phrase, persistent rule exceptions, a separate Casual lane,
  local wrong-suggestion storage, streaming Dictation 2.0, Tone, Clarity, and
  Word Tools remain evidence-gated.

## 0.1.0

- First hardened private release: editor, local documents, AXIOM proofreading, profiles and dictionary, local dictation, and optional offline Transform.
