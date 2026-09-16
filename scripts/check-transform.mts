import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { history } from "@tiptap/pm/history";
import { AllSelection, TextSelection } from "@tiptap/pm/state";
import { Editor } from "@tiptap/react";
import { EDITOR_EXTENSIONS } from "../src/editor.ts";
import {
  acceptTransform,
  captureTransformTarget,
  createTransformTargetPlugin,
  responseAcceptBlock,
  type TransformResponse,
  type TransformSelection,
  transformTargetState,
} from "../src/transform.ts";

const [
  panelSource,
  nativeSource,
  permissionSource,
  corpusText,
  manualScoresText,
] = await Promise.all([
  readFile(new URL("../src/AppShell.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/src/transform.rs", import.meta.url), "utf8"),
  readFile(
    new URL("../src-tauri/permissions/transform.toml", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../benchmarks/transform-corpus.json", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../benchmarks/transform-manual-scores.json", import.meta.url),
    "utf8",
  ),
]);

const corpus = JSON.parse(corpusText) as {
  cases: Array<{ id: string; kind: string; preset: string }>;
  version: string;
};
const manualScores = JSON.parse(manualScoresText) as {
  scores: Array<{
    id: string;
    meaningPreservation: number;
    presetAdherence: number;
  }>;
  version: string;
};
assert.equal(corpus.version, "redline-transform-corpus-v1");
assert.equal(corpus.cases.length, 40);
assert.deepEqual(
  [...new Set(corpus.cases.map(({ preset }) => preset))].sort(),
  ["academic", "concise", "professional"],
);
assert.equal(corpus.cases.filter(({ kind }) => kind === "normal").length, 24);
assert.equal(corpus.cases.filter(({ kind }) => kind !== "normal").length, 16);
assert.equal(manualScores.version, "redline-transform-manual-scores-v1");
assert.equal(manualScores.scores.length, 24);
assert.deepEqual(
  manualScores.scores.map(({ id }) => id).sort(),
  corpus.cases
    .filter(({ kind }) => kind === "normal")
    .map(({ id }) => id)
    .sort(),
);
for (const preset of ["concise", "professional", "academic"]) {
  const scores = manualScores.scores.filter(({ id }) => id.startsWith(preset));
  const median = (values: number[]) =>
    values.toSorted((left, right) => left - right)[values.length / 2 - 1];
  assert.ok(
    median(scores.map(({ meaningPreservation }) => meaningPreservation)) >= 4,
  );
  assert.ok(median(scores.map(({ presetAdherence }) => presetAdherence)) >= 4);
}
assert.ok(
  manualScores.scores.filter(
    ({ meaningPreservation, presetAdherence }) =>
      meaningPreservation >= 4 && presetAdherence >= 4,
  ).length /
    manualScores.scores.length >=
    0.85,
);

const transformPanelSource = panelSource.slice(
  panelSource.indexOf("export function TransformPanel"),
  panelSource.indexOf("type StatusBarProps"),
);
assert.deepEqual(
  [...transformPanelSource.matchAll(/<option value="([a-z]+)">/g)].map(
    (match) => match[1],
  ),
  ["concise", "professional", "academic"],
);
assert.doesNotMatch(transformPanelSource, /Archaic|Gothic Command/);
assert.match(transformPanelSource, /Model not installed/);
assert.match(transformPanelSource, /Check again/);
assert.match(
  transformPanelSource,
  /%LOCALAPPDATA%\\com\.tyree\.redline\\models\\qwen2\.5-1\.5b-instruct-q4_k_m\.gguf/,
);
assert.match(
  nativeSource,
  /TRANSFORM_PROMPT_CONTRACT_VERSION: &str = "redline-transform-v1"/,
);
assert.match(nativeSource, /MAX_INPUT_SCALARS: usize = 4_?000/);
assert.doesNotMatch(nativeSource, /https?:\/\/|reqwest|ureq/);
const commands =
  permissionSource.match(/commands\.allow = \[([\s\S]*?)\]/)?.[1] ?? "";
assert.deepEqual(
  [...commands.matchAll(/"([a-z_]+)"/g)].map((match) => match[1]),
  ["transform_status", "generate_transform", "cancel_transform"],
);

function editorWith(content: object) {
  const editor = new Editor({
    content,
    element: null,
    extensions: EDITOR_EXTENSIONS,
  });
  editor.registerPlugin(history());
  editor.registerPlugin(createTransformTargetPlugin());
  return editor;
}

function select(editor: Editor, from: number, to: number) {
  editor.view.dispatch(
    editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, from, to),
    ),
  );
}

function response(
  overrides: Partial<TransformResponse> = {},
): TransformResponse {
  return {
    identicalOutput: false,
    invariants: {
      changedNumbers: false,
      invented: {},
      missing: {},
      protectedTokenMutations: 0,
    },
    metrics: {
      generatedTokens: 4,
      generationMs: 2,
      modelLoadMs: 0,
      promptProcessingMs: 1,
      tokensPerSecond: 2,
      totalMs: 3,
    },
    promptContractVersion: "redline-transform-v1",
    requestId: "request-1",
    text: "clear text",
    ...overrides,
  } as TransformResponse;
}

