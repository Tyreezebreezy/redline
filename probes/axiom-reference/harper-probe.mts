import { Dialect, LocalLinter } from "harper.js";
import { binaryInlined } from "harper.js/binaryInlined";

export type HarperProbe = {
  linter: LocalLinter;
  flags(text: string): Promise<string[]>;
  known(word: string): Promise<boolean>;
  flagsMany(words: string[]): Promise<Set<string>>;
  dispose(): Promise<void>;
};

const SPELLING_RULES = new Set([
  "SpellCheck",
  "HiphenateSpellCheck",
  "HiphenateNumberSpellCheck",
  "LooseHyphenSpellCheck",
]);

function spellingLints(
  groups: Record<string, { get_problem_text(): string; lint_kind(): string; free(): void }[]>,
): string[] {
  const words: string[] = [];
  for (const [ruleId, lints] of Object.entries(groups)) {
    if (!SPELLING_RULES.has(ruleId)) continue;
    for (const lint of lints) {
      try {
        if (lint.lint_kind() === "Spelling" || lint.lint_kind() === "Typo") {
          words.push(lint.get_problem_text());
        }
      } finally {
        lint.free();
      }
    }
  }
  return words;
}

export async function createHarperProbe(): Promise<HarperProbe> {
  const linter = new LocalLinter({
    binary: binaryInlined,
    dialect: Dialect.American,
  });
  await linter.setup();

  return {
    linter,
    async flags(text) {
      const groups = await linter.organizedLints(text, { language: "plaintext" });
      return spellingLints(
        groups as Record<
          string,
          { get_problem_text(): string; lint_kind(): string; free(): void }[]
        >,
      );
    },
    async known(word) {
      return (await this.flags(word)).length === 0;
    },
    async flagsMany(words) {
      const flagged = new Set<string>();
      const chunkSize = 2000;
      for (let i = 0; i < words.length; i += chunkSize) {
        const chunk = words.slice(i, i + chunkSize).join(" ");
        for (const word of await this.flags(chunk)) {
          flagged.add(word);
        }
      }
      return flagged;
    },
    async dispose() {
      await linter.dispose();
    },
  };
}
