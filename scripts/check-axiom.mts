import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { history, redo, undo } from "@tiptap/pm/history";
import { EditorState } from "@tiptap/pm/state";
import { Editor } from "@tiptap/react";
import { Dialect, LocalLinter } from "harper.js";
import { binaryInlined } from "harper.js/binaryInlined";
import {
  analyzeText,
  findProtectedSpans,
  isDictionaryEligible,
  normalizeDictionaryTerm,
  PROFILE_RULE_OVERRIDES,
} from "../src/axiom/axiom.ts";
import {
  AXIOM_DECORATIONS,
  createAxiomDecorations,
} from "../src/axiom/decorations.ts";
import { analyzeWithHarper } from "../src/axiom/HarperAdapter.ts";
import {
  correctionPlan,
  isIgnoredIssue,
  mapIssue,
  projectDocument,
  remapIgnoredIssues,
} from "../src/axiom/projection.ts";
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
  "See https://example.com, email me@example.com, ask Renée, open C:\\Temp\\draft.txt, run --dry-run, use 192.168.1.10 and build v0.0.5 with request_id.",
);
assert.ok(spans.length >= 8);

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

const normalizationFixtures = JSON.parse(
  await readFile(
    new URL("../fixtures/dictionary-normalization.json", import.meta.url),
    "utf8",
  ),
) as { input: string; normalized: string }[];
for (const fixture of normalizationFixtures) {
  assert.equal(normalizeDictionaryTerm(fixture.input), fixture.normalized);
}

const dictionaryText = "Zorblaxon is stable.";
const dictionaryIssue = {
  id: "dictionary",
  source: "harper",
  ruleId: "SpellCheck",
  category: "spelling" as const,
  severity: "suggestion" as const,
  message: "Unknown word",
  from: 0,
  to: 9,
  originalText: "Zorblaxon",
  suggestions: [],
};
assert.equal(isDictionaryEligible(dictionaryIssue), true);
assert.equal(
  (
    await analyzeText(
      dictionaryText,
      { analyze: async () => [dictionaryIssue] },
      { dictionary: new Set(["zorblaxon"]), profile: "general" },
    )
  ).length,
  0,
);
assert.equal(
  (
    await analyzeText(
      dictionaryText,
      {
        analyze: async () => [
          { ...dictionaryIssue, ruleId: "AnA", category: "grammar" },
        ],
      },
      { dictionary: new Set(["zorblaxon"]), profile: "general" },
    )
  ).length,
  1,
);

const harper = new LocalLinter({
  binary: binaryInlined,
  dialect: Dialect.American,
});
await harper.setup();
const harperDefaults = await harper.getDefaultLintConfig();
assert.equal(Object.keys(harperDefaults).length, 823);
assert.deepEqual(
  Object.entries(harperDefaults)
    .filter(([, enabled]) => !enabled)
    .map(([rule]) => rule)
    .sort(),
  [
    "AnalogAcousticBike",
    "AnotherThinkComing",
    "AvoidContractions",
    "BoringWords",
    "NoOxfordComma",
    "PossessiveNoun",
    "SpelledNumbers",
    "ViciousCircleOrCycle",
    "ViciousCycle",
  ],
);
assert.equal(harperDefaults.AvoidContractions, false);
assert.equal(harperDefaults.LongSentences, true);
assert.deepEqual(PROFILE_RULE_OVERRIDES.general, {});
assert.deepEqual(PROFILE_RULE_OVERRIDES.academic, {
  AvoidContractions: true,
});
assert.deepEqual(PROFILE_RULE_OVERRIDES.professional, {});
await harper.setLintConfig(harperDefaults);
assert.equal(
  (await analyzeWithHarper(harper, "We don't expect a delay.")).some(
    ({ ruleId }) => ruleId === "AvoidContractions",
  ),
  false,
);
await harper.setLintConfig({ ...harperDefaults, AvoidContractions: true });
assert.equal(
  (await analyzeWithHarper(harper, "We don't expect a delay.")).some(
    ({ ruleId }) => ruleId === "AvoidContractions",
  ),
  true,
);
await harper.dispose();
await assert.rejects(
  analyzeText("Provider failure", {
    analyze: async () => {
      throw new Error("Provider unavailable");
    },
  }),
  /Provider unavailable/,
);

function correctionEditor(marks: { type: "bold" | "italic" }[] = []) {
  return new Editor({
    element: null,
    extensions: EDITOR_EXTENSIONS,
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", marks, text: "teh" }],
        },
      ],
    },
  });
}

for (const marks of [
  [{ type: "bold" as const }],
  [{ type: "italic" as const }],
  [{ type: "bold" as const }, { type: "italic" as const }],
]) {
  const markedEditor = correctionEditor(marks);
  const markedProjection = projectDocument(markedEditor.state.doc);
  const markedIssue = mapIssue(markedProjection, {
    id: "marked",
    source: "test",
    category: "spelling",
    severity: "suggestion",
    message: "Typo",
    from: 0,
    to: 3,
    originalText: "teh",
    suggestions: [{ kind: "replace", text: "the" }],
  });
  assert.ok(markedIssue);
  const plan = correctionPlan(
    markedEditor.state.doc,
    markedProjection,
    markedIssue,
    markedIssue.suggestions[0],
  );
  assert.ok(plan);
  let state = EditorState.create({
    doc: markedEditor.state.doc,
    plugins: [history()],
  });
  state = state.apply(
    state.tr.replaceWith(
      plan.from,
      plan.to,
      markedEditor.schema.text("the", plan.marks),
    ),
  );
  assert.deepEqual(state.doc.toJSON().content?.[0].content?.[0].marks, marks);
  assert.equal(state.doc.textContent, "the");
  assert.equal(
    undo(state, (transaction) => {
      state = state.apply(transaction);
    }),
    true,
  );
  assert.equal(state.doc.textContent, "teh");
  assert.equal(
    redo(state, (transaction) => {
      state = state.apply(transaction);
    }),
    true,
  );
  assert.equal(state.doc.textContent, "the");
  markedEditor.destroy();
}

