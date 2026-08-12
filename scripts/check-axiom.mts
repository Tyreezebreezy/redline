import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Editor } from "@tiptap/react";
import { analyzeText, findProtectedSpans } from "../src/axiom/axiom.ts";
import { mapIssue, projectDocument } from "../src/axiom/projection.ts";
import { EDITOR_EXTENSIONS } from "../src/editor.ts";

const editor = new Editor({
  element: null,
  extensions: EDITOR_EXTENSIONS,
  content: {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Résumé 😀" }],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", marks: [{ type: "bold" }], text: "Curly “quote”" },
          { type: "hardBreak" },
          { type: "text", marks: [{ type: "italic" }], text: "next line" },
        ],
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Item one" }],
              },
            ],
          },
        ],
      },
      {
        type: "orderedList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Item two" }],
              },
            ],
          },
        ],
      },
    ],
  },
});

const projection = projectDocument(editor.state.doc);
assert.equal(
  projection.text,
  "Résumé 😀\nCurly “quote”\nnext line\nItem one\nItem two",
);
assert.equal(projection.text.includes("•"), false);
assert.equal(projection.text.includes("1."), false);

for (const originalText of [
  "Résumé",
  "😀",
  "Curly “quote”",
  "next line",
  "Item two",
]) {
  const from = projection.text.indexOf(originalText);
  const issue = {
    id: "test",
    source: "test",
    category: "other" as const,
    severity: "suggestion" as const,
    message: "test",
    from,
    to: from + originalText.length,
    originalText,
    suggestions: [],
  };
  const mapped = mapIssue(projection, issue);
  assert.ok(mapped, `Expected ${originalText} to map`);
  assert.equal(
    editor.state.doc.textBetween(
      mapped.editorFrom,
      mapped.editorTo,
      "\n",
      "\n",
    ),
    originalText,
  );
  assert.ok(
    mapped.editorFrom >= 0 && mapped.editorTo <= editor.state.doc.content.size,
  );
}

const spans = findProtectedSpans(
  "See https://example.com, email me@example.com, open C:\\Temp\\draft.txt, run --dry-run, use 192.168.1.10 and build v0.0.4 with request_id.",
);
assert.ok(spans.length >= 7);

const protectedText = "Visit https://example.com for teh guide.";
const protectedIssues = await analyzeText(protectedText, {
  analyze: async () => [
    {
      id: "provider-1",
      source: "test",
      category: "spelling",
      severity: "suggestion",
      message: "URL finding",
      from: 6,
      to: 25,
      originalText: "https://example.com",
      suggestions: [],
    },
    {
      id: "provider-2",
      source: "test",
      category: "spelling",
      severity: "suggestion",
      message: "Typo",
      from: 30,
      to: 33,
      originalText: "teh",
      suggestions: [],
    },
    {
      id: "provider-3",
      source: "test",
      category: "punctuation",
      severity: "suggestion",
      message: "Insert in URL",
      from: 13,
      to: 13,
      originalText: "",
      suggestions: [{ kind: "insert-after", text: "-" }],
    },
  ],
});
assert.deepEqual(
  protectedIssues.map(({ id, originalText }) => ({ id, originalText })),
  [{ id: "a1", originalText: "teh" }],
);
await assert.rejects(
  analyzeText("Provider failure", {
    analyze: async () => {
      throw new Error("Provider unavailable");
    },
  }),
  /Provider unavailable/,
);

const [contractText, adapterText] = await Promise.all([
  readFile(new URL("../src/axiom/axiom.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/axiom/HarperAdapter.ts", import.meta.url), "utf8"),
]);
assert.doesNotMatch(contractText, /ProseMirror|Tiptap|@tiptap/);
assert.doesNotMatch(contractText, /editorFrom|editorTo/);
assert.match(adapterText, /text\.slice\(from, to\) !== problemText/);
assert.match(adapterText, /boundaries\[span\.start\]/);

editor.destroy();
console.log(
  "REDLINE AXIOM projection, mapping, Unicode, and protection verified.",
);
