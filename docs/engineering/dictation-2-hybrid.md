# Dictation 2.0 hybrid endpoint/finalization experiment

Date: 2026-09-15  
Branch: `codex/redline-1.0-foundation`  
Starting commit: `185b27a9f1dc9c6fe0f2fc62d8e28277fae6abfd`

This is a development probe, not a production integration. REDLINE's current
record-stop-transcribe dictation, UI, Tauri commands, capabilities, CSP,
Permissions Policy, database, and package dependencies remain unchanged.

## Architecture evaluated

The Rust probe keeps both engines in one process:

1. feed 100 ms, 16 kHz mono chunks to sherpa-onnx;
2. publish sherpa text only as ephemeral partial state;
3. let sherpa endpoint detection freeze one bounded segment, with a 30-second
   hard safety cap;
4. run Whisper exactly once on that segment;
5. emit one final event with an explicit segment ID;
6. commit the Whisper text, or non-empty sherpa fallback, once.

The queue-aware benchmark models one serialized Whisper worker while capture
continues. It records the delay between an endpoint and worker availability in
addition to Whisper inference time. It does not yet run streaming recognition
and Whisper inference concurrently on separate threads in real time.

The TypeScript prototype uses REDLINE's actual Tiptap extensions, ProseMirror
transactions, dictation target plugin, and transcript insertion function. A
partial is never editor content. Final text uses the mapped target only if its
document session and untouched range remain valid.

## Endpoint selection

Five representative fixtures were run through all profiles with the final
queue-aware probe:

| Profile | Rule 1 / Rule 2 silence | Rule 3 max | Segments | Median trailing silence | Median endpoint-to-final | Worst | WER |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| Responsive | 2.0 s / 0.8 s | 15 s | 6 | 1,296 ms | 5,082 ms | 5,693 ms | 0.014 |
| Balanced | 2.4 s / 1.2 s | 20 s | 5 | 1,706 ms | 4,868 ms | 5,031 ms | 0.000 |
| Patient | 3.0 s / 1.8 s | 30 s | 5 | 2,306 ms | 4,850 ms | 5,212 ms | 0.000 |

Responsive split the paragraph fixture into two segments. Patient added about
600 ms of silence without an accuracy gain. Balanced is the probe default. A
normal thinking pause can therefore be about 1.7 seconds before finalization;
shorter pauses remain within the current segment.

## Full 26-fixture result

The balanced run covered 23 speech and three no-speech fixtures:

- 23 sherpa endpoints; no input-finished flushes or safety-cap splits;
- median estimated first visible partial: **1,135 ms**;
- endpoint-to-final: **4,863 ms median**, **5,497 ms p90**,
  **5,562 ms p95**, and **6,439 ms worst**;
- simulated editor commit time remained negligible relative to inference;
- sherpa: 93 word errors / 258 reference words, **0.360 WER**;
- Whisper final: 57 errors, **0.221 WER**;
- hybrid committed: 57 errors, **0.221 WER**;
- all three no-speech fixtures emitted zero segments and zero commits;
- zero duplicate commit rejections were needed in the normal corpus run.

Whisper removed 36 of sherpa's 93 errors, a 38.7% reduction. It materially
improved ordinary prose, cybersecurity terms, paragraph structure, casual
speech, fast speech, pauses, and punctuation. Proper names remain weak. The
Renée / Émet / São Paulo fixture remained especially poor.

WER over-penalizes several useful formatting changes: Whisper emitted `443`,
`27`, `12.5%`, `2026`, `192.168.1.1`, `10.0.0.42/24`, `DNS`, and `DHCP` where
the fixture references spell tokens out. Those cases require semantic scoring
before any production acceptance threshold is set.

## Punctuation and terminology

The references contain 40 punctuation marks. Sherpa emitted none; Whisper and
the hybrid committed text emitted 46. Whisper correctly punctuated both
dedicated punctuation fixtures and reconstructed sentence boundaries in the
paragraph fixture. No deterministic punctuation rewriter was added.

Segment joins currently use one plain space. The full balanced corpus produced
one segment per speech fixture, while Responsive's premature split confirms
that adjacent-segment punctuation and spacing need live-speech review.

The terminology observer found `Redline` and `Axiom` instead of `REDLINE` and
`AXIOM`. No brittle replacement or production Terminology Engine integration
was added.

## Resources and lifecycle

Measured on a Gigabyte Z590 UD AC desktop with an Intel i9-11900K, 16 logical
processors, and 32 GiB RAM:

- sherpa load: 1,138 ms;
- Whisper load: 539 ms;
- both ready: 239.1 MiB working set;
- peak full-corpus working set: 435.1 MiB;
- completed working set: 250.8 MiB;
- streaming work: 5,662 ms wall / 48,180 ms process CPU, approximately 53.2%
  of total host CPU capacity while processing faster than real time;
