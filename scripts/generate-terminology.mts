import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const sourceUrl = new URL(
  "../data/terminology/curated.v1.json",
  import.meta.url,
);
const outputUrl = new URL("../src/axiom/terminology.v1.json", import.meta.url);

type Confidence = "high" | "multiword-high" | "context-required";
type Group = { entity_type: string; names: string[] };
type Override = {
  canonical_name: string;
  entity_type?: string;
  source_id?: string;
  confidence?: Confidence;
  ambiguity?: string;
  notes?: string;
  aliases?: string[];
  context_before?: string[];
  context_after?: string[];
};
type Source = {
  schema_version: number;
  snapshot_version: string;
  retrieved: string;
  license: string;
  groups: Group[];
  overrides: Override[];
};

function fail(message: string): never {
  throw new Error(`Terminology source is invalid: ${message}`);
}

const sourceText = await readFile(sourceUrl, "utf8");
const source = JSON.parse(sourceText) as Source;
if (source.schema_version !== 1) fail("unsupported schema version");
if (!source.groups?.length) fail("at least one group is required");

const overrides = new Map(
  source.overrides.map((override) => [override.canonical_name, override]),
);
const names = new Set<string>();
const aliases = new Map<string, string>();
const records = source.groups.flatMap((group) =>
  group.names.map((canonical_name) => {
    if (!canonical_name.trim() || names.has(canonical_name)) {
      fail(`duplicate or empty canonical name: ${canonical_name}`);
    }
    names.add(canonical_name);
    const override = overrides.get(canonical_name);
    const recordAliases = override?.aliases ?? [canonical_name.toLowerCase()];
    for (const alias of recordAliases) {
      const key = alias.normalize("NFC").toLocaleLowerCase("en-US");
      const owner = aliases.get(key);
      if (owner && owner !== canonical_name) {
        fail(`alias ${alias} belongs to both ${owner} and ${canonical_name}`);
      }
      aliases.set(key, canonical_name);
    }
    const multiword = /\s/u.test(canonical_name);
    const confidence =
      override?.confidence ?? (multiword ? "multiword-high" : "high");
    if (confidence === "context-required" && !override?.ambiguity) {
      fail(`${canonical_name} needs an ambiguity reason`);
    }
    return {
      canonical_name,
      aliases: recordAliases,
      entity_type: override?.entity_type ?? group.entity_type,
      source: override?.source_id ? "Wikidata" : "REDLINE curated",
      source_id: override?.source_id ?? null,
      confidence,
      ambiguity: override?.ambiguity ?? null,
      case_sensitive: false,
      multiword,
      version: 1,
      notes: override?.notes ?? null,
      ...(override?.context_before
        ? { context_before: override.context_before }
        : {}),
      ...(override?.context_after
        ? { context_after: override.context_after }
        : {}),
    };
  }),
);

for (const name of overrides.keys()) {
  if (!names.has(name))
    fail(`override has no matching canonical name: ${name}`);
}

records.sort((left, right) =>
  left.canonical_name.localeCompare(right.canonical_name, "en-US"),
);
const snapshot = {
  schema_version: 1,
  snapshot_version: source.snapshot_version,
  license: source.license,
  retrieved: source.retrieved,
  source: {
    kind: "bounded reviewed candidate set",
    file: "data/terminology/curated.v1.json",
    sha256: createHash("sha256").update(sourceText).digest("hex"),
  },
  records,
};
const output = `${JSON.stringify(snapshot, null, 2)}\n`;

if (process.argv.includes("--check")) {
  const current = await readFile(outputUrl, "utf8");
  if (current !== output) {
    throw new Error(
      "Terminology snapshot is stale. Run pnpm generate:terminology.",
    );
  }
  console.log(
    `Terminology snapshot verified: ${records.length} records, ${aliases.size} aliases.`,
  );
} else {
  await writeFile(outputUrl, output);
  console.log(
    `Terminology snapshot generated: ${records.length} records, ${aliases.size} aliases.`,
  );
}
