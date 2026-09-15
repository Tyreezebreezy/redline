use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    process::{Command, Stdio},
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CaptureInput {
    slot: String,
    sample_rate: u32,
    pcm: Vec<i16>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HybridInput<'a> {
    slot: &'a str,
    expected: &'a str,
    sample_rate: u32,
    pcm: &'a [i16],
}

fn expected_text(slot: &str) -> Option<&'static str> {
    match slot {
        "short" => Some("I can''t finish the assignment today, but I''ll submit it tomorrow."),
        "paragraph" => Some("When I paused to think, I corrected the first phrase and then continued speaking quickly. The second sentence should still have clear punctuation."),
        "terminology" => Some("YouTube, GitHub, LinkedIn Learning, Facebook Marketplace, PowerShell, ChatGPT, REDLINE, AXIOM, and ICARUS are part of my workflow."),
        _ => None,
    }
}

#[tauri::command]
fn analyze_live_capture(input: CaptureInput) -> Result<String, String> {
    let expected = expected_text(&input.slot).ok_or("unknown live-capture slot")?;
    if !(8_000..=48_000).contains(&input.sample_rate)
        || input.pcm.is_empty()
        || input.pcm.len() > 20 * input.sample_rate as usize
    {
        return Err("capture exceeds the bounded probe limits".into());
    }

    let repository = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..");
    let probe = repository.join("probes/dictation-2/target/release/redline-dictation-2-probe.exe");
    let sherpa = repository.join(
        "src-tauri/target/redline-1.0-research/model/sherpa-onnx-streaming-zipformer-en-20M-2023-02-17",
    );
    let whisper = repository.join("src-tauri/resources/models/ggml-base.en.bin");
    if !probe.is_file() || !sherpa.is_dir() || !whisper.is_file() {
        return Err(
            "build the dictation probe and place the documented models before live capture".into(),
        );
    }

    let mut child = Command::new(probe)
        .arg("hybrid-stdin")
        .arg(sherpa)
        .arg(whisper)
        .arg("balanced")
        .current_dir(repository)
        .env("REDLINE_PROBE_APPEND_SILENCE_MS", "3000")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;
    serde_json::to_writer(
        child.stdin.take().ok_or("probe stdin unavailable")?,
        &HybridInput {
            slot: &input.slot,
            expected,
            sample_rate: input.sample_rate,
            pcm: &input.pcm,
        },
    )
    .map_err(|error| error.to_string())?;
    let output = child
        .wait_with_output()
        .map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }
    String::from_utf8(output.stdout).map_err(|error| error.to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![analyze_live_capture])
        .run(tauri::generate_context!())
        .expect("failed to run REDLINE WebView2 capture probe");
}
