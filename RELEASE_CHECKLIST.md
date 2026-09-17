# REDLINE 0.2.0 release checklist

Status values: **PASS**, **FAIL**, **NOT TESTED**, or **REQUIRES MANUAL VERIFICATION**.

## Automated release gates

- **PASS** — package, Rust, Tauri, lockfile, and visible versions are `0.2.0`.
- **PASS** — fast TypeScript, Biome, editor, persistence, dictation, Transform,
  Humanizer, AXIOM, grammar-harness, terminology, and native unit checks.
- **PASS** — 24-case Humanizer corpus: 20 usable local suggestions, three safe
  prompt-injection refusals, one safe Academic grandiosity refusal, and zero
  deterministic or terminology mutations.
- **PASS** — rendered checks at 720×480, 800×540, 800×1200, 960×540, 960×1000,
  1024×720, 1366×768, 1440×900, and 1920×1080 with no application overflow,
  panel escape, console error, or external request.
- **PASS** — isolated native WebView2 smoke for all three My Voice lanes,
  source-untouched Cancel, explicit Accept, one-step undo/redo, stale-source
  refusal, independent Writing Context, persistence, and zero external requests.
- **PASS** — 290-case AXIOM benchmark and grammar release gate: 94/94 required
  findings, zero unexplained false positives or misses, 22 documented known
  misses, nine documented limitations, and zero mapping/protection failures.
- **PASS** — 40-case Transform corpus: zero protected-token mutations or
  prompt-injection escapes. The exact accepted Transform v1 prompt shape is
  regression-locked separately from the Humanizer contract.
- **PASS** — 26-case production dictation corpus: WER 0.215; silence,
  background-noise, and no-speech controls produced no insertion.
- **PASS** — Rust formatting, Clippy with warnings denied, frontend production
  build, and Tauri/NSIS production preflight build.
- **PASS** — Tiptap packages patched together from 3.30.0 to exact 3.30.5 for
  GHSA-j95f-988m-3j2f; peer checks and production pnpm audit report no issues.
- **PASS** — Ponytail review found no removable abstraction without weakening
  single-owner storage, editor mapping, validation, accessibility, or safety.
- **PASS** — clean `b8ba8999ce8b6777a6adab743c95fa70e65d7c72`
  release-commit secret scan and exact-tag artifact builds.
- **PASS** — both NSIS archives pass 7-Zip integrity checks. The lightweight
  installer excludes Qwen, the bundled installer contains the pinned
  1,117,320,736-byte Qwen resource, and the offline package contains the same
  model plus its installation instructions.
- **PASS** — exact release artifact identities:
  - `REDLINE_0.2.0_optional-model-setup.exe` — 142,438,144 bytes — SHA-256
    `78EF5FC5ACEEE8CF295F5C4A5FC75BE5DB14FC111AABC2478DA358E898CE0F1F`
  - `REDLINE_0.2.0_bundled-model-setup.exe` — 1,237,141,723 bytes — SHA-256
    `94624A9FCCE781849BCD6D1853B1CB59CD5B60DC170373CD7E2CD2ECA8B85E5C`
  - `REDLINE_Transform_Model_0.2.0_offline.zip` — 1,092,943,883 bytes —
    SHA-256
    `7290A7F209226001E50ACDAF52F3DC1E9CF766632BDAA4B954F6951F03017406`
- **BLOCKED** — private Gitea push, release creation, attachment upload, and
  download/hash readback require a fresh explicit owner authorization after
  the environment blocked the external write.

## Manual boundaries

- **REQUIRES MANUAL VERIFICATION** — physical microphone allow/deny/recovery and
  live capture on the owner's actual target laptop hardware.
- **REQUIRES MANUAL VERIFICATION** — screen-reader behavior beyond the verified
  semantic names, live regions, keyboard flow, focus restoration, and visible
  focus states.
- **NOT TESTED** — an exact production-identifier installer launch/reopen was
  intentionally not run because this machine already contains real REDLINE
  application data. The same source passed isolated native launch/reopen QA;
  the exact installers passed non-installing archive and resource verification.

## Known limitations

- The SQLite database is not encrypted at rest, and local recovery history is
  not an off-device backup.
- The unsigned private-use release may trigger SmartScreen.
- The historical 0.0.9 installer predates downgrade protection; 0.1.0 and later
  installers retain the guard.
- Transform and My Voice require the optional offline Qwen model unless the
  bundled-model installer is used.
- Live Dictation 2.0 remains deferred.
