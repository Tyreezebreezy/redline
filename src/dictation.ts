import { invoke, isTauri } from "@tauri-apps/api/core";
import { Mark } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";

export type DictationStatus =
  | { status: "idle" }
  | { status: "preparing"; message: string }
  | { status: "listening"; deviceName: string; message: string }
  | { status: "processing"; message: string }
  | { status: "success"; message: string }
  | { status: "cancelled"; message: string }
  | { status: "error"; message: string };

export type CaptureInfo = {
  deviceName: string;
  maxDurationSeconds: number;
  sampleRate: number;
};

export type SpeechTranscript = {
  text: string;
  audioDurationMs: number;
  modelLoadMs: number;
  processingMs: number;
  realTimeFactor: number;
  timedOut: boolean;
};

type CaptureHandlers = {
  onError: (message: string) => void;
  onTimeout: () => void;
};

type BrowserCapture = {
  accepting: boolean;
  audioContext: AudioContext;
  frames: number;
  handlers: CaptureHandlers;
  pcm: Int16Array;
  processor: AudioWorkletNode;
  sessionId: string;
  source: MediaStreamAudioSourceNode;
  stream: MediaStream;
  timeout: number;
  timedOut: boolean;
  track: MediaStreamTrack;
  trackEnded: () => void;
};

const MAX_CAPTURE_SECONDS = 90;
const MAX_CAPTURE_SAMPLE_RATE = 48_000;
const WORKLET_URL = "/dictation-capture.js";
let activeCapture: BrowserCapture | null = null;

type DictationTarget = {
  documentSession: number;
  from: number;
  marks: readonly Mark[];
  sessionId: string;
  to: number;
  valid: boolean;
};

type TargetMeta =
  | { target: DictationTarget; type: "capture" }
  | { sessionId?: string; type: "clear" };

export const DICTATION_TARGET = new PluginKey<DictationTarget | null>(
  "dictationTarget",
);

function microphoneError(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return new Error(
      "Microphone permission was denied. To ask again, close REDLINE, rename %LOCALAPPDATA%\\com.tyree.redline\\EBWebView, then reopen REDLINE; your documents are stored separately. Also confirm Windows Settings > Privacy & security > Microphone > Let desktop apps access your microphone is on.",
    );
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return new Error("No system microphone is available.");
  }
  return error instanceof Error
    ? error
    : new Error("REDLINE could not open the system microphone.");
}

async function closeCapture(capture: BrowserCapture, discard: boolean) {
  if (!capture.accepting) {
    if (discard) capture.pcm.fill(0);
    return;
  }
  capture.accepting = false;
  window.clearTimeout(capture.timeout);
  capture.track.removeEventListener("ended", capture.trackEnded);
  capture.processor.port.onmessage = null;
  capture.processor.disconnect();
  capture.source.disconnect();
  for (const track of capture.stream.getTracks()) track.stop();
  if (capture.audioContext.state !== "closed") {
    await capture.audioContext.close();
  }
  if (discard) capture.pcm.fill(0);
}

async function freezeTimedOutCapture(capture: BrowserCapture) {
  if (activeCapture !== capture || capture.timedOut) return;
  capture.timedOut = true;
  await closeCapture(capture, false);
  capture.handlers.onTimeout();
}

