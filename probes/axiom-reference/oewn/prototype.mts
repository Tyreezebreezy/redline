import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = "probes/axiom-reference/oewn/data/json";
const files = readdirSync(dir);

const entryFiles = files.filter((f) => /^entries-[a-z0-9]\.json$/.test(f));
const synsetFiles = files.filter((f) => !/^entries-/.test(f) && f !== "frames.json");

let rawBytes = 0;
for (const f of files) rawBytes += readFileSync(join(dir, f)).length;

type Sense = { id: string; synset: string; antonym?: string[]; derivation?: string[]; [k: string]: unknown };
type Entry = Record<string, { sense: Sense[]; pronunciation?: unknown }>;
type Synset = { definition: string[]; partOfSpeech: string; members: string[]; [k: string]: unknown };

const tLoad = performance.now();
const entries = new Map<string, Entry>();
let senseCount = 0;
for (const f of entryFiles) {
  const obj = JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, Entry>;
  for (const [word, entry] of Object.entries(obj)) {
    for (const pos of Object.keys(entry)) {
      senseCount += entry[pos]?.sense?.length ?? 0;
    }
    entries.set(word, entry);
  }
}

const synsets = new Map<string, Synset>();
let relationCount = 0;
const RELATION_KEYS = new Set([
  "antonym", "hypernym", "hyponym", "holo_member", "holo_part", "holo_substance",
  "mero_member", "mero_part", "mero_substance", "derivation", "domain_topic",
  "domain_region", "domain_usage", "also", "similar", "entails", "causes",
  "instance_hypernym", "instance_hyponym", "member_holonym", "member_meronym",
  "part_holonym", "part_meronym", "substance_holonym", "substance_meronym",
  "pertainym", "region_domain", "topic_domain", "usage_domain", "attribute",
]);
for (const f of synsetFiles) {
  const obj = JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, Synset>;
  for (const [id, synset] of Object.entries(obj)) {
    synsets.set(id, synset);
    for (const [k, v] of Object.entries(synset)) {
      if (RELATION_KEYS.has(k) && Array.isArray(v)) relationCount += v.length;
    }
  }
}
const tLoaded = performance.now();

const before = process.memoryUsage().heapUsed;

function lookup(word: string) {
  const entry = entries.get(word);
  if (!entry) return null;
  const result: Record<string, { definition: string[]; members: string[]; relations: Record<string, string[]> }[]> = {};
  for (const [pos, e] of Object.entries(entry)) {
    result[pos] = (e.sense ?? []).map((s) => {
      const syn = synsets.get(s.synset);
      const relations: Record<string, string[]> = {};
      if (syn) {
        for (const k of RELATION_KEYS) {
          const v = syn[k];
          if (Array.isArray(v)) relations[k] = v as string[];
        }
      }
      return {
        definition: syn?.definition ?? [],
        members: syn?.members ?? [],
        relations,
      };
    });
  }
  return result;
}

// sample lookups + latency
const samples = ["bank", "run", "happy", "quickly", "mouse", "set", "virus", "love", "bad", "right", "light", "quokka"];
for (const w of samples) {
  const r = lookup(w);
  const posSummary = r ? Object.entries(r).map(([p, senses]) => `${p}:${senses.length}`).join(" ") : "NOT FOUND";
  console.log(`${w} -> ${posSummary}`);
}

// latency: 1000 lookups of "bank"
const t0 = performance.now();
for (let i = 0; i < 1000; i++) lookup("bank");
const t1 = performance.now();
const after = process.memoryUsage().heapUsed;

console.log("\n=== OEWN 2025 measurements ===");
console.log(`raw JSON files: ${files.length}, total bytes: ${rawBytes} (${(rawBytes / 1e6).toFixed(1)} MB)`);
console.log(`entries (lemmas): ${entries.size}`);
console.log(`senses: ${senseCount}`);
console.log(`synsets: ${synsets.size}`);
console.log(`relations (indexed): ${relationCount}`);
console.log(`load+parse time: ${(tLoaded - tLoad).toFixed(0)} ms`);
console.log(`lookup "bank" x1000: ${(t1 - t0).toFixed(1)} ms total, ${((t1 - t0) / 1000).toFixed(3)} ms/lookup`);
console.log(`heap delta (before lookups): ${((after - before) / 1e6).toFixed(1)} MB`);

// compact snapshot: word -> {pos -> [synset ids]} only (drop definitions/relations)
const compact: Record<string, Record<string, string[]>> = {};
for (const [word, entry] of entries) {
  const c: Record<string, string[]> = {};
  for (const [pos, e] of Object.entries(entry)) {
    c[pos] = (e.sense ?? []).map((s) => s.synset);
  }
  compact[word] = c;
}
const compactJson = JSON.stringify(compact);
console.log(`compact snapshot (word->pos->synset ids) JSON: ${(compactJson.length / 1e6).toFixed(1)} MB`);

// with definitions inlined
const compactDef: Record<string, Record<string, { d: string[]; s: string }[]>> = {};
for (const [word, entry] of entries) {
  const c: Record<string, { d: string[]; s: string }[]> = {};
  for (const [pos, e] of Object.entries(entry)) {
    c[pos] = (e.sense ?? []).map((s) => ({ d: synsets.get(s.synset)?.definition ?? [], s: s.synset }));
  }
  compactDef[word] = c;
}
const compactDefJson = JSON.stringify(compactDef);
console.log(`compact snapshot (word->pos->[{definition,synset}]) JSON: ${(compactDefJson.length / 1e6).toFixed(1)} MB`);
