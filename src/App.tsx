import { getCurrentWindow } from "@tauri-apps/api/window";
import { type Editor, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AnalysisPanel,
  type SaveState,
  Sidebar,
  StatusBar,
  TopBar,
} from "./AppShell";
import {
  type DocumentRecord,
  type DocumentSummary,
  desktopAvailable,
  documents,
  type RecoveryPoint,
} from "./documents";
import { EditorWorkspace } from "./EditorWorkspace";
import { EDITOR_EXTENSIONS, EMPTY_DOCUMENT } from "./editor";
import "./styles.css";

const IDLE_SAVE_MS = 1_000;
const MAX_DIRTY_MS = 5_000;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

type DocumentEditorProps = {
  document: DocumentRecord | null;
  onDirty: (editor: Editor) => void;
  onReady: (editor: Editor) => void;
};

function DocumentEditor({
  document: initialDocument,
  onDirty,
  onReady,
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
    onUpdate: ({ editor: current }) => onDirty(current),
    onContentError: ({ error }) => {
      console.error("REDLINE rejected invalid editor content.", error);
    },
    shouldRerenderOnTransaction: false,
  });

  useEffect(() => {
    if (editor && !editor.isDestroyed) onReady(editor);
  }, [editor, onReady]);

  return <EditorWorkspace editor={editor} />;
}

