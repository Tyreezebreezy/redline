import type { Transaction } from "@tiptap/pm/state";
import { type Editor, useEditor } from "@tiptap/react";
import { useEffect } from "react";
import { AXIOM_DECORATIONS, createAxiomDecorations } from "./axiom/decorations";
import {
  createDictationTargetPlugin,
  DICTATION_TARGET,
  type DictationStatus,
} from "./dictation";
import type { DocumentRecord } from "./documents";
import { EditorWorkspace } from "./EditorWorkspace";
import { EDITOR_EXTENSIONS, EMPTY_DOCUMENT } from "./editor";
import {
  createTransformTargetPlugin,
  type RewriteMode,
  TRANSFORM_TARGET,
} from "./transform";

type DocumentEditorProps = {
  dictationStatus: DictationStatus;
  document: DocumentRecord | null;
  onCancelDictation: () => void;
  onDirty: (editor: Editor, transaction: Transaction) => void;
  onHumanize: () => void;
  onReady: (editor: Editor) => void;
  onSelectIssue: (issueId: string) => void;
  onStartDictation: () => void;
  onStopDictation: () => void;
  onTransform: () => void;
  rewriteMode: RewriteMode | null;
  voiceEnabled: boolean;
};

export function DocumentEditor({
  dictationStatus,
  document: initialDocument,
  onCancelDictation,
  onDirty,
  onHumanize,
  onReady,
  onSelectIssue,
  onStartDictation,
  onStopDictation,
  onTransform,
  rewriteMode,
  voiceEnabled,
}: DocumentEditorProps) {
  const editor = useEditor({
    autofocus: "start",
    content: initialDocument
      ? JSON.parse(initialDocument.contentJson)
      : EMPTY_DOCUMENT,
    editorProps: {
      attributes: {
        "aria-label": "Document editor",
        "aria-multiline": "true",
        class: "tiptap",
        role: "textbox",
        spellcheck: "false",
      },
      handleKeyDown: (_view, event) => {
        if (event.altKey && event.key === "F10") {
          const button = window.document.querySelector<HTMLButtonElement>(
            '[data-editor-toolbar] button[tabindex="0"]:not(:disabled), [data-editor-toolbar] button:not(:disabled)',
          );
          button?.focus();
          return Boolean(button);
        }
        return false;
      },
    },
    enableContentCheck: true,
    extensions: EDITOR_EXTENSIONS,
    injectCSS: false,
    onUpdate: ({ editor: current, transaction }) =>
      onDirty(current, transaction),
    onContentError: ({ error }) => {
      console.error("REDLINE rejected invalid editor content.", error);
    },
    shouldRerenderOnTransaction: false,
  });

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.registerPlugin(createDictationTargetPlugin());
    editor.registerPlugin(createTransformTargetPlugin());
    editor.registerPlugin(createAxiomDecorations(editor, onSelectIssue));
    return () => {
      if (!editor.isDestroyed) {
        editor.unregisterPlugin(AXIOM_DECORATIONS);
        editor.unregisterPlugin(DICTATION_TARGET);
        editor.unregisterPlugin(TRANSFORM_TARGET);
      }
    };
  }, [editor, onSelectIssue]);

  useEffect(() => {
    if (editor && !editor.isDestroyed) onReady(editor);
  }, [editor, onReady]);

  return (
    <EditorWorkspace
      dictationStatus={dictationStatus}
      editor={editor}
      onCancelDictation={onCancelDictation}
      onHumanize={onHumanize}
      onStartDictation={onStartDictation}
      onStopDictation={onStopDictation}
      onTransform={onTransform}
      rewriteMode={rewriteMode}
      voiceEnabled={voiceEnabled}
    />
  );
}
