# REDLINE Terminology Engine

## Production boundary

Terminology is an AXIOM-owned, editor-neutral correctness source. It emits
ordinary `CanonicalTerm` issues in projected-text offsets; REDLINE performs the
existing mapping into editor positions. It does not introduce editor types,
native commands, persistence, runtime networking, or a management UI.

The built-in snapshot contains 377 reviewed records:

- 203 high-confidence single-name records;
- 158 high-confidence multiword records;
- 16 context-required ambiguous records.

Personal or project terms such as ICARUS, REDLINE, and The Forge are not
silently promoted into the global built-in dictionary.

## Data and generation

`data/terminology/curated.v1.json` is the reviewed source manifest.
`scripts/generate-terminology.mts` validates and deterministically compiles it
to `src/axiom/terminology.v1.json` using Node standard-library APIs only.

The runtime snapshot records its schema and snapshot version, license,
retrieval date, source file, source SHA-256, record provenance, aliases,
confidence, and optional context hints. Source IDs are retained where a term
was verified against Wikidata; other entries are explicitly marked REDLINE
curated rather than assigned invented identifiers.

Wikidata structured data is CC0 and exposes machine-readable Wikibase JSON.
REDLINE uses it only as an offline review source. It does not download a full
dump, query Wikidata at runtime, or automatically promote labels or aliases.

Generate and review an update with:

```text
pnpm generate:terminology
git diff -- data/terminology/curated.v1.json src/axiom/terminology.v1.json
pnpm test:terminology
pnpm benchmark:axiom
```

`pnpm check` runs the generator in check mode and fails if the committed
snapshot is stale. A release-quality update must review the source-manifest
diff, generated snapshot diff, ambiguity classification, aliases, paired
controls, protected-span behavior, corpus results, and license/provenance.

## Matching and ambiguity

Matching is dependency-free, Unicode-aware, case-insensitive, and deterministic.
It prefers the longest alias. Possessive suffixes remain outside the correction
range. Exact canonical spelling produces no issue.

High-confidence names match directly. Multiword-high-confidence names require
the complete reviewed phrase. Context-required common words match only beside
an approved product or service hint. Every context-required record has a
positive product fixture and a negative ordinary-language control. Alias
collisions fail validation instead of selecting an arbitrary winner.

URLs, email addresses, paths, filenames, versions, hashes, IP addresses, code
identifiers, and the existing AXIOM protected spans remain excluded. A provider
spelling or orthography issue that overlaps the same canonical correction is
suppressed; unrelated grammar findings are preserved.

## Validation and performance

`scripts/check-terminology.mts` verifies schema and counts, source integrity,
required product coverage, canonical no-op behavior, lowercase corrections,
longest matching, punctuation and possessives, all ambiguity pairs, protected
spans, collision rejection, and bounded startup/lookup time.

The AXIOM corpus contains dedicated product, punctuation, ambiguity, and
protected-span cases. Its release gate remains zero unexplained false positives,
zero unexplained misses, zero mapping failures, and zero protected-span
failures.

`pnpm benchmark:terminology` measures the same matcher with 100, 1,000, 10,000,
and 50,000 synthetic records. This is a scalability signal, not permission to
bulk-import an unreviewed source.

## Future layering

Future precedence is deliberately simple:

1. generated REDLINE built-in snapshot;
2. User Profile terminology overrides;
3. project or document Style Guide overrides.

Later layers may replace or suppress earlier terms. The current matcher already
accepts an explicit record set, so future composition belongs before matcher
construction; no generic terminology framework is required now.

Humanizer/Voice, Clarity, Tone, and Word Tools consume the corrected text or
their own advisory inputs after AXIOM. They must not mutate or reinterpret the
built-in terminology snapshot. Valid vocabulary alternatives remain advisory,
not grammar underlines.
