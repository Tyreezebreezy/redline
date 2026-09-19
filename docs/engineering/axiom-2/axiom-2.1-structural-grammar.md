# AXIOM 2.1 — Structural Grammar Expansion

Status: Tier-1 deterministic subject-verb agreement rules shipped; remaining
weaknesses documented and deferred with reasons.

## 1. What was added

Four deterministic structural-agreement rules in
`src/axiom/structuralRules.ts`, wired into `analyzeText`:

| Rule | Phenomenon | Example |
| --- | --- | --- |
| `HeadNounAgreement` | head noun vs verb across a prepositional phrase | `The report from the analysts are ready` -> `is` |
| `SimpleNounAgreement` | subject/verb number at clause start | `The report are ready` -> `is` |
| `IndefiniteAgreement` | each/every/everyone/one + plural verb | `Each of them have a role` -> `has` |
| `CompoundSubjectAgreement` | two proper names + singular verb | `Alice and Bob is presenting` -> `are` |

### Quantifier-aware classification

`classifyHead` distinguishes, with explicit evidence:

- `a number of` -> plural; `the number of` -> singular.
- `a lot / couple / few / handful / dozen / score of` -> plural.
- `list / set / pair / kind / type / sort / category / variety / range / amount`
  -> singular.
- collective and ambiguous heads (`team`, `group`, `committee`, `family`,
  `majority`, `data`, `media`, `staff`, `rest`, `half`, ...) -> **skipped**, not
  corrected.

### Tense-aware replacements

`replacementFor` produces `is/are` and `was/were` correctly (`A number of
issues was` -> `were`, not `are`).

## 2. Measured result

| Metric | 0.3.0 | 2.1 |
| --- | --- | --- |
| Cases | 505 | 519 |
| Required findings | 172 | 184 |
| True positives | 172 | 184 |
| Unexplained false positives | 0 | 0 |
| Unexplained misses | 0 | 0 |
| Known misses | 53 | 41 (12 recovered) |
| Terminology | 377 | 377 |
| Protected/mapping failures | 0 | 0 |

The 12 recovered misses are the concrete subject-verb agreement gaps
(intervening nouns, coordinated proper names, each/every/everyone, quantified
constructions, and simple noun agreement).

## 3. Deferred (with reasons)

- **Collective nouns** (`group`, `committee`, `team`): `the team are` is a
  legitimate negative control in REDLINE's corpus; American collective
  agreement is not stable enough to correct objectively.
- **Neither/either**: proximity agreement is variable; left as a known miss.
- **Verb form** (`to + -ed`, `to + -ing`): distinguishing the infinitive
  marker from prepositional `to` and lexical base forms (`need`, `proceed`)
  needs a lexicon, not a regex; not pursued.
- **Tense**: only malformed local constructions qualify; narrative-tense
  preference is Tier 4, not AXIOM.
- **Determiners / articles**: count-vs-mass and zero-article decisions need a
  noun lexicon; a/an is already handled by Harper.
- **Prepositions**: collocation is too contextual for a handcrafted ruleset.
- **Missing / extra words**: would require guessing content words (deferred to
  future contextual GEC / Writing Intelligence).
- **Punctuation**: comma splices and clause commas need clause parsing; style
  commas must not become errors.
- **Confusion sets** (`principle`, `then`, `compliment`, `bare`): evaluated
  and rejected because context cannot resolve them deterministically
  (`compliment` the team is ambiguous praise-vs-complete).

## 4. Rules tested but rejected

- Naive `X and Y = plural` for all coordinated subjects (rejected: compound
  nouns like "macaroni and cheese" are singular).
- Collective-noun agreement correction (rejected: `the team are` control).
- `to + -ing` / `to + -ed` infinitives (rejected: prepositional `to` and
  `-ed`-stem verbs like `need`).
- `these/those + noun` (rejected: mass-noun ambiguity).
- Complement/compliment, principal/principle, bare/bear, than/then confusion
  sets (rejected: no deterministic high-precision context).

## 5. Product invariants preserved

- Precision over recall; zero unexplained false positives.
- Protected spans, canonical terminology, and personal dictionary authority
  intact.
- General/Professional/Academic do not change objective agreement.
- No neural model added.
