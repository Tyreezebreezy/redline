import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { history } from "@tiptap/pm/history";
import { TextSelection } from "@tiptap/pm/state";
import { Editor } from "@tiptap/react";
import {
  captureDictationTarget,
  createDictationTargetPlugin,
  insertDictationTranscript,
} from "../src/dictation.ts";
import { EDITOR_EXTENSIONS } from "../src/editor.ts";

const [
  captureSource,
  workspaceSource,
  nativeSource,
  commandSource,
  workletSource,
] = await Promise.all([
  readFile(new URL("../src/dictation.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/EditorWorkspace.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/src/dictation.rs", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/src/app.rs", import.meta.url), "utf8"),
  readFile(new URL("../public/dictation-capture.js", import.meta.url), "utf8"),
]);
assert.match(
  captureSource,
  /getUserMedia\(\{\s*audio: true,\s*video: false,?\s*\}\)/,
);
assert.match(captureSource, /new Int16Array/);
assert.match(captureSource, /Uint8Array/);
assert.match(captureSource, /track\.stop\(\)/);
assert.match(captureSource, /"stop_dictation", pcm/);
assert.match(commandSource, /InvokeBody::Raw\(pcm\)/);
assert.doesNotMatch(nativeSource, /\bcpal\b|build_input_stream/);
assert.match(workletSource, /registerProcessor\("redline-pcm-capture"/);
assert.match(
  captureSource,
  /Microphone access is blocked\. Open recovery help for next steps\./,
);
assert.match(workspaceSource, /<summary>Microphone permission help<\/summary>/);
assert.match(workspaceSource, /%LOCALAPPDATA%\\com\.tyree\.redline\\EBWebView/);

function editorWith(content: object) {
  const editor = new Editor({
    content,
    element: null,
    extensions: EDITOR_EXTENSIONS,
  });
  editor.registerPlugin(history());
  editor.registerPlugin(createDictationTargetPlugin());
  return editor;
}

function select(editor: Editor, from: number, to = from) {
  editor.view.dispatch(
    editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, from, to),
    ),
  );
}

{
  const editor = editorWith({
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Helloworld" }] },
    ],
  });
  select(editor, 6);
  assert.equal(captureDictationTarget(editor, "session-map-01", 7).ok, true);
  editor.view.dispatch(editor.state.tr.insertText("Say: ", 1));
  const mappedInsertion = insertDictationTranscript(
    editor,
    "session-map-01",
    7,
    "beautiful",
  );
  assert.equal(mappedInsertion.ok, true, JSON.stringify(mappedInsertion));
  assert.equal(editor.getText(), "Say: Hello beautiful world");
  assert.equal(editor.commands.undo(), true);
  assert.equal(editor.getText(), "Say: Helloworld");
  assert.equal(editor.commands.redo(), true);
  assert.equal(editor.getText(), "Say: Hello beautiful world");
  editor.destroy();
}

for (const marks of [["bold"], ["italic"], ["bold", "italic"]]) {
  const original = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            marks: marks.map((type) => ({ type })),
            text: "replace",
          },
        ],
      },
    ],
  };
  const editor = editorWith(original);
  select(editor, 1, 8);
  assert.equal(
    captureDictationTarget(editor, `session-${marks.join("-")}`, 2).ok,
    true,
  );
  assert.equal(
    insertDictationTranscript(editor, `session-${marks.join("-")}`, 2, "spoken")
      .ok,
    true,
  );
  assert.deepEqual(
    editor.getJSON().content?.[0].content?.[0].marks?.map(({ type }) => type),
    marks,
  );
  assert.equal(editor.commands.undo(), true);
  assert.deepEqual(editor.getJSON(), original);
  editor.destroy();
}

{
  const editor = editorWith({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", marks: [{ type: "bold" }], text: "mixed" },
          { type: "text", marks: [{ type: "italic" }], text: " marks" },
        ],
      },
    ],
  });
  select(editor, 1, 12);
  assert.equal(captureDictationTarget(editor, "session-mixed-01", 1).ok, false);
  editor.destroy();
}

{
  const editor = editorWith({
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Helloworld" }] },
    ],
  });
  select(editor, 6);
  assert.equal(captureDictationTarget(editor, "session-stale-01", 3).ok, true);
  editor.view.dispatch(editor.state.tr.insertText("changed", 6));
  assert.equal(
    insertDictationTranscript(editor, "session-stale-01", 3, "unsafe").ok,
    false,
  );
  assert.equal(editor.getText(), "Hellochangedworld");

  select(editor, 6);
  assert.equal(
    captureDictationTarget(editor, "session-document-01", 3).ok,
    true,
  );
  assert.equal(
    insertDictationTranscript(
      editor,
      "session-document-01",
      4,
      "wrong document",
    ).ok,
    false,
  );
  editor.destroy();
}

console.log(
  "REDLINE dictation mapping, formatting, spacing, and undo verified.",
);
