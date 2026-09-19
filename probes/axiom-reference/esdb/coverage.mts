import { readFileSync, writeFileSync } from "node:fs";
import { createHarperProbe } from "../harper-probe.mts";

type Result = {
  file: string;
  totalLines: number;
  capitalized: number;
  lowercaseUnique: number;
  flagged: number;
  coveragePct: number;
  elapsedMs: number;
};

function loadLowercase(file: string): string[] {
  return [
    ...new Set(
      readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).filter((w) => /^[a-z]/.test(w)),
    ),
  ];
}

async function coverage(file: string, probe: Awaited<ReturnType<typeof createHarperProbe>>) {
  const all = readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
  const words = loadLowercase(file);
  const flagged: string[] = [];
  const t0 = performance.now();
  for (const word of words) {
    if (!(await probe.known(word))) flagged.push(word);
  }
  const elapsedMs = performance.now() - t0;
  const result: Result = {
    file,
    totalLines: all.length,
    capitalized: all.filter((w) => /^[A-Z]/.test(w)).length,
    lowercaseUnique: words.length,
    flagged: flagged.length,
    coveragePct: Number((((words.length - flagged.length) / words.length) * 100).toFixed(2)),
    elapsedMs: Math.round(elapsedMs),
  };
  return { result, flagged };
}

const probe = await createHarperProbe();
const dataDir = "probes/axiom-reference/esdb/data/";

const results: Result[] = [];
const missesByFile: Record<string, string[]> = {};

for (const file of ["en_US.txt", "en_US-large.txt"]) {
  console.log(`Checking ${file} ...`);
  const { result, flagged } = await coverage(`${dataDir}${file}`, probe);
  results.push(result);
  missesByFile[file] = flagged.sort();
  writeFileSync(
    `${dataDir}harper-misses-${file}`,
    flagged.sort().join("\n") + "\n",
  );
  console.log(JSON.stringify(result));
}

// dialect: how many en_GB-ise words (lowercased) are NOT flagged by American Harper?
{
  const gbWords = loadLowercase(`${dataDir}en_GB-ise.txt`);
  const usWords = new Set(loadLowercase(`${dataDir}en_US.txt`));
  const gbOnly = gbWords.filter((w) => !usWords.has(w));
  const flaggedGbOnly: string[] = [];
  for (const w of gbOnly) {
    if (!(await probe.known(w))) flaggedGbOnly.push(w);
  }
  console.log(
    JSON.stringify({
      dialect: "en_GB-ise lowercase tokens not in en_US",
      gbOnlyCount: gbOnly.length,
      flaggedByAmericanHarper: flaggedGbOnly.length,
      flaggedPct: Number(((flaggedGbOnly.length / gbOnly.length) * 100).toFixed(2)),
    }),
  );
  writeFileSync(
    `${dataDir}gb-only-flagged-by-american.txt`,
    flaggedGbOnly.join("\n") + "\n",
  );
}

writeFileSync(
  "probes/axiom-reference/esdb/coverage-results.json",
  JSON.stringify({ results, missCounts: Object.fromEntries(Object.entries(missesByFile).map(([k, v]) => [k, v.length])) }, null, 2),
);

await probe.dispose();
