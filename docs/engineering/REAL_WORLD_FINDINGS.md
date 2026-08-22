# REDLINE real-world findings

These are user-observed product findings, not automatic commitments. Promote one only after a bounded design, paired evidence, and the normal release gates.

| ID | Finding | Current disposition |
| --- | --- | --- |
| RW-001 | Dictation records first and inserts after transcription. The desired future experience is visible local partial transcription while speaking. | Research only; current production path remains supported. |
| RW-002 | AXIOM misses malformed syntax in the class exemplified by `where we are classes`. | Reproduced with Harper 2.7.0. Tracked as a known benchmark miss; no phrase-specific heuristic. |
| RW-003 | Writers need control over names, proper nouns, slang, technical terms, and casual phrases. | Existing persistent dictionary covers eligible single terms. UI now names this **Always allow word**. Phrase and rule controls are deferred pending real samples. |
| RW-004 | Future personalization should consider Ignore Once, Always Allow Word/Phrase, persistent rule exceptions, and later profiles. | Ignore Once and global word allowance exist. The remaining scopes require evidence and explicit product design. |
| RW-005 | Tone Analysis should be separate from grammar findings and Transform rewrites. | Architecture boundary recorded; no Tone feature or model shipped. |

## Intake template

- Exact original text and expected behavior
- Writing profile and document context
- REDLINE version
- Whether the issue is a miss, false positive, unsafe correction, dictation error, or UX friction
- Reproduction frequency
- Whether the text may be retained in the local benchmark; redact private content first