for (const marks of [[], ["bold"], ["italic"], ["bold", "italic"]]) {
  const original = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}),
            text: "wordy text",
            type: "text",
          },
        ],
      },
    ],
  };
  const editor = editorWith(original);
  select(editor, 1, 11);
  const captured = captureTransformTarget(
    editor,
    `marks-${marks.join("-")}`,
    1,
  );
  assert.equal(captured.ok, true);
  assert.equal(captured.acceptSupported, true);
  assert.equal(
    acceptTransform(editor, `marks-${marks.join("-")}`, 1, "clear text").ok,
    true,
  );
  assert.deepEqual(
    editor.getJSON().content?.[0].content?.[0].marks?.map(({ type }) => type) ??
      [],
    marks,
  );
  assert.equal(editor.commands.undo(), true);
  assert.deepEqual(editor.getJSON(), original);
  assert.equal(editor.commands.redo(), true);
  assert.equal(editor.getText(), "clear text");
  editor.destroy();
}

{
  const editor = editorWith({
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Select all" }] },
    ],
  });
  editor.view.dispatch(
    editor.state.tr.setSelection(new AllSelection(editor.state.doc)),
  );
  const captured = captureTransformTarget(editor, "select-all", 1);
  assert.equal(captured.ok, true);
  assert.equal(captured.acceptSupported, true);
  assert.equal(acceptTransform(editor, "select-all", 1, "Selected").ok, true);
  assert.equal(editor.getText(), "Selected");
  editor.destroy();
}

{
  const editor = editorWith({
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Intro" }] },
      { type: "paragraph", content: [{ type: "text", text: "Keep this" }] },
    ],
  });
  select(editor, 8, 17);
  assert.equal(captureTransformTarget(editor, "mapped", 2).ok, true);
  editor.view.dispatch(editor.state.tr.insertText("Before. ", 1));
  assert.equal(transformTargetState(editor, "mapped", 2).current, true);
  assert.equal(acceptTransform(editor, "mapped", 2, "Retain this").ok, true);
  assert.equal(editor.getText(), "Before. Intro\n\nRetain this");
  editor.destroy();
}

{
  const editor = editorWith({
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Do not touch" }] },
    ],
  });
  select(editor, 1, 13);
  assert.equal(captureTransformTarget(editor, "stale", 3).ok, true);
  editor.view.dispatch(editor.state.tr.insertText("changed", 4, 8));
  assert.equal(transformTargetState(editor, "stale", 3).current, false);
  assert.equal(acceptTransform(editor, "stale", 3, "unsafe").ok, false);
  assert.equal(editor.getText(), "Do changedtouch");

  select(editor, 1, editor.state.doc.content.size - 1);
  assert.equal(captureTransformTarget(editor, "wrong-document", 3).ok, true);
  assert.equal(
    acceptTransform(editor, "wrong-document", 4, "wrong document").ok,
    false,
  );
  assert.equal(editor.getText(), "Do changedtouch");
  editor.destroy();
}

for (const content of [
  {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { marks: [{ type: "bold" }], text: "mixed", type: "text" },
          { marks: [{ type: "italic" }], text: " marks", type: "text" },
        ],
      },
    ],
  },
  {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "one" }] },
      { type: "paragraph", content: [{ type: "text", text: "two" }] },
    ],
  },
]) {
  const editor = editorWith(content);
  select(editor, 1, editor.state.doc.content.size - 1);
  const captured = captureTransformTarget(editor, "complex", 5);
  assert.equal(captured.ok, true);
  assert.equal(captured.acceptSupported, false);
  assert.equal(acceptTransform(editor, "complex", 5, "unsafe").ok, false);
  assert.deepEqual(editor.getJSON(), content);
  editor.destroy();
}

const selection: TransformSelection = {
  acceptReason: null,
  acceptSupported: true,
  mode: "transform",
  original: "Version 2.0 costs $40.",
  preset: "concise",
  protectedTerms: [],
  targetId: "invariants",
};
assert.match(
  responseAcceptBlock(
    response({
      invariants: {
        changedNumbers: true,
        invented: { numbers: ["50"] },
        missing: { numbers: ["40"] },
        protectedTokenMutations: 2,
      },
    }),
    selection,
  ) ?? "",
  /Protected factual or technical tokens changed/,
);
assert.match(
  responseAcceptBlock(response({ identicalOutput: true }), selection) ?? "",
  /identical/,
);
assert.match(
  responseAcceptBlock(response({ text: "one\ntwo" }), selection) ?? "",
  /structural line breaks/,
);

console.log(
  "REDLINE Transform mapping, safety, formatting, undo, presets, and command boundary verified.",
);
