import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { analyzeClarity } from "../src/clarity/clarity.ts";
import type { WritingProfile } from "../src/axiom/axiom.ts";

type Case = {
  id: string;
  text: string;
  profile: WritingProfile;
  expected: string[];
};

const cases = JSON.parse(
  await readFile(
    new URL("../benchmarks/clarity-corpus.json", import.meta.url),
    "utf8",
  ),
) as Case[];

let falsePositives = 0;
let misses = 0;
const unexpected: string[] = [];
const missed: string[] = [];

for (const testCase of cases) {
  const findings = analyzeClarity(testCase.text, testCase.profile);
  const foundCategories = new Set(findings.map((f) => f.category));
  for (const expected of testCase.expected) {
    if (!foundCategories.has(expected as never)) {
      misses += 1;
      missed.push(`${testCase.id}: missing ${expected}`);
    }
  }
  for (const category of foundCategories) {
    if (!testCase.expected.includes(category)) {
      falsePositives += 1;
      unexpected.push(`${testCase.id}: unexpected ${category}`);
    }
  }
}

assert.equal(misses, 0, `Clarity misses:\n${missed.join("\n")}`);
assert.equal(
  falsePositives,
  0,
  `Clarity false positives:\n${unexpected.join("\n")}`,
);
console.log(
  `Clarity corpus verified: ${cases.length} cases, zero false positives, zero misses.`,
);
