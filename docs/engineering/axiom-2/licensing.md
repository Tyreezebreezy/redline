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

## 3. Known/reported status (reverify before use)

- **Harper** — Apache-2.0; already pinned and embedded (v2.7.0). Safe to keep.
- **ERRANT** — MIT; development/evaluation tooling.
- **ESDB / SCOWL** — permissive; exact terms to verify before any derived
  runtime asset ships.
- **Open English WordNet** — CC BY 4.0 reported; verify attribution terms
  before embedding.
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
