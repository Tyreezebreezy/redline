import type { AxiomIssue } from "./axiom.ts";

export type StyleRuleInput = {
  ruleType: "preferred-term" | "preferred-capitalization";
  fromText: string;
  toText: string;
  enabled: boolean;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function styleRuleIssues(
  text: string,
  rules: readonly StyleRuleInput[],
): AxiomIssue[] {
  const issues: AxiomIssue[] = [];
  for (const rule of rules) {
    if (!rule.enabled || !rule.fromText || !rule.toText) continue;
    const flags = rule.ruleType === "preferred-term" ? "giu" : "gu";
    let pattern: RegExp;
    try {
      pattern = new RegExp(escapeRegExp(rule.fromText), flags);
    } catch {
      continue;
    }
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      if (match[0] === rule.toText) continue;
      issues.push({
        id: "",
        source: "axiom",
        ruleId: "StyleGuide",
        category: "formatting",
        severity: "suggestion",
        message: `Use “${rule.toText}” instead of “${match[0]}”.`,
        explanation: "This is a personal Style Guide preference.",
        from: match.index ?? 0,
        to: (match.index ?? 0) + match[0].length,
        originalText: match[0],
        suggestions: [{ kind: "replace", text: rule.toText }],
      });
    }
  }
  return issues;
}
