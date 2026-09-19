# AXIOM 2.0 — Stage B: Lexical + Semantic Foundation

Status: Stage B evidence and decisions. No production change was made; this
documents research only.

## 1. Harper lexical audit

- **Version:** `harper.js` 2.7.0 (pinned in `pnpm-lock.yaml`), Apache-2.0.
- **Dictionary:** curated dictionary embedded in the ~15 MB WASM
  (`harper_wasm_bg.wasm`). Source format is a hunspell-like word list
  (`dictionary.dict`) plus affix/annotation expansion rules (`annotations.json`),
  per upstream docs. The dictionary is not directly enumerable; coverage was
  measured by probing the `SpellCheck` rule.
- **Dialect:** constructed with `Dialect.American`; correctly rejects British
  spellings (`colour`, `analyse`, `organise`, `centre`, `grey`, `theatre`).
- **Morphology:** affix expansion handles regular inflections; irregular forms
  (`children`, `mice`, `geese`, `went`, `bought`) and contractions are
  recognized. Gap: compound possessives of `-man/-men` words
  (`airmen's`, `workmen's`, `yachtswomen's`) are missed.
- **User dictionary:** `importWords`/`exportWords`/`clearWords` support the
  existing single-owner Personal Dictionary.
- **Startup/cost:** Linter construction (curated dictionary build) is Harper's
  most expensive operation; the AXIOM benchmark reports ~1.1 s initialization.

### Coverage vs ESDB (measured, American, lowercase tokens)

| Metric | Result |
| --- | --- |
| ESDB size 60 (109,140 words; 88,199 lowercase unique) | Harper flags 1,233 → **98.6% coverage** |
| ESDB size 70 (168,608 words; 140,188 lowercase unique) | Harper flags 42,232 → **69.9% coverage** |
| en_GB-ise tokens not in en_US (2,840) | American Harper flags 2,806 → **98.8% rejected** |

### Character of the 1,233 size-60 misses

- Compound/irregular possessives (`airmen's`, `alumni's`, `antennae's`) — a
  large share.
- Rare or domain/cultural vocabulary (`adobo`, `aikido`, `alopecia`, `asana`,
  `bechamel`, `beignet`, `bento`, `wonton`, `ziggurat`).
- A few British-leaning forms (`afterwards`, `axe`, `whinging`) — correctly
  out of scope for American.
- Modern/informal (`attaboy`, `benchwarmer`, `workaholism`, `woker`).

### Harper misses that matter most

- **`teh`** (transposition of "the") — not flagged, even in sentence context.
- **`alot`** (should be "a lot") — not flagged, even in sentence context.

These are short/common typo classes Harper's `SpellCheck` heuristic skips, not
a dictionary-coverage issue (ESDB also treats them as misspelled). They point
to a deterministic REDLINE rule opportunity, not a dictionary fix.

## 2. ESDB / SCOWL

- **Identity/version:** English Speller Database (ESDB), formerly SCOWLv2.
  Release `rel-2026.02.25` ("2026.02.25"). Upstream:
  `https://github.com/en-wl/wordlist`; plain wordlists via
  `https://github.com/en-wl/wordlist-diff`.
- **License (verified):** MIT-like (Kevin Atkinson, 2000-2026). Sources mostly
  public domain (12dicts, ENABLE2K). Caveats: COCA 3-gram ranking under NDA;
  AU data (Titze) for Australian; UKACD notice only for size >80; Princeton
  WordNet notice for non-speller reuse of the full database. An American
  speller wordlist at size <=70 needs only the Kevin Atkinson notice.
- **Structure:** commonness sizes 35/50/60/70/80/85; dialect spellings
  (A=US, B=GB-ise, Z=GB-ize, C=CA, D=AU); variant levels 0-9; POS + inflection
  forms (noun plural/possessive, verb tense/participle, adjective
  comparative/superlative). Size 60 is the recommended default spell-check
  tier and deliberately excludes "problematic valid words" like `calender`.

### Coverage / overlap

- Harper ≈ ESDB size 60 for common vocabulary (98.6%).
- The divergence is narrow and well-characterized (see lexical corpus below).

### Precision risk of a larger dictionary (measured)

| Word | Harper | ESDB-60 | ESDB-70 | Meaning |
| --- | --- | --- | --- | --- |
| `calender` | flags | flags | **accepts** | real word, usually a typo of "calendar" |
| `nad` | flags | flags | **accepts** | rare/slang token |
| `sphygmomanometer` | flags | flags | accepts | rare but valid |
| `callipygian` | flags | flags | accepts | rare but valid |

This is the documented handoff risk: a larger dictionary reduces false
positives (accepts rare valid words) while increasing false negatives (hides
`calender`/`nad`).

### Decision

