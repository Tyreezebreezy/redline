import { readFileSync } from "node:fs";
import { createHarperProbe } from "./harper-probe.mts";

type Case = { word: string; category: string; kind: "valid" | "invalid" };
const corpus = JSON.parse(
  readFileSync("probes/axiom-reference/lexical-corpus.json", "utf8"),
) as { cases: Case[] };

function loadSet(file: string): Set<string> {
  return new Set(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((w) => w.toLowerCase()),
  );
}

const esdb60 = loadSet("probes/axiom-reference/esdb/data/en_US.txt");
const esdb70 = loadSet("probes/axiom-reference/esdb/data/en_US-large.txt");

const probe = await createHarperProbe();

type EngineResult = { correct: number; total: number; pct: number };
const byCategory = new Map<string, { harper: EngineResult; esdb60: EngineResult; esdb70: EngineResult }>();

function bump(
  cat: string,
  engine: "harper" | "esdb60" | "esdb70",
  correct: boolean,
) {
  const entry = byCategory.get(cat) ?? {
    harper: { correct: 0, total: 0, pct: 0 },
    esdb60: { correct: 0, total: 0, pct: 0 },
    esdb70: { correct: 0, total: 0, pct: 0 },
  };
  const r = entry[engine];
  r.total += 1;
  if (correct) r.correct += 1;
  byCategory.set(cat, entry);
}

for (const c of corpus.cases) {
  const harperKnown = await probe.known(c.word);
  const in60 = esdb60.has(c.word.toLowerCase());
  const in70 = esdb70.has(c.word.toLowerCase());

  const shouldAccept = c.kind === "valid";
  bump(c.category, "harper", shouldAccept ? harperKnown : !harperKnown);
  bump(c.category, "esdb60", shouldAccept ? in60 : !in60);
  bump(c.category, "esdb70", shouldAccept ? in70 : !in70);
}

await probe.dispose();

function pct(r: EngineResult) {
  r.pct = Number(((r.correct / r.total) * 100).toFixed(1));
  return `${r.correct}/${r.total} (${r.pct}%)`;
}

console.log("Category | Harper | ESDB-60 | ESDB-70");
console.log("--- | --- | --- | ---");
for (const [cat, r] of byCategory) {
  console.log(`${cat} | ${pct(r.harper)} | ${pct(r.esdb60)} | ${pct(r.esdb70)}`);
}

// overall
function overall(key: "harper" | "esdb60" | "esdb70") {
  let correct = 0;
  let total = 0;
  for (const r of byCategory.values()) {
    correct += r[key].correct;
    total += r[key].total;
  }
  return `${correct}/${total} (${Number(((correct / total) * 100).toFixed(1))}%)`;
}
console.log("---");
console.log(`OVERALL | ${overall("harper")} | ${overall("esdb60")} | ${overall("esdb70")}`);
