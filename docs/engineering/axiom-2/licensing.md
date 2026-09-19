# AXIOM 2.0 — Licensing

Status: licensing policy and hard rules for third-party data/models.

## 1. Hard rule

Before adding third-party data/models, verify:

- license
- redistribution rights
- modification rights
- attribution requirements
- commercial-use implications
- model/data-training restrictions
- derived-data implications

Do not assume "available online" means redistributable. Do not commit
restricted corpus text into Gitea.

## 2. Distribution classes

| Class | Meaning |
| --- | --- |
| EMBEDDABLE | May ship appropriately licensed data/derived assets. |
| RESEARCH-EVALUATION | May be used for research/testing subject to license; not automatically redistributed. |
| REFERENCE-ONLY | Human/software research reference; do not copy protected content into REDLINE. |

## 3. Verified status (Stage B)

- **Harper** — Apache-2.0 (verified from pinned `harper.js` 2.7.0 LICENSE);
  already embedded. Safe to keep.
- **ERRANT** — MIT; development/evaluation tooling.
- **ESDB (formerly SCOWLv2)** — **VERIFIED** MIT-like: "Copyright 2000-2026 by
  Kevin Atkinson. Permission to use, copy, modify, distribute, and sell any
  part of the English Speller Database ... provided that the above copyright
  notice appears in all copies and that both [notices] appear in supporting
  documentation." Derived from mostly public-domain sources (12dicts,
  ENABLE2K). Caveats: (a) COCA 3-gram data was used under a signed NDA — the
  *frequency ranking* derives from non-redistributable COCA data, but the
  ESDB combined work itself is MIT-like; (b) Australian (`D`/`AU`) data adds a
  Benjamin Titze notice; (c) size >80 adds the UK Advanced Cryptics Dictionary
  notice; (d) non-speller reuse of the full database may trigger the Princeton
  WordNet notice. Practical rule for REDLINE: an American speller wordlist at
  size <=70 requires only the Kevin Atkinson notice.
- **Open English WordNet (2025)** — **VERIFIED** CC-BY 4.0 (README and
  LICENSE.md); fork of Princeton WordNet 3.1 under open methodology.
  Attribution required; redistribution and modification allowed; commercial
  use allowed under CC BY.
- **JFLEG** — restricted / noncommercial considerations; research only.
- **W&I+LOCNESS** — licensing restrictions; research only.
- **NUCLE** — licensed/restricted; research only.
- **LanguageTool** — licenses vary by component; methodology-only unless a
  specific component is verified.
- **COCA** — licensed; no redistribution without explicit permission/license.
- **U.S. Plain Language / Digital.gov** — U.S. government work (public
  domain); extract principles.
- **Microsoft Writing Style Guide / Purdue OWL** — copyrighted; extract
  principles, not prose.

## 4. Attribution and provenance

Any embedded derived asset records: snapshot version, generation date,
upstream version, license, source hash, generator version, record count,
review status. See source-registry.md for the schema.

## 5. Data generation discipline

- Upstream source -> offline generator -> validation -> review -> versioned
  REDLINE snapshot -> application.
- No silent regeneration on every app build.
- No huge downloads at runtime.

## 6. Private/owner-specific data

Do not commit the owner's private writing as training/evaluation fixtures
without explicit approval. Real-world findings may become minimal
anonymized/private test examples only where already approved. Do not silently
harvest documents.

## 7. Training restrictions

Do not begin training/fine-tuning solely because data exists. Training, if
ever justified, is a separate future phase documented with task, target
architecture, license, evaluation, baseline, failure categories, and expected
gain. This research primarily evaluates existing models/architectures.

## 8. Enforcement

A source that fails license verification does not enter the registry as
EMBEDDABLE. Restricted corpus text is never committed. The provenance/license
manifest gate runs on every ingestion.
