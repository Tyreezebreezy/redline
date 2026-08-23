# REDLINE current work

## 0.1.1 daily-use improvement pass

- Branch: `codex/redline-0.1.1-daily-use`
- Baseline: `bd52aa3a4f1c796e91ac88dde10c1352ef55e7ea`
- Release tag protected: `v0.1.0` -> `b775095666b45ce283d02e5875f7516bb936f83b`
- Accepted implementation: `f61f44db201c57b16bd36f5731f798e0fa9acb05`
- Status: 0.1.1A accepted; verified branch available on origin for sequential Claude Code or Codex handoff

### In scope

- Make known AXIOM grammar misses visible in benchmark reporting without weakening the zero-unexplained-miss gate.
- Keep paired clean controls beside every new malformed-syntax fixture.
- Clarify that the existing persistent personal dictionary is the global **Always allow word** control.
- Record evidence-backed decisions for Casual context, local feedback, live dictation, Tone, and Voice.
- Add no dependency, native command, database migration, network access, or CSP expansion.

### Explicitly deferred

- A heuristic for the phrase-shaped `where we are classes` example. The pinned Harper rules do not detect the class, and a REDLINE regex would not reliably distinguish malformed word order from punctuation or clause boundaries.
- Always Allow Phrase and persistent rule exceptions until real multiword false-positive samples define a safe scope.
- Casual profile until it differs usefully from General under paired fixtures.
- Local wrong-suggestion storage until the review/delete UX and privacy-minimal evidence shape are approved.
- Production streaming dictation and Tone/Voice features.

### Handoff

Continue from real observations in `REAL_WORLD_FINDINGS.md`. For AXIOM gaps, classify malformed grammar, test Harper first, and require paired positive and negative fixtures before considering a narrow deterministic rule. Keep collecting real vocabulary cases before broadening personal allowances. The `where we are classes` example is representative evidence, not a phrase to hardcode.

The accepted branch is available for sequential Claude Code or Codex work. Do not merge, tag, release, build installers, or begin Tone, Voice, User Profiles, or a production dictation rewrite without owner approval.