async function createBrowserCapture(
  sessionId: string,
  handlers: CaptureHandlers,
) {
  if (activeCapture) throw new Error("Another dictation session is active.");
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("WebView2 microphone capture is unavailable.");
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
  } catch (error) {
    throw microphoneError(error);
  }

  const track = stream.getAudioTracks()[0];
  if (!track) {
    for (const current of stream.getTracks()) current.stop();
    throw new Error("WebView2 returned no microphone track.");
  }

  const audioContext = new AudioContext();
  let nativeStarted = false;
  try {
    await audioContext.audioWorklet.addModule(WORKLET_URL);
    if (
      audioContext.sampleRate < 8_000 ||
      audioContext.sampleRate > MAX_CAPTURE_SAMPLE_RATE
    ) {
      throw new Error(
        `The browser microphone sample rate is not supported (${audioContext.sampleRate} Hz).`,
      );
    }
    const source = audioContext.createMediaStreamSource(stream);
    const processor = new AudioWorkletNode(audioContext, "redline-pcm-capture");
    const mute = audioContext.createGain();
    mute.gain.value = 0;
    source.connect(processor).connect(mute).connect(audioContext.destination);

    const capture: BrowserCapture = {
      accepting: true,
      audioContext,
      frames: 0,
      handlers,
      pcm: new Int16Array(audioContext.sampleRate * MAX_CAPTURE_SECONDS),
      processor,
      sessionId,
      source,
      stream,
      timedOut: false,
      timeout: 0,
      track,
      trackEnded: () => undefined,
    };
    capture.trackEnded = () => {
      if (!capture.accepting || activeCapture !== capture) return;
      void closeCapture(capture, true).then(() => {
        if (activeCapture === capture) activeCapture = null;
        handlers.onError("Microphone capture stopped unexpectedly.");
      });
    };
    track.addEventListener("ended", capture.trackEnded);
    processor.port.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
      if (!capture.accepting) return;
      const chunk = new Int16Array(data);
      const take = Math.min(chunk.length, capture.pcm.length - capture.frames);
      capture.pcm.set(chunk.subarray(0, take), capture.frames);
      capture.frames += take;
      if (capture.frames === capture.pcm.length) {
        void freezeTimedOutCapture(capture);
      }
    };

    activeCapture = capture;
    const info = await invoke<CaptureInfo>("start_dictation", {
      deviceName: track.label || "System microphone",
      sampleRate: audioContext.sampleRate,
      sessionId,
    });
    nativeStarted = true;
    if (audioContext.state !== "running") await audioContext.resume();
    capture.timeout = window.setTimeout(
      () => void freezeTimedOutCapture(capture),
      MAX_CAPTURE_SECONDS * 1_000,
    );
    return info;
  } catch (error) {
    if (activeCapture?.sessionId === sessionId) activeCapture = null;
    for (const current of stream.getTracks()) current.stop();
    if (audioContext.state !== "closed") await audioContext.close();
    if (nativeStarted) {
      await invoke<void>("cancel_dictation", { sessionId }).catch(
        () => undefined,
      );
    }
    throw microphoneError(error);
  }
}

export const dictation = {
  start: createBrowserCapture,
  stop: async (sessionId: string) => {
    const capture = activeCapture;
    if (!capture || capture.sessionId !== sessionId) {
      throw new Error("The dictation session is no longer active.");
    }
    activeCapture = null;
    await closeCapture(capture, false);
    const pcm = new Uint8Array(
      capture.pcm.buffer,
      0,
      capture.frames * Int16Array.BYTES_PER_ELEMENT,
    );
    try {
      return await invoke<SpeechTranscript>("stop_dictation", pcm, {
        headers: {
          "x-redline-sample-rate": String(capture.audioContext.sampleRate),
          "x-redline-session-id": sessionId,
          "x-redline-timed-out": String(capture.timedOut),
        },
      });
    } finally {
      capture.pcm.fill(0);
    }
  },
  cancel: async (sessionId: string) => {
    const capture = activeCapture;
    if (capture?.sessionId === sessionId) {
      activeCapture = null;
      await closeCapture(capture, true);
    }
    if (isTauri()) await invoke<void>("cancel_dictation", { sessionId });
  },
};

