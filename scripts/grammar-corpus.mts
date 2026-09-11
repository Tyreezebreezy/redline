import assert from "node:assert/strict";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
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
  robustness_group?: string;
  robustness_variant?: "O" | "A1" | "A2" | "A3" | "A4" | "A5";
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
  source_id: string;
  source_case_id: string;
  license: string;
  provenance: string[];
  original: string;
  corrected?: string;
  category: TaxonomyCategory;
  rule_id?: string;
  status: Status;
  robustness_group?: string;
  robustness_variant?: "O" | "A1" | "A2" | "A3" | "A4" | "A5";
  expected: ExpectedIssue[];
  harper_actual: Array<{
    rule_id?: string;
    category: string;
    from: number;
    to: number;
    original: string;
    replacements: string[];
  }>;
  harper_missed: ExpectedIssue[];
  harper_false_positives: string[];
  axiom_added: string[];
  axiom_suppressed: string[];
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

type DuplicateRecord = {
  kept_source_id: string;
  kept_case_id: string;
  removed_source_id: string;
  removed_case_id: string;
  category: TaxonomyCategory;
  removed: boolean;
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

async function weirFiles(root: string): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) paths.push(...(await weirFiles(path)));
    else if (entry.isFile() && extname(entry.name) === ".weir")
      paths.push(path);
  }
  return paths.toSorted();
}

function decodeWeirLiteral(literal: string) {
  let value = "";
  for (let index = 1; index < literal.length - 1; index += 1) {
    const character = literal[index];
    if (character !== "\\") {
      value += character;
      continue;
    }
    index += 1;
    const escaped = literal[index];
    if (escaped === "n") value += "\n";
    else if (escaped === "r") value += "\r";
    else if (escaped === "t") value += "\t";
    else if (["\\", '"', "“", "”"].includes(escaped)) value += escaped;
    else throw new Error(`Unsupported Harper string escape: \\${escaped}`);
  }
  return value;
}

function parseHarperWeirText(
  text: string,
  sourcePath: string,
  manifest: SourceManifest,
) {
  const cases: CorpusCase[] = [];
  const ruleId = basename(sourcePath, ".weir");
  const lines = text.split(/\r?\n/u);
  lines.forEach((line, index) => {
    if (!line.startsWith("test ")) return;
    const match = line.match(
      /^test\s+("(?:[^"\\]|\\.)*")\s+("(?:[^"\\]|\\.)*")\s*$/u,
    );
    if (!match) {
      throw new Error(`Unsupported Harper test at ${sourcePath}:${index + 1}`);
    }
    const original = decodeWeirLiteral(match[1]);
    const corrected = decodeWeirLiteral(match[2]);
    const expected = tokenEdits(original, corrected);
    const sourceCaseId = `${sourcePath}:${index + 1}`;
    cases.push({
      id: `${manifest.id}:${sourceCaseId}`,
      source: manifest.source,
      source_id: manifest.id,
      source_case_id: sourceCaseId,
      license: manifest.license,
      category: taxonomyFor(ruleId),
      original,
      corrected,
      expected,
      rule_id: ruleId,
      should_warn: expected.length > 0,
      expected_span: expected[0]
        ? { from: expected[0].from ?? 0, to: expected[0].to ?? 0 }
        : undefined,
      expected_replacement: expected[0]?.replacement,
      tags: ["external", "harper", "weir"],
      redistribution: manifest.redistribution,
      provenance: [
        `${manifest.source_url}/blob/dc1182cc2b33603748105df074d6bb47f0de3720/harper-core/src/linting/weir_rules/${sourcePath}#L${index + 1}`,
      ],
      benchmark_status: expected.length > 0 ? "required" : "control",
    });
  });
  return cases;
}

async function parseHarperWeir(root: string, manifest: SourceManifest) {
  const cases: CorpusCase[] = [];
  for (const path of await weirFiles(root)) {
    const sourcePath = relative(root, path).replaceAll("\\", "/");
    cases.push(
      ...parseHarperWeirText(
        await readFile(path, "utf8"),
        sourcePath,
        manifest,
      ),
    );
  }
  return cases;
}

type OffsetToken = { text: string; from: number; to: number };

