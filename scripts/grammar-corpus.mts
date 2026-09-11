import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
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

const TAXONOMY = [
  "SPELL",
  "ORTH",
  "NOUN",
  "NOUN:NUM",
  "VERB",
  "VERB:FORM",
  "VERB:SVA",
  "VERB:TENSE",
  "ADJ",
  "ADV",
  "DET",
  "PREP",
  "PRON",
  "CONJ",
  "PUNCT",
  "WO",
  "MORPH",
  "OTHER",
] as const;
const PRODUCT_CLASSES = [
  "CanonicalTerm",
  "ProtectedSpan",
  "SentenceBoundary",
  "ContextualWrongWord",
  "Terminology",
] as const;
const SOURCE_KINDS = [
  "Real User",
  "REDLINE Corpus",
  "Harper",
  "External Corpus",
  "Synthetic Control",
] as const;
const REDISTRIBUTION = [
  "allowed",
  "restricted",
  "forbidden",
  "unknown",
] as const;
const STATUSES = [
  "PASS",
  "MISS",
  "FALSE POSITIVE",
  "KNOWN MISS",
  "KNOWN LIMITATION",
  "PROTECTED",
  "MAPPING FAILURE",
] as const;

type TaxonomyCategory = (typeof TAXONOMY)[number];
type ProductClass = (typeof PRODUCT_CLASSES)[number];
type SourceKind = (typeof SOURCE_KINDS)[number];
type Redistribution = (typeof REDISTRIBUTION)[number];
type Status = (typeof STATUSES)[number];

type ExpectedIssue = {
  originalText: string;
  category?: string;
  ruleId?: string;
  from?: number;
  to?: number;
  replacement?: string;
};

type CorpusCase = {
  id: string;
  source: SourceKind;
  source_id: string;
  source_case_id: string;
  license: string;
  category: TaxonomyCategory;
  subcategory?: ProductClass;
  original: string;
  corrected?: string;
  expected: ExpectedIssue[];
  rule_id?: string;
  should_warn: boolean;
  expected_span?: { from: number; to: number };
  expected_replacement?: string;
  tags: string[];
  notes?: string;
  redistribution: Redistribution;
  provenance: string[];
  benchmark_status:
    | "required"
    | "control"
    | "known-miss"
    | "known-limitation"
    | "protected";
  knownLimitations?: ExpectedIssue[];
  knownMisses?: ExpectedIssue[];
  dictionary?: string[];
  ignore?: { occurrence: number; originalText: string };
  profile?: WritingProfile;
  protected?: boolean;
  protectedSpans?: number;
};

