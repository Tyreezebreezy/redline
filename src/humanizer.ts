import { terminologySnapshot } from "./axiom/terminology.ts";
import type { DictionaryEntry, VoiceLane } from "./documents";

export const VOICE_SPEC_VERSION = "redline-voice-v1";

export const VOICE_LANES: ReadonlyArray<{
  id: VoiceLane;
  label: string;
  summary: string;
}> = [
  {
    id: "natural",
    label: "Natural",
    summary: "Organize the thought while keeping your everyday cadence.",
  },
  {
    id: "professional",
    label: "Professional",
    summary: "Clear, respectful, direct, and free of corporate filler.",
  },
  {
    id: "academic",
    label: "Academic",
    summary: "Structured and precise without inventing evidence or citations.",
  },
];

function wholeTermAt(text: string, term: string, from: number) {
  const word = /[\p{L}\p{M}\p{N}]/u;
  return (
    (from === 0 || !word.test(text[from - 1] ?? "")) &&
    (from + term.length === text.length ||
      !word.test(text[from + term.length] ?? ""))
  );
}

function containsWholeTerm(text: string, term: string) {
  let from = text.indexOf(term);
  while (from >= 0) {
    if (wholeTermAt(text, term, from)) return true;
    from = text.indexOf(term, from + term.length);
  }
  return false;
}

export function humanizerProtectedTerms(
  text: string,
  dictionary: readonly DictionaryEntry[],
) {
  const candidates = [
    ...terminologySnapshot.records.map(({ canonical_name }) => canonical_name),
    ...dictionary.map(({ term }) => term),
  ].sort((left, right) => right.length - left.length);
  return [
    ...new Set(candidates.filter((term) => containsWholeTerm(text, term))),
  ];
}

function occurrences(text: string, term: string) {
  let count = 0;
  let from = text.indexOf(term);
  while (from >= 0) {
    if (wholeTermAt(text, term, from)) count += 1;
    from = text.indexOf(term, from + term.length);
  }
  return count;
}

export function changedHumanizerTerm(
  source: string,
  output: string,
  terms: readonly string[],
) {
  return terms.find(
    (term) => occurrences(source, term) !== occurrences(output, term),
  );
}