**BUILD-TIME ONLY (build-time validation + optional small targeted
supplement), not a runtime second dictionary.** Harper already covers the
common tier; the only material gains are rare words that carry typo-hiding
risk. The real spelling gaps (`teh`, `alot`) are Harper rule heuristics, not
vocabulary, and are better addressed as targeted deterministic rules in a
later stage.

## 3. Lexical benchmark corpus

`probes/axiom-reference/lexical-corpus.json` (96 cases; positive and negative
controls across dialect, morphology, contractions, compounds, uncommon words,
transposition/omission/duplication/wrong-vowel/phonetic typos, hard
negatives, and real-word pairs).

| Engine | Overall |
| --- | --- |
| Harper | 88/96 (91.7%) |
| ESDB size 60 | 89/96 (92.7%) |
| ESDB size 70 | 91/96 (94.8%) |

Category highlights:

- Harper: 100% on US dialect, irregulars, contractions, compounds, wrong-vowel,
  omission, duplication; 66.7% on transposition (misses `teh`, `alot`); 50% on
  phonetic (`lite`/`thru` accepted as informal-but-real); 75% on uncommon
  words (misses `sphygmomanometer`, `callipygian`).
- ESDB-70 improves uncommon-word and hard-negative recall but drops
  transposition recall (`nad`) and hard-negative precision (`calender`).
- All engines correctly leave real-word confusion pairs (`loose`/`lose`,
  `then`/`than`, `affect`/`effect`) to AXIOM Context, not spelling.

## 4. Open English WordNet (OEWN)

- **Version/license:** 2025 Edition, CC-BY 4.0 (verified). Fork of Princeton
  WordNet 3.1. Core: 135,969 words / 107,519 synsets; Plus adds proper nouns
  from Open English Namenet.
- **Data model:** `word -> POS -> senses -> synset -> relations`
  (definition, hypernym, hyponym, antonym, meronym, derivation, domain, etc.).
  This is a sense-structured lexical network, not a flat thesaurus.
- **Measured (JSON release):**

| Metric | Value |
| --- | --- |
| Raw JSON on disk | 72.4 MB (73 files) |
| Lemmas | 128,009 |
| Senses | 185,129 |
| Synsets | 107,519 |
| Indexed relations | 129,459 |
| Load + parse | ~995 ms |
| Lookup latency | ~0.010 ms/lookup (warm) |
| In-memory (heap delta) | ~9.8 MB |
| Compact snapshot (word->pos->synset ids) | 5.3 MB JSON |
| Compact snapshot (with definitions) | 19.2 MB JSON |

- **Sense quality:** `bank` -> n:10 v:8; `run` -> n:16 v:41; `light` ->
  a:25 n:14 r:1 v:7. Polysemy and homography are properly sense-separated.
- **Storage options:** raw JSON (72 MB) is impractical for a light app; a
  generated compact snapshot (5-19 MB) or a small SQLite table is the right
  runtime form. SQLite is attractive because REDLINE already uses it, but the
  plain compact JSON is also viable at this size; measure before choosing.

### Decision

**INTEGRATE LATER (future on-demand semantic layer / Word Tools), generated
into a compact snapshot.** OEWN is cheap (5-19 MB snapshot, sub-millisecond
lookup) and licensed for redistribution with attribution. It is lexical
semantics only — not grammar, not register, not fact — and stays out of the
keystroke hot path.

## 5. Lexical precedence note (for Stage E resolver)

Proposed precedence, reconciled with current AXIOM behavior rather than
imposed blindly:

```text
Protected text
  > Personal explicit allow (single owner)
  > Canonical Terminology
  > high-confidence spelling (Harper + any proven small supplement)
  > contextual model
```

Conflict policy to carry into Stage E:

1. Harper flags a word, ESDB says valid -> ESDB (larger) wins for *acceptance*
   only at a trusted commonness tier; size-70+ acceptance must not hide known
   typo-collision words (`calender`).
2. ESDB valid but Personal Dictionary sets a preferred capitalization ->
   Personal wins (current behavior).
3. WordNet recognizes a lowercase common word that Terminology treats as a
   brand -> Terminology wins.
4. Uncommon valid word that looks like a typo -> stay conservative; flag only
   with high confidence, never solely on edit distance.

## 6. Summary table

| Component | Recommendation | Why |
| --- | --- | --- |
| Harper | KEEP as Tier-1 base | 98.6% of common American vocab; fast; Apache-2.0 |
| ESDB/SCOWL | BUILD-TIME ONLY (validation + small targeted supplement) | Common tier already covered; rare-tier gains carry typo-hiding risk |
| OEWN | INTEGRATE LATER (compact snapshot, on-demand) | Cheap, sense-rich, CC-BY 4.0; not grammar, so no keystroke-path role |

## 7. Not done / not touched

No production grammar, Harper configuration, dependency, Tauri authority, CSP,
model asset, or release change. Live Dictation 2.0 remains deferred. REDLINE
remains single-user.
