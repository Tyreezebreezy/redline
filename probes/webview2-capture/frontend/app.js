const TARGET_LABEL = "Mic/Inst (Samson G-Track Pro)";
const prompts = {
  short: "I can''t finish the assignment today, but I''ll submit it tomorrow.",
  paragraph:
    "When I paused to think, I corrected the first phrase and then continued speaking quickly. The second sentence should still have clear punctuation.",
  terminology:
    "YouTube, GitHub, LinkedIn Learning, Facebook Marketplace, PowerShell, ChatGPT, REDLINE, AXIOM, and ICARUS are part of my workflow.",
};
const elements = Object.fromEntries(
  ["capture", "cycles", "environment", "log", "prompt", "result", "slot", "status", "stop"].map(
    (id) => [id, document.querySelector(`#${id}`)],
  ),
);
const invoke = window.__TAURI__.core.invoke;
let activeStop = null;
let externalRequests = 0;

function log(event, value = {}) {
  elements.log.textContent += `${new Date().toISOString()} ${event} ${JSON.stringify(value)}\n`;
  elements.log.scrollTop = elements.log.scrollHeight;
}

function blockExternal(kind, url) {
  externalRequests += 1;
  log("EXTERNAL_REQUEST_BLOCKED", { kind, url: String(url) });
  throw new Error(`External request blocked: ${kind}`);
}

window.fetch = (url) => blockExternal("fetch", url);
window.XMLHttpRequest = class {
  open(_method, url) {
    blockExternal("XMLHttpRequest", url);
  }
};
window.WebSocket = class {
  constructor(url) {
    blockExternal("WebSocket", url);
  }
};
window.EventSource = class {
  constructor(url) {
    blockExternal("EventSource", url);
  }
};
if (navigator.sendBeacon) navigator.sendBeacon = (url) => blockExternal("sendBeacon", url);

async function permissionState() {
  try {
    return (await navigator.permissions.query({ name: "microphone" })).state;
  } catch {
    return "unavailable";
  }
}

async function refreshEnvironment(lastTrack = null) {
  elements.environment.textContent = JSON.stringify(
    {
      secureContext: window.isSecureContext,
      mediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
      permission: await permissionState(),
      externalRequests,
      track: lastTrack,
    },
    null,
    2,
  );
}

function setBusy(busy) {
  elements.capture.disabled = busy;
  elements.cycles.disabled = busy;
  elements.slot.disabled = busy;
  elements.stop.disabled = !busy || !activeStop;
}

async function capturePcm(seconds) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  const track = stream.getAudioTracks()[0];
  if (!track) throw new DOMException("No audio track was returned", "NotFoundError");
  const settings = track.getSettings();
  if (!track.label.includes(TARGET_LABEL)) {
    stream.getTracks().forEach((item) => item.stop());
    throw new Error(`Selected track mismatch: ${track.label}`);
  }

  let context;
  let source;
  let processor;
  let mute;
  try {
    context = new AudioContext();
    await context.audioWorklet.addModule("pcm-worklet.js");
    if (context.state !== "running") await context.resume();
    source = context.createMediaStreamSource(stream);
    processor = new AudioWorkletNode(context, "bounded-pcm");
    mute = context.createGain();
    mute.gain.value = 0;
    source.connect(processor).connect(mute).connect(context.destination);
  } catch (error) {
    stream.getTracks().forEach((item) => item.stop());
    if (context && context.state !== "closed") await context.close();
    throw error;
  }
  const targetFrames = context.sampleRate * seconds;
  const pcm = new Int16Array(targetFrames);
  let frames = 0;
  let peak = 0;
  let sumSquares = 0;
  let settle;
  const done = new Promise((resolve, reject) => {
    settle = resolve;
    track.addEventListener("ended", () => reject(new Error("Microphone track ended unexpectedly")), {
      once: true,
    });
    processor.port.onmessage = ({ data }) => {
      const chunk = new Int16Array(data);
      const take = Math.min(chunk.length, targetFrames - frames);
      pcm.set(chunk.subarray(0, take), frames);
      for (let index = 0; index < take; index += 1) {
        const value = chunk[index] / 32768;
        peak = Math.max(peak, Math.abs(value));
        sumSquares += value * value;
      }
      frames += take;
      if (frames === targetFrames) resolve();
    };
  });
  activeStop = () => settle();
  setBusy(true);
  elements.status.textContent = `Capturing ${track.label}…`;

  try {
    await done;
  } finally {
    activeStop = null;
    processor.disconnect();
    source.disconnect();
    mute.disconnect();
    stream.getTracks().forEach((item) => item.stop());
    await context.close();
  }
  const captured = pcm.slice(0, frames);
  pcm.fill(0);
  const stopped = stream.getTracks().every((item) => item.readyState === "ended") && !stream.active;
  if (!stopped) throw new Error("track.stop() did not close microphone capture");
  const result = {
    pcm: captured,
    sampleRate: context.sampleRate,
    peak,
    rms: Math.sqrt(sumSquares / Math.max(frames, 1)),
    track: { label: track.label, settings },
  };
  log("CAPTURE_COMPLETE", {
    frames,
    bytes: captured.byteLength,
    peak: result.peak,
    rms: result.rms,
    stopped,
    track: result.track,
  });
  await refreshEnvironment(result.track);
  return result;
}

