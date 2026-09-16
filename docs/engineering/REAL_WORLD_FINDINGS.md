# REDLINE real-world findings

These are user-observed product findings, not automatic commitments. Do not invent missing text. If a sentence is remembered only approximately, record `Needs Exact Example` and use status `Needs Example`.

## Finding register

| ID | Category | Status | Finding and disposition |
| --- | --- | --- | --- |
| RW-001 | Dictation | Deferred | Record-then-insert remains supported; visible local partial transcription is future research. |
| RW-002 | Malformed syntax | Known Miss / Benchmark Added | Harper 2.7.0 misses the class exemplified by `where we are classes`; no phrase-specific heuristic. |
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
| RW-013 | Canonical terminology | Fixed / Benchmark Added | `CanonicalTerm` enforces `LinkedIn Learning` with paired controls. |
| RW-014 | Word form | Needs Exact Example | A remembered `propel` / `propelling` / distance-related mistake is approximate and cannot enter the corpus yet. |

## Backfilled evidence

Dates below say `Not recorded` when the original observation date is unavailable. That is intentional; the backfill date is 2026-09-10.

### RW-002 — malformed sentence class

- **Date:** Not recorded; backfilled 2026-09-10
- **Source:** Real User
- **Category / subcategory:** Broader malformed sentence syntax / word order
- **Exact or redacted original sentence:** `where we are classes`
- **Expected behavior:** Identify the malformed class only when a trustworthy correction can be established.
- **Actual REDLINE behavior:** No issue from Harper 2.7.0 or current AXIOM.
- **Expected correction:** Unknown; punctuation, a preposition, or different word order may have been intended.
- **Confidence:** High that the text is malformed; low about the intended correction.
- **Reproducible:** Yes
- **Benchmark status:** Known Miss / Benchmark Added
- **Rule/class candidate:** Broader sentence syntax or word order (`WO` / `OTHER`).
- **False-positive concerns:** High around legitimate relative clauses, questions, and clause boundaries.
- **Resolution / status:** Known Miss
- **Notes:** Represented by four known-miss fixtures and six controls. Never hardcode the phrase.

### RW-006 — missing punctuation or comma

- **Date:** Not recorded; backfilled 2026-09-10
- **Source:** Real User
- **Category / subcategory:** Punctuation / missing punctuation
- **Exact or redacted original sentence:** Needs Exact Example
- **Expected behavior:** Needs Exact Example
- **Actual REDLINE behavior:** Needs Exact Example
- **Expected correction:** Needs Exact Example
- **Confidence:** Low until reproduced.
- **Reproducible:** Unknown
- **Benchmark status:** Needs Exact Example
- **Rule/class candidate:** `PUNCT` or `SentenceBoundary`.
- **False-positive concerns:** Optional commas and style-dependent punctuation.
- **Resolution / status:** Needs Example
- **Notes:** Existing synthetic coverage is not a substitute for the user's sentence.

### RW-007 — word-form error

- **Date:** Not recorded; backfilled 2026-09-10
- **Source:** Real User
- **Category / subcategory:** Word form / morphology
- **Exact or redacted original sentence:** Needs Exact Example
- **Expected behavior:** Needs Exact Example
- **Actual REDLINE behavior:** Needs Exact Example
- **Expected correction:** Needs Exact Example
- **Confidence:** Low until reproduced.
- **Reproducible:** Unknown
- **Benchmark status:** Needs Exact Example
- **Rule/class candidate:** `MORPH` or `VERB:FORM`.
- **False-positive concerns:** Valid inflections and domain vocabulary.
- **Resolution / status:** Needs Example
- **Notes:** Do not infer the missing sentence from synthetic fixtures.

### RW-008 — contextual wrong valid word