- finalization work: 114,265 ms wall / 806,458 ms process CPU, approximately
  44.1% of total host CPU capacity during the serialized benchmark.

Lazy Whisper loading reduced pre-audio memory from about 239 MiB to 91.6 MiB,
but added a 415 ms first-endpoint load and still peaked at 430.7 MiB. The
simplest active-session lifecycle is to keep both engines resident. An idle
application could delay the Whisper load until dictation starts, but unloading
and reloading it per phrase is unjustified.

Required sherpa model files total 43.11 MiB. Its shared runtime DLLs total
about 21.71 MiB; the probe executable is 3.25 MiB. Production use would add
roughly 64.8 MiB beyond REDLINE's existing Whisper model, before installer
compression, and would require hash-pinned offline DLL packaging and license
review. Exact model hashes and locations are in
`probes/dictation-2/README.md`.

## Long and rapid sessions

Realistically replayed balanced sessions used repeated 12.3-second technical
paragraph audio plus three seconds of silence per phrase:

| Audio | Segments | Median final | p95 | Worst | Max queue | Ready / peak / completed RAM |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 2:03 | 8 | 5,025 ms | 6,616 ms | 6,616 ms | 0 ms | 238.8 / 440.7 / 248.6 MiB |
| 5:07 | 20 | 4,956 ms | 5,075 ms | 5,136 ms | 0 ms | 238.7 / 453.2 / 251.5 MiB |
| 10:13 | 40 | 6,665 ms | 8,699 ms | 11,249 ms | 0 ms | 239.4 / 472.8 / 250.4 MiB |

No duplicate or lost segment was observed, and completed memory returned to
about 250 MiB. Peak memory rose about 32 MiB between the two- and ten-minute
runs. The ten-minute run showed substantial latency drift and made the desktop
noticeably sluggish; responsiveness is not yet acceptable evidence for a
school laptop.

A separate 20-phrase rapid test used the short sentence fixture. Five segments
queued behind the serialized Whisper worker, with 1,268 ms maximum queue delay.
Endpoint-to-final was 5,409 ms median, 7,667 ms p95, and 7,668 ms worst. Zero
duplicate commits occurred. This is the clearest evidence that rapid short
phrases can outpace finalization even when long-phrase cadence does not.

## State and editor safety

The deterministic Tiptap/ProseMirror prototype passes:

- ephemeral partial updates and cancellation;
- explicit segment identity and one-time final commits;
- unrelated edits before the mapped target;
- cursor and selection movement without target theft;
- one-step undo and redo for the final insertion;
- refusal when the original target is touched;
- wrong-document/session refusal;
- user-edited prior text remaining unchanged;
- pause/resume without stale partials;
- microphone-failure cleanup in state;
- document close isolation.

The WebView2 live probe additionally closes tracks after every bounded capture
and on AudioWorklet setup failure. It passes PCM to the hybrid executable over
local stdin only. No audio file, network request, new production command, or
production permission is created.

## Live microphone and laptop status

**PENDING OWNER-RUN CAPTURE.** The packaged WebView2 probe is built and exposes
three fixed scripts plus a 20-cycle capture/stop test. This automation session
cannot act on a native microphone permission prompt or supply real speech.

The current host is a desktop (`PCSystemType=1`, chassis type 3), not a laptop.
Therefore laptop CPU, fan/thermal behavior, responsiveness, and battery impact
are **NOT TESTED**. No laptop suitability claim may be made from desktop data.

## Current checkpoint status

**CONDITIONAL / AWAITING LAPTOP LIVE-MIC GATE.** This is not a Dictation 2.0
pass. The real laptop microphone gate and 20-cycle live stability gate are
**NOT YET RUN**.

The architecture is technically coherent and its accuracy gain is material,
but a production integration is not yet justified. Known blockers are:

1. real WebView2 microphone recognition across the required speaking cases;
2. 20 consecutive live open/capture/close cycles;
3. laptop endpoint-to-final latency, responsiveness, thermal/fan observation,
   and memory;
4. the 10-minute latency drift;
5. rapid-phrase queue delay;
6. real adjacent-segment punctuation/join behavior;
7. an actual concurrent capture-plus-finalizer implementation test rather than
   only deterministic queue scheduling;
8. semantic accuracy scoring for formatted numbers, addresses, and acronyms.

Do not begin production Dictation 2.0 integration from this state.

## Refactor observations

- A production streaming session needs one explicit state owner outside the
  existing `App.tsx` coordination block.
- The mapped target plugin and current conservative insertion transaction are
  reusable; replacing them would add risk without value.
- Native command organization should be split from `src-tauri/src/lib.rs` only
  when an approved production streaming command actually touches it.
- No generic ASR provider framework, event bus, worker pool, or transcript
  repository is justified by this probe.
