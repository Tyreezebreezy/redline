import { readFileSync } from "node:fs";

type Case = {
  id: string;
  text: string;
  expected?: { originalText: string }[];
  knownMisses?: { originalText: string }[];
  knownLimitations?: { originalText: string }[];
  suite?: string;
};

type Finding = { text: string; replacement: string; rule: string };

// ---- Candidate C: deterministic context rules ----

const PLURAL_QUANTIFIERS = new Set([
  "number", "lot", "couple", "few", "pair", "majority", "minority",
  "rest", "series", "range", "variety", "group", "team", "set", "list",
  "kind", "type", "sort", "category", "portion", "percent", "percentage",
  "half", "third", "quarter",
]);

function isLikelyPlural(word: string) {
  const lower = word.toLowerCase();
  if (/^(class|bus|analysis|basis|crisis|thesis|gas|glass|news|series|species|means|data|staff|fish|sheep|deer)$/.test(lower)) {
    return lower === "data" || lower === "staff" || lower === "series" || lower === "species";
  }
  if (/(ss|us|is)$/.test(lower)) return false;
  return /s$/.test(lower);
}

function acceptExcept(text: string): Finding[] {
  const out: Finding[] = [];
  for (const m of text.matchAll(/\b(?:I|we|you|they|he|she)\s+except\b/g)) {
    out.push({ text: "except", replacement: "accept", rule: "AcceptExcept" });
  }
  for (const m of text.matchAll(/\bto\s+except\b/g)) {
    out.push({ text: "except", replacement: "accept", rule: "AcceptExcept" });
  }
  return out;
}

function bearBare(text: string): Finding[] {
  const out: Finding[] = [];
  for (const m of text.matchAll(/\b(?:cannot|couldn'?t|can'?t)\s+bare\b/g)) {
    out.push({ text: "bare", replacement: "bear", rule: "BearBare" });
  }
  return out;
}

function citeSite(text: string): Finding[] {
  const out: Finding[] = [];
  for (const m of text.matchAll(
    /\bsite\b(?=\s+(?:your|their|our|my|the|a|this|that)\s+(?:sources?|references?|stud(?:y|ies)|articles?|papers?|work|data|evidence))/g,
  )) {
    out.push({ text: "site", replacement: "cite", rule: "CiteSite" });
  }
  return out;
}

function itsContraction(text: string): Finding[] {
  const out: Finding[] = [];
  for (const m of text.matchAll(
    /\bIts\b(?=\s+(?:going|been|raining|getting|happening|important|clear|obvious|not|possible|necessary|time|hard|easy|good|bad|worth))/g,
  )) {
    out.push({ text: "Its", replacement: "It's", rule: "ItsContraction" });
  }
  return out;
}

function headNounSva(text: string): Finding[] {
  const out: Finding[] = [];
  const pattern =
    /\b(?:the|a|an|this|that)\s+([a-z]+)\s+(?:of|from|in|with|for)\s+(?:the|a|an|their|our|my|your|his|her|these|those|two|three|many|several|few)?\s*([a-z]+)\s+(is|are|was|were)\b/gi;
  for (const m of text.matchAll(pattern)) {
    const head = m[1].toLowerCase();
    const verb = m[3].toLowerCase();
    if (PLURAL_QUANTIFIERS.has(head)) continue;
    const headPlural = isLikelyPlural(head);
    const verbPlural = verb === "are" || verb === "were";
    if (headPlural && !verbPlural) {
      out.push({ text: verb, replacement: "are", rule: "HeadNounSVA" });
    } else if (!headPlural && verbPlural) {
      out.push({ text: verb, replacement: "is", rule: "HeadNounSVA" });
    }
  }
  return out;
}

const RULES = [acceptExcept, bearBare, citeSite, itsContraction, headNounSva];

function applyRules(text: string): Finding[] {
  return RULES.flatMap((rule) => rule(text));
}

// ---- Benchmark against the corpus ----

function load(file: string): Case[] {
  return JSON.parse(readFileSync(file, "utf8"));
}

const cases = [...load("benchmarks/axiom-corpus.json"), ...load("benchmarks/axiom-2-corpus.json")];

const knownMissCases = cases.filter((c) => (c.knownMisses?.length ?? 0) > 0);
const controlCases = cases.filter(
  (c) => !(c.expected?.length ?? 0) && !(c.knownMisses?.length ?? 0) && !(c.knownLimitations?.length ?? 0),
);

function matches(finding: Finding, originalText: string) {
  const a = finding.text.toLowerCase();
  const b = originalText.toLowerCase();
  return b.includes(a) || a.includes(b);
}

let recovered = 0;
let missed = 0;
const recoveredByCase: string[] = [];
const unrecoveredByCase: string[] = [];
for (const c of knownMissCases) {
  const findings = applyRules(c.text);
  const hit = (c.knownMisses ?? []).some((km) => findings.some((f) => matches(f, km.originalText)));
  if (hit) {
    recovered += 1;
    recoveredByCase.push(`${c.id} (${(c.knownMisses ?? []).map((k) => k.originalText).join(", ")})`);
  } else {
    missed += 1;
    unrecoveredByCase.push(`${c.id} (${(c.knownMisses ?? []).map((k) => k.originalText).join(", ")})`);
  }
}

let falsePositives = 0;
const fpByCase: string[] = [];
for (const c of controlCases) {
  const findings = applyRules(c.text);
  if (findings.length > 0) {
    falsePositives += findings.length;
    fpByCase.push(`${c.id} [${c.suite ?? "legacy"}] -> ${findings.map((f) => `${f.text}->${f.replacement} (${f.rule})`).join("; ")}`);
  }
}

console.log(`=== Candidate C (deterministic context rules) ===`);
console.log(`rules: ${RULES.length}`);
console.log(`known-miss cases: ${knownMissCases.length}`);
console.log(`recovered: ${recovered}, missed: ${missed}, recovery %: ${((recovered / knownMissCases.length) * 100).toFixed(1)}`);
console.log(`\n--- recovered ---`);
for (const r of recoveredByCase) console.log(`  ${r}`);
console.log(`\n--- unrecovered ---`);
for (const r of unrecoveredByCase) console.log(`  ${r}`);
console.log(`\ncontrol cases (negative/register/voice): ${controlCases.length}`);
console.log(`false positives: ${falsePositives}`);
for (const f of fpByCase) console.log(`  FP: ${f}`);
