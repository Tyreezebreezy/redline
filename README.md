# REDLINE

REDLINE is a single-owner, local-first Windows writing assistant with rich-text
editing, SQLite documents, AXIOM proofreading, local dictation, preview-first
local Transform rewrites, and optional My Voice rewrites.

The app runs offline after installation. The default installer includes REDLINE and the local dictation model. Transform is an optional offline package because its model is about 1.09 GB. See [`docs/0.1.0-release.md`](docs/0.1.0-release.md) for installation, privacy, model setup, upgrade, and uninstall details.

## Platform and development prerequisites

- Windows 10 or 11, x64, with Microsoft Edge WebView2 Runtime
- Node.js 20.19+ or 22.12+ and Corepack-managed pnpm 11.16.0
- Stable Rust MSVC toolchain and the Visual Studio C++ build tools

Normal use needs no network connection. A microphone is optional and is accessed only after the user grants WebView2 permission. Transform remains disabled unless its verified offline model is installed.

## Commands

- `pnpm dev` — Vite frontend development
- `pnpm tauri dev` — Windows desktop development
- `pnpm check` — type, lint, format, foundation, editor-schema, and count checks
- `pnpm benchmark:axiom` — run the 290-case proofreading corpus
- `pnpm benchmark:dictation` — run the 26-case speech corpus
- `pnpm benchmark:transform` — run the 40-case local Transform corpus
- `pnpm benchmark:humanizer` — run the 24-case local My Voice corpus
- `pnpm package:transform-model` — build the optional offline Transform package
- `pnpm notices` — regenerate production dependency and model notices
- `pnpm build` — production frontend build
- `pnpm tauri build` — production NSIS installer

Architecture notes live in [`docs/0.0.1-foundation.md`](docs/0.0.1-foundation.md),
[`docs/0.0.8-dictation.md`](docs/0.0.8-dictation.md),
[`docs/0.0.9-transform.md`](docs/0.0.9-transform.md), and
[`docs/engineering/humanizer.md`](docs/engineering/humanizer.md).

The React/Tiptap renderer calls a bounded Tauri command surface. Rust owns SQLite persistence, local Whisper transcription, and local llama.cpp Transform inference. CSP, Permissions Policy, command capabilities, input bounds, and model hashes preserve the local/private-first boundary.

For release gates, artifact hashes, manual smoke tests, and known limitations, see [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md). Installation and microphone/model troubleshooting are in the 0.1.0 release notes linked above.
