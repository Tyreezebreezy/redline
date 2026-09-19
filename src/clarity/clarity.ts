import type { WritingProfile } from "../axiom/axiom";

export type ClarityFinding = {
  id: string;
  category: "long-sentence" | "repeated-opener" | "wordy-phrase";
  message: string;
  from: number;
  to: number;
  originalText: string;
  replacement?: string;
};

export type EditorClarityFinding = ClarityFinding & {
  editorFrom: number;
  editorTo: number;
};

const WORDY_PHRASES: { phrase: string; replacement: string }[] = [
  { phrase: "due to the fact that", replacement: "because" },
  { phrase: "in order to", replacement: "to" },
  { phrase: "in the event that", replacement: "if" },
  { phrase: "at this point in time", replacement: "now" },
  { phrase: "in spite of the fact that", replacement: "although" },
  { phrase: "a large number of", replacement: "many" },
  { phrase: "the vast majority of", replacement: "most" },
  { phrase: "in the near future", replacement: "soon" },
  { phrase: "for the purpose of", replacement: "to" },
  { phrase: "with regard to", replacement: "about" },
  { phrase: "in the process of", replacement: "during" },
];

const LONG_SENTENCE_WORDS = 40;
const COMMON_OPENERS = new Set([
  "a", "an", "the", "this", "that", "these", "those", "it", "he", "she", "we",
  "they", "you", "i", "and", "but", "or", "so", "for", "nor", "yet", "if",
  "when", "while", "as", "in", "on", "at", "to", "of", "with", "by", "from",
  "there", "here",
]);

type Sentence = { from: number; to: number; text: string };

function splitSentences(text: string): Sentence[] {
  const sentences: Sentence[] = [];
  const pattern = /[^.!?]+[.!?]+[\s\u2029]*|.+$/gu;
  for (const match of text.matchAll(pattern)) {
    const trimmed = match[0].trim();
    if (trimmed) {
      sentences.push({
        from: match.index ?? 0,
        to: (match.index ?? 0) + match[0].length,
        text: trimmed,
      });
    }
  }
  return sentences;
}

function firstWord(sentence: string): string | null {
  const match = sentence.match(/^[\p{L}\p{M}'’-]+/u);
  if (!match) return null;
  const word = match[0].toLocaleLowerCase("en-US");
  if (COMMON_OPENERS.has(word)) return null;
  return word;
}

export function analyzeClarity(
  text: string,
  profile: WritingProfile,
): ClarityFinding[] {
  const findings: ClarityFinding[] = [];

  for (const { phrase, replacement } of WORDY_PHRASES) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const pattern = new RegExp(escaped, "giu");
    for (const match of text.matchAll(pattern)) {
      findings.push({
        id: "",
        category: "wordy-phrase",
        message: `Consider “${replacement}” instead of “${phrase}”.`,
        from: match.index ?? 0,
        to: (match.index ?? 0) + match[0].length,
        originalText: match[0],
        replacement,
      });
    }
  }

  if (profile === "general") {
    return findings.sort((left, right) => left.from - right.from);
  }

  const sentences = splitSentences(text);
  for (const sentence of sentences) {
    const words = sentence.text.split(/\s+/u).filter(Boolean).length;
    if (words > LONG_SENTENCE_WORDS) {
      findings.push({
        id: "",
        category: "long-sentence",
        message: `This sentence is unusually long (${words} words).`,
        from: sentence.from,
        to: sentence.to,
        originalText: sentence.text,
      });
    }
  }

  for (let index = 0; index + 2 < sentences.length; index += 1) {
    const opener = firstWord(sentences[index].text);
    if (!opener) continue;
    if (
      firstWord(sentences[index + 1].text) === opener &&
      firstWord(sentences[index + 2].text) === opener
    ) {
      findings.push({
        id: "",
        category: "repeated-opener",
        message: `Several sentences begin with “${opener}”.`,
        from: sentences[index].from,
        to: sentences[index + 2].to,
        originalText: opener,
      });
    }
  }

  return findings.sort((left, right) => left.from - right.from);
}
