# REDLINE engineering guide

## Product boundary

REDLINE is a local-first Windows writing assistant. Preserve offline operation, bounded Tauri commands, the existing CSP and Permissions Policy, SQLite ownership in Rust, editor-neutral AXIOM issues, mapped ProseMirror issues, and precision over nagging.

Do not add cloud services, telemetry, broad filesystem/network/shell authority, large models, dependencies, or speculative abstraction without owner approval. Do not move or recreate `v0.1.0`.

## Current cycle

- Released baseline: `v0.1.0` at `b775095666b45ce283d02e5875f7516bb936f83b`.
- Working branch: `codex/redline-1.0-refactor-terminology`.
- Current plan and handoff: `docs/engineering/CURRENT_WORK.md`.
- Append-only activity log: `docs/engineering/WORKLOG.md`.
- User-observed evidence: `docs/engineering/REAL_WORLD_FINDINGS.md`.
- The owner-approved `probes/transform-engine/` directory remains untouched and outside commits.

## Change discipline

1. Read the current-work and findings documents before editing.
2. Reuse existing AXIOM, persistence, dictation, and Transform boundaries.
3. Every grammar-rule change needs paired positive and negative corpus fixtures and must keep unexplained false positives at zero.
4. Do not weaken validation, accessibility, stale-range protection, protected spans, model hashes, or release security gates.
5. Update the worklog after meaningful work and leave a concise handoff in current work.

## Verification

Run the smallest relevant check while iterating, then the full gate before a checkpoint:

```text
pnpm check
pnpm benchmark:axiom
pnpm evaluate:grammar -- --gate
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
pnpm build
```

Run the dictation or Transform release benchmark only when its implementation or shared command/editor path changes. Rendered UI changes also require keyboard, console, theme, and 1024x720, 1366x768, 1440x900, and 1920x1080 checks.
