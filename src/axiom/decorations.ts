import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/react";
import type { EditorIssue } from "./projection";

export const AXIOM_DECORATIONS = new PluginKey<DecorationSet>(
  "axiomDecorations",
);

function decorationSet(
  editor: Editor,
  issues: EditorIssue[],
  selectedIssueId: string | null,
) {
  const decorations = issues.flatMap((issue) => {
    if (
      !Number.isInteger(issue.editorFrom) ||
      !Number.isInteger(issue.editorTo) ||
      issue.editorFrom < 0 ||
      issue.editorTo <= issue.editorFrom ||
      issue.editorTo > editor.state.doc.content.size
    ) {
      return [];
    }
    return [
      Decoration.inline(issue.editorFrom, issue.editorTo, {
        class: `axiom-issue axiom-${issue.category}${selectedIssueId === issue.id ? " axiom-selected" : ""}`,
        "data-axiom-issue": issue.id,
      }),
    ];
  });
  return DecorationSet.create(editor.state.doc, decorations);
}

export function createAxiomDecorations(
  editor: Editor,
  onSelectIssue: (issueId: string) => void,
) {
  return new Plugin<DecorationSet>({
    key: AXIOM_DECORATIONS,
    state: {
      init: () => DecorationSet.empty,
      apply(transaction, current) {
        const next = transaction.getMeta(AXIOM_DECORATIONS) as
          | { issues: EditorIssue[]; selectedIssueId: string | null }
          | undefined;
        if (next) {
          return decorationSet(editor, next.issues, next.selectedIssueId);
        }
        return transaction.docChanged ? DecorationSet.empty : current;
      },
    },
    props: {
      decorations: (state) => AXIOM_DECORATIONS.getState(state),
      handleDOMEvents: {
        mousedown: (_view, event) => {
          const target =
            event.target instanceof Element
              ? event.target.closest<HTMLElement>("[data-axiom-issue]")
              : null;
          const issueId = target?.dataset.axiomIssue;
          if (!issueId) return false;
          event.preventDefault();
          onSelectIssue(issueId);
          return true;
        },
      },
    },
  });
}

export function updateAxiomDecorations(
  editor: Editor,
  issues: EditorIssue[],
  selectedIssueId: string | null,
) {
  if (editor.isDestroyed || !AXIOM_DECORATIONS.get(editor.state)) return;
  editor.view.dispatch(
    editor.state.tr
      .setMeta(AXIOM_DECORATIONS, { issues, selectedIssueId })
      .setMeta("addToHistory", false),
  );
}
