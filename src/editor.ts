import { Placeholder } from "@tiptap/extensions/placeholder";
import { Mark } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

export const EMPTY_DOCUMENT = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export const EDITOR_EXTENSIONS = [
  StarterKit.configure({
    blockquote: false,
    code: false,
    codeBlock: false,
    dropcursor: false,
    gapcursor: false,
    heading: { levels: [1, 2, 3] },
    horizontalRule: false,
    link: false,
    strike: false,
    trailingNode: false,
    underline: false,
  }),
  Placeholder.configure({ placeholder: "Start writing…" }),
];

const wordSegmenter = new Intl.Segmenter(undefined, { granularity: "word" });
const characterSegmenter = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
});

export function countText(text: string) {
  let words = 0;
  let characters = 0;

  for (const segment of wordSegmenter.segment(text)) {
    words += Number(segment.isWordLike);
  }

  for (const _segment of characterSegmenter.segment(text)) {
    characters += 1;
  }

  return { words, characters };
}

export function marksForTextSelection(
  editor: Editor,
  selection: TextSelection = editor.state.selection as TextSelection,
) {
  const { storedMarks } = editor.state;
  if (
    !(selection instanceof TextSelection) ||
    !selection.$from.sameParent(selection.$to)
  ) {
    return null;
  }
  if (selection.empty) return storedMarks ?? selection.$from.marks();

  let marks: readonly Mark[] | null = null;
  let invalid = false;
  selection.$from.parent.nodesBetween(
    selection.$from.parentOffset,
    selection.$to.parentOffset,
    (node) => {
      if (node.isText) {
        if (marks === null) marks = node.marks;
        else if (!Mark.sameSet(marks, node.marks)) invalid = true;
      } else if (node.isLeaf) {
        invalid = true;
      }
    },
  );
  return invalid ? null : (marks ?? []);
}