type NativeCase = {
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

type SourceManifest = {
  id: string;
  source: SourceKind;
  project: string;
  version: string;
  author: string;
  license: string;
  retrieval_date: string;
  source_url: string;
  redistribution: Redistribution;
  bundled_with_application: boolean;
  development_only: boolean;
  import_policy: string;
  notes?: string;
};

type EvaluationRow = {
  id: string;
  source: SourceKind;
  category: TaxonomyCategory;
  status: Status;
  expected: ExpectedIssue[];
  actual: Array<{
    rule_id?: string;
    category: string;
    from: number;
    to: number;
    editor_from: number;
    editor_to: number;
    original: string;
    replacements: string[];
  }>;
  missed: ExpectedIssue[];
  known_misses: ExpectedIssue[];
  known_limitations: ExpectedIssue[];
  false_positives: string[];
  mapping_failures: number;
  protected_failures: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected non-empty string field: ${key}`);
  }
  return value;
}

function enumValue<T extends readonly string[]>(
  record: Record<string, unknown>,
  key: string,
  values: T,
): T[number] {
  const value = requiredString(record, key);
  if (!values.includes(value)) throw new Error(`Invalid ${key}: ${value}`);
  return value as T[number];
}

function validateManifests(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.sources)) {
    throw new Error("Source manifest must contain a sources array");
  }
  const manifests = value.sources.map((item): SourceManifest => {
    if (!isRecord(item)) throw new Error("Invalid source manifest entry");
    const manifest = {
      id: requiredString(item, "id"),
      source: enumValue(item, "source", SOURCE_KINDS),
      project: requiredString(item, "project"),
      version: requiredString(item, "version"),
      author: requiredString(item, "author"),
      license: requiredString(item, "license"),
      retrieval_date: requiredString(item, "retrieval_date"),
      source_url: requiredString(item, "source_url"),
      redistribution: enumValue(item, "redistribution", REDISTRIBUTION),
      bundled_with_application: item.bundled_with_application,
      development_only: item.development_only,
      import_policy: requiredString(item, "import_policy"),
      notes: typeof item.notes === "string" ? item.notes : undefined,
    };
    if (
      typeof manifest.bundled_with_application !== "boolean" ||
      typeof manifest.development_only !== "boolean"
    ) {
      throw new Error(
        `Manifest ${manifest.id} needs boolean bundle/dev fields`,
      );
    }
    if (manifest.bundled_with_application || !manifest.development_only) {
      throw new Error(
        `Manifest ${manifest.id} violates the dev-only corpus boundary`,
      );
    }
    if (
      manifest.source !== "REDLINE Corpus" &&
      manifest.redistribution === "unknown"
    ) {
      throw new Error(`Manifest ${manifest.id} has unresolved redistribution`);
    }
    return manifest as SourceManifest;
  });
  assert.equal(new Set(manifests.map(({ id }) => id)).size, manifests.length);
  return new Map(manifests.map((manifest) => [manifest.id, manifest]));
}

function taxonomyFor(ruleId?: string, category?: string, id = "") {
  const byRule: Record<string, TaxonomyCategory> = {
    AnA: "DET",
    CanonicalTerm: "ORTH",
    CommaFixes: "PUNCT",
    DiscourseMarkers: "PUNCT",
    IAmAgreement: "VERB:SVA",
    ItsPossessive: "PRON",
    MissingTo: "VERB:FORM",
    NounVerbConfusion: "OTHER",
    PrincipleToPrincipalRoleNoun: "OTHER",
    PronounVerbAgreement: "VERB:SVA",
    RepeatedWords: "OTHER",
    SpellCheck: "SPELL",
    TheirToTheyre: "PRON",
    ThenThan: "OTHER",
    ThereToTheir: "PRON",
    ToLoseTooLoose: "OTHER",
    YourPredicateAdjective: "PRON",
  };
  if (ruleId && byRule[ruleId]) return byRule[ruleId];
  if (category === "spelling") return "SPELL";
  if (category === "punctuation") return "PUNCT";
  if (category === "formatting") return "ORTH";
  if (id.includes("article")) return "DET";
  if (id.includes("agreement")) return "VERB:SVA";
  if (id.includes("word-form-number")) return "NOUN:NUM";
  if (id.includes("word-form")) return "MORPH";
  if (id.includes("missing-verb")) return "VERB";
  if (id.includes("punctuation") || id.includes("apostrophe")) return "PUNCT";
  if (id.includes("spelling")) return "SPELL";
  if (id.includes("subordinate") || id.includes("word-order")) return "WO";
  return "OTHER";
}

function productClass(id: string, ruleId?: string): ProductClass | undefined {
  if (ruleId === "CanonicalTerm" || id.includes("canonical"))
    return "CanonicalTerm";
  if (id.includes("protected") || id.includes("technical"))
    return "ProtectedSpan";
  if (id.includes("word-choice")) return "ContextualWrongWord";
  if (id.includes("boundary")) return "SentenceBoundary";
  return undefined;
}

function normalizeNativeCase(fixture: NativeCase, manifest: SourceManifest) {
  const first =
    fixture.expected[0] ??
    fixture.knownMisses?.[0] ??
    fixture.knownLimitations?.[0];
  const benchmarkStatus = fixture.protected
    ? "protected"
    : fixture.knownMisses?.length
      ? "known-miss"
      : fixture.knownLimitations?.length
        ? "known-limitation"
        : fixture.expected.length
          ? "required"
          : "control";
  return {
    id: fixture.id,
    source: manifest.source,
    source_id: manifest.id,
    source_case_id: fixture.id,
    license: manifest.license,
    category: taxonomyFor(first?.ruleId, first?.category, fixture.id),
    subcategory: productClass(fixture.id, first?.ruleId),
    original: fixture.text,
    expected: fixture.expected,
    rule_id: first?.ruleId,
    should_warn: fixture.expected.length > 0,
    tags: ["fast", benchmarkStatus],
    redistribution: manifest.redistribution,
    provenance: [`benchmarks/axiom-corpus.json#${fixture.id}`],
    benchmark_status: benchmarkStatus,
    knownLimitations: fixture.knownLimitations,
    knownMisses: fixture.knownMisses,
    dictionary: fixture.dictionary,
    ignore: fixture.ignore,
    profile: fixture.profile,
    protected: fixture.protected,
    protectedSpans: fixture.protectedSpans,
  } satisfies CorpusCase;
}

