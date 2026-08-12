# REDLINE

REDLINE is a local-first desktop writing assistant. Version 0.0.3 adds local SQLite documents, autosave, recent documents, Trash restore, and bounded recovery points to the rich-text editor. Proofreading, AXIOM, voice, and synchronization remain deliberately deferred.

## Commands

- `pnpm dev` — Vite frontend development
- `pnpm tauri dev` — Windows desktop development
- `pnpm check` — type, lint, format, foundation, editor-schema, and count checks
- `pnpm build` — production frontend build
- `pnpm tauri build --no-bundle` — production desktop executable

Foundation architecture and security decisions live in [`docs/0.0.1-foundation.md`](docs/0.0.1-foundation.md).
