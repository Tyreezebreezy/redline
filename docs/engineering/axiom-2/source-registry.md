# AXIOM 2.0 — Source Registry

Status: machine-readable registry contract plus the initial classified source
list. Entries marked "VERIFY" require fresh license/attribution review before
use; do not trust stale notes.

## 1. Registry schema

Each source records, as applicable:

| Field | Meaning |
| --- | --- |
| id | stable internal identifier |
| name | human-readable name |
| url | canonical upstream location |
| organization | maintainer/organization |
| purpose | what REDLINE uses it for |
| dialect/relevance | en-US relevance and role |
| version | pinned upstream version |
| retrieval_date | date acquired/verified |
| license | SPDX or described license |
| attribution | required attribution terms |
| source_hash | hash of the exact artifact |
| distribution | EMBEDDABLE / RESEARCH-EVALUATION / REFERENCE-ONLY |
| notes | restrictions, training limits, derived-data implications |

## 2. Distribution classes

| Class | Meaning |
| --- | --- |
| EMBEDDABLE | May ship appropriately licensed data/derived assets. |
| RESEARCH-EVALUATION | May be used for research/testing subject to license; not automatically redistributed. |
| REFERENCE-ONLY | Human/software research reference; do not copy protected content into REDLINE. |

## 3. Initial source list

### Language / reference

| Source | Purpose | License (status) | Distribution | Recommendation |
| --- | --- | --- | --- | --- |
| Harper (v2.7.0) | Tier-1 deterministic infrastructure | Apache-2.0 (verified) | EMBEDDABLE | Keep; audit coverage (Stage B) |
| ESDB / SCOWL | American spelling, commonness tiers, inflections | VERIFY (permissive; confirm exact) | EMBEDDABLE candidate | Build-time validation + possible small generated supplement; do not ship a second huge runtime dictionary |
| Open English WordNet | Semantic/Word Tools (definitions, synonyms, antonyms, senses) | VERIFY (CC BY 4.0 reported) | EMBEDDABLE candidate | Prototype; on-demand lookup only; keep out of keystroke path |

### Corpora

| Source | Purpose | License (status) | Distribution | Recommendation |
| --- | --- | --- | --- | --- |
| COCA | Contemporary American usage, register, collocations | Licensed/restricted | RESEARCH-EVALUATION | Usage evidence only; no redistribution |
| Santa Barbara Corpus of Spoken American English | Natural spoken American constructions | VERIFY | RESEARCH-EVALUATION | Natural/General usage evidence only; not written-correctness authority |
| MICUSP | U.S. academic writing | VERIFY | RESEARCH-EVALUATION | Academic register evidence |
| MICASE | U.S. academic speech | VERIFY | RESEARCH-EVALUATION | Academic register evidence |

### Writing standards

| Source | Purpose | License (status) | Distribution | Recommendation |
| --- | --- | --- | --- | --- |
| U.S. Plain Language / Digital.gov | Professional clarity/concision principles | U.S. government work (public domain) | REFERENCE-ONLY | Extract principles, not prose |
| Microsoft Writing Style Guide | American professional writing guidance | Copyrighted | REFERENCE-ONLY | Extract principles |
| Purdue OWL | Academic writing guidance | Copyrighted | REFERENCE-ONLY | Extract principles |

### Grammar software / research

| Source | Purpose | License (status) | Distribution | Recommendation |
| --- | --- | --- | --- | --- |
| GECToR (Grammarly) | Localized-edit GEC architecture baseline | MIT code; training data restricted | REFERENCE-ONLY / RESEARCH | Architecture reference; do not reuse training data |
| Google Docs neural grammar (published work) | Neural grammar research | Published research | REFERENCE-ONLY | Methodology reference |
| LanguageTool | Comparative grammar rules | VERIFY (LGPL; components vary) | RESEARCH-EVALUATION | Methodology-only comparison |
| Microsoft Editor / ProWritingAid | Competitive behavior reference | Proprietary | REFERENCE-ONLY | Comparative methodology only |

### Evaluation

| Source | Purpose | License (status) | Distribution | Recommendation |
| --- | --- | --- | --- | --- |
| ERRANT (v3.0.2) | Edit-categorization taxonomy | MIT (verified) | EMBEDDABLE (dev tooling) | Development/evaluation taxonomy; not a runtime dependency |
| BEA-19 / CoNLL-14 / JFLEG / W&I+LOCNESS / NUCLE / FCE / Lang-8 | GEC evaluation corpora | Mixed; mostly restricted | RESEARCH-EVALUATION / LOCAL-ONLY | Local research inputs only; no committed text |

## 4. Machine-readable manifest

A machine-readable manifest (`corpus/manifests/sources.json` today) mirrors
these records. Additions must pass a provenance/license gate before
ingestion. The existing manifest schema is the starting point; extend it with
the `distribution` and `source_hash` fields above where missing.

## 5. Rules

- Verify license, redistribution, modification, attribution, commercial-use,
  training, and derived-data implications before adding third-party data or
  models.
- "Available online" does not mean redistributable.
- Do not commit restricted corpus text into Gitea.
- A source's research usefulness does not grant redistribution rights.
