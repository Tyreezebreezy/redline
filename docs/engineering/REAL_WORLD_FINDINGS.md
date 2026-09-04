# REDLINE real-world findings

These are user-observed product findings, not automatic commitments. Do not invent missing text. If a sentence is remembered only approximately, record `Needs Exact Example` and use status `Needs Example`.

## Finding register

| ID | Category | Status | Finding and disposition |
| --- | --- | --- | --- |
| RW-001 | Dictation | Deferred | Record-then-insert remains supported; visible local partial transcription is future research. |
| RW-002 | Malformed syntax | Benchmark Added | Harper 2.7.0 misses the class exemplified by `where we are classes`; no phrase-specific heuristic. |
| RW-003 | Personal vocabulary | Deferred | **Always allow word** covers eligible single terms; phrase and rule controls await real samples. |
| RW-004 | Personalization | Deferred | Ignore Once and global word allowance exist; remaining scopes need evidence and explicit design. |
| RW-005 | Tone | Deferred | Tone remains separate from grammar and Transform; no Tone feature or model is shipped. |
| RW-006 | Punctuation | Needs Example | Synthetic coverage exists, but the original daily-use sentence is unavailable. |
| RW-007 | Word form | Needs Example | SpellCheck and direct pronoun agreement are covered; the original miss is unavailable. |
| RW-008 | Contextual word choice | Needs Example | Harper covers narrow contexts; the original daily-use sentence is unavailable. |
| RW-009 | Canonical terminology | Fixed | `CanonicalTerm` covers `Facebook Marketplace` and `LinkedIn Learning` with paired controls. |
| RW-010 | Subject-verb agreement | Needs Example | Harper misses tested noun and compound-subject cases; the original daily-use sentence is unavailable. |
| RW-011 | Malformed syntax | Needs Example | Keep ambiguous dictated text out of rules until the intended correction is known. |
| RW-012 | Word Tools | Deferred | Synonyms and vocabulary alternatives remain advisory and must not create correctness underlines. |

## New finding template

- **ID:** RW-###
- **Date:** YYYY-MM-DD
- **Category:**
- **Exact or redacted original sentence:**
- **Expected behavior:**
- **Actual REDLINE behavior:**
- **Proposed correction, if known:**
- **Confidence:** High / Medium / Low
- **Reproducible:** Yes / No / Unknown
- **Status:** New / Needs Example / Investigating / Benchmark Added / Fixed / Deferred
- **Rule/class candidate:**
- **False-positive concerns:**
- **Notes:** Include the writing profile, REDLINE version, reproduction frequency, and whether the redacted text may enter the local benchmark.

## Grammar rule promotion policy

A real-world report does not immediately become a rule.

Real-world miss → reproduce → identify grammatical class → create should-warn fixtures → create should-not-warn controls → test Harper/current AXIOM → evaluate deterministic fix → benchmark → promote only if precision remains acceptable.

The release gate remains **zero unexplained false positives**. Never add a phrase-specific regex merely to fix one user sentence.

## Word-choice boundary

- Objective grammar mistakes belong to AXIOM.
- Stylistic vocabulary improvement belongs to future Word Tools.
- Synonyms are advisory only.
- Never underline valid vocabulary merely because another word may sound better.

## Canonical terminology

`CanonicalTerm` may later support established names such as `ICARUS`, `REDLINE`, `The Forge`, and user- or project-specific preferred capitalization. Do not add them automatically: each term needs confirmed canonical ownership and safe paired controls. This pass adds no terminology-management UI.
