import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Editor } from "@tiptap/react";
import { Dialect, LocalLinter } from "harper.js";
import { binaryInlined } from "harper.js/binaryInlined";
import { analyzeText } from "../src/axiom/axiom.ts";
import { analyzeWithHarper } from "../src/axiom/HarperAdapter.ts";
import { mapIssue, projectDocument } from "../src/axiom/projection.ts";
import { EDITOR_EXTENSIONS } from "../src/editor.ts";

type ExpectedIssue = { originalText: string; category?: string };
type Case = {
  id: string;
  text: string;
  expected: ExpectedIssue[];
  protected?: boolean;
};
type Row = {
  case: string;
  issues: string[];
  mappingFailures: number;
  missed: string[];
  ms: number;
  protectedFailures: number;
  unexpected: string[];
};

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
let truePositives = 0;
let expectedFindings = 0;
let protectedSpanFailures = 0;
let mappingFailures = 0;
const rows: Row[] = [];
const warmTimes: number[] = [];
const performanceRows: object[] = [];

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
    const editor = new Editor({
      element: null,
      extensions: EDITOR_EXTENSIONS,
      content: {
        type: "doc",
        content: fixture.text.split("\n").map((text) => ({
          type: "paragraph",
          content: text ? [{ type: "text", text }] : undefined,
        })),
      },
    });
    const projection = projectDocument(editor.state.doc);
    const failedMappings = issues.filter(
      (issue) => mapIssue(projection, issue) === null,
    ).length;
    editor.destroy();
    const protectedFailures = fixture.protected ? issues.length : 0;
    falsePositives += unexpected.length;
    misses += missed.length;
    truePositives += fixture.expected.length - missed.length;
    expectedFindings += fixture.expected.length;
    protectedSpanFailures += protectedFailures;
    mappingFailures += failedMappings;
    const elapsed = Number((performance.now() - caseStarted).toFixed(1));
    warmTimes.push(elapsed);
    rows.push({
      case: fixture.id,
      issues: issues.map(
        (issue) =>
          `${issue.originalText}: ${issue.message} [${issue.ruleId ?? "unknown"}]`,
      ),
      mappingFailures: failedMappings,
      unexpected: unexpected.map((issue) => issue.originalText),
      missed: missed.map((issue) => issue.originalText),
      ms: elapsed,
      protectedFailures,
    });
  }

  for (const [name, paragraphs] of [
    ["short", 1],
    ["medium", 30],
    ["long", 150],
  ] as const) {
    const content = Array.from({ length: paragraphs }, (_, index) =>
      index === paragraphs - 1
        ? "This is a unusual result that requires review."
        : "The revised report is complete, and the team has reviewed it carefully.",
    );
    const performanceEditor = new Editor({
      element: null,
      extensions: EDITOR_EXTENSIONS,
      content: {
        type: "doc",
        content: content.map((text) => ({
          type: "paragraph",
          content: [{ type: "text", text }],
        })),
      },
    });
    const projectionStarted = performance.now();
    const performanceProjection = projectDocument(performanceEditor.state.doc);
    const projectionMs = performance.now() - projectionStarted;
    const analysisStarted = performance.now();
    const performanceIssues = await analyzeText(performanceProjection.text, {
      analyze: (text) => analyzeWithHarper(linter, text),
    });
    const analysisMs = performance.now() - analysisStarted;
    const mappingStarted = performance.now();
    const performanceMappings = performanceIssues.map((issue) =>
      mapIssue(performanceProjection, issue),
    );
    const mappingMs = performance.now() - mappingStarted;
    performanceRows.push({
      document: name,
      characters: performanceProjection.text.length,
      paragraphs,
      issues: performanceIssues.length,
      projectionMs: Number(projectionMs.toFixed(2)),
      analysisMs: Number(analysisMs.toFixed(1)),
      mappingMs: Number(mappingMs.toFixed(2)),
      mappingFailures: performanceMappings.filter((issue) => issue === null)
        .length,
    });
    performanceEditor.destroy();
  }
} finally {
  await linter.dispose();
}

console.table(rows);
console.table(performanceRows);
const sortedTimes = warmTimes.toSorted((left, right) => left - right);
console.log(
  JSON.stringify(
    {
      cases: corpus.length,
      expectedFindings,
      truePositives,
      falsePositives,
      misses,
      protectedSpanFailures,
      mappingFailures,
      initializationMs: Number(initializationMs.toFixed(1)),
      warmP50Ms: sortedTimes[Math.floor(sortedTimes.length * 0.5)],
      warmP95Ms: sortedTimes[Math.floor(sortedTimes.length * 0.95)],
      warmMaxMs: sortedTimes.at(-1),
    },
    null,
    2,
  ),
);
assert.equal(corpus.length, 90);
assert.equal(falsePositives, 0);
assert.equal(misses, 0);
assert.equal(protectedSpanFailures, 0);
assert.equal(mappingFailures, 0);
