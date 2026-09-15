import assert from "node:assert/strict";
import { history } from "@tiptap/pm/history";
import { TextSelection } from "@tiptap/pm/state";
import { Editor } from "@tiptap/react";
import {
  captureDictationTarget,
  createDictationTargetPlugin,
  insertDictationTranscript,
} from "../src/dictation.ts";
import { EDITOR_EXTENSIONS } from "../src/editor.ts";

type CommitEvent = { documentId: string; segmentId: number; text: string };

class HybridSession {
  #committed = new Set<number>();
  #documentId = "";
  #state: "idle" | "active" | "paused" | "failed" = "idle";
  partial = "";

  start(documentId: string) {
    this.#documentId = documentId;
    this.#state = "active";
    this.#committed.clear();
    this.partial = "";
  }

  updatePartial(documentId: string, text: string) {
    if (this.#state === "active" && documentId === this.#documentId) {
      this.partial = text;
    }
  }

  finalize(
    documentId: string,
    segmentId: number,
    text: string,
  ): CommitEvent | null {
    const value = text.trim();
    if (
      this.#state !== "active" ||
      documentId !== this.#documentId ||
      !value ||
      this.#committed.has(segmentId)
    ) {
      return null;
    }
    this.#committed.add(segmentId);
    this.partial = "";
    return { documentId, segmentId, text: value };
  }

  pause() {
    if (this.#state === "active") this.#state = "paused";
  }

  resume() {
    if (this.#state === "paused") this.#state = "active";
  }

  cancelPartial() {
    this.partial = "";
  }

  closeDocument() {
    this.#state = "idle";
    this.#documentId = "";
    this.partial = "";
  }

  microphoneLost() {
    this.#state = "failed";
    this.partial = "";
  }
}

function editorWith(text: string) {
  const editor = new Editor({
    content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
    element: null,
    extensions: EDITOR_EXTENSIONS,
  });
  editor.registerPlugin(history());
  editor.registerPlugin(createDictationTargetPlugin());
  return editor;
}

function select(editor: Editor, from: number, to = from) {
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)),
  );
}

const session = new HybridSession();
session.start("document-a");
session.updatePartial("document-a", "first par");
assert.equal(session.partial, "first par");
session.pause();
session.updatePartial("document-a", "ignored while paused");
assert.equal(session.partial, "first par");
session.cancelPartial();
assert.equal(session.partial, "");
session.resume();

const editor = editorWith("Start.");
select(editor, 7);
assert.equal(captureDictationTarget(editor, "session-a", 1).ok, true);
const first = session.finalize("document-a", 1, "first phrase");
assert.ok(first);
assert.equal(insertDictationTranscript(editor, "session-a", 1, first.text).ok, true);
assert.equal(editor.getText(), "Start. first phrase");
assert.equal(session.finalize("document-a", 1, "first phrase"), null);

select(editor, editor.state.selection.from);
assert.equal(captureDictationTarget(editor, "session-b", 1).ok, true);
editor.view.dispatch(editor.state.tr.insertText("opening", 8, 13));
select(editor, 1);
session.updatePartial("document-a", "second par");
const second = session.finalize("document-a", 2, "second phrase");
assert.ok(second);
assert.equal(insertDictationTranscript(editor, "session-b", 1, second.text).ok, true);
assert.equal(editor.getText(), "Start. opening phrase second phrase");
assert.equal(editor.commands.undo(), true);
assert.equal(editor.getText(), "Start. opening phrase");
assert.equal(editor.commands.redo(), true);
assert.equal(editor.getText(), "Start. opening phrase second phrase");

select(editor, editor.state.doc.content.size - 1);
assert.equal(captureDictationTarget(editor, "session-touched", 1).ok, true);
editor.view.dispatch(editor.state.tr.insertText("manual", editor.state.selection.from));
assert.equal(
  insertDictationTranscript(editor, "session-touched", 1, "must refuse").ok,
  false,
);

select(editor, editor.state.doc.content.size - 1);
assert.equal(captureDictationTarget(editor, "session-document", 1).ok, true);
assert.equal(
  insertDictationTranscript(editor, "session-document", 2, "wrong document").ok,
  false,
);
assert.equal(session.finalize("document-b", 3, "wrong document"), null);

session.updatePartial("document-a", "discard me");
session.microphoneLost();
assert.equal(session.partial, "");
assert.equal(session.finalize("document-a", 4, "after failure"), null);
session.closeDocument();
editor.destroy();

console.log(
  "PASS: hybrid partial/final state, one-time commits, user-edit ownership, ProseMirror mapping, cursor independence, undo/redo, touched-target refusal, pause/resume, cancel, failure, and document isolation",
);
