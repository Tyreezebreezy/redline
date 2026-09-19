import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const sourceDir = "probes/axiom-reference/oewn/data/json";
const outputPath = "src/wordTools/lexicon.v1.json";

type SynsetCompact = { d?: string[]; m?: string[]; a?: string[]; h?: string[] };
type WordIndex = Record<string, Record<string, string[]>>;
type Snapshot = {
  schema_version: number;
  source: string;
  license: string;
  source_url: string;
  generated: string;
  source_sha256: string;
  dialect: string;
  generator_version: number;
  word_count: number;
  synset_count: number;
  words: WordIndex;
  synsets: Record<string, SynsetCompact>;
};

const files = readdirSync(sourceDir);
const entryFiles = files.filter((f) => /^entries-[a-z0-9]\.json$/.test(f)).sort();
const synsetFiles = files
  .filter((f) => !/^entries-/.test(f) && f !== "frames.json")
  .sort();

const hash = createHash("sha256");
for (const f of [...entryFiles, ...synsetFiles]) {
  hash.update(readFileSync(join(sourceDir, f)));
}
const sourceSha256 = hash.digest("hex");

const words: WordIndex = {};
const synsets: Record<string, SynsetCompact> = {};
let wordCount = 0;
let senseCount = 0;

for (const f of entryFiles) {
  const obj = JSON.parse(readFileSync(join(sourceDir, f), "utf8"));
  for (const [word, entry] of Object.entries(obj)) {
    const byPos: Record<string, string[]> = {};
    for (const [pos, e] of Object.entries(entry)) {
      const senses = (e.sense ?? []).map((s) => s.synset);
      if (senses.length) {
        byPos[pos] = senses;
        senseCount += senses.length;
      }
    }
    if (Object.keys(byPos).length) {
      words[word] = byPos;
      wordCount += 1;
    }
  }
}

for (const f of synsetFiles) {
  const obj = JSON.parse(readFileSync(join(sourceDir, f), "utf8"));
  for (const [id, s] of Object.entries(obj)) {
    const compact: SynsetCompact = {};
    if (s.definition?.length) compact.d = s.definition;
    if (s.members?.length) compact.m = s.members;
    if (s.antonym?.length) compact.a = s.antonym;
    if (s.hypernym?.length) compact.h = s.hypernym;
    synsets[id] = compact;
  }
}

for (const id of Object.keys(synsets)) {
  if (Object.keys(synsets[id]).length === 0) {
    throw new Error(`Lexicon synset is empty: ${id}`);
  }
}

const snapshot: Snapshot = {
  schema_version: 1,
  source: "Open English WordNet 2025 Edition",
  license: "CC BY 4.0",
  source_url: "https://github.com/globalwordnet/english-wordnet",
  generated: new Date().toISOString().slice(0, 10),
  source_sha256: sourceSha256,
  dialect: "en-US",
  generator_version: 1,
  word_count: wordCount,
  synset_count: Object.keys(synsets).length,
  words,
  synsets,
};

const output = `${JSON.stringify(snapshot)}\n`;

if (process.argv.includes("--check")) {
  const current = readFileSync(outputPath, "utf8");
  if (current !== output) {
    throw new Error("Lexicon snapshot is stale. Run pnpm generate:lexicon.");
  }
  console.log(
    `Lexicon snapshot verified: ${wordCount} words, ${Object.keys(synsets).length} synsets, ${senseCount} senses.`,
  );
} else {
  writeFileSync(outputPath, output);
  console.log(
    `Lexicon snapshot generated: ${wordCount} words, ${Object.keys(synsets).length} synsets, ${senseCount} senses, ${(output.length / 1e6).toFixed(2)} MB.`,
  );
}
