# REDLINE Word Tools (0.5.0)

## Architecture

- **Source:** Open English WordNet 2025 Edition (CC BY 4.0), fork of Princeton
  WordNet 3.1.
- **Generator:** `scripts/generate-lexicon.mts` reads the downloaded OEWN JSON
  and emits `src/wordTools/lexicon.v1.json`, a deterministic compact snapshot
  (word → POS → synset ids; synset → definition/members/antonym/hypernym).
  Metadata records source, license, source SHA-256, dialect (en-US),
  generation date, and counts. `--check` mode fails if the committed snapshot
  is stale.
- **Runtime:** `src/wordTools/lexicon.ts` lazily loads the snapshot on first
  use (Vite code-splits it into a separate chunk; it is never loaded in the
  typing/keystroke path). `lookupWord` returns sense-grouped results with
  definitions, synonyms (synset members), antonyms, and related/broader terms.
- **UI:** `src/wordTools/WordToolsPanel.tsx` renders senses grouped by part of
  speech; chips for synonyms/antonyms/related terms replace the selected word
  via a stale-checked ProseMirror transaction (one-step undo). Invoked from the
  editor toolbar only when a single word is selected.

## Sense handling

Senses preserve WordNet's structure rather than flattening to a thesaurus.
`bank` resolves to separate noun/verb senses (financial institution, river
slope, ...) each with its own definition and related terms. The chosen word is
excluded from its own synonym list.

## Data size / performance

- Snapshot: ~18.9 MB committed; loaded lazily (~a few hundred ms once), then
  sub-millisecond lookups.
- Licensing: CC BY 4.0; attribution added to the bundled third-party notices.

## Safety

- No automatic text modification; replacement is explicit and undoable.
- User edits win; a stale selection (word changed since lookup) is refused.
- Not part of AXIOM grammar analysis; Word Tools never creates correctness
  underlines.
