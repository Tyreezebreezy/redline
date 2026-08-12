export type AxiomSuggestion = {
  kind: "replace" | "remove" | "insert-after";
  text: string;
};

export type AxiomIssue = {
  id: string;
  source: string;
  ruleId?: string;
  category:
    | "grammar"
    | "spelling"
    | "punctuation"
    | "style"
    | "readability"
    | "word-choice"
    | "formatting"
    | "other";
  severity: "error" | "warning" | "suggestion";
  message: string;
  explanation?: string;
  from: number;
  to: number;
  originalText: string;
  suggestions: AxiomSuggestion[];
};

export type GrammarProvider = {
  analyze(text: string): Promise<AxiomIssue[]>;
};

export type ProtectedSpan = {
  from: number;
  to: number;
};

const PATTERNS = [
  /\b(?:https?:\/\/|www\.)[^\s<>()]+/giu,
  /\b[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/gu,
  /\b[A-Za-z]:\\(?:[^\\\s]+\\?)+/gu,
  /\\\\[^\s\\]+\\[^\s]+/gu,
  /(?:^|\s)(\/(?:[\w.@+-]+\/)*[\w.@+-]+)/gu,
  /(?:^|\s)(--?[A-Za-z][\w-]*(?:=[^\s]+)?)/gu,
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/gu,
  /\b[a-f\d]{12,}\b/giu,
  /\bv?\d+(?:\.\d+){1,3}(?:[-+][\w.-]+)?\b/giu,
  /\b(?:[A-Za-z]+(?:[A-Z][A-Za-z\d]+)+|[A-Za-z][A-Za-z\d]*_[A-Za-z\d_]+)\b/gu,
  /(?<![\p{L}\p{M}])(?=[\p{L}\p{M}'’.-]*[^\p{ASCII}])\p{Lu}[\p{L}\p{M}'’.-]*(?![\p{L}\p{M}])/gu,
];

export function findProtectedSpans(text: string): ProtectedSpan[] {
  const spans: ProtectedSpan[] = [];
  for (const pattern of PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const protectedText = match[1] ?? match[0];
      const offset = match[0].indexOf(protectedText);
      const from = (match.index ?? 0) + offset;
      const to = from + protectedText.length;
      if (
        /^\d+(?:\.\d+){3}$/.test(protectedText) &&
        protectedText.split(".").some((part) => Number(part) > 255)
      ) {
        continue;
      }
      spans.push({ from, to });
    }
  }

  spans.sort((left, right) => left.from - right.from || left.to - right.to);
  return spans.reduce<ProtectedSpan[]>((merged, span) => {
    const previous = merged[merged.length - 1];
    if (previous && span.from <= previous.to) {
      previous.to = Math.max(previous.to, span.to);
    } else {
      merged.push({ ...span });
    }
    return merged;
  }, []);
}

function validIssue(text: string, issue: AxiomIssue) {
  return (
    Number.isInteger(issue.from) &&
    Number.isInteger(issue.to) &&
    issue.from >= 0 &&
    issue.to >= issue.from &&
    issue.to <= text.length &&
    text.slice(issue.from, issue.to) === issue.originalText
  );
}

export async function analyzeText(
  text: string,
  provider: GrammarProvider,
): Promise<AxiomIssue[]> {
  const protectedSpans = findProtectedSpans(text);
  const issues = (await provider.analyze(text))
    .filter((issue) => validIssue(text, issue))
    .filter(
      (issue) =>
        !protectedSpans.some(
          (span) =>
            issue.from < span.to &&
            (issue.from === issue.to || issue.to > span.from),
        ),
    )
    .sort(
      (left, right) =>
        left.from - right.from ||
        left.to - right.to ||
        (left.ruleId ?? "").localeCompare(right.ruleId ?? ""),
    );

  return issues.map((issue, index) => ({
    ...issue,
    id: `a${index + 1}`,
  }));
}

let providerPromise: Promise<GrammarProvider> | undefined;

export function getGrammarProvider() {
  providerPromise ??= import("./HarperAdapter").then(
    ({ HarperAdapter }) => new HarperAdapter(),
  );
  return providerPromise.catch((error) => {
    providerPromise = undefined;
    throw error;
  });
}
