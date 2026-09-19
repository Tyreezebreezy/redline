import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Transaction } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AnalysisPanel,
  type AnalysisState,
  type SaveState,
  Sidebar,
  StatusBar,
  TopBar,
  TransformPanel,
} from "./AppShell";
import {
  type AxiomSuggestion,
  analyzeText,
  getGrammarProvider,
  isDictionaryEligible,
  type WritingProfile,
} from "./axiom/axiom";
import { updateAxiomDecorations } from "./axiom/decorations";
import {
  correctionPlan,
  type EditorIssue,
  type IgnoredEditorIssue,
  isIgnoredIssue,
  mapIssue,
  type Projection,
  projectDocument,
  remapIgnoredIssues,
} from "./axiom/projection";
import { DocumentEditor } from "./DocumentEditor";
import {
  captureDictationTarget,
  clearDictationTarget,
  type DictationStatus,
  dictation,
  insertDictationTranscript,
  MICROPHONE_PERMISSION_ERROR,
} from "./dictation";
import {
  type DictionaryEntry,
  type DocumentRecord,
  type DocumentSummary,
  desktopAvailable,
  documents,
  type RecoveryPoint,
  type VoiceLane,
  type VoiceSettings,
} from "./documents";
import { humanizerProtectedTerms } from "./humanizer";
import { useTransformWorkflow } from "./useTransformWorkflow";
import { lookupWord } from "./wordTools/lexicon";
import { selectedWord } from "./wordTools/selection";
import { WordToolsPanel, type WordToolsState } from "./wordTools/WordToolsPanel";
import "./styles.css";

