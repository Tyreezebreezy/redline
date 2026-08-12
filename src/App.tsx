import { useEditor } from "@tiptap/react";
import { AnalysisPanel, Sidebar, StatusBar, TopBar } from "./AppShell";
import { EditorWorkspace } from "./EditorWorkspace";
import { EDITOR_EXTENSIONS, EMPTY_DOCUMENT } from "./editor";
import "./styles.css";

function App() {
  const editor = useEditor({
    autofocus: "start",
    content: EMPTY_DOCUMENT,
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
          const toolbarButton =
            document.querySelector<HTMLButtonElement>(
              '[data-editor-toolbar] button[tabindex="0"]:not(:disabled)',
            ) ??
            document.querySelector<HTMLButtonElement>(
              "[data-editor-toolbar] button:not(:disabled)",
            );
          toolbarButton?.focus();
          return Boolean(toolbarButton);
        }
        return false;
      },
    },
    enableContentCheck: true,
    extensions: EDITOR_EXTENSIONS,
    onContentError: ({ error }) => {
      console.error("REDLINE rejected invalid editor content.", error);
    },
    shouldRerenderOnTransaction: false,
  });

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      <TopBar />
      <div className="app-body">
        <Sidebar />
        <EditorWorkspace editor={editor} />
        <AnalysisPanel />
      </div>
      <StatusBar editor={editor} />
    </div>
  );
}

export default App;