- **Date:** Not recorded; backfilled 2026-09-10
- **Source:** Real User
- **Category / subcategory:** Context-sensitive wrong word / `ContextualWrongWord`
- **Exact or redacted original sentence:** Needs Exact Example
- **Expected behavior:** Needs Exact Example
- **Actual REDLINE behavior:** Needs Exact Example
- **Expected correction:** Needs Exact Example
- **Confidence:** Low until reproduced.
- **Reproducible:** Unknown
- **Benchmark status:** Needs Exact Example
- **Rule/class candidate:** `OTHER` / `ContextualWrongWord`.
- **False-positive concerns:** Both words may be valid in nearby contexts.
- **Resolution / status:** Needs Example
- **Notes:** A confusion set needs positive and negative contextual controls.

### RW-009 — Facebook Marketplace capitalization

- **Date:** Not recorded; backfilled 2026-09-10
- **Source:** Real User
- **Category / subcategory:** Orthography / `CanonicalTerm`
- **Exact or redacted original sentence:** Safely represented by lowercase and partial-capitalization benchmark fixtures.
- **Expected behavior:** Suggest the established `Facebook Marketplace` capitalization.
- **Actual REDLINE behavior:** Fixed by AXIOM `CanonicalTerm`.
- **Expected correction:** `Facebook Marketplace`
- **Confidence:** High
- **Reproducible:** Yes
- **Benchmark status:** Benchmark Added
- **Rule/class candidate:** `ORTH` / `CanonicalTerm`.
- **False-positive concerns:** Standalone ordinary uses of “marketplace” and technical identifiers.
- **Resolution / status:** Fixed
- **Notes:** Paired exact-name, generic-word, and technical controls pass. The
  production 377-record generated snapshot retains this finding and supersedes
  the original two-term seed without changing its expected behavior.

### RW-010 — general noun subject-verb agreement

- **Date:** Not recorded; backfilled 2026-09-10
- **Source:** Real User
- **Category / subcategory:** Subject-verb agreement / noun subject
- **Exact or redacted original sentence:** Needs Exact Example
- **Expected behavior:** Needs Exact Example
- **Actual REDLINE behavior:** Needs Exact Example
- **Expected correction:** Needs Exact Example
- **Confidence:** Medium that the class matters; low about the missing sentence.
- **Reproducible:** Unknown
- **Benchmark status:** Needs Exact Example
- **Rule/class candidate:** `VERB:SVA`.
- **False-positive concerns:** Collective nouns, coordinated subjects, intervening nouns, and agreement by meaning.
- **Resolution / status:** Needs Example
- **Notes:** Synthetic noun-agreement misses remain documented, not promoted.

### RW-011 — broader malformed sentence context

- **Date:** Not recorded; backfilled 2026-09-10
- **Source:** Real User
- **Category / subcategory:** Broader malformed sentence syntax / unknown
- **Exact or redacted original sentence:** Needs Exact Example
- **Expected behavior:** Needs Exact Example
- **Actual REDLINE behavior:** Needs Exact Example
- **Expected correction:** Needs Exact Example
- **Confidence:** Low until exact context and intent are available.
- **Reproducible:** Unknown
- **Benchmark status:** Needs Exact Example
- **Rule/class candidate:** `OTHER`, `WO`, or `SentenceBoundary` after classification.
- **False-positive concerns:** Fragments, headings, dialogue, dictated speech, and deliberate syntax.
- **Resolution / status:** Needs Example
- **Notes:** Do not infer a rule from an approximate dictated fragment.

### RW-012 — synonyms and word choice

- **Date:** Not recorded; backfilled 2026-09-10
- **Source:** Real User
- **Category / subcategory:** Word Tools / advisory vocabulary
- **Exact or redacted original sentence:** Not applicable; this is a product-boundary request.
- **Expected behavior:** Offer synonyms only after an explicit future Word Tools action.
- **Actual REDLINE behavior:** No grammar underline for valid vocabulary.
- **Expected correction:** Not applicable.
- **Confidence:** High
- **Reproducible:** Yes
- **Benchmark status:** Deferred
- **Rule/class candidate:** None; not AXIOM grammar.
- **False-positive concerns:** Treating valid style choices as correctness errors.
- **Resolution / status:** Deferred
- **Notes:** Synonyms remain advisory future Word Tools / Style work.