async function captureAndAnalyze() {
  setBusy(true);
  elements.result.textContent = "";
  const slot = elements.slot.value;
  try {
    const capture = await capturePcm(15);
    if (capture.peak < 0.01 || capture.rms < 0.001) throw new Error("No clear speech energy detected");
    elements.status.textContent = "Microphone closed. Running local hybrid analysis…";
    const json = await invoke("analyze_live_capture", {
      input: { slot, sampleRate: capture.sampleRate, pcm: Array.from(capture.pcm) },
    });
    capture.pcm.fill(0);
    const report = JSON.parse(json);
    const row = report.fixtures[0];
    elements.result.textContent = JSON.stringify(
      {
        expected: row.expected,
        sherpa: row.sherpa_text,
        whisper: row.whisper_text,
        committed: row.committed_text,
        sherpaWer: row.sherpa_wer,
        whisperWer: row.whisper_wer,
        firstVisibleMs: row.estimated_first_visible_ms,
        endpointToFinalMs: row.segments.map((segment) => segment.endpoint_to_final_ms),
        terminologyCasingMisses: row.terminology_casing_misses,
        externalRequests,
      },
      null,
      2,
    );
    elements.status.textContent = "PASS — live capture analyzed locally; microphone is closed.";
    log("LIVE_ANALYSIS_COMPLETE", { slot, committed: row.committed_text });
  } catch (error) {
    elements.status.textContent = `FAIL — ${error.name ?? "Error"}: ${error.message ?? error}`;
    log("LIVE_ANALYSIS_FAILED", { slot, error: String(error?.stack ?? error) });
  } finally {
    activeStop = null;
    setBusy(false);
  }
}

async function runCycles() {
  setBusy(true);
  const results = [];
  try {
    for (let cycle = 1; cycle <= 20; cycle += 1) {
      elements.status.textContent = `Capture cycle ${cycle} of 20 — keep speaking.`;
      const result = await capturePcm(3);
      results.push({ peak: result.peak, rms: result.rms, label: result.track.label });
      result.pcm.fill(0);
    }
    const speechCycles = results.filter((row) => row.peak >= 0.01 && row.rms >= 0.001).length;
    const pass = speechCycles > 0 && externalRequests === 0;
    elements.result.textContent = JSON.stringify({ cycles: results.length, speechCycles, pass }, null, 2);
    elements.status.textContent = `${pass ? "PASS" : "FAIL"} — 20 capture/stop cycles; microphone is closed.`;
    log("CYCLE_TEST_COMPLETE", { cycles: results.length, speechCycles, pass });
  } catch (error) {
    elements.status.textContent = `FAIL — ${error.name ?? "Error"}: ${error.message ?? error}`;
    log("CYCLE_TEST_FAILED", { completed: results.length, error: String(error?.stack ?? error) });
  } finally {
    activeStop = null;
    setBusy(false);
  }
}

function showPrompt() {
  elements.prompt.textContent = prompts[elements.slot.value];
}

elements.slot.addEventListener("change", showPrompt);
elements.capture.addEventListener("click", captureAndAnalyze);
elements.cycles.addEventListener("click", runCycles);
elements.stop.addEventListener("click", () => activeStop?.());
showPrompt();
refreshEnvironment();
log("PROBE_READY", { origin: location.origin });
