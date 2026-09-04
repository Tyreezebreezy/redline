export type AxiomSuggestion = {
  kind: "replace" | "remove" | "insert-after";
  text: string;
};

export type WritingProfile = "general" | "academic" | "professional";

export const PROFILE_RULE_OVERRIDES: Record<
  WritingProfile,
  Readonly<Record<string, boolean>>
> = {
  general: {},
  academic: { AvoidContractions: true },
  professional: {},
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
  analyze(
    text: string,
    ruleOverrides: Readonly<Record<string, boolean>>,
  ): Promise<AxiomIssue[]>;
};

export type AxiomControls = {
  dictionary: ReadonlySet<string>;
  profile: WritingProfile;
};

const DEFAULT_CONTROLS: AxiomControls = {
  dictionary: new Set(),
  profile: "general",
};

const CANONICAL_TERMS = ["Facebook Marketplace", "LinkedIn Learning"];
const WORD_CHARACTER = /[\p{L}\p{M}\p{N}]/u;

function canonicalTermIssues(text: string): AxiomIssue[] {
  const issues: AxiomIssue[] = [];
  for (const canonical of CANONICAL_TERMS) {
    const pattern = new RegExp(canonical, "giu");
    for (const match of text.matchAll(pattern)) {
      const from = match.index;
      const to = from + match[0].length;
      if (
        match[0] === canonical ||
        WORD_CHARACTER.test(text[from - 1] ?? "") ||
        WORD_CHARACTER.test(text[to] ?? "")
      ) {
        continue;
      }
      const canonicalWords = canonical.split(" ");
      const observedWords = match[0].split(" ");
      const mismatches = observedWords.flatMap((word, index) =>
        word === canonicalWords[index] ? [] : [index],
      );
      const firstMismatch = mismatches[0];
      const lastMismatch = mismatches[mismatches.length - 1];
      if (firstMismatch === undefined || lastMismatch === undefined) continue;
      const prefix = observedWords.slice(0, firstMismatch).join(" ");
      const issueFrom = from + prefix.length + Number(prefix.length > 0);
      const originalText = observedWords
        .slice(firstMismatch, lastMismatch + 1)
        .join(" ");
      issues.push({
        id: "",
        source: "axiom",
        ruleId: "CanonicalTerm",
        category: "formatting",
        severity: "suggestion",
        message: `Use the canonical name “${canonical}”.`,
        explanation:
          "REDLINE preserves the official capitalization of known product and service names.",
        from: issueFrom,
        to: issueFrom + originalText.length,
        originalText,
        suggestions: [
          {
            kind: "replace",
            text: canonicalWords
              .slice(firstMismatch, lastMismatch + 1)
              .join(" "),
          },
        ],
      });
    }
  }
  return issues;
}

export function normalizeDictionaryTerm(term: string) {
  return term.trim().normalize("NFC").toLowerCase().normalize("NFC");
}

export function isDictionaryEligible(issue: AxiomIssue) {
  const term = issue.originalText.trim().normalize("NFC");
  const length = [...term].length;
  return (
    issue.source === "harper" &&
    issue.ruleId === "SpellCheck" &&
    length >= 2 &&
    length <= 64 &&
    /[\p{L}\p{N}]/u.test(term) &&
    /^[\p{L}\p{N}](?:[\p{L}\p{M}\p{N}'’-]*[\p{L}\p{N}])?$/u.test(term)
  );
}

export type ProtectedSpan = {
  from: number;
  to: number;
};

const PATTERNS = [
  /\b(?:https?:\/\/|www\.)[^\s<>()]+/giu,
  /\b[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/gu,
  /(?<![\w.-])\*\.(?:[A-Za-z\d-]+\.)+[A-Za-z]{2,}\b/gu,
  /(?<![\w])@[A-Za-z\d][\w.-]*\/[A-Za-z\d][\w.-]*/gu,
  /\b(?:application|audio|font|image|message|model|multipart|text|video)\/[A-Za-z\d][A-Za-z\d!#$&^_.+-]*\b/giu,
  /\b[A-Za-z]:\\(?:[^\\\s]+\\?)+/gu,
  /\\\\[^\s\\]+\\[^\s]+/gu,
  /(?:^|\s)(\/(?:[\w.@+-]+\/)*[\w.@+-]+)/gu,
  /(?:^|\s)(--?[A-Za-z][\w-]*(?:=[^\s]+)?)/gu,
  /\b(?:\d{1,3}\.){3}\d{1,3}\/(?:\d|[12]\d|3[0-2])\b/gu,
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/gu,
  /(?<![\w:])(?=[A-Fa-f\d:]*[A-Fa-f\d])(?:[A-Fa-f\d]{0,4}:){1,7}:[A-Fa-f\d]{0,4}(?:\/(?:\d|[1-9]\d|1[01]\d|12[0-8]))?(?![\w:])/gu,
  /(?<![\w:])(?:[A-Fa-f\d]{1,4}:){3,7}[A-Fa-f\d]{1,4}(?:\/(?:\d|[1-9]\d|1[01]\d|12[0-8]))?(?![\w:])/gu,
  /\b(?:[A-Fa-f\d]{2}[:-]){5}[A-Fa-f\d]{2}\b/gu,
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
  controls: AxiomControls = DEFAULT_CONTROLS,
): Promise<AxiomIssue[]> {
  const protectedSpans = findProtectedSpans(text);
  const canonicalIssues = canonicalTermIssues(text);
  const issues = (
    await provider.analyze(text, PROFILE_RULE_OVERRIDES[controls.profile])
  )
    .filter(
      (issue) =>
        !canonicalIssues.some(
          (canonical) =>
            issue.from >= canonical.from && issue.to <= canonical.to,
        ),
    )
    .concat(canonicalIssues)
    .filter((issue) => validIssue(text, issue))
    .filter(
      (issue) =>
        !protectedSpans.some(
          (span) =>
            issue.from < span.to &&
            (issue.from === issue.to || issue.to > span.from),
        ),
    )
    .filter(
      (issue) =>
        !isDictionaryEligible(issue) ||
        !controls.dictionary.has(normalizeDictionaryTerm(issue.originalText)),
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
