# REDLINE engineering worklog

Append entries; do not rewrite earlier evidence.

## 2026-08-21 — 0.1.1 daily-use pass started

- Verified local `main` and `origin/main` at `bd52aa3a4f1c796e91ac88dde10c1352ef55e7ea` after fetching Gitea.
- Verified `v0.1.0` still resolves to `b775095666b45ce283d02e5875f7516bb936f83b`.
- Preserved `probes/transform-engine/` as the only approved untracked path.
- Created `codex/redline-0.1.1-daily-use` from the verified baseline.
- Captured the pinned Harper 2.7.0 default configuration: nine rules are disabled by default; none detects the observed malformed `where we are classes` syntax class.
- Re-ran the 183-case AXIOM baseline: 47/47 expected findings, zero unexplained false positives or misses, eight documented known false positives, zero protection or mapping failures.
- Chose benchmark-visible known misses and paired controls over a narrow regex or broad rule enablement.

## 2026-08-21 — bounded implementation verified

- Aligned package, Tauri, Rust, lockfile, and visible app versions at `0.1.1` on the working branch.
- Renamed the persistent spelling action to **Always allow word** and clarified the management dialog without changing storage or suppression scope.
- Expanded the AXIOM corpus from 183 to 193 cases: four documented malformed-syntax misses and six paired grammatical controls.
- Final AXIOM result: 47/47 required findings, zero unexplained false positives or misses, four documented known misses, eight existing known false positives, zero mapping or protected-span failures.
- `pnpm check`: passed TypeScript, Biome, foundation, editor, dictation mapping, Transform safety, AXIOM, and 15 native tests; three release benchmarks remained intentionally ignored.
- Rust formatting and Clippy with warnings denied passed. Production Vite build passed.
- Rendered QA passed at 1024x720, 1366x768, 1440x900, and 1920x1080 with no horizontal overflow or console errors; Dark, Light, and System remained functional.
- Verified no capability, command, permission, CSP, dependency, or external-request expansion. Gitleaks 8.30.1 scanned 11 commits with no findings.
- Ponytail removed one redundant benchmark counter; the full regression and 193-case benchmark passed again afterward.