function offsetTokens(text: string): OffsetToken[] {
  return [...text.matchAll(/\S+/gu)].map((match) => ({
    text: match[0],
    from: match.index,
    to: match.index + match[0].length,
  }));
}

function tokenEdits(original: string, corrected: string): ExpectedIssue[] {
  const before = offsetTokens(original);
  const after = offsetTokens(corrected);
  const lengths = Array.from(
    { length: before.length + 1 },
    () => new Uint16Array(after.length + 1),
  );
  for (let left = before.length - 1; left >= 0; left -= 1) {
    for (let right = after.length - 1; right >= 0; right -= 1) {
      lengths[left][right] =
        before[left].text === after[right].text
          ? lengths[left + 1][right + 1] + 1
          : Math.max(lengths[left + 1][right], lengths[left][right + 1]);
    }
  }

  const matches: Array<[number, number]> = [];
  let left = 0;
  let right = 0;
  while (left < before.length && right < after.length) {
    if (before[left].text === after[right].text) {
      matches.push([left, right]);
      left += 1;
      right += 1;
    } else if (lengths[left + 1][right] >= lengths[left][right + 1]) {
      left += 1;
    } else {
      right += 1;
    }
  }
  matches.push([before.length, after.length]);

  const edits: ExpectedIssue[] = [];
  let beforeStart = 0;
  let afterStart = 0;
  for (const [beforeEnd, afterEnd] of matches) {
    if (beforeStart !== beforeEnd || afterStart !== afterEnd) {
      const from = beforeStart === 0 ? 0 : before[beforeStart - 1].to;
      const to =
        beforeEnd < before.length ? before[beforeEnd].from : original.length;
      const replacementFrom = afterStart === 0 ? 0 : after[afterStart - 1].to;
      const replacementTo =
        afterEnd < after.length ? after[afterEnd].from : corrected.length;
      const replacement = corrected.slice(replacementFrom, replacementTo);
      edits.push({
        originalText: original.slice(from, to),
        from,
        to,
        replacement,
      });
    }
    beforeStart = beforeEnd + 1;
    afterStart = afterEnd + 1;
  }
  return edits;
}

