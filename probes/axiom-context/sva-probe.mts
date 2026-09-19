import { readFileSync } from "node:fs";

type Finding = { text: string; replacement: string; rule: string };

// Always-singular (non-collective) heads: safe to force singular.
const ALWAYS_SINGULAR = new Set([
  "list", "set", "pair", "kind", "type", "sort", "category", "variety", "range",
  "amount", "level", "quality", "report", "box", "result", "number", "way", "form",
]);

// Collective / ambiguous heads: do NOT rule (conservative).
const SKIP_HEAD = new Set([
  "team", "group", "committee", "family", "government", "audience", "crowd",
  "company", "board", "jury", "orchestra", "band", "class", "department",
  "organization", "corporation", "association", "faculty", "crew", "squad",
  "panel", "staff", "data", "media", "news", "series", "species", "means",
  "majority", "minority", "rest", "percent", "percentage", "half", "part",
  "portion", "all", "some", "none", "most", "everything", "everyone",
]);

const PLURAL_IRREGULAR = new Set([
  "children", "men", "women", "people", "teeth", "feet", "geese", "mice",
  "police", "criteria", "phenomena", "analyses", "theses", "bases",
]);

const PLURAL_QUANTIFIER = new Set(["lot", "couple", "few", "handful", "dozen", "score"]);

function isLikelyPlural(word: string) {
  const w = word.toLowerCase();
  if (PLURAL_IRREGULAR.has(w)) return true;
  if (/(ss|us|is)$/.test(w)) return false;
  return /s$/.test(w);
}

// returns "singular" | "plural" | "skip"
function classifyHead(head: string, determiner: string) {
  const w = head.toLowerCase();
  if (SKIP_HEAD.has(w)) return "skip";
  if (w === "number") return determiner.toLowerCase() === "a" ? "plural" : "singular";
  if (PLURAL_QUANTIFIER.has(w)) return "plural";
  if (ALWAYS_SINGULAR.has(w)) return "singular";
  return isLikelyPlural(w) ? "plural" : "singular";
}

function headNounAgreement(text: string): Finding[] {
  const out: Finding[] = [];
  const pattern =
    /\b(The|A|An|This|That)\s+([a-z]+)\s+(?:of|from|in|with|for)\s+(?:the|a|an|their|our|my|your|his|her|its|these|those|two|three|four|five|six|seven|eight|nine|ten|many|several|few|no)?\s*([a-z]+)\s+(is|are|was|were)\b/gi;
  for (const m of text.matchAll(pattern)) {
    const determiner = m[1];
    const head = m[2];
    const verb = m[4];
    const cls = classifyHead(head, determiner);
    if (cls === "skip") continue;
    const verbPlural = verb.toLowerCase() === "are" || verb.toLowerCase() === "were";
    if (cls === "plural" && !verbPlural) {
      out.push({ text: verb, replacement: "are", rule: "HeadNounAgreement" });
    } else if (cls === "singular" && verbPlural) {
      out.push({ text: verb, replacement: "is", rule: "HeadNounAgreement" });
    }
  }
  return out;
}

function eachEveryoneAgreement(text: string): Finding[] {
  const out: Finding[] = [];
  const pattern =
    /\b(Each|Every|Everyone|Everybody|One)\s+(?:of|in)\s+(?:the|a|an|their|our|my|your|his|her|its|these|those|two|three|four|five|six|seven|eight|nine|ten|many|several|few|no)?\s*(?:[a-z]+\s+)?([a-z]+)\s+(is|are|was|were|has|have)\b/gi;
  for (const m of text.matchAll(pattern)) {
    const verb = m[3];
    const v = verb.toLowerCase();
    const plural = v === "are" || v === "were" || v === "have";
    if (plural) {
      const rep = v === "have" ? "has" : v === "are" ? "is" : "was";
      out.push({ text: verb, replacement: rep, rule: "IndefiniteAgreement" });
    }
  }
  return out;
}

