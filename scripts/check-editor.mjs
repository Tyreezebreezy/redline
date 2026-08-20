import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Editor } from "@tiptap/react";
import { countText, EDITOR_EXTENSIONS } from "../src/editor.ts";

const allowedNodes = [
  "bulletList",
  "doc",
  "hardBreak",
  "heading",
  "listItem",
  "orderedList",
  "paragraph",
  "text",
];
const allowedMarks = ["bold", "italic"];
const content = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", marks: [{ type: "bold" }], text: "Title" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "A " },
        { type: "text", marks: [{ type: "italic" }], text: "draft" },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Item" }] },
          ],
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 3 },
      content: [{ type: "text", text: "Step" }],
    },
    {
      type: "orderedList",
      attrs: { start: 1, type: null },
      content: [
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Step" }] },
          ],
        },
      ],
    },
  ],
};

const editor = new Editor({
  content,
  element: null,
  enableContentCheck: true,
  extensions: EDITOR_EXTENSIONS,
});

assert.deepEqual(Object.keys(editor.schema.nodes).sort(), allowedNodes);
assert.deepEqual(Object.keys(editor.schema.marks).sort(), allowedMarks);

function assertApprovedContent(node) {
  assert.ok(allowedNodes.includes(node.type), `Unexpected node: ${node.type}`);
  if (node.type === "heading") {
    assert.ok([1, 2, 3].includes(node.attrs?.level));
  }
  for (const mark of node.marks ?? []) {
    assert.ok(
      allowedMarks.includes(mark.type),
      `Unexpected mark: ${mark.type}`,
    );
  }
  for (const child of node.content ?? []) {
    assertApprovedContent(child);
  }
}

assertApprovedContent(editor.getJSON());
assert.deepEqual(countText(""), { words: 0, characters: 0 });
assert.deepEqual(countText("Hello, world!"), { words: 2, characters: 13 });
assert.deepEqual(countText("Café 👨‍👩‍👧‍👦"), { words: 1, characters: 6 });
assert.deepEqual(countText("one\ntwo"), { words: 2, characters: 7 });

const workspaceSource = await readFile(
  new URL("../src/EditorWorkspace.tsx", import.meta.url),
  "utf8",
);
assert.match(
  workspaceSource,
  /onMouseDown=\{\(event\) => event\.preventDefault\(\)\}/,
);

editor.destroy();
console.log("REDLINE editor schema and counts verified.");