### RW-013 — LinkedIn Learning capitalization

- **Date:** Not recorded; backfilled 2026-09-10
- **Source:** Real User
- **Category / subcategory:** Orthography / `CanonicalTerm`
- **Exact or redacted original sentence:** Safely represented by lowercase and partial-capitalization benchmark fixtures.
- **Expected behavior:** Suggest the established `LinkedIn Learning` capitalization.
- **Actual REDLINE behavior:** Fixed by AXIOM `CanonicalTerm`.
- **Expected correction:** `LinkedIn Learning`
- **Confidence:** High
- **Reproducible:** Yes
- **Benchmark status:** Benchmark Added
- **Rule/class candidate:** `ORTH` / `CanonicalTerm`.
- **False-positive concerns:** Standalone ordinary uses of “learning” and technical identifiers.
- **Resolution / status:** Fixed
- **Notes:** Paired exact-name, generic-word, and technical controls pass. The
  production 377-record generated snapshot retains this finding and supersedes
  the original two-term seed without changing its expected behavior.

### RW-014 — approximate propel / propelling report

- **Date:** Not recorded; backfilled 2026-09-10
- **Source:** Real User
- **Category / subcategory:** Word form / possible contextual wrong word
- **Exact or redacted original sentence:** Needs Exact Example; remembered only as involving `propel`, `propelling`, and distance.
- **Expected behavior:** Needs Exact Example
- **Actual REDLINE behavior:** Needs Exact Example
- **Expected correction:** Needs Exact Example
- **Confidence:** Low
- **Reproducible:** Unknown
- **Benchmark status:** Needs Exact Example
- **Rule/class candidate:** `MORPH`, `VERB:FORM`, or `ContextualWrongWord` only after reproduction.
- **False-positive concerns:** Manufacturing a sentence would manufacture the grammatical class too.
- **Resolution / status:** Needs Example
- **Notes:** Do not add a corpus case until the exact or safely redacted sentence is supplied.

## New finding template

- **ID:** RW-###
- **Date:** YYYY-MM-DD
- **Source:** Real User / REDLINE Corpus / Harper / External Corpus / Synthetic Control
- **Category / subcategory:**
- **Exact or redacted original sentence:**
- **Expected behavior:**
- **Actual REDLINE behavior:**
- **Proposed correction, if known:**
- **Confidence:** High / Medium / Low
- **Reproducible:** Yes / No / Unknown
- **Benchmark status:** Not Added / Needs Exact Example / Benchmark Added / Known Miss / Known Limitation / Deferred
- **Rule/class candidate:**
- **False-positive concerns:**
- **Resolution / status:** New / Needs Example / Investigating / Benchmark Added / Fixed / Deferred
- **Notes:** Include the writing profile, REDLINE version, reproduction frequency, and whether the redacted text may enter the local benchmark.

## Grammar rule promotion policy

A real-world report does not immediately become a rule.

Real-world miss → reproduce → identify grammatical class → test Harper/current AXIOM → create should-warn fixtures → create should-not-warn controls → evaluate a deterministic fix → run a focused benchmark → run the full benchmark → review false-positive risk → promote only if precision remains acceptable.

The release gate remains **zero unexplained false positives**. Never add a phrase-specific regex merely to fix one user sentence.

## Word-choice boundary

- Objective grammar mistakes belong to AXIOM.
- Stylistic vocabulary improvement belongs to future Word Tools.
- Synonyms are advisory only.
- Never underline valid vocabulary merely because another word may sound better.

## Canonical terminology

`CanonicalTerm` now consumes a generated 377-record built-in snapshot with
high-confidence, multiword-high-confidence, and context-required entries.
It may later support established names such as `ICARUS`, `REDLINE`, `The
Forge`, and user- or project-specific preferred capitalization. Do not add
them automatically: each term needs confirmed canonical ownership and safe
paired controls. This pass adds no terminology-management UI.
