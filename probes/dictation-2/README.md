# Dictation 2.0 ASR probe

Development-only comparison harness for REDLINE's existing whisper.cpp path and
the official sherpa-onnx streaming Zipformer runtime. It does not alter or ship
with production dictation.

Inputs are REDLINE's existing 26 recorded benchmark WAV files. Model paths are
explicit command-line arguments so large binaries remain outside Git.

Run the sherpa or whisper subcommand with a model path, the corpus JSON, and the
audio directory. The sherpa probe feeds 100 ms chunks and records partial-result
churn, first partial latency, final-availability proxies, and WER. The Whisper probe
re-decodes cumulative audio every two seconds to measure the cost and stability
of the smallest near-live approach available without changing REDLINE's current
engine.
