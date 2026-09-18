# AXIOM 2.0 — Architecture

Status: engineering contract (Stage A). This document is normative for future
AXIOM 2.0 work. It describes the target hybrid local American-English language
engine and the contracts every engine must satisfy. It does not authorize
production integration.

## 1. Goal

Move REDLINE from a rule-based grammar checker plus terminology toward a hybrid
local American-English language engine without sacrificing privacy, speed,
explainability, precision, or user authorship.

The system combines:

1. American English reference knowledge
2. deterministic AXIOM
3. contextual grammatical-error detection
4. confidence/conflict resolution
5. advisory Writing Intelligence
6. My Voice
7. explicit Transform

Success is evidence, not a shipped neural engine.

## 2. Product boundaries that AXIOM must preserve

- **Single-user local application.** One implicit local owner. No profiles,
  Guest, accounts, profile switching, or profile-owned documents.
- **Local-only.** No cloud grammar, text upload, telemetry, remote inference,
  or cloud semantic lookup. Offline-capable.
- **Windows-first.** Ordinary desktop hardware, CPU-first, bounded memory.
- **Precision over nagging.** A missed questionable correction is preferable
  to a wrong or subjective one.
- **Voice preservation.** Correct what is wrong; advise on what could be
  better; rewrite only when explicitly requested.

## 3. Concept separation

These boundaries must remain clean:

| Concept | Question | Tier |
| --- | --- | --- |
| AXIOM | Is the writing actually incorrect? | Tier 0-3 |
| AXIOM Context | Does sentence context reveal an objective error deterministic rules miss? | Tier 2 |
| Terminology | What is the canonical/preferred form? | Tier 1 |
| Writing Intelligence | Could this valid writing be improved for its purpose? | Tier 4 |
| My Voice / Humanizer | Among valid ways to say this, which sounds like the owner? | Tier 4 |
| Transform | Rewrite this because I explicitly asked. | Tier 5 |

## 4. Target tiered architecture

```text
REDLINE DOCUMENT
        |
        v
TIER 0 - AXIOM REFERENCE   American English knowledge (lexical, semantic, usage, provenance)
        |
        v
TIER 1 - AXIOM CORE        Harper + deterministic REDLINE rules + terminology
                           + personal dictionary + proven lexical supplement
        |
        v
TIER 2 - AXIOM CONTEXT     Contextual GEC; localized contextual edits
        |
        v
TIER 3 - AXIOM RESOLVER    confidence, conflict resolution, protected spans, provenance
        |
   OBJECTIVE CORRECTIONS
        |
        v
TIER 4 - WRITING INTEL     clarity, tone, goals, wording, My Voice (ADVISORY ONLY)
        |
        v
TIER 5 - TRANSFORM         intentional rewriting (SEPARATE EXPLICIT ACTION)
```

The Tier 3 / Tier 4 boundary is mandatory. Objective corrections stop at
Tier 3. Tier 4 is advisory and must never be surfaced as a grammar error.

## 5. Current Tier 1 (baseline, unchanged by this research)

- `src/axiom/axiom.ts` — `analyzeText()` orchestrates: protected-span
  detection, canonical terminology issues, Harper analysis (with profile rule
  overrides), canonical-overlap filtering, protected-span filtering,
  personal-dictionary filtering, sorting, ID assignment.
- `src/axiom/HarperAdapter.ts` — wraps `harper.js` 2.7.0 (`WorkerLinter`,
  `Dialect.American`), maps Harper lints to `AxiomIssue`.
- `src/axiom/terminology.ts` — 377-record generated snapshot
  (`terminology.v1.json`), longest-match matcher with `context-required`
  handling.
- `WritingProfile` = `general | academic | professional`;
  `PROFILE_RULE_OVERRIDES` currently enables `AvoidContractions` only for
  `academic`.

Accepted floor: 290 AXIOM cases, 94/94 required findings, zero unexplained
false positives or misses, zero mapping failures, zero protected-span
failures, 22 documented known misses, nine documented limitations.

## 6. Runtime workload separation

| Workload | Content | Trigger |
| --- | --- | --- |
| Hot path | Harper, terminology, protected spans, light lexical checks, cached deterministic analysis | per keystroke |
| Debounced/background | AXIOM Context, sentence-level contextual checks, Writing Intelligence | after typing pauses |
| On-demand | definitions, deeper semantic lookup, My Voice, Transform, document reports | explicit action |

