# Changelog

## 1.0.0 — 2026-09-19

### Added

- Applied the approved REDLINE 1.0 visual identity: Editorial Graphite + Warm
  Paper + restrained REDLINE Crimson, with a Windows-native typography stack
  and semantic accent families for corrections (crimson), Clarity (amber),
  Tone (cool blue), My Voice (violet-neutral), and success (muted green).
  Corrections read stronger than suggestions.
- Expanded Transform Studio with three additional explicit rewrite modes:
  Simplify, Expand, and Improve Flow, unified behind the existing local
  llama.cpp/Qwen runtime. Transform remains preview-first with stale-target
  safety and undo.

### Changed

- Preserved the 0.5.0-0.7.0 feature set (Word Tools, Clarity, Tone, Writing
  Goals, Personal Style Guide) with the AXIOM floor unchanged.

### Known limitations

- Live Dictation 2.0 (streaming partial transcription) remains the primary
  outstanding item; production dictation still uses the record → stop →
  local Whisper transcription → insert workflow with the established local
  fallback.
- Writing Context rendered QA remains a manual follow-up.
- The installer is unsigned/private-use and may trigger SmartScreen.

## 0.7.0 — 2026-09-19

### Added

- Personal Style Guide: add preferred terms and preferred capitalization that
  REDLINE enforces as suggestions (with one-click replacement) above the
  built-in terminology but below protected spans and quoted/code text.
- Writing Goals: a single-owner audience and purpose setting, stored locally.
- Tone: a deterministic, advisory tone summary (informal, tentative, confident,
  formal, direct, or neutral) with a stated confidence level; tone is never a
  grammar error and never a numeric score.

### Deferred

- Snippets remain optional future work. Transform Studio, My Voice maturation,
  and final 1.0 convergence wait for the updated AppForge baseline. Live
  Dictation 2.0 remains deferred.

## 0.6.0 — 2026-09-19

### Added

- Clarity suggestions: a deterministic, advisory Tier-4 analysis that flags
  wordy phrases (with one-click replacement), unusually long sentences, and
  repeated sentence openers. These are suggestions, never grammar errors, and
  remain separate from AXIOM corrections. Writing Context controls the
  sensitivity (General surfaces only wordy-phrase suggestions; Professional
  and Academic add sentence-level signals).

### Deferred

- Tone, Writing Goals, Personal Style Guide, and Snippets remain evidence-gated.

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