function validateNormalizedCase(
  value: unknown,
  manifests: ReadonlyMap<string, SourceManifest>,
): CorpusCase {
  if (!isRecord(value)) throw new Error("Corpus case must be an object");
  const sourceId = requiredString(value, "source_id");
  const manifest = manifests.get(sourceId);
  if (!manifest) throw new Error(`Missing source manifest: ${sourceId}`);
  if (!Array.isArray(value.expected))
    throw new Error("Expected must be an array");
  const expected = value.expected.map((item): ExpectedIssue => {
    if (!isRecord(item)) throw new Error("Invalid expected issue");
    const originalText = item.originalText;
    if (typeof originalText !== "string") {
      throw new Error("Expected issue originalText must be a string");
    }
    return {
      originalText,
      category: typeof item.category === "string" ? item.category : undefined,
      ruleId: typeof item.ruleId === "string" ? item.ruleId : undefined,
      from: typeof item.from === "number" ? item.from : undefined,
      to: typeof item.to === "number" ? item.to : undefined,
      replacement:
        typeof item.replacement === "string" ? item.replacement : undefined,
    };
  });
  if (
    !Array.isArray(value.tags) ||
    !value.tags.every((tag) => typeof tag === "string")
  ) {
    throw new Error("Tags must be a string array");
  }
  if (
    !Array.isArray(value.provenance) ||
    !value.provenance.every((entry) => typeof entry === "string") ||
    value.provenance.length === 0
  ) {
    throw new Error("Provenance must be a non-empty string array");
  }
  const id = requiredString(value, "id");
  if (requiredString(value, "license") !== manifest.license) {
    throw new Error(`Case ${id} license disagrees with manifest`);
  }
  const source = enumValue(value, "source", SOURCE_KINDS);
  if (source !== manifest.source)
    throw new Error(`Case ${id} source disagrees with manifest`);
  if (
    enumValue(value, "redistribution", REDISTRIBUTION) !==
    manifest.redistribution
  ) {
    throw new Error(`Case ${id} redistribution disagrees with manifest`);
  }
  const benchmarkStatus = enumValue(value, "benchmark_status", [
    "required",
    "control",
    "known-miss",
    "known-limitation",
    "protected",
  ] as const);
  if (typeof value.should_warn !== "boolean")
    throw new Error("should_warn must be boolean");
  if (
    (benchmarkStatus === "required" || benchmarkStatus === "known-miss") !==
    value.should_warn
  ) {
    throw new Error(`Case ${id} should_warn disagrees with benchmark_status`);
  }
  if (
    (benchmarkStatus === "required" ||
      benchmarkStatus === "known-miss" ||
      benchmarkStatus === "known-limitation") &&
    expected.length === 0
  ) {
    throw new Error(`Case ${id} needs at least one expected issue`);
  }
  if (
    (benchmarkStatus === "control" || benchmarkStatus === "protected") &&
    expected.length > 0
  ) {
    throw new Error(
      `Case ${id} cannot attach expected issues to ${benchmarkStatus}`,
    );
  }
  return {
    id,
    source,
    source_id: sourceId,
    source_case_id: requiredString(value, "source_case_id"),
    license: manifest.license,
    category: enumValue(value, "category", TAXONOMY),
    subcategory:
      value.subcategory === undefined
        ? undefined
        : enumValue(value, "subcategory", PRODUCT_CLASSES),
    original: requiredString(value, "original"),
    corrected:
      typeof value.corrected === "string" ? value.corrected : undefined,
    expected: benchmarkStatus === "required" ? expected : [],
    rule_id: typeof value.rule_id === "string" ? value.rule_id : undefined,
    should_warn: value.should_warn,
    expected_span: isRecord(value.expected_span)
      ? {
          from: Number(value.expected_span.from),
          to: Number(value.expected_span.to),
        }
      : undefined,
    expected_replacement:
      typeof value.expected_replacement === "string"
        ? value.expected_replacement
        : undefined,
    tags: value.tags,
    notes: typeof value.notes === "string" ? value.notes : undefined,
    redistribution: manifest.redistribution,
    provenance: value.provenance,
    benchmark_status: benchmarkStatus,
    knownLimitations:
      benchmarkStatus === "known-limitation" ? expected : undefined,
    knownMisses: benchmarkStatus === "known-miss" ? expected : undefined,
    protected: benchmarkStatus === "protected",
  };
}

