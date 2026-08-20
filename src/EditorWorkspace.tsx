import { type Editor, EditorContent, useEditorState } from "@tiptap/react";
import { type KeyboardEvent, type ReactNode, useEffect, useState } from "react";
import type { DictationStatus } from "./dictation";
import { transformSelection } from "./transform";

type ToolbarButtonProps = {
  active?: boolean;
  children: ReactNode;
  disabled?: boolean;
  id: string;
  label: string;
  onClick: () => void;
  onFocus: () => void;
  shortcut?: string;
  tabIndex: number;
};

function ToolbarButton({
  active,
  children,
  disabled,
  id,
  label,
  onClick,
  onFocus,
  shortcut,
  tabIndex,
}: ToolbarButtonProps) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className="toolbar-button"
      data-toolbar-id={id}
      disabled={disabled}
      onClick={onClick}
      onFocus={onFocus}
      onMouseDown={(event) => event.preventDefault()}
      tabIndex={tabIndex}
      title={shortcut ? `${label} (${shortcut})` : label}
      type="button"
    >
      {children}
    </button>
  );
}

export function EditorToolbar({
  dictationStatus,
  editor,
  onCancelDictation,
  onStartDictation,
  onStopDictation,
  onTransform,
  transformOpen,
}: {
  dictationStatus: DictationStatus;
  editor: Editor;
  onCancelDictation: () => void;
  onStartDictation: () => void;
  onStopDictation: () => void;
  onTransform: () => void;
  transformOpen: boolean;
}) {
  const [tabStop, setTabStop] = useState("paragraph");
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      bulletList: current.isActive("bulletList"),
      canRedo: current.can().redo(),
      canUndo: current.can().undo(),
      heading1: current.isActive("heading", { level: 1 }),
      heading2: current.isActive("heading", { level: 2 }),
      heading3: current.isActive("heading", { level: 3 }),
      italic: current.isActive("italic"),
      orderedList: current.isActive("orderedList"),
      paragraph: current.isActive("paragraph"),
      transformSelection: transformSelection(current),
    }),
  });

  const tabIndex = (id: string) => (tabStop === id ? 0 : -1);
  const focusEditor = () => editor.chain().focus().run();

  useEffect(() => {
    if (
      tabStop !== "dictate" ||
      !["preparing", "processing"].includes(dictationStatus.status)
    ) {
      return;
    }
    setTabStop("cancel-dictation");
    const frame = window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLButtonElement>(
          '[data-toolbar-id="cancel-dictation"]',
        )
        ?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [dictationStatus.status, tabStop]);

  useEffect(() => {
    if (tabStop === "transform" && !state.transformSelection.ok) {
      setTabStop("paragraph");
    }
  }, [state.transformSelection.ok, tabStop]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      focusEditor();
      return;
    }

    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }

    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ),
    );
    const current = buttons.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (current + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) %
            buttons.length;

    event.preventDefault();
    setTabStop(buttons[next].dataset.toolbarId ?? "paragraph");
    buttons[next].focus();
  };

  return (
    <div
      aria-label="Formatting"
      className="editor-toolbar"
      data-editor-toolbar
      onKeyDown={handleKeyDown}
      role="toolbar"
    >
      <fieldset className="toolbar-group">
        <legend className="sr-only">Text style</legend>
        <ToolbarButton
          active={state.paragraph}
          id="paragraph"
          label="Paragraph"
          onClick={() => editor.chain().focus().setParagraph().run()}
          onFocus={() => setTabStop("paragraph")}
          shortcut="Ctrl+Alt+0"
          tabIndex={tabIndex("paragraph")}
        >
          P
        </ToolbarButton>
        {([1, 2, 3] as const).map((level) => {
          const id = `heading${level}` as const;
          return (
            <ToolbarButton
              active={state[id]}
              id={id}
              key={id}
              label={`Heading ${level}`}
              onClick={() =>
                editor.chain().focus().toggleHeading({ level }).run()
              }
              onFocus={() => setTabStop(id)}
              shortcut={`Ctrl+Alt+${level}`}
              tabIndex={tabIndex(id)}
            >
              H{level}
            </ToolbarButton>
          );
        })}
      </fieldset>

      <fieldset className="toolbar-group">
        <legend className="sr-only">Emphasis</legend>
        <ToolbarButton
          active={state.bold}
          id="bold"
          label="Bold"
          onClick={() => editor.chain().focus().toggleBold().run()}
          onFocus={() => setTabStop("bold")}
          shortcut="Ctrl+B"
          tabIndex={tabIndex("bold")}
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          active={state.italic}
          id="italic"
          label="Italic"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          onFocus={() => setTabStop("italic")}
          shortcut="Ctrl+I"
          tabIndex={tabIndex("italic")}
        >
          <em>I</em>
        </ToolbarButton>
      </fieldset>

      <fieldset className="toolbar-group">
        <legend className="sr-only">Lists</legend>
        <ToolbarButton
          active={state.bulletList}
          id="bulletList"
          label="Bullet list"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          onFocus={() => setTabStop("bulletList")}
          shortcut="Ctrl+Shift+8"
          tabIndex={tabIndex("bulletList")}
        >
          • List
        </ToolbarButton>
        <ToolbarButton
          active={state.orderedList}
          id="orderedList"
          label="Numbered list"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          onFocus={() => setTabStop("orderedList")}
          shortcut="Ctrl+Shift+7"
          tabIndex={tabIndex("orderedList")}
        >
          1. List
        </ToolbarButton>
      </fieldset>

      <fieldset className="toolbar-group">
        <legend className="sr-only">History</legend>
        <ToolbarButton
          disabled={!state.canUndo}
          id="undo"
          label="Undo"
          onClick={() => editor.chain().focus().undo().run()}
          onFocus={() => setTabStop("undo")}
          shortcut="Ctrl+Z"
          tabIndex={tabIndex("undo")}
        >
          Undo
        </ToolbarButton>
        <ToolbarButton
          disabled={!state.canRedo}
          id="redo"
          label="Redo"
          onClick={() => editor.chain().focus().redo().run()}
          onFocus={() => setTabStop("redo")}
          shortcut="Ctrl+Y"
          tabIndex={tabIndex("redo")}
        >
          Redo
        </ToolbarButton>
      </fieldset>

      <fieldset className="toolbar-group dictation-group">
        <legend className="sr-only">Dictation</legend>
        <ToolbarButton
          active={dictationStatus.status === "listening"}
          disabled={
            transformOpen ||
            dictationStatus.status === "preparing" ||
            dictationStatus.status === "processing"
          }
          id="dictate"
          label={
            dictationStatus.status === "listening"
              ? "Stop dictation"
              : "Start dictation"
          }
          onClick={
            dictationStatus.status === "listening"
              ? onStopDictation
              : onStartDictation
          }
          onFocus={() => setTabStop("dictate")}
          tabIndex={tabIndex("dictate")}
        >
          <span aria-hidden="true">●</span>{" "}
          {dictationStatus.status === "listening"
            ? "Stop"
            : dictationStatus.status === "preparing"
              ? "Preparing…"
              : dictationStatus.status === "processing"
                ? "Processing…"
                : "Dictate"}
        </ToolbarButton>
        {dictationStatus.status === "preparing" ||
        dictationStatus.status === "listening" ||
        dictationStatus.status === "processing" ? (
          <button
            className="toolbar-button"
            data-toolbar-id="cancel-dictation"
            onClick={() => {
              onCancelDictation();
              setTabStop("paragraph");
              focusEditor();
            }}
            onFocus={() => setTabStop("cancel-dictation")}
            tabIndex={tabIndex("cancel-dictation")}
            type="button"
          >
            Cancel
          </button>
        ) : null}
      </fieldset>

      <fieldset className="toolbar-group transform-group">
        <legend className="sr-only">Transform</legend>
        <ToolbarButton
          active={transformOpen}
          disabled={
            !state.transformSelection.ok ||
            ["preparing", "listening", "processing"].includes(
              dictationStatus.status,
            )
          }
          id="transform"
          label={
            state.transformSelection.ok
              ? "Transform selected text"
              : state.transformSelection.reason
          }
          onClick={onTransform}
          onFocus={() => setTabStop("transform")}
          tabIndex={tabIndex("transform")}
        >
          Transform
        </ToolbarButton>
      </fieldset>
    </div>
  );
}

