import type { Editor } from "@tiptap/react";
import { type MutableRefObject, useCallback, useRef, useState } from "react";
import type { DictationStatus } from "./dictation";
import {
  acceptTransform,
  captureTransformTarget,
  clearTransformTarget,
  responseAcceptBlock,
  type TransformPreset,
  type TransformSelection,
  type TransformWorkflowState,
  transformProvider,
  transformTargetState,
} from "./transform";

type Options = {
  dictationSessionRef: MutableRefObject<string | null>;
  dictationStatus: DictationStatus;
  documentSessionRef: MutableRefObject<number>;
  editorRef: MutableRefObject<Editor | null>;
  onError: (message: string) => void;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function useTransformWorkflow({
  dictationSessionRef,
  dictationStatus,
  documentSessionRef,
  editorRef,
  onError,
}: Options) {
  const [state, setState] = useState<TransformWorkflowState>({
    status: "idle",
  });
  const stateRef = useRef<TransformWorkflowState>({ status: "idle" });

  const updateState = useCallback((next: TransformWorkflowState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const reset = useCallback(() => {
    updateState({ status: "idle" });
  }, [updateState]);

  const checkAvailability = useCallback(
    async (selection: TransformSelection) => {
      updateState({ ...selection, status: "checking" });
      try {
        const status = await transformProvider.status();
        const pending = stateRef.current;
        if (
          pending.status !== "checking" ||
          pending.targetId !== selection.targetId
        ) {
          return;
        }
        updateState(
          status.available
            ? { ...selection, status: "ready" }
            : {
                ...selection,
                message:
                  "The optional offline Transform model is not installed.",
                status: "unavailable",
              },
        );
      } catch (error) {
        const pending = stateRef.current;
        if (
          pending.status === "checking" &&
          pending.targetId === selection.targetId
        ) {
          updateState({
            ...selection,
            message: errorMessage(error),
            status: "error",
          });
        }
      }
    },
    [updateState],
  );

  const open = useCallback(() => {
    const editor = editorRef.current;
    if (
      !editor ||
      editor.isDestroyed ||
      dictationSessionRef.current ||
      ["preparing", "listening", "processing"].includes(dictationStatus.status)
    ) {
      return;
    }
    clearTransformTarget(editor);
    const targetId = crypto.randomUUID();
    const captured = captureTransformTarget(
      editor,
      targetId,
      documentSessionRef.current,
    );
    if (!captured.ok) return;
    void checkAvailability({
      acceptReason: captured.acceptReason,
      acceptSupported: captured.acceptSupported,
      original: captured.text,
      preset: "concise",
      targetId,
    });
  }, [
    checkAvailability,
    dictationSessionRef,
    dictationStatus.status,
    documentSessionRef,
    editorRef,
  ]);

  const recheck = useCallback(() => {
    const current = stateRef.current;
    if (current.status === "idle" || current.status === "generating") return;
    void checkAvailability({
      acceptReason: current.acceptReason,
      acceptSupported: current.acceptSupported,
      original: current.original,
      preset: current.preset,
      targetId: current.targetId,
    });
  }, [checkAvailability]);

  const cancel = useCallback(async () => {
    const current = stateRef.current;
    if (current.status === "idle") return;
    updateState({ status: "idle" });
    clearTransformTarget(editorRef.current, current.targetId);
    if (current.status === "generating") {
      try {
        await transformProvider.cancel(current.requestId);
      } catch (error) {
        onError(errorMessage(error));
      }
    }
  }, [editorRef, onError, updateState]);

  const changePreset = useCallback(
    (preset: TransformPreset) => {
      const current = stateRef.current;
      if (
        current.status === "idle" ||
        current.status === "generating" ||
        current.status === "checking" ||
        current.status === "unavailable"
      )
        return;
      updateState({
        acceptReason: current.acceptReason,
        acceptSupported: current.acceptSupported,
        original: current.original,
        preset,
        status: "ready",
        targetId: current.targetId,
      });
    },
    [updateState],
  );

  const generate = useCallback(async () => {
    const current = stateRef.current;
    const editor = editorRef.current;
    if (
      current.status === "idle" ||
      current.status === "generating" ||
      current.status === "checking" ||
      current.status === "unavailable" ||
      !editor ||
      editor.isDestroyed
    ) {
      return;
    }
    const target = transformTargetState(
      editor,
      current.targetId,
      documentSessionRef.current,
    );
    if (!target.current) {
      updateState({ ...current, message: target.reason, status: "stale" });
      return;
    }

    const requestId = crypto.randomUUID();
    const selection = {
      acceptReason: current.acceptReason,
      acceptSupported: current.acceptSupported,
      original: current.original,
      preset: current.preset,
      targetId: current.targetId,
    };
    updateState({ ...selection, requestId, status: "generating" });
    try {
      const status = await transformProvider.status();
      if (!status.available) {
        throw new Error(
          "The optional offline Transform model is not installed.",
        );
      }
      const stillPending = stateRef.current;
      if (
        stillPending.status !== "generating" ||
        stillPending.requestId !== requestId
      ) {
        return;
      }
      const response = await transformProvider.generate(
        requestId,
        current.original,
        current.preset,
      );
      const pending = stateRef.current;
      if (pending.status !== "generating" || pending.requestId !== requestId) {
        return;
      }
      const mapped = transformTargetState(
        editor,
        current.targetId,
        documentSessionRef.current,
      );
      const sourceBlocked = mapped.current ? null : mapped.reason;
      updateState({
        ...selection,
        acceptBlockedReason:
          sourceBlocked ?? responseAcceptBlock(response, selection),
        response,
        stale: !mapped.current,
        status: "preview",
      });
    } catch (error) {
      const pending = stateRef.current;
      if (pending.status === "generating" && pending.requestId === requestId) {
        updateState({
          ...selection,
          message: errorMessage(error),
          status: "error",
        });
      }
    }
  }, [documentSessionRef, editorRef, updateState]);

  const accept = useCallback(() => {
    const current = stateRef.current;
    const editor = editorRef.current;
    if (
      current.status !== "preview" ||
      current.acceptBlockedReason ||
      !editor ||
      editor.isDestroyed
    ) {
      return;
    }
    const accepted = acceptTransform(
      editor,
      current.targetId,
      documentSessionRef.current,
      current.response.text,
    );
    if (!accepted.ok) {
      updateState({
        ...current,
        acceptBlockedReason: accepted.message,
        stale: true,
      });
      return;
    }
    updateState({ status: "idle" });
  }, [documentSessionRef, editorRef, updateState]);

  const onEditorContentChange = useCallback(
    (editor: Editor) => {
      const current = stateRef.current;
      if (current.status === "idle" || current.status === "generating") return;
      const target = transformTargetState(
        editor,
        current.targetId,
        documentSessionRef.current,
      );
      if (target.current) return;
      updateState(
        current.status === "preview"
          ? { ...current, acceptBlockedReason: target.reason, stale: true }
          : { ...current, message: target.reason, status: "stale" },
      );
    },
    [documentSessionRef, updateState],
  );

  return {
    accept,
    cancel,
    changePreset,
    generate,
    onEditorContentChange,
    open,
    recheck,
    reset,
    state,
  };
}