function parseJsonl(
  text: string,
  manifests: ReadonlyMap<string, SourceManifest>,
) {
  return text.split(/\r?\n/u).flatMap((line, index) => {
    if (!line.trim() || line.trimStart().startsWith("#")) return [];
    try {
      return [validateNormalizedCase(JSON.parse(line), manifests)];
    } catch (error) {
      throw new Error(`JSONL line ${index + 1}: ${String(error)}`);
    }
  });
}

function parseM2(text: string, manifest: SourceManifest) {
  const cases: CorpusCase[] = [];
  const blocks = text.trim().split(/\r?\n\s*\r?\n/u);
  blocks.forEach((block, blockIndex) => {
    const lines = block.split(/\r?\n/u);
    const sentenceLine = lines.find((line) => line.startsWith("S "));
    if (!sentenceLine)
      throw new Error(`M2 block ${blockIndex + 1} lacks S line`);
    const original = sentenceLine.slice(2);
    const tokens = original.split(" ");
    const annotations = new Map<
      string,
      Array<{ start: number; end: number; type: string; replacement: string }>
    >();
    for (const line of lines.filter((item) => item.startsWith("A "))) {
      const fields = line.slice(2).split("|||");
      if (fields.length < 6) throw new Error(`Malformed M2 edit: ${line}`);
      const [startText, endText] = fields[0].split(" ");
      const start = Number(startText);
      const end = Number(endText);
      if (!Number.isInteger(start) || !Number.isInteger(end)) {
        throw new Error(`Invalid M2 span: ${fields[0]}`);
      }
      const annotator = fields.at(-1) ?? "0";
      const edit = {
        start,
        end,
        type: fields[1],
        replacement: fields[2] === "-NONE-" ? "" : fields[2],
      };
      annotations.set(annotator, [...(annotations.get(annotator) ?? []), edit]);
    }
    if (annotations.size === 0) annotations.set("0", []);
    for (const [annotator, edits] of annotations) {
      const realEdits = edits.filter(
        ({ start, end, type }) => start >= 0 && end >= 0 && type !== "noop",
      );
      const corrected = [...tokens];
      for (const edit of realEdits.toSorted(
        (left, right) => right.start - left.start,
      )) {
        if (edit.start > edit.end || edit.end > tokens.length) {
          throw new Error(
            `M2 span outside sentence in block ${blockIndex + 1}`,
          );
        }
        corrected.splice(
          edit.start,
          edit.end - edit.start,
          ...(edit.replacement ? edit.replacement.split(" ") : []),
        );
      }
      const expected = realEdits.map((edit): ExpectedIssue => {
        const from =
          tokens.slice(0, edit.start).join(" ").length + Number(edit.start > 0);
        const originalText = tokens.slice(edit.start, edit.end).join(" ");
        return {
          originalText,
          from,
          to: from + originalText.length,
          replacement: edit.replacement,
        };
      });
      const firstType = realEdits[0]?.type.replace(/^[MRU]:/u, "") ?? "OTHER";
      const category = TAXONOMY.includes(firstType as TaxonomyCategory)
        ? (firstType as TaxonomyCategory)
        : "OTHER";
      cases.push({
        id: `${manifest.id}:${blockIndex + 1}:${annotator}`,
        source: manifest.source,
        source_id: manifest.id,
        source_case_id: `${blockIndex + 1}:${annotator}`,
        license: manifest.license,
        category,
        original,
        corrected: corrected.join(" "),
        expected,
        should_warn: expected.length > 0,
        expected_span:
          expected[0]?.from === undefined
            ? undefined
            : {
                from: expected[0].from,
                to: expected[0].to ?? expected[0].from,
              },
        expected_replacement: expected[0]?.replacement,
        tags: ["external", "m2"],
        redistribution: manifest.redistribution,
        provenance: [`${manifest.source_url}#${blockIndex + 1}:${annotator}`],
        benchmark_status: expected.length > 0 ? "required" : "control",
      });
    }
  });
  return cases;
}

