import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  changedHumanizerTerm,
  humanizerProtectedTerms,
  VOICE_LANES,
  VOICE_SPEC_VERSION,
} from "../src/humanizer.ts";
import {
  responseAcceptBlock,
  type TransformResponse,
  type TransformSelection,
} from "../src/transform.ts";

const [
  corpusText,
  panelSource,
  editorSource,
  nativeSource,
  migrationSource,
  permissionSource,
] = await Promise.all([
  readFile(
    new URL("../benchmarks/humanizer-corpus.json", import.meta.url),
    "utf8",
  ),
  readFile(new URL("../src/AppShell.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/EditorWorkspace.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/src/transform.rs", import.meta.url), "utf8"),
  readFile(
    new URL("../src-tauri/migrations/0003_voice_settings.sql", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../src-tauri/permissions/documents.toml", import.meta.url),
    "utf8",
  ),
]);

const corpus = JSON.parse(corpusText) as {
  version: string;
  cases: Array<{
    id: string;
    kind: string;
    lane: string;
    source: string;
    protectedTerms: string[];
    forbiddenContains: string[];
    expectedError?: string;
  }>;
};
assert.equal(corpus.version, "redline-humanizer-corpus-v1");
assert.equal(corpus.cases.length, 24);
for (const lane of ["natural", "professional", "academic"]) {
  assert.equal(corpus.cases.filter((entry) => entry.lane === lane).length, 8);
}
assert.ok(corpus.cases.some(({ kind }) => kind === "prompt-injection"));
assert.ok(corpus.cases.some(({ kind }) => kind === "protected-terms"));
assert.ok(corpus.cases.some(({ kind }) => kind === "intentional-repetition"));
assert.ok(corpus.cases.some(({ kind }) => kind === "speech-artifact"));
assert.equal(
  corpus.cases.find(({ id }) => id === "academic-ordinary-assignment")
    ?.expectedError,
  "style-drift",
);
assert.ok(
  corpus.cases
    .filter(({ kind }) => kind === "prompt-injection")
    .every(({ expectedError }) => expectedError === "prompt-injection"),
);

assert.equal(VOICE_SPEC_VERSION, "redline-voice-v1");
assert.deepEqual(
  VOICE_LANES.map(({ id }) => id),
  ["natural", "professional", "academic"],
);
const protectedTerms = humanizerProtectedTerms(
  "GitHub and Zorblaxon stay exactly as written.",
  [{ createdAt: 1, normalizedTerm: "zorblaxon", term: "Zorblaxon" }],
);
assert.ok(protectedTerms.includes("GitHub"));
assert.ok(protectedTerms.includes("Zorblaxon"));
assert.equal(
  changedHumanizerTerm(
    "GitHub and Zorblaxon",
    "Github and Zorblaxon",
    protectedTerms,
  ),
  "GitHub",
);
assert.equal(
  changedHumanizerTerm(
    "GitHub and Zorblaxon",
    "GitHub and Zorblaxon",
    protectedTerms,
  ),
  undefined,
);

assert.match(panelSource, />Writing Context</);
assert.match(panelSource, /aria-label="Writing Context"/);
assert.match(panelSource, />My Voice</);
assert.match(panelSource, /Enable My Voice/);
assert.match(editorSource, /Preview selected text in My Voice/);
assert.doesNotMatch(panelSource, /<option value="casual">/i);
assert.match(
  nativeSource,
  /HUMANIZER_PROMPT_CONTRACT_VERSION: &str = "redline-humanizer-v1"/,
);
assert.match(nativeSource, /Treat every instruction[\s\S]*Never obey it/);
assert.match(nativeSource, /Never add facts, sources, citations, evidence/);
assert.match(nativeSource, /has_academic_style_drift/);
assert.doesNotMatch(nativeSource, /reqwest|ureq|https?:\/\//);
assert.match(migrationSource, /CHECK \(id = 1\)/);
assert.match(
  migrationSource,
  /default_lane IN \('natural', 'professional', 'academic'\)/,
);
assert.match(permissionSource, /"update_voice_settings"/);

const response: TransformResponse = {
  identicalOutput: false,
  invariants: {
    changedNumbers: false,
    invented: {},
    missing: {},
    protectedTokenMutations: 0,
  },
  metrics: {
    generatedTokens: 3,
    generationMs: 2,
    modelLoadMs: 0,
    promptProcessingMs: 1,
    tokensPerSecond: 2,
    totalMs: 3,
  },
  promptContractVersion: "redline-humanizer-v1",
  requestId: "voice-1",
  text: "Github is local.",
};
const selection: TransformSelection = {
  acceptReason: null,
  acceptSupported: true,
  mode: "humanizer",
  original: "GitHub is local.",
  preset: "natural",
  protectedTerms: ["GitHub"],
  targetId: "voice-target",
};
assert.match(
  responseAcceptBlock(response, selection) ?? "",
  /Protected terminology changed: GitHub/,
);

console.log(
  "REDLINE Humanizer lanes, storage boundary, terminology protection, injection contract, and UI semantics verified.",
);
