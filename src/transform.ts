import { invoke, isTauri } from "@tauri-apps/api/core";
import { Mark } from "@tiptap/pm/model";
import {
  AllSelection,
  Plugin,
  PluginKey,
  TextSelection,
} from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { marksForTextSelection } from "./editor.ts";
import { changedHumanizerTerm } from "./humanizer.ts";

export type TransformPreset =
  | "concise"
  | "professional"
  | "academic"
  | "simplify"
  | "expand"
  | "improve-flow";
export type VoicePreset = "natural" | "professional" | "academic";
export type RewritePreset = TransformPreset | VoicePreset;
export type RewriteMode = "transform" | "humanizer";

export type TransformStatus = {
  available: boolean;
  verified: boolean;
  modelId: string;
  component: "bundled" | "optional" | null;
};

export type TransformInvariantReport = {
  protectedTokenMutations: number;
  changedNumbers: boolean;
  missing: Record<string, string[]>;
  invented: Record<string, string[]>;
};

export type TransformResponse = {
  requestId: string;
  text: string;
  identicalOutput: boolean;
  promptContractVersion: string;
  invariants: TransformInvariantReport;
  metrics: {
    modelLoadMs: number;
    promptProcessingMs: number;
    generationMs: number;
    totalMs: number;
    generatedTokens: number;
    tokensPerSecond: number;
  };
};

export type TransformSelection = {
  acceptReason: string | null;
  acceptSupported: boolean;
  mode: RewriteMode;
  original: string;
  preset: RewritePreset;
  protectedTerms: string[];
  targetId: string;
};

export type TransformWorkflowState =
  | { status: "idle" }
  | ({ status: "checking" } & TransformSelection)
  | ({ message: string; status: "unavailable" } & TransformSelection)
  | ({ status: "ready" } & TransformSelection)
  | ({ requestId: string; status: "generating" } & TransformSelection)
  | ({
      acceptBlockedReason: string | null;
      response: TransformResponse;
      stale: boolean;
      status: "preview";
    } & TransformSelection)
  | ({ message: string; status: "stale" } & TransformSelection)
  | ({ message: string; status: "error" } & TransformSelection);

type TransformTarget = {
  acceptReason: string | null;
  acceptSupported: boolean;
  documentSession: number;
  from: number;
  marks: readonly Mark[];
  originalText: string;
  targetId: string;
  to: number;
  valid: boolean;
};

type TargetMeta =
  | { target: TransformTarget; type: "capture" }
  | { targetId?: string; type: "clear" };

export const TRANSFORM_TARGET = new PluginKey<TransformTarget | null>(
  "transformTarget",
);

export const transformProvider = {
  status: () =>
    isTauri()
      ? invoke<TransformStatus>("transform_status")
      : Promise.resolve({
          available: false,
          component: null,
          modelId: "qwen2.5-1.5b-q4_k_m",
          verified: false,
        } satisfies TransformStatus),
  generate: (
    requestId: string,
    text: string,
    preset: RewritePreset,
    mode: RewriteMode,
  ) =>
    isTauri()
      ? invoke<TransformResponse>("generate_transform", {
          request: { mode, preset, requestId, text },
        })
      : Promise.reject(
          new Error(
            "Local Transform generation is available in REDLINE desktop.",
          ),
        ),
  cancel: (requestId: string) =>
    isTauri()
      ? invoke<void>("cancel_transform", { requestId })
      : Promise.resolve(),
};

export function createTransformTargetPlugin() {
  return new Plugin<TransformTarget | null>({
    key: TRANSFORM_TARGET,
    state: {
      init: () => null,
      apply(transaction, target) {
        const meta = transaction.getMeta(TRANSFORM_TARGET) as
          | TargetMeta
          | undefined;
        if (meta?.type === "capture") return meta.target;
        if (
          meta?.type === "clear" &&
          (!meta.targetId || meta.targetId === target?.targetId)
        ) {
          return null;
        }
        if (!target?.valid || !transaction.docChanged) return target;

        let { from, to } = target;
        for (const stepMap of transaction.mapping.maps) {
          let touched = false;
          stepMap.forEach((oldStart, oldEnd) => {
            const insertion = oldStart === oldEnd;
            touched ||= insertion
              ? oldStart >= from && oldStart <= to
              : oldStart <= to && oldEnd >= from;
          });
          if (touched) return { ...target, valid: false };
          from = stepMap.map(from, 1);
          to = stepMap.map(to, -1);
        }
        return { ...target, from, to };
      },
    },
  });
}

export function transformSelection(editor: Editor) {
  const selection = transformTextSelection(editor);
  if (!selection || selection.empty) {
    return { ok: false as const, reason: "Select text to transform." };
  }
  const text = editor.state.doc.textBetween(
    selection.from,
    selection.to,
    "\n",
    "\n",
  );
  if (!text.trim()) {
    return { ok: false as const, reason: "Select text to transform." };
  }
  if (Array.from(text).length > 4000) {
    return {
      ok: false as const,
      reason: "Transform selections are limited to 4000 characters.",
    };
  }
  return { ok: true as const, text };
}