function duplicateKey(fixture: CorpusCase) {
  const normalized = (value: string | undefined) =>
    (value ?? "")
      .normalize("NFC")
      .toLocaleLowerCase("en-US")
      .replace(/\s+/gu, " ")
      .trim();
  return [
    normalized(fixture.original),
    normalized(fixture.corrected),
    fixture.category,
  ].join("\u0000");
}

function deduplicate(cases: CorpusCase[]) {
  const retained = new Map<string, CorpusCase>();
  let duplicates = 0;
  for (const fixture of cases) {
    const key = duplicateKey(fixture);
    const existing = retained.get(key);
    if (!existing) {
      retained.set(key, fixture);
      continue;
    }
    duplicates += 1;
    existing.provenance = [
      ...new Set([...existing.provenance, ...fixture.provenance]),
    ];
    existing.notes = [
      existing.notes,
      `Duplicate source case retained as provenance: ${fixture.source_case_id}`,
    ]
      .filter(Boolean)
      .join(" ");
  }
  return { cases: [...retained.values()], duplicates };
}

function matches(issue: AxiomIssue, expected: ExpectedIssue) {
  return (
    issue.originalText === expected.originalText &&
    (expected.category === undefined || issue.category === expected.category) &&
    (expected.ruleId === undefined || issue.ruleId === expected.ruleId) &&
    (expected.from === undefined || issue.from === expected.from) &&
    (expected.to === undefined || issue.to === expected.to) &&
    (expected.replacement === undefined ||
      issue.suggestions.some(({ text }) => text === expected.replacement))
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

async function evaluate(cases: CorpusCase[]) {
  const linter = new LocalLinter({
    binary: binaryInlined,
    dialect: Dialect.American,
  });
  await linter.setup();
  const baseline = await linter.getDefaultLintConfig();
  const rows: EvaluationRow[] = [];
  try {
    for (const fixture of cases) {
      const profile = fixture.profile ?? "general";
      await linter.setLintConfig({
        ...baseline,
        ...PROFILE_RULE_OVERRIDES[profile],
      });
      const issues = await analyzeText(
        fixture.original,
        { analyze: (text) => analyzeWithHarper(linter, text) },
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
          content: fixture.original.split("\n").map((text) => ({
            type: "paragraph",
            content: text ? [{ type: "text", text }] : undefined,
          })),
        },
      });
      const projection = projectDocument(editor.state.doc);
      const mapped = issues.map((issue) => mapIssue(projection, issue));
      const mappingFailures = mapped.filter((issue) => issue === null).length;
      let evaluated = mapped.filter((issue) => issue !== null);
      if (fixture.ignore) {
        const ignored = evaluated.filter(
          ({ originalText }) => originalText === fixture.ignore?.originalText,
        )[fixture.ignore.occurrence];
        assert.ok(ignored, `Missing ignored issue in ${fixture.id}`);
        evaluated = evaluated.filter(
          (issue) => !isIgnoredIssue(issue, [ignored]),
        );
      }
      const required = consumeMatches(evaluated, fixture.expected);
      const knownMiss = consumeMatches(
        required.remaining,
        fixture.knownMisses ?? [],
      );
      const knownLimitation = consumeMatches(
        knownMiss.remaining,
        fixture.knownLimitations ?? [],
      );
      const spanFailure =
        fixture.protectedSpans === undefined
          ? 0
          : Number(
              findProtectedSpans(fixture.original).length !==
                fixture.protectedSpans,
            );
      const protectedFailures =
        (fixture.protected ? evaluated.length : 0) + spanFailure;
      const observedKnown =
        (fixture.knownLimitations?.length ?? 0) - knownLimitation.missed.length;
      const status: Status = mappingFailures
        ? "MAPPING FAILURE"
        : protectedFailures || knownLimitation.remaining.length
          ? "FALSE POSITIVE"
          : required.missed.length
            ? "MISS"
            : knownMiss.missed.length
              ? "KNOWN MISS"
              : observedKnown
                ? "KNOWN LIMITATION"
                : fixture.protected
                  ? "PROTECTED"
                  : "PASS";
      rows.push({
        id: fixture.id,
        source: fixture.source,
        category: fixture.category,
        status,
        expected: fixture.expected,
        actual: evaluated.map((issue) => ({
          rule_id: issue.ruleId,
          category: issue.category,
          from: issue.from,
          to: issue.to,
          editor_from: issue.editorFrom,
          editor_to: issue.editorTo,
          original: issue.originalText,
          replacements: issue.suggestions.map(({ text }) => text),
        })),
        missed: required.missed,
        known_misses: knownMiss.missed,
        known_limitations: (fixture.knownLimitations ?? []).filter(
          (expected) => !knownLimitation.missed.includes(expected),
        ),
        false_positives: knownLimitation.remaining.map(
          ({ originalText }) => originalText,
        ),
        mapping_failures: mappingFailures,
        protected_failures: protectedFailures,
      });
      editor.destroy();
    }
  } finally {
    await linter.dispose();
  }
  return rows;
}

