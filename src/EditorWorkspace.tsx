import { type Editor, EditorContent, useEditorState } from "@tiptap/react";
import { type KeyboardEvent, type ReactNode, useState } from "react";

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
      tabIndex={tabIndex}
      title={shortcut ? `${label} (${shortcut})` : label}
      type="button"
    >
      {children}
    </button>
  );
}

export function EditorToolbar({ editor }: { editor: Editor }) {
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
    }),
  });

  const tabIndex = (id: string) => (tabStop === id ? 0 : -1);
  const focusEditor = () => editor.chain().focus().run();

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
    </div>
  );
}

export function EditorWorkspace({ editor }: { editor: Editor | null }) {
  return (
    <main className="workspace" id="workspace" tabIndex={-1}>
      <div className="editor-stage">
        {editor ? <EditorToolbar editor={editor} /> : null}
        <EditorContent editor={editor} className="editor-content" />
      </div>
    </main>
  );
}
