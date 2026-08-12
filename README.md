# REDLINE

REDLINE is a local-first desktop writing assistant. This repository currently contains only the 0.0.1 desktop foundation; proofreading, AXIOM, editing, documents, persistence, voice, and synchronization are deliberately deferred.

## Commands

- `pnpm dev` — Vite frontend development
- `pnpm tauri dev` — Windows desktop development
- `pnpm check` — type, lint, format, and foundation checks
- `pnpm build` — production frontend build
- `pnpm tauri build --no-bundle` — production desktop executable

Architecture and security decisions live in [`docs/0.0.1-foundation.md`](docs/0.0.1-foundation.md).