function report(rows: EvaluationRow[], duplicates: number) {
  const statuses = Object.fromEntries(STATUSES.map((status) => [status, 0]));
  const categories = Object.fromEntries(
    TAXONOMY.map((category) => [
      category,
      { cases: 0, expected: 0, caught: 0, missed: 0, false_positives: 0 },
    ]),
  );
  const sources: Record<
    string,
    { cases: number; statuses: Record<string, number> }
  > = {};
  let expected = 0;
  let caught = 0;
  let falsePositives = 0;
  let knownMisses = 0;
  let knownLimitations = 0;
  let protectedFailures = 0;
  let mappingFailures = 0;
  for (const row of rows) {
    statuses[row.status] += 1;
    const category = categories[row.category];
    category.cases += 1;
    category.expected += row.expected.length;
    category.missed += row.missed.length;
    category.caught += row.expected.length - row.missed.length;
    category.false_positives += row.false_positives.length;
    expected += row.expected.length;
    caught += row.expected.length - row.missed.length;
    falsePositives += row.false_positives.length;
    knownMisses += row.known_misses.length;
    knownLimitations += row.known_limitations.length;
    protectedFailures += row.protected_failures;
    mappingFailures += row.mapping_failures;
    sources[row.source] ??= { cases: 0, statuses: {} };
    sources[row.source].cases += 1;
    sources[row.source].statuses[row.status] =
      (sources[row.source].statuses[row.status] ?? 0) + 1;
  }
  return {
    totals: {
      cases: rows.length,
      duplicates_removed: duplicates,
      expected_findings: expected,
      caught,
      required_detection_rate: expected ? caught / expected : 1,
      false_positives: falsePositives,
      precision:
        caught + falsePositives ? caught / (caught + falsePositives) : 1,
      known_misses: knownMisses,
      known_limitations: knownLimitations,
      protected_failures: protectedFailures,
      mapping_failures: mappingFailures,
    },
    statuses,
    categories,
    sources,
    cases: rows,
  };
}

async function loadManifests() {
  return validateManifests(
    JSON.parse(
      await readFile(
        new URL("../corpus/manifests/sources.json", import.meta.url),
        "utf8",
      ),
    ),
  );
}

