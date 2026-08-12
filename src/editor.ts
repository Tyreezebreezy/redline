import { Placeholder } from "@tiptap/extensions/placeholder";
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
