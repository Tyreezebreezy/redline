# REDLINE 0.1.0 release checklist

Status values: **PASS**, **FAIL**, **NOT TESTED**, or **REQUIRES MANUAL VERIFICATION**.

## Automated release gates

- **PASS** — version is `0.1.0` in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
- **PASS** — `pnpm install --frozen-lockfile` with pinned pnpm 11.16.0.
- **PASS** — TypeScript, Biome, frontend production build, Rust formatting, Clippy with warnings denied, and Tauri release build.
- **PASS** — current-source NSIS package generated in an isolated temporary target (142,425,036 bytes), verified, then removed; published artifacts were not overwritten.
- **PASS** — foundation, editor, dictation mapping, Transform mapping/safety, AXIOM mapping, SQLite lifecycle, autosave, profile, dictionary, and migration tests.
- **PASS** — 183-case AXIOM corpus: 47/47 expected findings; zero unexplained false positives, misses, protected-span failures, or mapping failures.
- **PASS** — 26-case dictation corpus: WER 0.215; silence/no-speech produced no insertion.
- **PASS** — 40-case Transform corpus: all surviving presets completed with zero protected-token mutations or prompt-injection escapes.
- **PASS** — rendered desktop checks at 1024×720, 1366×768, 1440×900, and 1920×1080; no horizontal overflow or console/runtime errors.
- **PASS** — bounded Tauri command allowlist, production/development CSP, Permissions Policy, local model hashes, SQLite input bounds, ephemeral audio handling, and zero-network architecture reviewed.
- **PASS** — Git-history secret scan found no leaks. Current dependency scan found no pnpm advisories; its one Cargo advisory is an inactive Linux-only `glib` dependency and is absent from the Windows target graph.
- **PASS** — release artifacts match their published SHA-256 hashes:
  - `REDLINE_0.1.0_bundled-model-setup.exe`: `12E436CD928C40E36002D098CF490BE9213BF3B0ABFC023E676A48CD41216CD6`
  - `REDLINE_0.1.0_optional-model-setup.exe`: `1D9E45183BF1318392D8E5C0516DE5E9C53423C626B9E002B4679813F8EE811F`
  - `REDLINE_Transform_Model_0.1.0_offline.zip`: `73AE6DAD5729F69001A2CB1124C717D6E8FB515EF67DF80F11FA2B911BE60C5B`

## Manual smoke tests

- **REQUIRES MANUAL VERIFICATION** — clean Windows install, Start Menu launch, upgrade, uninstall choices, and unsigned SmartScreen presentation.
- **REQUIRES MANUAL VERIFICATION** — physical microphone permission allow/deny/recovery, repeated capture, cancellation, and idle microphone release.
- **REQUIRES MANUAL VERIFICATION** — final keyboard-only and screen-reader pass in the packaged WebView2 application.

## Release blockers

None identified.

## Known limitations

- The SQLite database is not encrypted at rest, and local recovery history is not an off-device backup.
- The unsigned private-use release may trigger SmartScreen.
- The historical 0.0.9 installer predates downgrade protection and can overwrite 0.1.0 if deliberately rerun. Installers produced for 0.1.0 and later retain downgrade protection.
- Transform requires the separately verified optional offline model unless the bundled-model installer is used.