async function selfTest(manifests: ReadonlyMap<string, SourceManifest>) {
  const redline = manifests.get("redline-axiom-0.1.1b");
  assert.ok(redline);
  assert.throws(() => validateManifests({ sources: [{ id: "bad" }] }));
  assert.throws(() => parseJsonl('{"id":"missing-fields"}', manifests));
  const jsonl = JSON.stringify({
    id: "jsonl-control",
    source: "REDLINE Corpus",
    source_id: redline.id,
    source_case_id: "jsonl-control",
    license: redline.license,
    category: "OTHER",
    original: "This sentence is complete.",
    expected: [],
    should_warn: false,
    tags: ["control"],
    redistribution: redline.redistribution,
    provenance: ["self-test"],
    benchmark_status: "control",
  });
  assert.equal(parseJsonl(jsonl, manifests)[0].id, "jsonl-control");
  assert.throws(() =>
    parseJsonl(jsonl.replace(redline.license, "wrong license"), manifests),
  );
  assert.equal(taxonomyFor("PronounVerbAgreement"), "VERB:SVA");
  assert.equal(taxonomyFor("CanonicalTerm"), "ORTH");
  const m2 = parseM2(
    "S This is a example\nA 2 3|||R:DET|||an|||REQUIRED|||-NONE-|||0",
    redline,
  );
  assert.equal(m2[0].corrected, "This is an example");
  assert.equal(m2[0].category, "DET");
  assert.throws(() => parseM2("S Broken .\nA invalid", redline));
  const duplicate = deduplicate([m2[0], { ...m2[0], source_case_id: "copy" }]);
  assert.equal(duplicate.cases.length, 1);
  assert.equal(duplicate.duplicates, 1);
  const native = normalizeNativeCase(
    {
      id: "self-test",
      text: "This is a example.",
      expected: [{ originalText: "a", category: "grammar" }],
    },
    redline,
  );
  const rows = await evaluate([native, m2[0]]);
  assert.equal(rows[0].status, "PASS");
  assert.equal(rows[1].status, "PASS");
  console.log("Grammar corpus self-test: PASS");
}

const args = process.argv.slice(2);
const manifests = await loadManifests();
if (args.includes("--self-test")) {
  await selfTest(manifests);
  process.exit(0);
}

const gate = args.includes("--gate");
const sourceIndex = args.indexOf("--source");
const sourceId = sourceIndex >= 0 ? args[sourceIndex + 1] : undefined;
const outputIndex = args.indexOf("--output");
const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : undefined;
const paths = args.filter(
  (arg, index) =>
    !arg.startsWith("--") &&
    index !== sourceIndex + 1 &&
    index !== outputIndex + 1,
);
const hasExternalInputs = paths.length > 0;
let cases: CorpusCase[] = [];
if (paths.length === 0) {
  const manifest = manifests.get("redline-axiom-0.1.1b");
  assert.ok(manifest);
  const native = JSON.parse(
    await readFile(
      new URL("../benchmarks/axiom-corpus.json", import.meta.url),
      "utf8",
    ),
  ) as NativeCase[];
  cases = native.map((fixture) => normalizeNativeCase(fixture, manifest));
} else {
  for (const path of paths) {
    const text = await readFile(resolve(path), "utf8");
    if (extname(path).toLowerCase() === ".m2") {
      const manifest = sourceId ? manifests.get(sourceId) : undefined;
      if (!manifest)
        throw new Error("M2 input requires --source with a known manifest ID");
      cases.push(...parseM2(text, manifest));
    } else if (extname(path).toLowerCase() === ".jsonl") {
      cases.push(...parseJsonl(text, manifests));
    } else {
      throw new Error(`Unsupported corpus format: ${path}`);
    }
  }
}

// The curated suite intentionally contains repeated text under different profiles and
// controls. External imports use the cross-source duplicate key; the authoritative
// REDLINE suite keeps all 265 case identities intact.
const deduplicated = hasExternalInputs
  ? deduplicate(cases)
  : { cases, duplicates: 0 };
const result = report(
  await evaluate(deduplicated.cases),
  deduplicated.duplicates,
);
const output = `${JSON.stringify(result, null, 2)}\n`;
if (outputPath) await writeFile(resolve(outputPath), output, "utf8");
else console.log(output);
if (
  gate &&
  (result.totals.false_positives > 0 ||
    result.statuses.MISS > 0 ||
    result.totals.mapping_failures > 0 ||
    result.totals.protected_failures > 0)
) {
  process.exitCode = 1;
}