function parseRobustGec(
  text: string,
  manifest: SourceManifest,
  sourcePath: string,
) {
  const cases: CorpusCase[] = [];
  const dataset = basename(dirname(resolve(sourcePath)));
  const blocks = text.trim().split(/\r?\n\s*\r?\n/u);
  let lineNumber = 1;
  blocks.forEach((block, blockIndex) => {
    const variants = new Map<string, { source?: string; target?: string }>();
    const blockLines = block.split(/\r?\n/u);
    for (const line of blockLines) {
      const match = line.match(/^(O|A[1-5])-([ST])\s(.*)$/u);
      if (!match) throw new Error(`Malformed RobustGEC line: ${line}`);
      const record = variants.get(match[1]) ?? {};
      if (match[2] === "S") record.source = match[3];
      else record.target = match[3];
      variants.set(match[1], record);
    }
    for (const variant of ["O", "A1", "A2", "A3", "A4", "A5"] as const) {
      const record = variants.get(variant);
      if (!record?.source || record.target === undefined) {
        throw new Error(
          `RobustGEC block ${blockIndex + 1} lacks ${variant}-S/T`,
        );
      }
      const expected = tokenEdits(record.source, record.target);
      const sourceCaseId = `${dataset}:${blockIndex + 1}:${variant}`;
      cases.push({
        id: `${manifest.id}:${sourceCaseId}`,
        source: manifest.source,
        source_id: manifest.id,
        source_case_id: sourceCaseId,
        license: manifest.license,
        category: "OTHER",
        original: record.source,
        corrected: record.target,
        expected,
        should_warn: expected.length > 0,
        expected_span: expected[0]
          ? { from: expected[0].from ?? 0, to: expected[0].to ?? 0 }
          : undefined,
        expected_replacement: expected[0]?.replacement,
        tags: ["external", "robustgec", dataset, variant],
        notes:
          "ERRANT category intentionally unavailable without the external Python/spaCy toolchain.",
        redistribution: manifest.redistribution,
        provenance: [
          `${manifest.source_url}/blob/1c5787b3c6288a45f0d99b883a501c02b54812a1/benchmark/${dataset}/para.txt#L${lineNumber}`,
        ],
        benchmark_status: expected.length > 0 ? "required" : "control",
        robustness_group: `${manifest.id}:${dataset}:${blockIndex + 1}`,
        robustness_variant: variant,
      });
    }
    lineNumber += blockLines.length + 1;
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
  const retained: CorpusCase[] = [];
  const seen = new Map<string, CorpusCase>();
  const duplicates: DuplicateRecord[] = [];
  for (const fixture of cases) {
    const key = duplicateKey(fixture);
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, fixture);
      retained.push(fixture);
      continue;
    }
    const remove = !existing.robustness_group && !fixture.robustness_group;
    duplicates.push({
      kept_source_id: existing.source_id,
      kept_case_id: existing.source_case_id,
      removed_source_id: fixture.source_id,
      removed_case_id: fixture.source_case_id,
      category: fixture.category,
      removed: remove,
    });
    if (!remove) {
      retained.push(fixture);
      continue;
    }
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
  return { cases: retained, duplicates };
}

function issueKey(issue: AxiomIssue) {
  return JSON.stringify([
    issue.ruleId,
    issue.from,
    issue.to,
    issue.originalText,
    issue.suggestions.map(({ kind, text }) => [kind, text]),
  ]);
}

function issueLabel(issue: AxiomIssue) {
  return `${issue.ruleId ?? "unknown"}@${issue.from}-${issue.to}:${issue.originalText}`;
}

function matches(
  issue: AxiomIssue,
  expected: ExpectedIssue,
  original?: string,
) {
  const equivalentCorrection =
    original !== undefined &&
    expected.from !== undefined &&
    expected.to !== undefined &&
    expected.replacement !== undefined &&
    issue.suggestions.some(
      ({ text }) =>
        original.slice(0, issue.from) + text + original.slice(issue.to) ===
        original.slice(0, expected.from) +
          expected.replacement +
          original.slice(expected.to),
    );
  return (
    (equivalentCorrection ||
      (issue.originalText === expected.originalText &&
        (expected.from === undefined || issue.from === expected.from) &&
        (expected.to === undefined || issue.to === expected.to) &&
        (expected.replacement === undefined ||
          issue.suggestions.some(
            ({ text }) => text === expected.replacement,
          )))) &&
    (expected.category === undefined || issue.category === expected.category) &&
    (expected.ruleId === undefined || issue.ruleId === expected.ruleId)
  );
}

function consumeMatches(
  issues: AxiomIssue[],
  expected: ExpectedIssue[],
  original?: string,
) {
  const remaining = [...issues];
  const missed: ExpectedIssue[] = [];
  for (const item of expected) {
    const index = remaining.findIndex((issue) =>
      matches(issue, item, original),
    );
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
      let harperIssues: AxiomIssue[] = [];
      const issues = await analyzeText(
        fixture.original,
        {
          analyze: async (text) => {
            harperIssues = await analyzeWithHarper(linter, text);
            return harperIssues;
          },
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
      const required = consumeMatches(
        evaluated,
        fixture.expected,
        fixture.original,
      );
      const knownMiss = consumeMatches(
        required.remaining,
        fixture.knownMisses ?? [],
        fixture.original,
      );
      const knownLimitation = consumeMatches(
        knownMiss.remaining,
        fixture.knownLimitations ?? [],
        fixture.original,
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
      const harperRequired = consumeMatches(
        harperIssues,
        fixture.expected,
        fixture.original,
      );
      const harperKnownMiss = consumeMatches(
        harperRequired.remaining,
        fixture.knownMisses ?? [],
        fixture.original,
      );
      const harperKnownLimitation = consumeMatches(
        harperKnownMiss.remaining,
        fixture.knownLimitations ?? [],
        fixture.original,
      );
      const harperKeys = new Set(harperIssues.map(issueKey));
      const axiomKeys = new Set(issues.map(issueKey));
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
        source_id: fixture.source_id,
        source_case_id: fixture.source_case_id,
        license: fixture.license,
        provenance: fixture.provenance,
        original: fixture.original,
        corrected: fixture.corrected,
        category: fixture.category,
        rule_id: fixture.rule_id,
        status,
        robustness_group: fixture.robustness_group,
        robustness_variant: fixture.robustness_variant,
        expected: fixture.expected,
        harper_actual: harperIssues.map((issue) => ({
          rule_id: issue.ruleId,
          category: issue.category,
          from: issue.from,
          to: issue.to,
          original: issue.originalText,
          replacements: issue.suggestions.map(({ text }) => text),
        })),
        harper_missed: harperRequired.missed,
        harper_false_positives: harperKnownLimitation.remaining.map(
          ({ originalText }) => originalText,
        ),
        axiom_added: issues
          .filter((issue) => !harperKeys.has(issueKey(issue)))
          .map(issueLabel),
        axiom_suppressed: harperIssues
          .filter((issue) => !axiomKeys.has(issueKey(issue)))
          .map(issueLabel),
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

function robustReport(rows: EvaluationRow[]) {
  const groups = new Map<string, EvaluationRow[]>();
  for (const row of rows) {
    if (!row.robustness_group) continue;
    groups.set(row.robustness_group, [
      ...(groups.get(row.robustness_group) ?? []),
      row,
    ]);
  }
  const details: Array<{
    group: string;
    status: string[];
  }> = [];
  let robustPass = 0;
  let contextDrop = 0;
  let contextFalsePositive = 0;
  let ruleDrift = 0;
  let replacementDrift = 0;
  let incomplete = 0;
  const atExpected = (row: EvaluationRow, expected: ExpectedIssue) =>
    row.actual.filter((issue) => {
      const equivalentCorrection =
        expected.from !== undefined &&
        expected.to !== undefined &&
        expected.replacement !== undefined &&
        issue.replacements.some(
          (replacement) =>
            row.original.slice(0, issue.from) +
              replacement +
              row.original.slice(issue.to) ===
            row.original.slice(0, expected.from) +
              expected.replacement +
              row.original.slice(expected.to),
        );
      return (
        equivalentCorrection ||
        (issue.original === expected.originalText &&
          (expected.from === undefined || issue.from === expected.from) &&
          (expected.to === undefined || issue.to === expected.to))
      );
    });

  for (const [group, variants] of groups) {
    const byVariant = new Map(
      variants.map((row) => [row.robustness_variant, row]),
    );
    const original = byVariant.get("O");
    if (!original || variants.length !== 6) {
      incomplete += 1;
      details.push({ group, status: ["INCOMPLETE GROUP"] });
      continue;
    }
    const statuses: string[] = [];
    const clean = (row: EvaluationRow) =>
      row.missed.length === 0 &&
      row.false_positives.length === 0 &&
      row.mapping_failures === 0 &&
      row.protected_failures === 0;
    if (variants.every(clean)) {
      robustPass += 1;
      statuses.push("ROBUST PASS");
    }
    if (
      original.expected.length > 0 &&
      original.missed.length === 0 &&
      variants.some((row) =>
        row.missed.some((expected) => atExpected(row, expected).length === 0),
      )
    ) {
      contextDrop += 1;
      statuses.push("CONTEXT DROP");
    }
    if (
      original.false_positives.length === 0 &&
      variants.some((row) => row.false_positives.length > 0)
    ) {
      contextFalsePositive += 1;
      statuses.push("CONTEXT FALSE POSITIVE");
    }
    const ruleSignature = (row: EvaluationRow) =>
      row.expected
        .flatMap((expected) =>
          atExpected(row, expected).flatMap((issue) => issue.rule_id ?? []),
        )
        .toSorted()
        .join("|");
    const originalRules = ruleSignature(original);
    if (
      originalRules &&
      variants.some((row) => {
        const signature = ruleSignature(row);
        return signature.length > 0 && signature !== originalRules;
      })
    ) {
      ruleDrift += 1;
      statuses.push("RULE DRIFT");
    }
    if (
      original.missed.length === 0 &&
      variants.some((row) =>
        row.missed.some(
          (expected) =>
            expected.replacement !== undefined &&
            atExpected(row, expected).some(
              (issue) =>
                !issue.replacements.includes(expected.replacement ?? ""),
            ),
        ),
      )
    ) {
      replacementDrift += 1;
      statuses.push("REPLACEMENT DRIFT");
    }
    if (statuses.length > 0) details.push({ group, status: statuses });
  }
  return {
    groups: groups.size,
    robust_pass: robustPass,
    context_drop: contextDrop,
    context_false_positive: contextFalsePositive,
    rule_drift: ruleDrift,
    replacement_drift: replacementDrift,
    incomplete_groups: incomplete,
    details,
  };
}

function report(rows: EvaluationRow[], duplicates: DuplicateRecord[]) {
  const statuses = Object.fromEntries(STATUSES.map((status) => [status, 0]));
  const categories = Object.fromEntries(
    TAXONOMY.map((category) => [
      category,
      { cases: 0, expected: 0, caught: 0, missed: 0, false_positives: 0 },
    ]),
  );
  const sources: Record<
    string,
    {
      source: SourceKind;
      cases: number;
      expected: number;
      harper_caught: number;
      axiom_caught: number;
      harper_false_positives: number;
      axiom_false_positives: number;
      statuses: Record<string, number>;
    }
  > = {};
  let expected = 0;
  let caught = 0;
  let falsePositives = 0;
  let knownMisses = 0;
  let knownLimitations = 0;
  let protectedFailures = 0;
  let mappingFailures = 0;
  let harperCaught = 0;
  let harperFalsePositives = 0;
  let axiomAddedFindings = 0;
  let axiomSuppressedIssues = 0;
  let axiomSuppressedFalsePositives = 0;
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
    const rowHarperCaught = row.expected.length - row.harper_missed.length;
    const rowAxiomCaught = row.expected.length - row.missed.length;
    harperCaught += rowHarperCaught;
    harperFalsePositives += row.harper_false_positives.length;
    axiomAddedFindings += Math.max(0, rowAxiomCaught - rowHarperCaught);
    axiomSuppressedIssues += row.axiom_suppressed.length;
    axiomSuppressedFalsePositives += Math.max(
      0,
      row.harper_false_positives.length - row.false_positives.length,
    );
    const sourceKey =
      row.source_id === "robustgec-2023-upstream"
        ? `${row.source_id}/${row.source_case_id.split(":")[0]}`
        : row.source_id;
    sources[sourceKey] ??= {
      source: row.source,
      cases: 0,
      expected: 0,
      harper_caught: 0,
      axiom_caught: 0,
      harper_false_positives: 0,
      axiom_false_positives: 0,
      statuses: {},
    };
    const source = sources[sourceKey];
    source.cases += 1;
    source.expected += row.expected.length;
    source.harper_caught += rowHarperCaught;
    source.axiom_caught += rowAxiomCaught;
    source.harper_false_positives += row.harper_false_positives.length;
    source.axiom_false_positives += row.false_positives.length;
    source.statuses[row.status] = (source.statuses[row.status] ?? 0) + 1;
  }
  const duplicateSummary: Record<string, number> = {};
  for (const duplicate of duplicates) {
    const key = `${duplicate.kept_source_id} <- ${duplicate.removed_source_id} [${duplicate.category}]`;
    duplicateSummary[key] = (duplicateSummary[key] ?? 0) + 1;
  }
  const categoryBacklog = Object.entries(categories)
    .filter(([, metrics]) => metrics.missed > 0 || metrics.false_positives > 0)
    .map(([category, metrics]) => ({ category, ...metrics }))
    .toSorted(
      (left, right) =>
        right.missed - left.missed ||
        right.false_positives - left.false_positives,
    );
  const candidates = new Map<
    string,
    {
      candidate: string;
      source_ids: string[];
      missed_findings: number;
      cases_with_false_positive_concerns: number;
      example_case_ids: string[];
    }
  >();
  for (const row of rows) {
    if (row.missed.length === 0) continue;
    const key = row.rule_id ?? row.category;
    const candidate = candidates.get(key) ?? {
      candidate: key,
      source_ids: [],
      missed_findings: 0,
      cases_with_false_positive_concerns: 0,
      example_case_ids: [],
    };
    candidate.source_ids = [
      ...new Set([...candidate.source_ids, row.source_id]),
    ];
    candidate.missed_findings += row.missed.length;
    candidate.cases_with_false_positive_concerns += Number(
      row.false_positives.length > 0,
    );
    if (candidate.example_case_ids.length < 5) {
      candidate.example_case_ids.push(row.source_case_id);
    }
    candidates.set(key, candidate);
  }
  const backlog = [...candidates.values()]
    .toSorted(
      (left, right) =>
        right.missed_findings - left.missed_findings ||
        right.cases_with_false_positive_concerns -
          left.cases_with_false_positive_concerns,
    )
    .slice(0, 25);
  return {
    totals: {
      cases: rows.length,
      duplicates_detected: duplicates.length,
      duplicates_removed: duplicates.filter(({ removed }) => removed).length,
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
    harper_raw: {
      caught: harperCaught,
      missed: expected - harperCaught,
      false_positives: harperFalsePositives,
    },
    axiom_incremental: {
      expected_findings_added: axiomAddedFindings,
      raw_issues_suppressed: axiomSuppressedIssues,
      false_positives_suppressed: axiomSuppressedFalsePositives,
    },
    statuses,
    categories,
    sources,
    robustness: robustReport(rows),
    duplicate_summary: duplicateSummary,
    duplicates,
    category_backlog: categoryBacklog,
    ranked_backlog: backlog,
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
  assert.equal(duplicate.duplicates.length, 1);
  assert.equal(duplicate.duplicates[0].removed, true);
  const harper = manifests.get("harper-2.7.0-upstream");
  const robustGec = manifests.get("robustgec-2023-upstream");
  assert.ok(harper);
  assert.ok(robustGec);
  const weir = parseHarperWeirText(
    'test "This is a example." "This is an example."',
    "AnA.weir",
    harper,
  );
  assert.equal(weir.length, 1);
  assert.equal(weir[0].expected[0].replacement, " an ");
  assert.throws(() =>
    parseHarperWeirText('test "broken"', "Broken.weir", harper),
  );
  const robustBlock = [
    "O-S This are wrong .",
    "O-T This is wrong .",
    "A1-S Today , this are wrong .",
    "A1-T Today , this is wrong .",
    "A2-S Clearly , this are wrong .",
    "A2-T Clearly , this is wrong .",
    "A3-S Here , this are wrong .",
    "A3-T Here , this is wrong .",
    "A4-S Again , this are wrong .",
    "A4-T Again , this is wrong .",
    "A5-S Still , this are wrong .",
    "A5-T Still , this is wrong .",
  ].join("\n");
  const robust = parseRobustGec(robustBlock, robustGec, "sample/para.txt");
  assert.equal(robust.length, 6);
  assert.equal(robust[0].expected[0].replacement, " is ");
  const robustDuplicates = deduplicate([
    robust[0],
    { ...robust[0], source_case_id: "duplicate-variant" },
  ]);
  assert.equal(robustDuplicates.cases.length, 2);
  assert.equal(robustDuplicates.duplicates[0].removed, false);
  assert.equal(robustReport(await evaluate(robust)).groups, 1);
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
const adapterIndex = args.indexOf("--adapter");
const adapter = adapterIndex >= 0 ? args[adapterIndex + 1] : undefined;
if (adapter && adapter !== "harper-weir" && adapter !== "robustgec") {
  throw new Error(`Unsupported corpus adapter: ${adapter}`);
}
const paths = args.filter(
  (arg, index) =>
    !arg.startsWith("--") &&
    index !== sourceIndex + 1 &&
    index !== outputIndex + 1 &&
    index !== adapterIndex + 1,
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
  const selectedManifest = sourceId ? manifests.get(sourceId) : undefined;
  if (adapter && !selectedManifest) {
    throw new Error(
      "External adapters require --source with a known manifest ID",
    );
  }
  if (adapter) assert.ok(selectedManifest);
  for (const path of paths) {
    if (adapter === "harper-weir") {
      cases.push(...(await parseHarperWeir(resolve(path), selectedManifest)));
      continue;
    }
    const text = await readFile(resolve(path), "utf8");
    if (adapter === "robustgec") {
      cases.push(...parseRobustGec(text, selectedManifest, path));
    } else if (extname(path).toLowerCase() === ".m2") {
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
  : { cases, duplicates: [] };
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
