# Changelog

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