const removeEditor = correctionEditor([{ type: "bold" }]);
const removeProjection = projectDocument(removeEditor.state.doc);
const removeIssue = mapIssue(removeProjection, {
  id: "remove",
  source: "test",
  category: "style",
  severity: "suggestion",
  message: "Remove",
  from: 0,
  to: 3,
  originalText: "teh",
  suggestions: [{ kind: "remove", text: "" }],
});
assert.ok(removeIssue);
const removePlan = correctionPlan(
  removeEditor.state.doc,
  removeProjection,
  removeIssue,
  removeIssue.suggestions[0],
);
assert.ok(removePlan);
let removeState = EditorState.create({
  doc: removeEditor.state.doc,
  plugins: [history()],
});
removeState = removeState.apply(
  removeState.tr.delete(removePlan.from, removePlan.to),
);
assert.equal(removeState.doc.textContent, "");
assert.equal(
  undo(removeState, (transaction) => {
    removeState = removeState.apply(transaction);
  }),
  true,
);
assert.equal(removeState.doc.textContent, "teh");
removeEditor.destroy();

const unsafeEditor = new Editor({
  element: null,
  extensions: EDITOR_EXTENSIONS,
  content: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", marks: [{ type: "bold" }], text: "mixed" },
          { type: "text", marks: [{ type: "italic" }], text: " marks" },
        ],
      },
      { type: "paragraph", content: [{ type: "text", text: "next" }] },
    ],
  },
});
const unsafeProjection = projectDocument(unsafeEditor.state.doc);
for (const originalText of ["mixed marks", "marks\nnext"]) {
  const from = unsafeProjection.text.indexOf(originalText);
  const issue = mapIssue(unsafeProjection, {
    id: originalText,
    source: "test",
    category: "other",
    severity: "suggestion",
    message: "Unsafe",
    from,
    to: from + originalText.length,
    originalText,
    suggestions: [{ kind: "replace", text: "replacement" }],
  });
  assert.ok(issue);
  assert.equal(
    correctionPlan(
      unsafeEditor.state.doc,
      unsafeProjection,
      issue,
      issue.suggestions[0],
    ),
    null,
  );
}

const beforeDecorations = unsafeEditor.getJSON();
const decorationsPlugin = createAxiomDecorations(unsafeEditor, () => undefined);
const decorationIssue = mapIssue(unsafeProjection, {
  id: "decoration",
  source: "test",
  category: "grammar",
  severity: "suggestion",
  message: "Decoration",
  from: 0,
  to: 5,
  originalText: "mixed",
  suggestions: [],
});
assert.ok(decorationIssue);
let decorationState = EditorState.create({
  doc: unsafeEditor.state.doc,
  plugins: [history(), decorationsPlugin],
});
decorationState = decorationState.apply(
  decorationState.tr
    .setMeta(AXIOM_DECORATIONS, {
      issues: [decorationIssue],
      selectedIssueId: decorationIssue.id,
    })
    .setMeta("addToHistory", false),
);
assert.deepEqual(decorationState.doc.toJSON(), beforeDecorations);
assert.equal(undo(decorationState), false);
assert.equal(AXIOM_DECORATIONS.getState(decorationState)?.find().length, 1);
unsafeEditor.destroy();

const ignoreEditor = new Editor({
  element: null,
  extensions: EDITOR_EXTENSIONS,
  content: {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "teh and teh" }] },
    ],
  },
});
let ignoreProjection = projectDocument(ignoreEditor.state.doc);
const firstIssue = mapIssue(ignoreProjection, {
  id: "first",
  source: "harper",
  ruleId: "SpellCheck",
  category: "spelling",
  severity: "suggestion",
  message: "Typo",
  from: 0,
  to: 3,
  originalText: "teh",
  suggestions: [],
});
const secondIssue = mapIssue(ignoreProjection, {
  id: "second",
  source: "harper",
  ruleId: "SpellCheck",
  category: "spelling",
  severity: "suggestion",
  message: "Typo",
  from: 8,
  to: 11,
  originalText: "teh",
  suggestions: [],
});
assert.ok(firstIssue && secondIssue);
let ignored = [firstIssue];
assert.equal(isIgnoredIssue(firstIssue, ignored), true);
assert.equal(isIgnoredIssue(secondIssue, ignored), false);
let transaction = ignoreEditor.state.tr.insertText("Now ", 1);
ignoreEditor.view.dispatch(transaction);
ignored = remapIgnoredIssues(
  ignored,
  transaction.mapping,
  ignoreEditor.state.doc,
);
ignoreProjection = projectDocument(ignoreEditor.state.doc);
const movedIssue = mapIssue(ignoreProjection, {
  ...firstIssue,
  from: 4,
  to: 7,
});
assert.ok(movedIssue);
assert.equal(isIgnoredIssue(movedIssue, ignored), true);
transaction = ignoreEditor.state.tr.insertText("x", movedIssue.editorFrom + 1);
ignoreEditor.view.dispatch(transaction);
ignored = remapIgnoredIssues(
  ignored,
  transaction.mapping,
  ignoreEditor.state.doc,
);
assert.deepEqual(ignored, []);
ignoreEditor.destroy();

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
  "REDLINE AXIOM projection, mapping, Unicode, protection, decorations, and corrections verified.",
);
