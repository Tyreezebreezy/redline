import snapshot from "./terminology.v1.json" with { type: "json" };

export type TerminologyRecord = {
  canonical_name: string;
  aliases: string[];
  entity_type: string;
  source: string;
  source_id: string | null;
  confidence: "high" | "context-required";
  ambiguity: string | null;
  case_sensitive: boolean;
  multiword: boolean;
  version: number;
  notes: string | null;
  context_before?: string[];
  context_after?: string[];
};

export type TerminologyMatch = {
  canonical: string;
  observed: string;
  from: number;
  to: number;
};

const WORD = /[\p{L}\p{M}\p{N}]+(?:[.'\u2019-][\p{L}\p{M}\p{N}]+)*/gu;

export function createTerminologyMatcher(
  records: readonly TerminologyRecord[],
) {
  const aliases = new Map<string, TerminologyRecord>();
  let maximumWords = 1;
  for (const record of records) {
    for (const alias of record.aliases) {
      aliases.set(normalize(alias), record);
      maximumWords = Math.max(maximumWords, alias.split(" ").length);
    }
  }

  return (text: string): TerminologyMatch[] => {
    const tokens = [...text.matchAll(WORD)].map((match) => ({
      from: match.index,
      to: match.index + match[0].length,
      text: match[0],
    }));
    const matches: TerminologyMatch[] = [];
    for (let start = 0; start < tokens.length; start += 1) {
      for (
        let end = Math.min(tokens.length, start + maximumWords);
        end > start;
        end -= 1
      ) {
        const first = tokens[start];
        const last = tokens[end - 1];
        if (!first || !last) continue;
        const observed = text.slice(first.from, last.to);
        if (end - start > 1 && !/^\S+(?: \S+)+$/u.test(observed)) continue;
        const record = aliases.get(normalize(observed));
        if (
          !record ||
          observed === record.canonical_name ||
          !contextAllows(record, tokens, start, end)
        ) {
          continue;
        }
        matches.push({
          canonical: record.canonical_name,
          observed,
          from: first.from,
          to: last.to,
        });
        start = end - 1;
        break;
      }
    }
    return matches;
  };
}

function contextAllows(
  record: TerminologyRecord,
  tokens: { text: string }[],
  start: number,
  end: number,
) {
  if (record.confidence === "high") return true;
  const before = normalize(tokens[start - 1]?.text ?? "");
  const after = normalize(tokens[end]?.text ?? "");
  return (
    record.context_before?.some((hint) => normalize(hint) === before) ===
      true ||
    record.context_after?.some((hint) => normalize(hint) === after) === true
  );
}

function normalize(value: string) {
  return value.normalize("NFC").toLocaleLowerCase("en-US");
}

export const findTerminologyMatches = createTerminologyMatcher(
  snapshot.records as TerminologyRecord[],
);

export const terminologySnapshot = snapshot;