function simpleNounAgreement(text: string): Finding[] {
  const out: Finding[] = [];
  const pattern = /\b(The|A|An|This|That)\s+([a-z]{2,})\s+(is|are|was|were)\b/gi;
  for (const m of text.matchAll(pattern)) {
    const head = m[2];
    const verb = m[3];
    const cls = classifyHead(head, m[1]);
    if (cls === "skip") continue;
    const verbPlural = verb.toLowerCase() === "are" || verb.toLowerCase() === "were";
    if (cls === "plural" && !verbPlural) {
      out.push({ text: verb, replacement: "are", rule: "SimpleNounAgreement" });
    } else if (cls === "singular" && verbPlural) {
      out.push({ text: verb, replacement: "is", rule: "SimpleNounAgreement" });
    }
  }
  return out;
}

function compoundProperAgreement(text: string): Finding[] {
  const out: Finding[] = [];
  const pattern = /\b([A-Z][a-z]+)\s+and\s+([A-Z][a-z]+)\s+(is|was)\b/g;
  for (const m of text.matchAll(pattern)) {
    const verb = m[3];
    out.push({ text: verb, replacement: verb.toLowerCase() === "was" ? "were" : "are", rule: "CompoundSubjectAgreement" });
  }
  return out;
}

const RULES = [headNounAgreement, eachEveryoneAgreement, simpleNounAgreement, compoundProperAgreement];

function applyRules(text: string): Finding[] {
  return RULES.flatMap((r) => r(text));
}

type Case = { id: string; text: string; expected?: { originalText: string }[]; knownMisses?: { originalText: string }[]; knownLimitations?: { originalText: string }[]; suite?: string };
const cases = [...JSON.parse(readFileSync("benchmarks/axiom-corpus.json", "utf8")), ...JSON.parse(readFileSync("benchmarks/axiom-2-corpus.json", "utf8"))] as Case[];

const km = cases.filter((c) => (c.knownMisses?.length ?? 0) > 0 && (c.knownMisses ?? []).some((k) => /are|is|was|were|has|have|report are|reports is/.test(k.originalText)));
const controls = cases.filter((c) => !(c.expected?.length ?? 0) && !(c.knownMisses?.length ?? 0) && !(c.knownLimitations?.length ?? 0));

function matches(f: Finding, o: string) {
  const a = f.text.toLowerCase();
  const b = o.toLowerCase();
  return b.includes(a) || a.includes(b);
}

let recovered = 0;
const rec: string[] = [];
const miss: string[] = [];
for (const c of km) {
  const findings = applyRules(c.text);
  const hit = (c.knownMisses ?? []).some((k) => findings.some((f) => matches(f, k.originalText)));
  if (hit) { recovered++; rec.push(`${c.id} (${(c.knownMisses ?? []).map((k) => k.originalText).join(", ")})`); }
  else { miss.push(`${c.id} (${(c.knownMisses ?? []).map((k) => k.originalText).join(", ")})`); }
}

let fp = 0;
const fpList: string[] = [];
for (const c of controls) {
  const findings = applyRules(c.text);
  if (findings.length) { fp += findings.length; fpList.push(`${c.id} [${c.suite ?? "legacy"}] "${c.text}" -> ${findings.map((f) => `${f.text}->${f.replacement} (${f.rule})`).join("; ")}`); }
}

console.log(`=== SVA probe (refined) ===`);
console.log(`SVA-related known-miss cases: ${km.length}`);
console.log(`recovered: ${recovered}, missed: ${miss.length}`);
console.log(`\n--- recovered ---`);
for (const r of rec) console.log(`  ${r}`);
console.log(`\n--- not recovered ---`);
for (const r of miss) console.log(`  ${r}`);
console.log(`\ncontrols (${controls.length}): false positives ${fp}`);
for (const f of fpList) console.log(`  FP: ${f}`);