function transformTextSelection(editor: Editor) {
  const { selection } = editor.state;
  if (selection instanceof TextSelection) return selection;
  if (selection instanceof AllSelection) {
    return editor.state.doc.childCount === 1 &&
      editor.state.doc.firstChild?.isTextblock
      ? TextSelection.create(
          editor.state.doc,
          1,
          editor.state.doc.content.size - 1,
        )
      : selection;
  }
  return null;
}

export function captureTransformTarget(
  editor: Editor,
  targetId: string,
  documentSession: number,
) {
  const selected = transformSelection(editor);
  if (!selected.ok) return selected;
  const selection = transformTextSelection(editor);
  if (!selection)
    return { ok: false as const, reason: "Select text to transform." };
  const marks = marksForTextSelection(
    editor,
    selection instanceof TextSelection ? selection : undefined,
  );
  const sameTextblock =
    selection instanceof TextSelection &&
    selection.$from.sameParent(selection.$to) &&
    selection.$from.parent.isTextblock;
  const acceptSupported = sameTextblock && marks !== null;
  const acceptReason = acceptSupported
    ? null
    : sameTextblock
      ? "Accept is unavailable because the selection contains mixed formatting."
      : "Accept is available only for a selection inside one paragraph or heading. Preview remains available.";
  editor.view.dispatch(
    editor.state.tr
      .setMeta(TRANSFORM_TARGET, {
        target: {
          acceptReason,
          acceptSupported,
          documentSession,
          from: selection.from,
          marks: marks ?? [],
          originalText: selected.text,
          targetId,
          to: selection.to,
          valid: true,
        },
        type: "capture",
      } satisfies TargetMeta)
      .setMeta("addToHistory", false),
  );
  return {
    acceptReason,
    acceptSupported,
    ok: true as const,
    text: selected.text,
  };
}

export function clearTransformTarget(editor: Editor | null, targetId?: string) {
  if (!editor || editor.isDestroyed) return;
  editor.view.dispatch(
    editor.state.tr
      .setMeta(TRANSFORM_TARGET, {
        targetId,
        type: "clear",
      } satisfies TargetMeta)
      .setMeta("addToHistory", false),
  );
}

export function transformTargetState(
  editor: Editor,
  targetId: string,
  documentSession: number,
) {
  const target = TRANSFORM_TARGET.getState(editor.state);
  if (
    !target?.valid ||
    target.targetId !== targetId ||
    target.documentSession !== documentSession
  ) {
    return {
      current: false as const,
      reason: "The original selection changed. No text will be replaced.",
    };
  }
  const currentText = editor.state.doc.textBetween(
    target.from,
    target.to,
    "\n",
    "\n",
  );
  if (currentText !== target.originalText) {
    return {
      current: false as const,
      reason: "The original selection changed. No text will be replaced.",
    };
  }
  return { current: true as const, target };
}

export function responseAcceptBlock(
  response: TransformResponse,
  selection: TransformSelection,
) {
  if (!selection.acceptSupported) return selection.acceptReason;
  if (response.invariants.protectedTokenMutations > 0) {
    return "Protected factual or technical tokens changed. Accept is blocked.";
  }
  const changedTerm = changedHumanizerTerm(
    selection.original,
    response.text,
    selection.protectedTerms,
  );
  if (changedTerm) {
    return `Protected terminology changed: ${changedTerm}. Accept is blocked.`;
  }
  if (response.identicalOutput) {
    return "The generated text is identical to the original.";
  }
  if (response.text.includes("\n")) {
    return "Accept is blocked because this single-paragraph result contains structural line breaks.";
  }
  return null;
}

export function acceptTransform(
  editor: Editor,
  targetId: string,
  documentSession: number,
  transformed: string,
) {
  const state = transformTargetState(editor, targetId, documentSession);
  if (!state.current || !state.target.acceptSupported) {
    clearTransformTarget(editor, targetId);
    return {
      ok: false as const,
      message: state.current
        ? (state.target.acceptReason ??
          "This selection cannot be replaced safely.")
        : state.reason,
    };
  }
  if (!transformed.trim() || transformed.includes("\n")) {
    return {
      ok: false as const,
      message: "The generated text cannot be inserted safely here.",
    };
  }
  const currentMarks = marksForTextSelection(
    editor,
    TextSelection.create(editor.state.doc, state.target.from, state.target.to),
  );
  if (!currentMarks || !Mark.sameSet(currentMarks, state.target.marks)) {
    clearTransformTarget(editor, targetId);
    return {
      ok: false as const,
      message: "The selected formatting changed. No text was replaced.",
    };
  }

  try {
    const transaction = editor.state.tr.replaceWith(
      state.target.from,
      state.target.to,
      editor.schema.text(transformed, state.target.marks),
    );
    const end = Math.min(
      state.target.from + transformed.length,
      transaction.doc.content.size,
    );
    transaction
      .setSelection(TextSelection.near(transaction.doc.resolve(end)))
      .setMeta(TRANSFORM_TARGET, {
        targetId,
        type: "clear",
      } satisfies TargetMeta)
      .scrollIntoView();
    editor.view.dispatch(transaction);
    if (typeof window !== "undefined") editor.view.focus();
    return { ok: true as const };
  } catch {
    clearTransformTarget(editor, targetId);
    return {
      ok: false as const,
      message: "REDLINE could not replace the selection safely.",
    };
  }
}