export function createDictationTargetPlugin() {
  return new Plugin<DictationTarget | null>({
    key: DICTATION_TARGET,
    state: {
      init: () => null,
      apply(transaction, target) {
        const meta = transaction.getMeta(DICTATION_TARGET) as
          | TargetMeta
          | undefined;
        if (meta?.type === "capture") return meta.target;
        if (
          meta?.type === "clear" &&
          (!meta.sessionId || meta.sessionId === target?.sessionId)
        ) {
          return null;
        }
        if (!target?.valid || !transaction.docChanged) return target;

        let { from, to } = target;
        for (const stepMap of transaction.mapping.maps) {
          let touched = false;
          stepMap.forEach((oldStart, oldEnd) => {
            const insertion = oldStart === oldEnd;
            touched ||=
              from === to
                ? insertion
                  ? oldStart === from
                  : oldStart <= from && oldEnd >= from
                : insertion
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

function marksForRange(
  editor: Editor,
  selection: TextSelection = editor.state.selection as TextSelection,
) {
  const { storedMarks } = editor.state;
  if (
    !(selection instanceof TextSelection) ||
    !selection.$from.sameParent(selection.$to)
  ) {
    return null;
  }
  if (selection.empty) return storedMarks ?? selection.$from.marks();

  let marks: readonly Mark[] | null = null;
  let invalid = false;
  selection.$from.parent.nodesBetween(
    selection.$from.parentOffset,
    selection.$to.parentOffset,
    (node) => {
      if (node.isText) {
        if (marks === null) marks = node.marks;
        else if (!Mark.sameSet(marks, node.marks)) invalid = true;
      } else if (node.isLeaf) {
        invalid = true;
      }
    },
  );
  return invalid ? null : (marks ?? []);
}

export function captureDictationTarget(
  editor: Editor,
  sessionId: string,
  documentSession: number,
) {
  const marks = marksForRange(editor);
  const { selection } = editor.state;
  if (!marks || !selection.$from.parent.isTextblock) {
    return {
      ok: false as const,
      message:
        "Dictation can replace only text within one paragraph with consistent formatting.",
    };
  }
  editor.view.dispatch(
    editor.state.tr.setMeta(DICTATION_TARGET, {
      target: {
        documentSession,
        from: selection.from,
        marks,
        sessionId,
        to: selection.to,
        valid: true,
      },
      type: "capture",
    } satisfies TargetMeta),
  );
  return { ok: true as const };
}

export function clearDictationTarget(
  editor: Editor | null,
  sessionId?: string,
) {
  if (!editor || editor.isDestroyed) return;
  editor.view.dispatch(
    editor.state.tr.setMeta(DICTATION_TARGET, {
      sessionId,
      type: "clear",
    } satisfies TargetMeta),
  );
}

function insertionText(editor: Editor, from: number, to: number, text: string) {
  const clean = text.trim();
  if (!clean) return "";
  const $from = editor.state.doc.resolve(from);
  const $to = editor.state.doc.resolve(to);
  if (!$from.sameParent($to) || !$from.parent.isTextblock) return "";
  const left =
    $from.parentOffset > 0
      ? $from.parent.textBetween($from.parentOffset - 1, $from.parentOffset)
      : "";
  const right =
    $to.parentOffset < $to.parent.content.size
      ? $to.parent.textBetween($to.parentOffset, $to.parentOffset + 1)
      : "";
  const leading =
    left && !/[\s([{\-—/“‘]$/u.test(left) && !/^[,.;:!?%)}\]”’]/u.test(clean)
      ? " "
      : "";
  const trailing =
    right &&
    !/[\s([{\-—/“‘]$/u.test(clean) &&
    !/^[\s,.;:!?%)}\]”’]/u.test(right)
      ? " "
      : "";
  return `${leading}${clean}${trailing}`;
}

export function insertDictationTranscript(
  editor: Editor,
  sessionId: string,
  documentSession: number,
  transcript: string,
) {
  const target = DICTATION_TARGET.getState(editor.state);
  if (
    !target?.valid ||
    target.sessionId !== sessionId ||
    target.documentSession !== documentSession
  ) {
    clearDictationTarget(editor, sessionId);
    return {
      ok: false as const,
      message:
        "The document changed at the dictation target. No text was inserted.",
    };
  }
  const text = insertionText(editor, target.from, target.to, transcript);
  if (!text) {
    clearDictationTarget(editor, sessionId);
    return { ok: false as const, message: "No speech was detected." };
  }

  const $from = editor.state.doc.resolve(target.from);
  const $to = editor.state.doc.resolve(target.to);
  if (!$from.sameParent($to) || !$from.parent.isTextblock) {
    clearDictationTarget(editor, sessionId);
    return {
      ok: false as const,
      message: "The original dictation target is no longer safe.",
    };
  }
  if (target.from !== target.to) {
    const currentMarks = marksForRange(
      editor,
      TextSelection.create(editor.state.doc, target.from, target.to),
    );
    if (!currentMarks || !Mark.sameSet(currentMarks, target.marks)) {
      clearDictationTarget(editor, sessionId);
      return {
        ok: false as const,
        message: "The selected formatting changed. No text was inserted.",
      };
    }
  }

  try {
    const transaction = editor.state.tr.replaceWith(
      target.from,
      target.to,
      editor.schema.text(text, target.marks),
    );
    const end = Math.min(
      target.from + text.length,
      transaction.doc.content.size,
    );
    transaction
      .setSelection(TextSelection.near(transaction.doc.resolve(end)))
      .setMeta(DICTATION_TARGET, {
        sessionId,
        type: "clear",
      } satisfies TargetMeta)
      .scrollIntoView();
    editor.view.dispatch(transaction);
    if (typeof window !== "undefined") editor.view.focus();
    return { ok: true as const };
  } catch {
    clearDictationTarget(editor, sessionId);
    return {
      ok: false as const,
      message: "REDLINE could not insert the transcript safely.",
    };
  }
}
