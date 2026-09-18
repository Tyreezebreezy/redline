# AXIOM 2.0 — Pre-Build Planning Gate

Compact project definition. Kept short by design; the detailed contracts live in
the sibling documents.

## 1. Problem

REDLINE's correctness layer (AXIOM) is today a deterministic Harper + REDLINE
rule + terminology pipeline. It is precise but misses a class of objective
errors that only sentence context reveals: subject-verb agreement across
intervening phrases, verb tense/form, articles/determiners, prepositions,
contextual spelling, wrong-but-valid words, missing/extra words, word order,
and contextual punctuation. The goal is evidence that a **local** contextual
grammar layer can close that gap without introducing false positives, without
nagging, and without sacrificing privacy, speed, explainability, or the
author's voice.

## 2. Target device / platform

Windows desktop, ordinary consumer hardware (CPU, bounded RAM). Tauri 2 +
React + TypeScript + Vite + Tiptap/ProseMirror front end; Rust native layer;
SQLite. Fully local-first and offline-capable.

## 3. Run location

Local. Hot path stays on Harper + terminology + protected spans + light lexical
checks. Contextual analysis is debounced/background. No cloud, no telemetry,
no remote inference.

## 4. Scope

Research, prototyping, benchmarking, and hard decision gates only. Deliverables
are architecture contracts, an American English standard, a source/licensing
registry, lexical (ESDB/SCOWL) and semantic (Open English WordNet) prototypes,
an ERRANT-aligned evaluation harness and expanded corpus, a contextual-GEC
bakeoff, and an experimental resolver. Plus one bounded production UI bugfix
(Writing Context width).

## 5. Non-goals

No production contextual-GEC integration, no new model shipped in the
installer, no Harper replacement, no broad change to normal correction
behavior, no multi-user Profiles, no Dictation 2.0 resume, no Clarity/Tone
implementation, no Word Tools UI.

## 6. Visual impact

None for research tooling. The only product-visible change is the Writing
Context width fix, which must match existing typography, spacing, surfaces,
focus, and dark/light/system theme, with no layout redesign.

## 7. Technical constraints

Windows-first. Any candidate that only works conveniently on Linux is heavily
penalized. Favor small and predictable over large and marginally more
accurate unless evidence says otherwise. No new production dependencies during
research. Experimental language/model code lives under `probes/`, isolated
from production paths.

## 8. Privacy / licensing

Local-only runtime. Research downloads permitted only for explicit acquisition
of models/datasets/docs/licenses. Verify license, redistribution, modification,
attribution, and training restrictions before adding third-party data or
models. Do not commit restricted corpus text to Gitea. Do not harvest the
owner's private writing.

## 9. Validation plan

- `pnpm check`, `pnpm benchmark:axiom`, `pnpm evaluate:grammar -- --gate`,
  `cargo fmt --check`, `cargo clippy -- -D warnings`, `pnpm build` after any
  production change.
- Writing Context fix rendered/responsive QA at 720x480, 960x540, 960x1000,
  800x1200 portrait, half-screen, short windows, manual resize; `General`,
  `Professional`, `Academic` all fully visible; no horizontal overflow.
- Existing 290-case AXIOM floor and 377-record terminology floor must not
  regress.
- Research tooling validated with its own harness tests and manifest/generator
  checks.

## 10. Hard stop

STOP before production contextual-GEC integration unless the owner separately
and explicitly instructs it. Return evidence first. Axiom correctness remains
deterministic until a model proves it is materially better without
unacceptable cost.
