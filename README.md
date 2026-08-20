# REDLINE

REDLINE is a local-first Windows writing assistant with rich-text editing, SQLite documents, AXIOM proofreading, local dictation, and preview-first local Transform rewrites.

The app runs offline after installation. The default installer includes REDLINE and the local dictation model. Transform is an optional offline package because its model is about 1.09 GB. See [`docs/0.1.0-release.md`](docs/0.1.0-release.md) for installation, privacy, model setup, upgrade, and uninstall details.

## Commands

- `pnpm dev` — Vite frontend development
- `pnpm tauri dev` — Windows desktop development
- `pnpm check` — type, lint, format, foundation, editor-schema, and count checks
- `pnpm benchmark:axiom` — run the 183-case proofreading corpus
- `pnpm benchmark:dictation` — run the 26-case speech corpus
- `pnpm benchmark:transform` — run the 40-case local Transform corpus
- `pnpm package:transform-model` — build the optional offline Transform package
- `pnpm notices` — regenerate production dependency and model notices
- `pnpm build` — production frontend build
- `pnpm tauri build` — production NSIS installer

Architecture notes live in [`docs/0.0.1-foundation.md`](docs/0.0.1-foundation.md), [`docs/0.0.8-dictation.md`](docs/0.0.8-dictation.md), and [`docs/0.0.9-transform.md`](docs/0.0.9-transform.md).
