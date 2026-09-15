# Dictation 2.0 hybrid probe

Development-only REDLINE research harness. Production dictation is unchanged.

The hybrid path feeds 100 ms PCM chunks to sherpa-onnx for ephemeral partials
and endpoint detection, then runs Whisper once for each completed bounded
segment. Only the Whisper result (or non-empty sherpa fallback) becomes one
simulated commit event. Explicit segment IDs prevent duplicate commits.

## Pinned inputs

- `sherpa-onnx 1.13.8`, shared Windows runtime
- `whisper-rs 0.16.0`
- `ggml-base.en.bin`, 147,964,211 bytes, SHA-256
  `A03779C86DF3323075F5E796CB2CE5029F00EC8869EEE3FDFB897AFE36C6D002`
- `sherpa-onnx-streaming-zipformer-en-20M-2023-02-17`
  - `encoder-epoch-99-avg-1.int8.onnx`:
    `3810755CE7C3AB26B42A8BCF39D191308FA27FB0F53358823BA46141D03B7EB3`
  - `decoder-epoch-99-avg-1.onnx`:
    `45A7F940ECFB53D89FA270AD11B88B961E53A317203EB24B1C8E95ED208B0F30`
  - `joiner-epoch-99-avg-1.int8.onnx`:
    `E085D73B593CF9B0707F370DBD656D58327D3FE36D80D849202EF81DF02CB01E`
  - `tokens.txt`:
    `49E3C2646595FD907228B3C6787069658F67B17377C60AEB8619C4551B2316FB`

Expected local locations from the repository root:

```text
src-tauri/resources/models/ggml-base.en.bin
src-tauri/target/redline-1.0-research/model/sherpa-onnx-streaming-zipformer-en-20M-2023-02-17/
```

The official model is published with the sherpa-onnx 1.13.8 examples/releases.
Keep model binaries and generated reports outside Git. Verify every file hash
before use. The sherpa Rust build helper acquires its native shared runtime at
build time; a production integration would require a separately reviewed,
hash-pinned offline DLL packaging path.

## Build and run

```powershell
cargo build --release --manifest-path probes/dictation-2/Cargo.toml

probes/dictation-2/target/release/redline-dictation-2-probe.exe hybrid `
  src-tauri/target/redline-1.0-research/model/sherpa-onnx-streaming-zipformer-en-20M-2023-02-17 `
  src-tauri/resources/models/ggml-base.en.bin `
  benchmarks/dictation-corpus.json `
  balanced
```

Endpoint profiles are `responsive`, `balanced`, and `patient`. Optional probe
environment variables are:

- `REDLINE_PROBE_FIXTURE`: comma-separated fixture IDs
- `REDLINE_PROBE_REPEAT`: repeat count, bounded to 200 for hybrid runs
- `REDLINE_PROBE_APPEND_SILENCE_MS`: simulated post-phrase silence, 0-10,000
- `REDLINE_PROBE_LAZY_WHISPER=1`: defer Whisper loading to the first endpoint

`hybrid-stdin` accepts one bounded JSON PCM object on standard input. It exists
only for the local WebView2 microphone probe and never writes audio to disk.

## Live WebView2 probe

The existing probe shell in `probes/webview2-capture/` captures the actual
system microphone through the same WebView2 path as REDLINE. It exposes three
fixed scripts, a 20-cycle capture/stop test, and one bounded probe-only Tauri
command. PCM is mono, held in memory, capped at 20 seconds, passed to the hybrid
process over stdin, cleared afterward, and never persisted or transmitted.

```powershell
cargo build --release --manifest-path probes/webview2-capture/src-tauri/Cargo.toml
probes/webview2-capture/src-tauri/target/release/redline-webview2-capture-probe.exe
```

The user must make the WebView2 microphone permission decision and speak the
displayed text. Run all three scripts, then the 20-cycle test while speaking.
Record the UI result manually; the probe intentionally does not persist speech
or transcripts.

## Checks

```powershell
cargo test --release --manifest-path probes/dictation-2/Cargo.toml
cargo clippy --release --manifest-path probes/dictation-2/Cargo.toml -- -D warnings
node probes/dictation-live.mts
cargo clippy --manifest-path probes/webview2-capture/src-tauri/Cargo.toml -- -D warnings
```
