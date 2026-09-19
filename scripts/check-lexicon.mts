import { readFileSync } from "node:fs";

type Synset = { d?: string[]; m?: string[]; a?: string[]; h?: string[] };
type Snapshot = {
  schema_version: number;
  license: string;
  word_count: number;
  synset_count: number;
  words: Record<string, Record<string, string[]>>;
  synsets: Record<string, Synset>;
};

const snapshot = JSON.parse(
  readFileSync("src/wordTools/lexicon.v1.json", "utf8"),
) as Snapshot;

if (snapshot.schema_version !== 1) throw new Error("Unsupported lexicon schema.");
if (snapshot.license !== "CC BY 4.0") throw new Error("Unexpected license.");
if (snapshot.word_count !== Object.keys(snapshot.words).length) {
  throw new Error("Word count does not match the word index.");
}
if (snapshot.synset_count !== Object.keys(snapshot.synsets).length) {
  throw new Error("Synset count does not match the synset index.");
}

function senses(word: string) {
  const entry = snapshot.words[word.toLowerCase()];
  if (!entry) return [];
  const out: { pos: string; def?: string[]; m?: string[]; a?: string[]; h?: string[] }[] = [];
  for (const [pos, ids] of Object.entries(entry)) {
    for (const id of ids) {
      const synset = snapshot.synsets[id];
      if (synset) out.push({ pos, def: synset.d, m: synset.m, a: synset.a, h: synset.h });
    }
  }
  return out;
}

const bank = senses("bank");
if (bank.length < 3) throw new Error("bank should have multiple senses.");
const bankNoun = bank.find(
  (sense) => (sense.def ?? []).some((d) => d.includes("financial")),
);
if (!bankNoun) throw new Error("bank should have a financial-institution sense.");
if (!(bankNoun.m ?? []).some((w) => w.toLowerCase() !== "bank")) {
  throw new Error("bank should have synonyms beyond itself.");
}

for (const word of ["run", "happy", "color", "courageous"]) {
  if (!senses(word).length) throw new Error(`${word} should resolve to senses.`);
}

const synsetIds = Object.keys(snapshot.synsets);
for (let i = 0; i < synsetIds.length; i += 500) {
  const id = synsetIds[i];
  const synset = snapshot.synsets[id];
  for (const rel of ["a", "h"] as const) {
    for (const ref of synset[rel] ?? []) {
      if (!snapshot.synsets[ref]) {
        throw new Error(`Dangling ${rel} reference ${ref} from ${id}.`);
      }
    }
  }
}

console.log(
  `Lexicon validated: ${snapshot.word_count} words, ${snapshot.synset_count} synsets, license ${snapshot.license}.`,
);