const IDLE_SAVE_MS = 1_000;
const MAX_DIRTY_MS = 5_000;
const ANALYSIS_IDLE_MS = 800;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function App() {
  const [active, setActive] = useState<DocumentRecord | null>(null);
  const [allDocuments, setAllDocuments] = useState<DocumentSummary[]>([]);
  const [recent, setRecent] = useState<DocumentSummary[]>([]);
  const [trash, setTrash] = useState<DocumentSummary[]>([]);
  const [revisions, setRevisions] = useState<RecoveryPoint[]>([]);
  const [dictionary, setDictionary] = useState<DictionaryEntry[]>([]);
  const [profile, setProfile] = useState<WritingProfile>("general");
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>({
    enabled: true,
    defaultLane: "natural",
    schemaVersion: 1,
  });
  const [title, setTitle] = useState("Untitled");
  const [saveState, setSaveState] = useState<SaveState>("Saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisState>({ status: "ready" });
  const [dictationStatus, setDictationStatus] = useState<DictationStatus>({
    status: "idle",
  });
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [wordToolsState, setWordToolsState] = useState<WordToolsState>({
    status: "idle",
  });
  const editorRef = useRef<Editor | null>(null);
  const activeRef = useRef<DocumentRecord | null>(null);
  const titleRef = useRef(title);
  const dirtyRef = useRef(false);
  const generationRef = useRef(0);
  const analysisGenerationRef = useRef(0);
  const analysisRequestRef = useRef(0);
  const documentSessionRef = useRef(0);
  const analysisProjectionRef = useRef<Projection | null>(null);
  const dictionaryRef = useRef<ReadonlySet<string>>(new Set());
  const profileRef = useRef<WritingProfile>("general");
  const ignoredIssuesRef = useRef<IgnoredEditorIssue[]>([]);
  const analyzeOnReadyRef = useRef(false);
  const analysisTimer = useRef<number | undefined>(undefined);
  const idleTimer = useRef<number | undefined>(undefined);
  const maxTimer = useRef<number | undefined>(undefined);
  const saveQueue = useRef(Promise.resolve());
  const dictationSessionRef = useRef<string | null>(null);
  const dictationDocumentSessionRef = useRef<number | null>(null);
  const dictationStopRef = useRef<string | null>(null);
  const protectedTermsForHumanizer = useCallback(
    (text: string) => humanizerProtectedTerms(text, dictionary),
    [dictionary],
  );
  const {
    accept: acceptTransformPreview,
    cancel: cancelActiveTransform,
    changePreset: changeTransformPreset,
    generate: generateTransform,
    onEditorContentChange: updateTransformAfterEdit,
    open: openTransform,
    recheck: recheckTransformAvailability,
    reset: resetTransform,
    state: transformState,
  } = useTransformWorkflow({
    dictationSessionRef,
    dictationStatus,
    documentSessionRef,
    editorRef,
    onError: setSaveError,
    protectedTermsForHumanizer,
  });

  const setCurrent = useCallback(
    (document: DocumentRecord | null, analyzeOnReady = false) => {
      window.clearTimeout(analysisTimer.current);
      analysisTimer.current = undefined;
      analysisRequestRef.current += 1;
      documentSessionRef.current += 1;
      analysisProjectionRef.current = null;
      ignoredIssuesRef.current = [];
      analyzeOnReadyRef.current = analyzeOnReady;
      editorRef.current = null;
      setEditorInstance(null);
      setSelectedIssueId(null);
      generationRef.current += 1;
      analysisGenerationRef.current += 1;
      activeRef.current = document;
      setActive(document);
      const nextProfile = document?.writingProfile ?? "general";
      profileRef.current = nextProfile;
      setProfile(nextProfile);
      const nextTitle = document?.title ?? "Untitled";
      titleRef.current = nextTitle;
      setTitle(nextTitle);
      dirtyRef.current = false;
      setEditorEpoch((value) => value + 1);
      setSaveState("Saved");
      setSaveError(null);
      setAnalysis({ status: "ready" });
      resetTransform();
    },
    [resetTransform],
  );

  const refreshLists = useCallback(async (documentId?: string) => {
    if (!desktopAvailable) return;
    const workspace = await documents.loadWorkspace();
    setAllDocuments(workspace.documents);
    setRecent(workspace.recent);
    setTrash(workspace.trash);
    dictionaryRef.current = new Set(
      workspace.dictionary.map(({ normalizedTerm }) => normalizedTerm),
    );
    setDictionary(workspace.dictionary);
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
            writingProfile: profileRef.current,
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
      setAnalysis({
        status: "complete",
        generation,
        issues: [],
        session,
        text: projection.text,
      });
      return;
    }

    setAnalysis({ status: "analyzing" });
    try {
      const issues = await analyzeText(
        projection.text,
        await getGrammarProvider(),
        {
          dictionary: dictionaryRef.current,
          profile: profileRef.current,
        },
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
        issues: mapped.filter(
          (issue): issue is EditorIssue =>
            issue !== null && !isIgnoredIssue(issue, ignoredIssuesRef.current),
        ),
        session,
        text: projection.text,
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
    (editor: Editor, transactionOrContentChanged?: Transaction | false) => {
      const contentChanged = transactionOrContentChanged !== false;
      editorRef.current = editor;
      generationRef.current += 1;
      if (contentChanged) {
        if (transactionOrContentChanged) {
          ignoredIssuesRef.current = remapIgnoredIssues(
            ignoredIssuesRef.current,
            transactionOrContentChanged.mapping,
            editor.state.doc,
          );
        }
        analysisGenerationRef.current += 1;
        analysisRequestRef.current += 1;
        analysisProjectionRef.current = null;
        setSelectedIssueId(null);
        scheduleAnalysis(editor);
        updateTransformAfterEdit(editor);
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
    [save, scheduleAnalysis, updateTransformAfterEdit],
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

  const cancelActiveDictation = useCallback(async () => {
    const sessionId = dictationSessionRef.current;
    if (!sessionId) return;
    dictationSessionRef.current = null;
    dictationDocumentSessionRef.current = null;
    dictationStopRef.current = null;
    clearDictationTarget(editorRef.current, sessionId);
    setDictationStatus({
      status: "cancelled",
      message: "Dictation cancelled. No text was inserted.",
    });
    try {
      await dictation.cancel(sessionId);
    } catch (error) {
      setDictationStatus({ status: "error", message: errorMessage(error) });
    }
  }, []);

  const finishDictation = useCallback(async (sessionId: string) => {
    if (
      dictationSessionRef.current !== sessionId ||
      dictationStopRef.current === sessionId
    ) {
      return;
    }
    dictationStopRef.current = sessionId;
    setDictationStatus({
      status: "processing",
      message: "Processing speech locally…",
    });
    try {
      const transcript = await dictation.stop(sessionId);
      if (dictationSessionRef.current !== sessionId) return;
      const editor = editorRef.current;
      const documentSession = dictationDocumentSessionRef.current;
      if (!editor || editor.isDestroyed || documentSession === null) {
        throw new Error(
          "The original document is no longer open. No text was inserted.",
        );
      }
      setDictationStatus({
        status: "processing",
        message: "Inserting transcript…",
      });
      const result = insertDictationTranscript(
        editor,
        sessionId,
        documentSession,
        transcript.text,
      );
      if (!result.ok) throw new Error(result.message);
      setDictationStatus({
        status: "success",
        message: transcript.timedOut
          ? "Dictation reached 90 seconds and was inserted."
          : "Dictation inserted.",
      });
    } catch (error) {
      if (dictationSessionRef.current === sessionId) {
        clearDictationTarget(editorRef.current, sessionId);
        setDictationStatus({ status: "error", message: errorMessage(error) });
        editorRef.current?.view.focus();
      }
    } finally {
      if (dictationSessionRef.current === sessionId) {
        dictationSessionRef.current = null;
        dictationDocumentSessionRef.current = null;
      }
      if (dictationStopRef.current === sessionId) {
        dictationStopRef.current = null;
      }
    }
  }, []);

  const startDictation = useCallback(async () => {
    const editor = editorRef.current;
    if (
      !editor ||
      editor.isDestroyed ||
      dictationSessionRef.current ||
      transformState.status !== "idle"
    )
      return;
    const sessionId = crypto.randomUUID();
    const documentSession = documentSessionRef.current;
    const target = captureDictationTarget(editor, sessionId, documentSession);
    if (!target.ok) {
      setDictationStatus({ status: "error", message: target.message });
      return;
    }
    dictationSessionRef.current = sessionId;
    dictationDocumentSessionRef.current = documentSession;
    setDictationStatus({
      status: "preparing",
      message: "Preparing the system microphone…",
    });
    try {
      const info = await dictation.start(sessionId, {
        onError: (message) => {
          if (dictationSessionRef.current !== sessionId) return;
          dictationSessionRef.current = null;
          dictationDocumentSessionRef.current = null;
          clearDictationTarget(editorRef.current, sessionId);
          void dictation.cancel(sessionId);
          setDictationStatus({ status: "error", message });
          editorRef.current?.view.focus();
        },
        onTimeout: () => void finishDictation(sessionId),
      });
      if (
        dictationSessionRef.current !== sessionId ||
        documentSessionRef.current !== documentSession
      ) {
        await dictation.cancel(sessionId);
        return;
      }
      setDictationStatus({
        status: "listening",
        deviceName: info.deviceName,
        message: `Listening on ${info.deviceName}. Speech is processed locally.`,
      });
    } catch (error) {
      if (dictationSessionRef.current === sessionId) {
        dictationSessionRef.current = null;
        dictationDocumentSessionRef.current = null;
        clearDictationTarget(editor, sessionId);
        const message = errorMessage(error);
        setDictationStatus({
          status: "error",
          message,
          permissionHelp: message === MICROPHONE_PERMISSION_ERROR,
        });
      }
    }
  }, [finishDictation, transformState.status]);

  const cancelInteractiveWork = useCallback(async () => {
    await cancelActiveTransform();
    await cancelActiveDictation();
  }, [cancelActiveDictation, cancelActiveTransform]);

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
        dictionaryRef.current = new Set(
          workspace.dictionary.map(({ normalizedTerm }) => normalizedTerm),
        );
        setDictionary(workspace.dictionary);
        setVoiceSettings(workspace.voiceSettings);
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
        if (
          !dirtyRef.current &&
          !dictationSessionRef.current &&
          transformState.status === "idle"
        )
          return;
        event.preventDefault();
        await cancelInteractiveWork();
        if (!dirtyRef.current || (await save("auto"))) {
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
  }, [cancelInteractiveWork, save, transformState.status]);

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
    await cancelInteractiveWork();
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
    await cancelInteractiveWork();
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
    await cancelInteractiveWork();
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
      await cancelInteractiveWork();
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
    await cancelInteractiveWork();
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

  const rerunAnalysis = () => {
    analysisRequestRef.current += 1;
    analysisGenerationRef.current += 1;
    analysisProjectionRef.current = null;
    setSelectedIssueId(null);
    setAnalysis({ status: "ready" });
    void runAnalysis();
  };

  const changeProfile = (nextProfile: WritingProfile) => {
    if (profileRef.current === nextProfile) return;
    profileRef.current = nextProfile;
    setProfile(nextProfile);
    const editor = editorRef.current;
    if (editor) markDirty(editor, false);
    rerunAnalysis();
  };

  const ignoreIssue = (issueId: string) => {
    if (analysis.status !== "complete") return;
    const issue = analysis.issues.find(({ id }) => id === issueId);
    if (!issue) return;
    ignoredIssuesRef.current = [
      ...ignoredIssuesRef.current.filter(
        (ignored) => !isIgnoredIssue(issue, [ignored]),
      ),
      issue,
    ];
    const issues = analysis.issues.filter(({ id }) => id !== issueId);
    setSelectedIssueId(null);
    setAnalysis({ ...analysis, issues });
  };

  const addToDictionary = async (issueId: string) => {
    if (analysis.status !== "complete") return;
    const issue = analysis.issues.find(({ id }) => id === issueId);
    if (!issue || !isDictionaryEligible(issue)) return;
    try {
      const entry = await documents.addDictionaryTerm(issue.originalText);
      const entries = [
        ...dictionary.filter(
          ({ normalizedTerm }) => normalizedTerm !== entry.normalizedTerm,
        ),
        entry,
      ].sort((left, right) =>
        left.normalizedTerm.localeCompare(right.normalizedTerm),
      );
      dictionaryRef.current = new Set(
        entries.map(({ normalizedTerm }) => normalizedTerm),
      );
      setDictionary(entries);
      rerunAnalysis();
    } catch (error) {
      setSaveError(errorMessage(error));
    }
  };

  const removeFromDictionary = async (normalizedTerm: string) => {
    try {
      await documents.removeDictionaryTerm(normalizedTerm);
      const entries = dictionary.filter(
        (entry) => entry.normalizedTerm !== normalizedTerm,
      );
      dictionaryRef.current = new Set(
        entries.map((entry) => entry.normalizedTerm),
      );
      setDictionary(entries);
      rerunAnalysis();
    } catch (error) {
      setSaveError(errorMessage(error));
    }
  };

  const changeVoiceSettings = async (
    enabled: boolean,
    defaultLane: VoiceLane,
  ) => {
    try {
      if (
        !enabled &&
        transformState.status !== "idle" &&
        transformState.mode === "humanizer"
      ) {
        await cancelActiveTransform();
      }
      const saved = await documents.updateVoiceSettings(enabled, defaultLane);
      setVoiceSettings(saved);
      setSaveError(null);
    } catch (error) {
      setSaveError(errorMessage(error));
    }
  };

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

  const closeWordTools = useCallback(() => {
    setWordToolsState({ status: "idle" });
  }, []);

  const openWordTools = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor || editor.isDestroyed) return;
    const selection = selectedWord(editor);
    if (!selection.ok) return;
    await cancelInteractiveWork();
    setWordToolsState({ status: "loading", word: selection.word });
    try {
      const result = await lookupWord(selection.word);
      if (!result) {
        setWordToolsState({ status: "not-found", word: selection.word });
        return;
      }
      setWordToolsState({
        status: "ready",
        word: selection.word,
        from: selection.from,
        to: selection.to,
        result,
      });
    } catch {
      setWordToolsState({ status: "idle" });
    }
  }, [cancelInteractiveWork]);

  const applyWordReplacement = useCallback(
    (replacement: string) => {
      const editor = editorRef.current;
      if (!editor || editor.isDestroyed || wordToolsState.status !== "ready")
        return;
      const { from, to, word } = wordToolsState;
      if (editor.state.doc.textBetween(from, to, "\n", " ") !== word) {
        closeWordTools();
        return;
      }
      try {
        const marks = editor.state.doc.resolve(from).marks();
        const transaction = editor.state.tr.replaceWith(
          from,
          to,
          editor.schema.text(replacement, marks),
        );
        editor.view.dispatch(transaction);
      } finally {
        closeWordTools();
      }
    },
    [closeWordTools, wordToolsState],
  );

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
      <TopBar
        dictionary={dictionary}
        onProfileChange={changeProfile}
        onRemoveDictionaryTerm={removeFromDictionary}
        onVoiceSettingsChange={changeVoiceSettings}
        profile={profile}
        saveState={saveState}
        voiceSettings={voiceSettings}
      />
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
            dictationStatus={dictationStatus}
            document={active}
            key={`${active?.id ?? "new"}-${editorEpoch}`}
            onCancelDictation={() => void cancelActiveDictation()}
            onDirty={markDirty}
            onHumanize={() =>
              openTransform("humanizer", voiceSettings.defaultLane)
            }
            onReady={ready}
            onSelectIssue={selectIssue}
            onStartDictation={() => void startDictation()}
            onStopDictation={() => {
              const sessionId = dictationSessionRef.current;
              if (sessionId) void finishDictation(sessionId);
            }}
            onTransform={() => openTransform("transform", "concise")}
            onWordTools={() => void openWordTools()}
            rewriteMode={
              transformState.status === "idle" ? null : transformState.mode
            }
            voiceEnabled={voiceSettings.enabled}
            wordToolsOpen={wordToolsState.status !== "idle"}
          />
        ) : (
          <main className="workspace" id="workspace" tabIndex={-1} />
        )}
        {wordToolsState.status !== "idle" ? (
          <WordToolsPanel
            onClose={closeWordTools}
            onReplace={applyWordReplacement}
            state={wordToolsState}
          />
        ) : transformState.status === "idle" ? (
          <AnalysisPanel
            analysis={analysis}
            canApplySuggestion={canApplySuggestion}
            disabled={!editorInstance}
            onAnalyze={() => void runAnalysis()}
            onAddToDictionary={(issueId) => void addToDictionary(issueId)}
            onApplySuggestion={applySuggestion}
            onIgnoreIssue={ignoreIssue}
            onSelectIssue={selectIssue}
            selectedIssueId={selectedIssueId}
          />
        ) : (
          <TransformPanel
            onAccept={acceptTransformPreview}
            onCancel={() => void cancelActiveTransform()}
            onGenerate={() => void generateTransform()}
            onPresetChange={changeTransformPreset}
            onCheckAgain={recheckTransformAvailability}
            onRefreshSelection={() =>
              openTransform(transformState.mode, transformState.preset)
            }
            state={transformState}
          />
        )}
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