function App() {
  const [active, setActive] = useState<DocumentRecord | null>(null);
  const [allDocuments, setAllDocuments] = useState<DocumentSummary[]>([]);
  const [recent, setRecent] = useState<DocumentSummary[]>([]);
  const [trash, setTrash] = useState<DocumentSummary[]>([]);
  const [revisions, setRevisions] = useState<RecoveryPoint[]>([]);
  const [title, setTitle] = useState("Untitled");
  const [saveState, setSaveState] = useState<SaveState>("Saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const activeRef = useRef<DocumentRecord | null>(null);
  const titleRef = useRef(title);
  const dirtyRef = useRef(false);
  const generationRef = useRef(0);
  const idleTimer = useRef<number | undefined>(undefined);
  const maxTimer = useRef<number | undefined>(undefined);
  const saveQueue = useRef(Promise.resolve());

  const setCurrent = useCallback((document: DocumentRecord | null) => {
    activeRef.current = document;
    setActive(document);
    const nextTitle = document?.title ?? "Untitled";
    titleRef.current = nextTitle;
    setTitle(nextTitle);
    dirtyRef.current = false;
    setEditorEpoch((value) => value + 1);
    setSaveState("Saved");
    setSaveError(null);
  }, []);

  const refreshLists = useCallback(async (documentId?: string) => {
    if (!desktopAvailable) return;
    const workspace = await documents.loadWorkspace();
    setAllDocuments(workspace.documents);
    setRecent(workspace.recent);
    setTrash(workspace.trash);
    if (documentId) {
      setRevisions(await documents.listRevisions(documentId));
    } else {
      setRevisions([]);
    }
  }, []);

  const clearTimers = useCallback(() => {
    window.clearTimeout(idleTimer.current);
    window.clearTimeout(maxTimer.current);
    idleTimer.current = undefined;
    maxTimer.current = undefined;
  }, []);

  const save = useCallback(
    async (reason: "auto" | "manual") => {
      const editor = editorRef.current;
      if (!editor || (!dirtyRef.current && reason === "auto")) return true;
      if (!desktopAvailable) return true;
      if (
        reason === "auto" &&
        !activeRef.current &&
        !editor.getText().trim() &&
        titleRef.current.trim() === "Untitled"
      ) {
        clearTimers();
        return true;
      }

      clearTimers();
      const generation = generationRef.current;
      setSaveState("Saving");
      setSaveError(null);
      let succeeded = false;
      saveQueue.current = saveQueue.current
        .catch(() => undefined)
        .then(async () => {
          const current = activeRef.current;
          const saved = await documents.save({
            id: current?.id ?? null,
            expectedRevision: current?.revision ?? null,
            title: titleRef.current,
            contentJson: JSON.stringify(editor.getJSON()),
            reason,
          });
          activeRef.current = saved;
          setActive(saved);
          titleRef.current = saved.title;
          setTitle(saved.title);
          succeeded = true;
          if (generationRef.current === generation) {
            dirtyRef.current = false;
            setSaveState("Saved");
          } else {
            setSaveState("Unsaved");
          }
          await refreshLists(saved.id);
        })
        .catch((error) => {
          dirtyRef.current = true;
          setSaveState("Save failed");
          setSaveError(errorMessage(error));
        });
      await saveQueue.current;
      return succeeded;
    },
    [clearTimers, refreshLists],
  );

  const markDirty = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
      generationRef.current += 1;
      const wasDirty = dirtyRef.current;
      dirtyRef.current = true;
      setSaveState("Unsaved");
      setSaveError(null);
      window.clearTimeout(idleTimer.current);
      if (!desktopAvailable) return;
      idleTimer.current = window.setTimeout(
        () => void save("auto"),
        IDLE_SAVE_MS,
      );
      if (!wasDirty) {
        maxTimer.current = window.setTimeout(
          () => void save("auto"),
          MAX_DIRTY_MS,
        );
      }
    },
    [save],
  );

  const ready = useCallback((editor: Editor) => {
    editorRef.current = editor;
    setEditorInstance(editor);
  }, []);

  useEffect(() => {
    let cancelled = false;
    documents
      .loadWorkspace()
      .then((workspace) => {
        if (cancelled) return;
        setAllDocuments(workspace.documents);
        setRecent(workspace.recent);
        setTrash(workspace.trash);
        setRevisions(workspace.revisions);
        setCurrent(workspace.activeDocument);
        setLoaded(true);
      })
      .catch((error) => {
        setLoaded(true);
        setSaveState("Save failed");
        setSaveError(errorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [setCurrent]);

  useEffect(() => {
    if (!desktopAvailable) return;
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onCloseRequested(async (event) => {
        if (!dirtyRef.current) return;
        event.preventDefault();
        if (await save("auto")) {
          await getCurrentWindow().destroy();
        } else if (
          window.confirm(
            "REDLINE could not save this document. Close without saving?",
          )
        ) {
          await getCurrentWindow().destroy();
        }
      })
      .then((stop) => {
        unlisten = stop;
      });
    return () => unlisten?.();
  }, [save]);

  useEffect(() => {
    const handleSave = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save("manual");
      }
    };
    window.addEventListener("keydown", handleSave);
    return () => window.removeEventListener("keydown", handleSave);
  }, [save]);

  const switchTo = async (id: string) => {
    if (dirtyRef.current && !(await save("auto"))) return;
    try {
      const document = await documents.open(id);
      setCurrent(document);
      setRevisions(await documents.listRevisions(id));
    } catch (error) {
      setSaveState("Save failed");
      setSaveError(errorMessage(error));
    }
  };

  const newDocument = async () => {
    if (dirtyRef.current && !(await save("auto"))) return;
    setCurrent(null);
    setRevisions([]);
  };

  const changeTitle = (next: string) => {
    titleRef.current = next;
    setTitle(next);
    if (editorRef.current) markDirty(editorRef.current);
  };

  const moveToTrash = async () => {
    const current = activeRef.current;
    if (!current) return;
    if (!window.confirm(`Move “${current.title}” to Trash?`)) return;
    if (dirtyRef.current && !(await save("auto"))) return;
    const saved = activeRef.current;
    if (!saved) return;
    try {
      await documents.delete(saved.id, saved.revision);
      setCurrent(null);
      await refreshLists();
    } catch (error) {
      setSaveState("Save failed");
      setSaveError(errorMessage(error));
    }
  };

  const restoreDeleted = async (id: string) => {
    try {
      const document = await documents.restoreDeleted(id);
      setCurrent(document);
      await refreshLists(document.id);
    } catch (error) {
      setSaveState("Save failed");
      setSaveError(errorMessage(error));
    }
  };

  const restoreRevision = async (revision: RecoveryPoint) => {
    const current = activeRef.current;
    if (
      !current ||
      !window.confirm(
        "Restore this recovery point? Your current text will also be preserved.",
      )
    )
      return;
    if (dirtyRef.current && !(await save("auto"))) return;
    const saved = activeRef.current;
    if (!saved) return;
    try {
      const document = await documents.restoreRevision(
        saved.id,
        revision.id,
        saved.revision,
      );
      setCurrent(document);
      await refreshLists(document.id);
    } catch (error) {
      setSaveState("Save failed");
      setSaveError(errorMessage(error));
    }
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      <TopBar saveState={saveState} />
      <div className="app-body">
        <Sidebar
          activeId={active?.id ?? null}
          documents={allDocuments}
          recent={recent}
          revisions={revisions}
          trash={trash}
          onDelete={moveToTrash}
          onNew={() => void newDocument()}
          onOpen={(id) => void switchTo(id)}
          onRestore={(id) => void restoreDeleted(id)}
          onRestoreRevision={(revision) => void restoreRevision(revision)}
        />
        {loaded ? (
          <DocumentEditor
            document={active}
            key={`${active?.id ?? "new"}-${editorEpoch}`}
            onDirty={markDirty}
            onReady={ready}
          />
        ) : (
          <main className="workspace" id="workspace" tabIndex={-1} />
        )}
        <AnalysisPanel />
      </div>
      <StatusBar
        editor={editorInstance}
        error={saveError}
        onSave={() => void save("manual")}
        saveState={saveState}
        title={title}
        onTitleChange={changeTitle}
      />
    </div>
  );
}

export default App;
