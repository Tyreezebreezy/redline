import type { AxiomIssue } from "./axiom.ts";

type ContextRule = {
  ruleId: string;
  category: AxiomIssue["category"];
  message: string;
  explanation: string;
  pattern: RegExp;
  replacement: string;
};

const GERUNDS =
  "going|coming|being|getting|making|taking|doing|working|trying|raining|happening|thinking|using|having|reading|writing|saying|asking|needing|wanting";

const CONTEXT_RULES: ContextRule[] = [
  {
    ruleId: "AcceptExcept",
    category: "word-choice",
    message: "Did you mean “accept” rather than “except”?",
    explanation:
      "“Except” means to exclude; “accept” means to receive or agree to something.",
    pattern: /\b(?:I|we|you|they|he|she|please|kindly|to)\s+(except)\b/gi,
    replacement: "accept",
  },
  {
    ruleId: "LooseLose",
    category: "word-choice",
    message: "Did you mean “lose” rather than “loose”?",
    explanation:
      "“Loose” is an adjective meaning not tight; “lose” is the verb for misplacing or failing.",
    pattern: /\b(?:will|would|can|could|should|might|must|may|shall)\s+(loose)\b/gi,
    replacement: "lose",
  },
  {
    ruleId: "ItsContraction",
    category: "grammar",
    message: "Did you mean “It's” rather than “its”?",
    explanation:
      "“Its” is the possessive form; “it's” is the contraction of “it is” or “it has”.",
    pattern: new RegExp(`\\b(its)\\b(?=\\s+(?:${GERUNDS}))`, "gi"),
    replacement: "It's",
  },
  {
    ruleId: "YourContraction",
    category: "grammar",
    message: "Did you mean “you're” rather than “your”?",
    explanation:
      "“Your” is the possessive form; “you're” is the contraction of “you are”.",
    pattern: new RegExp(`\\b(your)\\b(?=\\s+(?:${GERUNDS}))`, "gi"),
    replacement: "you're",
  },
  {
    ruleId: "CiteSite",
    category: "word-choice",
    message: "Did you mean “cite” rather than “site”?",
    explanation:
      "“Cite” means to reference a source; “site” means a location.",
    pattern:
      /\b(site)\b(?=\s+(?:your|their|our|my|the|a|this|that)\s+(?:sources?|references?|stud(?:y|ies)|articles?|papers?|work|data|evidence))/gi,
    replacement: "cite",
  },
];

export function contextRuleIssues(text: string): AxiomIssue[] {
  const issues: AxiomIssue[] = [];
  for (const rule of CONTEXT_RULES) {
    rule.pattern.lastIndex = 0;
    for (const match of text.matchAll(rule.pattern)) {
      const originalText = match[1] ?? match[0];
      const offset = (match.index ?? 0) + match[0].indexOf(originalText);
      issues.push({
        id: "",
        source: "axiom",
        ruleId: rule.ruleId,
        category: rule.category,
        severity: "suggestion",
        message: rule.message,
        explanation: rule.explanation,
        from: offset,
        to: offset + originalText.length,
        originalText,
        suggestions: [{ kind: "replace", text: rule.replacement }],
      });
    }
  }
  return issues;
}