export function EditorWorkspace({
  dictationStatus,
  editor,
  onCancelDictation,
  onStartDictation,
  onStopDictation,
  onTransform,
  transformOpen,
}: {
  dictationStatus: DictationStatus;
  editor: Editor | null;
  onCancelDictation: () => void;
  onStartDictation: () => void;
  onStopDictation: () => void;
  onTransform: () => void;
  transformOpen: boolean;
}) {
  return (
    <main className="workspace" id="workspace" tabIndex={-1}>
      <div className="editor-stage">
        {editor ? (
          <>
            <EditorToolbar
              dictationStatus={dictationStatus}
              editor={editor}
              onCancelDictation={onCancelDictation}
              onStartDictation={onStartDictation}
              onStopDictation={onStopDictation}
              onTransform={onTransform}
              transformOpen={transformOpen}
            />
            <div
              aria-atomic="true"
              aria-live="polite"
              className={`dictation-status dictation-status-${dictationStatus.status}`}
              role="status"
            >
              <span aria-hidden="true" className="dictation-indicator" />
              <span>
                {dictationStatus.status === "idle"
                  ? "Speech is processed locally."
                  : dictationStatus.message}
              </span>
            </div>
            {dictationStatus.status === "error" &&
            dictationStatus.permissionHelp ? (
              <details className="microphone-help">
                <summary>Microphone permission help</summary>
                <ol>
                  <li>
                    In Windows Settings, open Privacy &amp; security →
                    Microphone and allow desktop apps to use the microphone.
                  </li>
                  <li>
                    Close REDLINE completely, then reopen it and try again.
                  </li>
                  <li>
                    If REDLINE remains denied, close it and rename
                    <code>%LOCALAPPDATA%\com.tyree.redline\EBWebView</code>.
                    Reopen REDLINE to receive a fresh permission prompt. Your
                    documents are stored separately.
                  </li>
                </ol>
              </details>
            ) : null}
          </>
        ) : null}
        <EditorContent editor={editor} className="editor-content" />
      </div>
    </main>
  );
}
