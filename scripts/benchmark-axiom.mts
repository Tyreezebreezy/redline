import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Editor } from "@tiptap/react";
import { Dialect, LocalLinter } from "harper.js";
import { binaryInlined } from "harper.js/binaryInlined";
import {
  type AxiomIssue,
  analyzeText,
  findProtectedSpans,
  normalizeDictionaryTerm,
  PROFILE_RULE_OVERRIDES,
  type WritingProfile,
} from "../src/axiom/axiom.ts";
import { analyzeWithHarper } from "../src/axiom/HarperAdapter.ts";
import {
  isIgnoredIssue,
  mapIssue,
  projectDocument,
} from "../src/axiom/projection.ts";
import { EDITOR_EXTENSIONS } from "../src/editor.ts";

type ExpectedIssue = {
  originalText: string;
  category?: string;
  ruleId?: string;
};
type Case = {
  audit?: "redundant-that-false-positive" | "redundant-that-true-positive";
  id: string;
  text: string;
  expected: ExpectedIssue[];
  knownLimitations?: ExpectedIssue[];
  knownMisses?: ExpectedIssue[];
  dictionary?: string[];
  ignore?: { occurrence: number; originalText: string };
  profile?: WritingProfile;
  protected?: boolean;
  protectedSpans?: number;
};
type Row = {
  case: string;
  issues: string[];
  knownLimitations: string[];
  knownMisses: string[];
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
const defaultConfig = await linter.getDefaultLintConfig();
let falsePositives = 0;
let misses = 0;
let truePositives = 0;
let expectedFindings = 0;
let protectedSpanFailures = 0;
let mappingFailures = 0;
let knownLimitations = 0;
let knownMisses = 0;
const rows: Row[] = [];
const warmTimes: number[] = [];
const performanceRows: object[] = [];

function matches(issue: AxiomIssue, expected: ExpectedIssue) {
  return (
    expected.originalText === issue.originalText &&
    (!expected.category || expected.category === issue.category) &&
    (!expected.ruleId || expected.ruleId === issue.ruleId)
  );
}

function consumeMatches(issues: AxiomIssue[], expected: ExpectedIssue[]) {
  const remaining = [...issues];
  const missed: ExpectedIssue[] = [];
  for (const item of expected) {
    const index = remaining.findIndex((issue) => matches(issue, item));
    if (index < 0) missed.push(item);
    else remaining.splice(index, 1);
  }
  return { missed, remaining };
}

try {
  for (const fixture of corpus) {
    const caseStarted = performance.now();
    const profile = fixture.profile ?? "general";
    await linter.setLintConfig({
      ...defaultConfig,
      ...PROFILE_RULE_OVERRIDES[profile],
    });
    const issues = await analyzeText(
      fixture.text,
      {
        analyze: (text) => analyzeWithHarper(linter, text),
      },
      {
        dictionary: new Set(
          (fixture.dictionary ?? []).map(normalizeDictionaryTerm),
        ),
        profile,
      },
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
    const mapped = issues.map((issue) => mapIssue(projection, issue));
    const failedMappings = mapped.filter((issue) => issue === null).length;
    let evaluatedIssues = mapped.filter((issue) => issue !== null);
    if (fixture.ignore) {
      const matches = evaluatedIssues.filter(
        ({ originalText }) => originalText === fixture.ignore?.originalText,
      );
      const ignored = matches[fixture.ignore.occurrence];
      assert.ok(ignored, `Missing ignored issue in ${fixture.id}`);
      evaluatedIssues = evaluatedIssues.filter(
        (issue) => !isIgnoredIssue(issue, [ignored]),
      );
    }
    const expectedMatches = consumeMatches(evaluatedIssues, fixture.expected);
    const knownMissMatches = consumeMatches(
      expectedMatches.remaining,
      fixture.knownMisses ?? [],
    );
    const knownMatches = consumeMatches(
      knownMissMatches.remaining,
      fixture.knownLimitations ?? [],
    );
    const unexpected = knownMatches.remaining;
    const missed = expectedMatches.missed;
    const observedKnown =
      (fixture.knownLimitations?.length ?? 0) - knownMatches.missed.length;
    editor.destroy();
    const spanCountFailure =
      fixture.protectedSpans === undefined
        ? 0
        : Number(
            findProtectedSpans(fixture.text).length !== fixture.protectedSpans,
          );
    const protectedFailures =
      (fixture.protected ? evaluatedIssues.length : 0) + spanCountFailure;
    falsePositives += unexpected.length;
    misses += missed.length;
    truePositives += fixture.expected.length - missed.length;
    expectedFindings += fixture.expected.length;
    protectedSpanFailures += protectedFailures;
    mappingFailures += failedMappings;
    knownLimitations += observedKnown;
    knownMisses += knownMissMatches.missed.length;
    const elapsed = Number((performance.now() - caseStarted).toFixed(1));
    warmTimes.push(elapsed);
    rows.push({
      case: fixture.id,
      issues: evaluatedIssues.map(
        (issue) =>
          `${issue.originalText}: ${issue.message} [${issue.ruleId ?? "unknown"}]`,
      ),
      mappingFailures: failedMappings,
      knownLimitations: (fixture.knownLimitations ?? [])
        .filter((expected) => !knownMatches.missed.includes(expected))
        .map(
          (expected) =>
            `${expected.originalText} [${expected.ruleId ?? "any"}]`,
        ),
      knownMisses: knownMissMatches.missed.map(
        (expected) => `${expected.originalText} [${expected.ruleId ?? "any"}]`,
      ),
      unexpected: unexpected.map((issue) => issue.originalText),
      missed: missed.map((issue) => issue.originalText),
      ms: elapsed,
      protectedFailures,
    });
  }

  const redundantThatCases = corpus.filter(({ audit }) => audit);
  const enabledAudit = { falsePositives: 0, truePositives: 0 };
  for (const fixture of redundantThatCases) {
    const issues = await analyzeWithHarper(linter, fixture.text);
    const hits = issues.filter(
      ({ ruleId }) => ruleId === "RedundantThat",
    ).length;
    if (fixture.audit === "redundant-that-false-positive") {
      enabledAudit.falsePositives += hits;
    } else {
      enabledAudit.truePositives += hits;
    }
  }
  await linter.setLintConfig({ ...defaultConfig, RedundantThat: false });
  const disabledAudit = {
    falsePositives: 0,
    residualFalsePositives: 0,
    truePositives: 0,
  };
  for (const fixture of redundantThatCases) {
    const issues = await analyzeWithHarper(linter, fixture.text);
    const hits = issues.filter(
      ({ ruleId }) => ruleId === "RedundantThat",
    ).length;
    if (fixture.audit === "redundant-that-false-positive") {
      disabledAudit.falsePositives += hits;
      disabledAudit.residualFalsePositives += issues.length;
    } else {
      disabledAudit.truePositives += hits;
    }
  }
  console.log(
    JSON.stringify(
      {
        redundantThatAudit: { disabled: disabledAudit, enabled: enabledAudit },
      },
      null,
      2,
    ),
  );
  await linter.setLintConfig(defaultConfig);

  const cleanSentence =
    "The revised report is complete and the team reviewed it.";
  const issueSentence = "This is a unusual result and the team reviewed it.";
  for (const [name, words] of [
    ["short", 100],
    ["one-thousand-words", 1_000],
    ["five-thousand-words", 5_000],
    ["ten-thousand-words", 10_000],
  ] as const) {
    const paragraphs = Math.max(1, words / 100);
    const content = Array.from({ length: paragraphs }, () =>
      Array.from({ length: 10 }, (_, index) =>
        index === 0 ? issueSentence : cleanSentence,
      ).join(" "),
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
    await linter.setLintConfig(defaultConfig);
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
      paragraphs: content.length,
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
      knownLimitations,
      knownMisses,
      initializationMs: Number(initializationMs.toFixed(1)),
      warmP50Ms: sortedTimes[Math.floor(sortedTimes.length * 0.5)],
      warmP95Ms: sortedTimes[Math.floor(sortedTimes.length * 0.95)],
      warmMaxMs: sortedTimes.at(-1),
    },
    null,
    2,
  ),
);
assert.ok(corpus.length >= 180);
assert.equal(falsePositives, 0);
assert.equal(misses, 0);
assert.equal(protectedSpanFailures, 0);
assert.equal(mappingFailures, 0);
