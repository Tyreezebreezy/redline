import type { AxiomIssue } from "./axiom.ts";

const ALWAYS_SINGULAR = new Set([
  "list", "set", "pair", "kind", "type", "sort", "category", "variety",
  "range", "amount", "level", "quality", "report", "box", "result", "way", "form",
]);

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

function isLikelyPlural(word: string): boolean {
  const lower = word.toLowerCase();
  if (PLURAL_IRREGULAR.has(lower)) return true;
  if (/(ss|us|is)$/.test(lower)) return false;
  return /s$/.test(lower);
}

function classifyHead(head: string, determiner: string): "singular" | "plural" | "skip" {
  const lower = head.toLowerCase();
  if (SKIP_HEAD.has(lower)) return "skip";
  if (lower === "number") return determiner.toLowerCase() === "a" ? "plural" : "singular";
  if (PLURAL_QUANTIFIER.has(lower)) return "plural";
  if (ALWAYS_SINGULAR.has(lower)) return "singular";
  return isLikelyPlural(lower) ? "plural" : "singular";
}

function makeIssue(
  ruleId: string,
  message: string,
  explanation: string,
  from: number,
  original: string,
  replacement: string,
): AxiomIssue {
  return {
    id: "",
    source: "axiom",
    ruleId,
    category: "grammar",
    severity: "suggestion",
    message,
    explanation,
    from,
    to: from + original.length,
    originalText: original,
    suggestions: [{ kind: "replace", text: replacement }],
  };
}

function replacementFor(cls: "singular" | "plural", verb: string): string {
  const lower = verb.toLowerCase();
  if (cls === "plural") return lower === "was" ? "were" : "are";
  return lower === "were" ? "was" : "is";
}

function headNounAgreement(text: string): AxiomIssue[] {
  const issues: AxiomIssue[] = [];
  const pattern =
    /\b(The|A|An|This|That)\s+([a-z]+)\s+(?:of|from|in|with|for)\s+(?:the|a|an|their|our|my|your|his|her|its|these|those|two|three|four|five|six|seven|eight|nine|ten|many|several|few|no)?\s*([a-z]+)\s+(is|are|was|were)\b/gi;
  for (const match of text.matchAll(pattern)) {
    const head = match[2];
    const verb = match[4];
    const cls = classifyHead(head, match[1]);
    if (cls === "skip") continue;
    const verbPlural = verb.toLowerCase() === "are" || verb.toLowerCase() === "were";
    const replacement = replacementFor(cls, verb);
    if ((cls === "plural" && !verbPlural) || (cls === "singular" && verbPlural)) {
      const from = (match.index ?? 0) + match[0].lastIndexOf(verb);
      issues.push(
        makeIssue(
          "HeadNounAgreement",
          `The verb “${verb}” does not agree with the subject “${head}”.`,
          "The grammatical head noun determines agreement; a noun inside a following phrase does not.",
          from,
          verb,
          replacement,
        ),
      );
    }
  }
  return issues;
}

function eachEveryoneAgreement(text: string): AxiomIssue[] {
  const issues: AxiomIssue[] = [];
  const pattern =
    /\b(Each|Every|Everyone|Everybody|One)\s+(?:of|in)\s+(?:the|a|an|their|our|my|your|his|her|its|these|those|two|three|four|five|six|seven|eight|nine|ten|many|several|few|no)?\s*(?:[a-z]+\s+)?([a-z]+)\s+(is|are|was|were|has|have)\b/gi;
  for (const match of text.matchAll(pattern)) {
    const verb = match[3];
    const lower = verb.toLowerCase();
    if (lower !== "are" && lower !== "were" && lower !== "have") continue;
    const replacement = lower === "have" ? "has" : lower === "are" ? "is" : "was";
    const from = (match.index ?? 0) + match[0].lastIndexOf(verb);
    issues.push(
      makeIssue(
        "IndefiniteAgreement",
        `“${match[1]}” is singular, so the verb should be “${replacement}”.`,
        "Each, every, everyone, everybody, and one take a singular verb.",
        from,
        verb,
        replacement,
      ),
    );
  }
  return issues;
}

function simpleNounAgreement(text: string): AxiomIssue[] {
  const issues: AxiomIssue[] = [];
  const pattern = /(?<=^|[.!?;]\s+)(The|A|An|This|That)\s+([a-z]{2,})\s+(is|are|was|were)\b/gi;
  for (const match of text.matchAll(pattern)) {
    const head = match[2];
    const verb = match[3];
    const cls = classifyHead(head, match[1]);
    if (cls === "skip") continue;
    const verbPlural = verb.toLowerCase() === "are" || verb.toLowerCase() === "were";
    const replacement = replacementFor(cls, verb);
    if ((cls === "plural" && !verbPlural) || (cls === "singular" && verbPlural)) {
      const from = (match.index ?? 0) + match[0].lastIndexOf(verb);
      issues.push(
        makeIssue(
          "SimpleNounAgreement",
          `The subject “${head}” and verb “${verb}” do not agree in number.`,
          "A singular subject takes a singular verb; a plural subject takes a plural verb.",
          from,
          verb,
          replacement,
        ),
      );
    }
  }
  return issues;
}

function compoundProperAgreement(text: string): AxiomIssue[] {
  const issues: AxiomIssue[] = [];
  const pattern = /\b([A-Z][a-z]+)\s+and\s+([A-Z][a-z]+)\s+(is|was)\b/g;
  for (const match of text.matchAll(pattern)) {
    const verb = match[3];
    const replacement = verb.toLowerCase() === "was" ? "were" : "are";
    const from = (match.index ?? 0) + match[0].lastIndexOf(verb);
    issues.push(
      makeIssue(
        "CompoundSubjectAgreement",
        `The coordinated subject is plural, so the verb should be “${replacement}”.`,
        "Two subjects joined by “and” form a plural subject.",
        from,
        verb,
        replacement,
      ),
    );
  }
  return issues;
}

export function structuralRuleIssues(text: string): AxiomIssue[] {
  return [
    ...headNounAgreement(text),
    ...eachEveryoneAgreement(text),
    ...simpleNounAgreement(text),
    ...compoundProperAgreement(text),
  ];
}
