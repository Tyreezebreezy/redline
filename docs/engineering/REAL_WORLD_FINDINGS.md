# REDLINE real-world findings

These are user-observed product findings, not automatic commitments. Promote one only after a bounded design, paired evidence, and the normal release gates.

| ID | Finding | Current disposition |
| --- | --- | --- |
| RW-001 | Dictation records first and inserts after transcription. The desired future experience is visible local partial transcription while speaking. | Research only; current production path remains supported. |
| RW-002 | AXIOM misses malformed syntax in the class exemplified by `where we are classes`. | Reproduced with Harper 2.7.0. Tracked as a known benchmark miss; no phrase-specific heuristic. |
| RW-003 | Writers need control over names, proper nouns, slang, technical terms, and casual phrases. | Existing persistent dictionary covers eligible single terms. UI now names this **Always allow word**. Phrase and rule controls are deferred pending real samples. |
| RW-004 | Future personalization should consider Ignore Once, Always Allow Word/Phrase, persistent rule exceptions, and later profiles. | Ignore Once and global word allowance exist. The remaining scopes require evidence and explicit product design. |
| RW-005 | Tone Analysis should be separate from grammar findings and Transform rewrites. | Architecture boundary recorded; no Tone feature or model shipped. |
| RW-006 | Missing comma or punctuation errors are sometimes not detected. | **Needs real example.** Synthetic coverage confirms Harper handles clear discourse markers and comma spacing but misses some introductory-clause and duplicate-comma cases. |
| RW-007 | Missing spelling or grammatical word-form errors are sometimes not detected. | **Needs real example.** SpellCheck and direct pronoun agreement are covered; broader morphology remains benchmark-visible. |
| RW-008 | Correctly spelled but contextually incorrect words can escape ordinary spellcheck. | **Needs real example.** Harper covers several narrow confusion contexts; ambiguous gaps remain unflagged rather than guessed. |
| RW-009 | Multiword product and service names need canonical capitalization. | Added the bounded AXIOM `CanonicalTerm` rule for `Facebook Marketplace` and `LinkedIn Learning`, with paired ordinary-word and technical controls. |
| RW-010 | Subject-verb agreement coverage is incomplete. | **Needs real example.** Harper catches tested pronoun agreement but misses noun, intervening-noun, and compound-subject cases. |
| RW-011 | Broader malformed sentences can pass without a finding. | **Needs real example.** Keep ambiguous dictated text out of deterministic rules until the intended correction is known. |
| RW-012 | Writers want synonyms and broader word-choice help. | Future advisory Word Tools only; valid alternatives are not grammar errors and must not create correctness underlines. |

## Intake template

- Exact original text and expected behavior
- Writing profile and document context
- REDLINE version
- Whether the issue is a miss, false positive, unsafe correction, dictation error, or UX friction
- Reproduction frequency
- Whether the text may be retained in the local benchmark; redact private content first
