import {
  Dialect,
  type Lint,
  type Linter,
  SuggestionKind,
  WorkerLinter,
} from "harper.js";
import { binary } from "harper.js/binary";
import type { AxiomIssue, AxiomSuggestion, GrammarProvider } from "./axiom";

function utf16Boundaries(text: string) {
  const boundaries = [0];
  let offset = 0;
  for (const scalar of text) {
    offset += scalar.length;
    boundaries.push(offset);
  }
  return boundaries;
}

function category(kind: string, ruleId: string): AxiomIssue["category"] {
  if (ruleId === "AnA") return "grammar";
  switch (kind) {
    case "Grammar":
    case "Agreement":
    case "BoundaryError":
    case "WordOrder":
      return "grammar";
    case "Spelling":
    case "Typo":
      return "spelling";
    case "Punctuation":
    case "Capitalization":
      return "punctuation";
    case "Style":
    case "Redundancy":
    case "Repetition":
      return "style";
    case "Readability":
      return "readability";
    case "WordChoice":
    case "Malapropism":
    case "Eggcorn":
    case "Usage":
    case "Nonstandard":
    case "Regionalism":
      return "word-choice";
    case "Formatting":
      return "formatting";
    default:
      return "other";
  }
}

function normalizeSuggestions(lint: Lint): AxiomSuggestion[] {
  return lint.suggestions().map((suggestion) => {
    const kind = suggestion.kind();
    const normalized: AxiomSuggestion = {
      kind:
        kind === SuggestionKind.Remove
          ? "remove"
          : kind === SuggestionKind.InsertAfter
            ? "insert-after"
            : "replace",
      text: suggestion.get_replacement_text(),
    };
    suggestion.free();
    return normalized;
  });
}

export async function analyzeWithHarper(
  linter: Linter,
  text: string,
): Promise<AxiomIssue[]> {
  const boundaries = utf16Boundaries(text);
  const groups = await linter.organizedLints(text, { language: "plaintext" });
  const issues: AxiomIssue[] = [];

  for (const [ruleId, lints] of Object.entries(groups)) {
    for (const lint of lints) {
      const span = lint.span();
      try {
        const problemText = lint.get_problem_text();
        let from = span.start;
        let to = span.end;
        if (text.slice(from, to) !== problemText) {
          const scalarFrom = boundaries[span.start];
          const scalarTo = boundaries[span.end];
          if (
            scalarFrom === undefined ||
            scalarTo === undefined ||
            text.slice(scalarFrom, scalarTo) !== problemText
          ) {
            continue;
          }
          from = scalarFrom;
          to = scalarTo;
        }
        issues.push({
          id: "",
          source: "harper",
          ruleId,
          category: category(lint.lint_kind(), ruleId),
          severity: "suggestion",
          message: lint.message(),
          from,
          to,
          originalText: problemText,
          suggestions: normalizeSuggestions(lint),
        });
      } finally {
        span.free();
        lint.free();
      }
    }
  }
  return issues;
}

export class HarperAdapter implements GrammarProvider {
  readonly #linter = new WorkerLinter({ binary, dialect: Dialect.American });
  #baseline: Awaited<ReturnType<Linter["getDefaultLintConfig"]>> | undefined;
  #configuration = "";
  #queue = Promise.resolve();

  analyze(text: string, ruleOverrides: Readonly<Record<string, boolean>>) {
    const operation = this.#queue.then(async () => {
      this.#baseline ??= await this.#linter.getDefaultLintConfig();
      const configuration = JSON.stringify(ruleOverrides);
      if (configuration !== this.#configuration) {
        for (const rule of Object.keys(ruleOverrides)) {
          if (!(rule in this.#baseline)) {
            throw new Error(`Harper rule is unavailable: ${rule}`);
          }
        }
        await this.#linter.setLintConfig({
          ...this.#baseline,
          ...ruleOverrides,
        });
        this.#configuration = configuration;
      }
      return analyzeWithHarper(this.#linter, text);
    });
    this.#queue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }
}