Typing responsiveness is mandatory; contextual analysis is never synchronous
with keystrokes.

## 7. Finding contract

Every engine must emit comparable evidence. The shape below is the target
contract; existing production code uses `AxiomIssue`. New engines may emit
this richer shape and be adapted to existing conventions, or emit
`AxiomIssue` directly with the required provenance fields.

```ts
AxiomFinding {
  id: string
  range: { from: number; to: number }
  original: string
  replacements: string[]            // localized; empty when none
  category: string                  // REDLINE product category
  errantCategory: string            // ERRANT-aligned tag (see evaluation.md)
  classification: "correction" | "suggestion" | "hidden"
  confidence: number                // calibrated, not raw probability
  engine: string                    // "harper" | "axiom-core" | "terminology" | "axiom-context" | ...
  ruleId?: string
  modelVersion?: string
  dialect: "en-US"
  writingContext: "general" | "professional" | "academic"
  explanation?: string
  provenance: { ruleId?: string; sources: string[] }
}
```

Requirements:

- Ranges are UTF-16 offsets validated against `original`.
- Overlapping findings must be resolvable (see resolver, below).
- Provenance always identifies why a finding exists and its source.

## 8. Output classes

Three classes only:

| Class | Meaning | Gate |
| --- | --- | --- |
| CORRECTION | Very high confidence of an actual error | stringent measured precision (target ~98%+ on the acceptance corpus) |
| SUGGESTION | Writing is valid; optional improvement may help | advisory |
| HIDDEN | Confidence insufficient | show nothing |

Rules:

- Below the correction threshold, downgrade to Suggestion where justified, or
  hide. Never inflate correction count to improve recall.
- Writing Context cannot turn a style preference into a grammar error.
- Raw model probability is not linguistic truth; confidence must be calibrated
  against the REDLINE evaluation corpus, per category where needed.

## 9. Rule provenance schema

Every REDLINE rule (deterministic or contextual) records, as applicable:

- rule ID (e.g. `AX-SVA-014`)
- name
- dialect (`en-US`)
- linguistic phenomenon
- AXIOM category
- classification (Correction / Suggestion)
- Writing Context applicability
- evidence/source IDs (see source-registry.md)
- implementation engine
- confidence policy
- exceptions
- positive-test count
- negative-control count
- known limitations
- introduced version
- last-reviewed date

No new rule may enter the corpus without paired positive and negative
controls.

## 10. Resolver policy (Tier 3)

Order of authority:

1. **Protected spans override everything.** URLs, IPs, commands, hashes,
   version strings, identifiers, paths, filenames, technical tokens.
2. **Canonical Terminology overrides overlapping generic spelling/orthography.**
3. **High-confidence deterministic AXIOM overrides a conflicting
   lower-confidence contextual candidate.**
4. Context model cannot silently replace protected canonical names.
5. Writing Context cannot turn style preferences into grammar errors.
6. Competing low-confidence edits are suppressed rather than guessed.

Resolver responsibilities: merge findings, resolve overlapping edits, protect
technical spans, apply confidence thresholds, enforce terminology authority,
resolve deterministic-vs-contextual disagreement, downgrade uncertain
findings, suppress low-confidence output, retain provenance, eliminate
duplicates.

## 11. Confidence calibration

- Do not display raw model probability as truth.
- Calibrate using the REDLINE evaluation corpus.
- Use per-category thresholds; a noisy category (e.g. prepositions) may need a
  much higher threshold or remain advisory.
- Example: SVA may be reliable at one threshold while preposition suggestions
  remain advisory or hidden.

## 12. Protected-span authority

AXIOM already protects technical spans (see `findProtectedSpans`). AXIOM 2.0
must preserve and expand this philosophy. A contextual model must not be
permitted to "correct" code, paths, identifiers, or known canonical technical
terms blindly. Protected-span authority generally overrides contextual-model
output.

## 13. Hot-path discipline

Do not put all resources in the keystroke path. The reference layer
(Tier 0) is loaded and queried at build time, on-demand, or in the background.
Only proven lightweight lexical data may join the hot path.

## 14. Non-goals (hard stops)

- No production contextual-GEC integration without owner review.
- No Harper replacement.
- No broad change to normal correction behavior.
- No new model assets in the installer.
- No Clarity/Tone implementation, no Dictation 2.0 resume, no multi-user
  resurrection.
