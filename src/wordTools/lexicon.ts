type SynsetCompact = {
  d?: string[];
  m?: string[];
  a?: string[];
  h?: string[];
};

type SnapshotType = {
  schema_version: number;
  word_count: number;
  synset_count: number;
  words: Record<string, Record<string, string[]>>;
  synsets: Record<string, SynsetCompact>;
};

export type WordSense = {
  pos: string;
  definition: string[];
  synonyms: string[];
  antonyms: string[];
  related: string[];
};

export type WordToolsResult = {
  word: string;
  senses: WordSense[];
};

let snapshotPromise: Promise<SnapshotType> | undefined;

function loadSnapshot(): Promise<SnapshotType> {
  snapshotPromise ??= import("./lexicon.v1.json").then(
    (module) => module.default as SnapshotType,
  );
  return snapshotPromise;
}

const POS_LABEL: Record<string, string> = {
  n: "noun",
  v: "verb",
  a: "adjective",
  s: "adjective",
  r: "adverb",
};

function membersOf(
  snapshot: SnapshotType,
  ids: string[] | undefined,
): string[] {
  if (!ids) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    for (const member of snapshot.synsets[id]?.m ?? []) {
      const key = member.normalize("NFC").toLocaleLowerCase("en-US");
      if (!seen.has(key)) {
        seen.add(key);
        out.push(member);
      }
    }
  }
  return out;
}

function dedupe(values: string[], exclude: string): string[] {
  const excluded = exclude.normalize("NFC").toLocaleLowerCase("en-US");
  const seen = new Set<string>([excluded]);
  const out: string[] = [];
  for (const value of values) {
    const key = value.normalize("NFC").toLocaleLowerCase("en-US");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export async function lookupWord(word: string): Promise<WordToolsResult | null> {
  const snapshot = await loadSnapshot();
  const key = word.normalize("NFC").toLocaleLowerCase("en-US");
  const entry = snapshot.words[key];
  if (!entry) return null;

  const senses: WordSense[] = [];
  for (const [pos, synsetIds] of Object.entries(entry)) {
    for (const id of synsetIds) {
      const synset: SynsetCompact = snapshot.synsets[id];
      if (!synset) continue;
      const members = synset.m ?? [];
      senses.push({
        pos,
        definition: synset.d ?? [],
        synonyms: dedupe(members, word),
        antonyms: dedupe(membersOf(snapshot, synset.a), word),
        related: dedupe(membersOf(snapshot, synset.h), word),
      });
    }
  }
  if (!senses.length) return null;

  senses.sort((left, right) => {
    const leftPlural = left.synonyms.length + left.antonyms.length + left.related.length;
    const rightPlural = right.synonyms.length + right.antonyms.length + right.related.length;
    return rightPlural - leftPlural;
  });

  return { word, senses };
}

export function posLabel(pos: string): string {
  return POS_LABEL[pos] ?? pos;
}
