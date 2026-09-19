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
type Suite = "correctness" | "negative-control" | "register" | "voice-preservation";
type Classification = "correction" | "suggestion" | "hidden";
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
  suite?: Suite;
  errant?: string;
  classification?: Classification;
  context?: "general" | "professional" | "academic" | "all";
  sourceType?: "authored-test" | "anonymized-real-world" | "research-derived-principle";
  notes?: string;
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
const expansionCorpus = JSON.parse(
  await readFile(
    new URL("../benchmarks/axiom-2-corpus.json", import.meta.url),
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
const allCases = [...corpus, ...expansionCorpus];

type CategoryStat = {
  cases: number;
  expectedFindings: number;
  truePositives: number;
  falseNegatives: number;
  falsePositives: number;
  knownMisses: number;
};
const suiteStats = new Map<string, CategoryStat>();
const categoryStats = new Map<string, CategoryStat>();
const knownMissInventory = new Map<string, { case: string; originalText: string }[]>();
const falsePositiveRows: { case: string; category: string; originalText: string }[] = [];

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
  for (const fixture of allCases) {
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
    const expectedIssues = fixture.expected ?? [];
    const expectedMatches = consumeMatches(evaluatedIssues, expectedIssues);
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
    truePositives += expectedIssues.length - missed.length;
    expectedFindings += expectedIssues.length;
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

    const fpCount = unexpected.length;
    const fnCount = missed.length;
    const tpCount = expectedIssues.length - fnCount;
    const suite = fixture.suite ?? "correctness";
    const suiteStat = suiteStats.get(suite) ?? {
      cases: 0,
      expectedFindings: 0,
      truePositives: 0,
      falseNegatives: 0,
      falsePositives: 0,
      knownMisses: 0,
    };
    suiteStat.cases += 1;
    suiteStat.expectedFindings += expectedIssues.length;
    suiteStat.truePositives += tpCount;
    suiteStat.falseNegatives += fnCount;
    suiteStat.falsePositives += fpCount;
    suiteStat.knownMisses += knownMissMatches.missed.length;
    suiteStats.set(suite, suiteStat);

    if (fixture.errant) {
      const catStat = categoryStats.get(fixture.errant) ?? {
        cases: 0,
        expectedFindings: 0,
        truePositives: 0,
        falseNegatives: 0,
        falsePositives: 0,
        knownMisses: 0,
      };
      catStat.cases += 1;
      catStat.expectedFindings += expectedIssues.length;
      catStat.truePositives += tpCount;
      catStat.falseNegatives += fnCount;
      catStat.falsePositives += fpCount;
      catStat.knownMisses += knownMissMatches.missed.length;
      categoryStats.set(fixture.errant, catStat);
    }

    for (const missedExpected of knownMissMatches.missed) {
      const bucket = knownMissInventory.get(fixture.errant ?? "OTHER") ?? [];
      bucket.push({ case: fixture.id, originalText: missedExpected.originalText });
      knownMissInventory.set(fixture.errant ?? "OTHER", bucket);
    }
    for (const fp of unexpected) {
      falsePositiveRows.push({
        case: fixture.id,
        category: fixture.errant ?? "OTHER",
        originalText: fp.originalText,
      });
    }
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

function precision(tp: number, fp: number) {
  const denominator = tp + fp;
  return denominator === 0 ? 1 : Number((tp / denominator).toFixed(4));
}
function recall(tp: number, fn: number) {
  const denominator = tp + fn;
  return denominator === 0 ? 1 : Number((tp / denominator).toFixed(4));
}
function f05(p: number, r: number) {
  const denominator = 0.25 * p + r;
  return denominator === 0 ? 1 : Number(((1.25 * p * r) / denominator).toFixed(4));
}

const overallPrecision = precision(truePositives, falsePositives);
const overallRecall = recall(truePositives, misses);
const overallF05 = f05(overallPrecision, overallRecall);

const suiteReport = Object.fromEntries(
  [...suiteStats.entries()].map(([suite, stat]) => [
    suite,
    {
      cases: stat.cases,
      expectedFindings: stat.expectedFindings,
      truePositives: stat.truePositives,
      falseNegatives: stat.falseNegatives,
      falsePositives: stat.falsePositives,
      knownMisses: stat.knownMisses,
      precision: precision(stat.truePositives, stat.falsePositives),
      recall: recall(stat.truePositives, stat.falseNegatives),
      f05: f05(
        precision(stat.truePositives, stat.falsePositives),
        recall(stat.truePositives, stat.falseNegatives),
      ),
    },
  ]),
);

const categoryReport = Object.fromEntries(
  [...categoryStats.entries()].map(([category, stat]) => [
    category,
    {
      cases: stat.cases,
      positives: stat.expectedFindings,
      truePositives: stat.truePositives,
      falseNegatives: stat.falseNegatives,
      falsePositives: stat.falsePositives,
      knownMisses: stat.knownMisses,
      precision: precision(stat.truePositives, stat.falsePositives),
      recall: recall(stat.truePositives, stat.falseNegatives),
      f05: f05(
        precision(stat.truePositives, stat.falsePositives),
        recall(stat.truePositives, stat.falseNegatives),
      ),
    },
  ]),
);

const knownMissReport = Object.fromEntries(
  [...knownMissInventory.entries()].map(([category, items]) => [category, items]),
);

const summary = {
  cases: allCases.length,
  legacyCases: corpus.length,
  expansionCases: expansionCorpus.length,
  expectedFindings,
  truePositives,
  falsePositives,
  falseNegatives: misses,
  precision: overallPrecision,
  recall: overallRecall,
  f05: overallF05,
  protectedSpanFailures,
  mappingFailures,
  knownLimitations,
  knownMisses,
  initializationMs: Number(initializationMs.toFixed(1)),
  warmP50Ms: sortedTimes[Math.floor(sortedTimes.length * 0.5)],
  warmP95Ms: sortedTimes[Math.floor(sortedTimes.length * 0.95)],
  warmMaxMs: sortedTimes.at(-1),
  suites: suiteReport,
  categories: categoryReport,
  knownMissInventory: knownMissReport,
  falsePositiveRows,
};

console.log("\n=== AXIOM Evaluation Summary ===");
console.log(
  `Overall: ${allCases.length} cases, ${expectedFindings} required findings, TP ${truePositives}, FP ${falsePositives}, FN ${misses}`,
);
console.log(
  `Precision ${overallPrecision}  Recall ${overallRecall}  F0.5 ${overallF05}`,
);
console.log(`Known misses ${knownMisses}, known limitations ${knownLimitations}, protected failures ${protectedSpanFailures}, mapping failures ${mappingFailures}`);
console.log("\n=== Suite distribution ===");
console.table(suiteReport);
console.log("=== Category distribution ===");
console.table(categoryReport);
if (falsePositiveRows.length > 0) {
  console.log("=== False positives (each is a defect) ===");
  console.table(falsePositiveRows);
}
console.log(
  JSON.stringify(summary, null, 2),
);
assert.ok(allCases.length >= 180);
assert.equal(falsePositives, 0);
assert.equal(misses, 0);
assert.equal(protectedSpanFailures, 0);
assert.equal(mappingFailures, 0);
