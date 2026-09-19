import type { Editor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";

export type SelectedWord =
  | { ok: true; word: string; from: number; to: number }
  | { ok: false; reason: string };

export function selectedWord(editor: Editor): SelectedWord {
  const { selection } = editor.state;
  if (!(selection instanceof TextSelection) || selection.empty) {
    return { ok: false, reason: "Select a word to look up." };
  }
  const text = editor.state.doc.textBetween(selection.from, selection.to, "\n", " ");
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 64 || /\s/u.test(trimmed)) {
    return { ok: false, reason: "Select a single word to look up." };
  }
  if (!/^[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*$/u.test(trimmed)) {
    return { ok: false, reason: "Select a single word to look up." };
  }
  const leading = text.length - text.trimStart().length;
  const trailing = text.length - text.trimEnd().length;
  return {
    ok: true,
    word: trimmed,
    from: selection.from + leading,
    to: selection.to - trailing,
  };
}
