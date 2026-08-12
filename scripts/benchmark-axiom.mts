import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Dialect, LocalLinter } from "harper.js";
import { binaryInlined } from "harper.js/binaryInlined";
import { analyzeText } from "../src/axiom/axiom.ts";
import { analyzeWithHarper } from "../src/axiom/HarperAdapter.ts";

type ExpectedIssue = { originalText: string; category?: string };
type Case = { id: string; text: string; expected: ExpectedIssue[] };

const corpus = JSON.parse(
  await readFile(
    new URL("../benchmarks/axiom-corpus.json", import.meta.url),
    "utf8",
  ),
) as Case[];
const linter = new LocalLinter({
  binary: binaryInlined,
  dialect: Dialect.American,
});
const started = performance.now();
await linter.setup();
const initializationMs = performance.now() - started;
let falsePositives = 0;
let misses = 0;
const rows: object[] = [];

try {
  for (const fixture of corpus) {
    const caseStarted = performance.now();
    const issues = await analyzeText(fixture.text, {
      analyze: (text) => analyzeWithHarper(linter, text),
    });
    const unexpected = issues.filter(
      (issue) =>
        !fixture.expected.some(
          (expected) =>
            expected.originalText === issue.originalText &&
            (!expected.category || expected.category === issue.category),
        ),
    );
    const missed = fixture.expected.filter(
      (expected) =>
        !issues.some(
          (issue) =>
            expected.originalText === issue.originalText &&
            (!expected.category || expected.category === issue.category),
        ),
    );
    falsePositives += unexpected.length;
    misses += missed.length;
    rows.push({
      case: fixture.id,
      issues: issues.map((issue) => `${issue.originalText}: ${issue.message}`),
      unexpected: unexpected.map((issue) => issue.originalText),
      missed: missed.map((issue) => issue.originalText),
      ms: Number((performance.now() - caseStarted).toFixed(1)),
    });
  }
} finally {
  await linter.dispose();
}

console.table(rows);
console.log(
  JSON.stringify(
    {
      cases: corpus.length,
      falsePositives,
      misses,
      initializationMs: Number(initializationMs.toFixed(1)),
    },
    null,
    2,
  ),
);
assert.equal(
  findTechnicalIntegrityFailure(rows),
  false,
  "Protected technical content produced a finding.",
);

function findTechnicalIntegrityFailure(results: object[]) {
  const technical = results.find(
    (row) => (row as { case?: string }).case === "technical-protected",
  ) as { issues?: string[] } | undefined;
  return Boolean(technical?.issues?.length);
}
