import { getCurrentWindow } from "@tauri-apps/api/window";
import { type Editor, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AnalysisPanel,
  type AnalysisState,
  type SaveState,
  Sidebar,
  StatusBar,
  TopBar,
} from "./AppShell";
import {
  type AxiomSuggestion,
  analyzeText,
  getGrammarProvider,
} from "./axiom/axiom";
import {
  AXIOM_DECORATIONS,
  createAxiomDecorations,
  updateAxiomDecorations,
} from "./axiom/decorations";
import {
  correctionPlan,
  type EditorIssue,
  mapIssue,
  type Projection,
  projectDocument,
} from "./axiom/projection";
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
const ANALYSIS_IDLE_MS = 800;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

type DocumentEditorProps = {
  document: DocumentRecord | null;
  onDirty: (editor: Editor) => void;
  onReady: (editor: Editor) => void;
  onSelectIssue: (issueId: string) => void;
};

function DocumentEditor({
  document: initialDocument,
  onDirty,
  onReady,
  onSelectIssue,
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
    onUpdate: ({ editor: current }) => onDirty(current),
    onContentError: ({ error }) => {
      console.error("REDLINE rejected invalid editor content.", error);
    },
    shouldRerenderOnTransaction: false,
  });

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.registerPlugin(createAxiomDecorations(editor, onSelectIssue));
    return () => {
      if (!editor.isDestroyed) editor.unregisterPlugin(AXIOM_DECORATIONS);
    };
  }, [editor, onSelectIssue]);

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
  const [analysis, setAnalysis] = useState<AnalysisState>({ status: "ready" });
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const activeRef = useRef<DocumentRecord | null>(null);
  const titleRef = useRef(title);
  const dirtyRef = useRef(false);
  const generationRef = useRef(0);
  const analysisGenerationRef = useRef(0);
  const analysisRequestRef = useRef(0);
  const documentSessionRef = useRef(0);
  const analysisProjectionRef = useRef<Projection | null>(null);
  const analyzeOnReadyRef = useRef(false);
  const analysisTimer = useRef<number | undefined>(undefined);
  const idleTimer = useRef<number | undefined>(undefined);
  const maxTimer = useRef<number | undefined>(undefined);
  const saveQueue = useRef(Promise.resolve());

  const setCurrent = useCallback(
    (document: DocumentRecord | null, analyzeOnReady = false) => {
      window.clearTimeout(analysisTimer.current);
      analysisTimer.current = undefined;
      analysisRequestRef.current += 1;
      documentSessionRef.current += 1;
      analysisProjectionRef.current = null;
      analyzeOnReadyRef.current = analyzeOnReady;
      editorRef.current = null;
      setEditorInstance(null);
      setSelectedIssueId(null);
      generationRef.current += 1;
      analysisGenerationRef.current += 1;
      activeRef.current = document;
      setActive(document);
      const nextTitle = document?.title ?? "Untitled";
      titleRef.current = nextTitle;
      setTitle(nextTitle);
      dirtyRef.current = false;
      setEditorEpoch((value) => value + 1);
      setSaveState("Saved");
      setSaveError(null);
      setAnalysis({ status: "ready" });
    },
    [],
  );

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

  const runAnalysis = useCallback(async () => {
    window.clearTimeout(analysisTimer.current);
    analysisTimer.current = undefined;
    const editor = editorRef.current;
    if (!editor || editor.isDestroyed) return;

    const generation = analysisGenerationRef.current;
    const session = documentSessionRef.current;
    const request = ++analysisRequestRef.current;
    const projection = projectDocument(editor.state.doc);
    if (!projection.text.trim()) {
      analysisProjectionRef.current = projection;
      setSelectedIssueId(null);
      setAnalysis({ status: "complete", generation, issues: [], session });
      return;
    }

    setAnalysis({ status: "analyzing" });
    try {
      const issues = await analyzeText(
        projection.text,
        await getGrammarProvider(),
      );
      if (
        analysisRequestRef.current !== request ||
        analysisGenerationRef.current !== generation ||
        documentSessionRef.current !== session ||
        editorRef.current !== editor
      ) {
        return;
      }
      const mapped = issues.map((issue) => mapIssue(projection, issue));
      if (mapped.some((issue) => issue === null)) {
        throw new Error(
          "AXIOM returned an issue that could not be mapped safely.",
        );
      }
      analysisProjectionRef.current = projection;
      setSelectedIssueId(null);
      setAnalysis({
        status: "complete",
        generation,
        issues: mapped.filter((issue) => issue !== null),
        session,
      });
    } catch (error) {
      if (
        analysisRequestRef.current === request &&
        analysisGenerationRef.current === generation &&
        documentSessionRef.current === session &&
        editorRef.current === editor
      ) {
        analysisProjectionRef.current = null;
        setSelectedIssueId(null);
        setAnalysis({ status: "error", message: errorMessage(error) });
      }
    }
  }, []);

  const scheduleAnalysis = useCallback(
    (editor: Editor) => {
      window.clearTimeout(analysisTimer.current);
      if (!editor.getText().trim()) {
        analysisTimer.current = undefined;
        analysisProjectionRef.current = null;
        setAnalysis({ status: "ready" });
        return;
      }
      setAnalysis({ status: "pending" });
      analysisTimer.current = window.setTimeout(
        () => void runAnalysis(),
        ANALYSIS_IDLE_MS,
      );
    },
    [runAnalysis],
  );

  const markDirty = useCallback(
    (editor: Editor, contentChanged = true) => {
      editorRef.current = editor;
      generationRef.current += 1;
      if (contentChanged) {
        analysisGenerationRef.current += 1;
        analysisRequestRef.current += 1;
        analysisProjectionRef.current = null;
        setSelectedIssueId(null);
        scheduleAnalysis(editor);
      }
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
    [save, scheduleAnalysis],
  );

  const ready = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
      setEditorInstance(editor);
      if (analyzeOnReadyRef.current) {
        analyzeOnReadyRef.current = false;
        scheduleAnalysis(editor);
      }
    },
    [scheduleAnalysis],
  );

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
        setCurrent(workspace.activeDocument, Boolean(workspace.activeDocument));
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
      setCurrent(document, true);
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
    if (editorRef.current) markDirty(editorRef.current, false);
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
      setCurrent(document, true);
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
      setCurrent(document, true);
      await refreshLists(document.id);
    } catch (error) {
      setSaveState("Save failed");
      setSaveError(errorMessage(error));
    }
  };

  const selectIssue = useCallback((issueId: string) => {
    setSelectedIssueId(issueId);
  }, []);

  const canApplySuggestion = useCallback(
    (issue: EditorIssue, suggestion: AxiomSuggestion) => {
      const editor = editorRef.current;
      const projection = analysisProjectionRef.current;
      return Boolean(
        editor &&
          !editor.isDestroyed &&
          projection &&
          correctionPlan(editor.state.doc, projection, issue, suggestion),
      );
    },
    [],
  );

  const applySuggestion = (issueId: string, suggestionIndex: number) => {
    const editor = editorRef.current;
    if (!editor || editor.isDestroyed || analysis.status !== "complete") return;
    const issue = analysis.issues.find(({ id }) => id === issueId);
    const suggestion = issue?.suggestions[suggestionIndex];
    const reject = () => {
      analysisRequestRef.current += 1;
      analysisGenerationRef.current += 1;
      analysisProjectionRef.current = null;
      setSelectedIssueId(null);
      scheduleAnalysis(editor);
    };
    if (
      !issue ||
      !suggestion ||
      analysis.generation !== analysisGenerationRef.current ||
      analysis.session !== documentSessionRef.current
    ) {
      reject();
      return;
    }

    const projection = projectDocument(editor.state.doc);
    const mapped = mapIssue(projection, issue);
    const plan = correctionPlan(
      editor.state.doc,
      projection,
      issue,
      suggestion,
    );
    if (
      projection.text.slice(issue.from, issue.to) !== issue.originalText ||
      !mapped ||
      mapped.editorFrom !== issue.editorFrom ||
      mapped.editorTo !== issue.editorTo ||
      !plan
    ) {
      reject();
      return;
    }

    try {
      const transaction = editor.state.tr;
      if (suggestion.kind === "remove" || !suggestion.text) {
        transaction.delete(plan.from, plan.to);
      } else {
        transaction.replaceWith(
          plan.from,
          plan.to,
          editor.schema.text(suggestion.text, plan.marks),
        );
      }
      editor.view.dispatch(transaction.scrollIntoView());
    } catch (error) {
      reject();
      setAnalysis({ status: "error", message: errorMessage(error) });
    }
  };

  useEffect(() => {
    if (!editorInstance || editorInstance.isDestroyed) return;
    updateAxiomDecorations(
      editorInstance,
      analysis.status === "complete" ? analysis.issues : [],
      selectedIssueId,
    );
  }, [analysis, editorInstance, selectedIssueId]);

  useEffect(() => {
    if (!selectedIssueId) return;
    const frame = window.requestAnimationFrame(() => {
      editorRef.current?.view.dom
        .querySelector(`[data-axiom-issue="${selectedIssueId}"]`)
        ?.scrollIntoView({ block: "nearest" });
      document
        .getElementById(`issue-${selectedIssueId}`)
        ?.scrollIntoView({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedIssueId]);

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
            onSelectIssue={selectIssue}
          />
        ) : (
          <main className="workspace" id="workspace" tabIndex={-1} />
        )}
        <AnalysisPanel
          analysis={analysis}
          canApplySuggestion={canApplySuggestion}
          disabled={!editorInstance}
          onAnalyze={() => void runAnalysis()}
          onApplySuggestion={applySuggestion}
          onSelectIssue={selectIssue}
          selectedIssueId={selectedIssueId}
        />
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
