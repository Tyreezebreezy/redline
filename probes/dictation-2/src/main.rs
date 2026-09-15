use serde::{Deserialize, Serialize};
use sherpa_onnx::{OnlineRecognizer, OnlineRecognizerConfig, OnlineStream};
use std::{
    collections::HashSet,
    env,
    error::Error,
    fs,
    io::Read,
    mem::size_of,
    path::{Path, PathBuf},
    time::Instant,
};
use whisper_rs::{
    FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters, WhisperState,
};

type Result<T> = std::result::Result<T, Box<dyn Error>>;
const RATE: u32 = 16_000;
const MAX_SEGMENT_SECONDS: usize = 30;

#[cfg(windows)]
use windows_sys::Win32::{
    Foundation::FILETIME,
    System::{
        ProcessStatus::{K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS},
        Threading::{GetCurrentProcess, GetProcessTimes},
    },
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Corpus {
    schema_version: u32,
    fixtures: Vec<Fixture>,
}

#[derive(Deserialize)]
struct Fixture {
    id: String,
    transcript: String,
    kind: String,
    file: String,
    #[serde(skip)]
    samples: Option<Vec<f32>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LiveCaptureInput {
    slot: String,
    expected: String,
    sample_rate: u32,
    pcm: Vec<i16>,
}

#[derive(Serialize)]
struct Measurement {
    id: String,
    kind: String,
    expected: String,
    transcript: String,
    audio_ms: u64,
    first_partial_audio_ms: Option<u64>,
    first_partial_wall_ms: Option<u64>,
    estimated_first_visible_ms: Option<u64>,
    processing_ms: u64,
    real_time_factor: f64,
    partial_changes: usize,
    partials: Vec<String>,
    word_errors: usize,
    reference_words: usize,
    wer: f64,
}

#[derive(Serialize)]
struct Report {
    engine: String,
    runtime_version: String,
    model: String,
    model_load_ms: u64,
    corpus_schema_version: u32,
    aggregate_wer: f64,
    total_word_errors: usize,
    total_reference_words: usize,
    fixtures: Vec<Measurement>,
}

#[derive(Clone, Copy, Serialize)]
struct EndpointConfig {
    name: &'static str,
    rule1_trailing_silence: f32,
    rule2_trailing_silence: f32,
    rule3_utterance_length: f32,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize)]
struct EditCounts {
    substitutions: usize,
    deletions: usize,
    insertions: usize,
}

impl EditCounts {
    fn total(self) -> usize {
        self.substitutions + self.deletions + self.insertions
    }
}

#[derive(Clone, Copy, Default, Serialize)]
struct ProcessSnapshot {
    cpu_ms: u64,
    peak_working_set_bytes: u64,
    working_set_bytes: u64,
}

#[derive(Serialize)]
struct HybridSegment {
    id: u64,
    reason: String,
    duration_ms: u64,
    endpoint_audio_ms: u64,
    trailing_silence_ms: u64,
    sherpa_text: String,
    whisper_text: String,
    committed_text: String,
    whisper_finalization_ms: u64,
    whisper_cpu_ms: u64,
    queue_delay_ms: u64,
    endpoint_to_final_ms: u64,
    final_available_audio_clock_ms: u64,
    simulated_commit_us: u128,
}

#[derive(Serialize)]
struct HybridMeasurement {
    id: String,
    kind: String,
    expected: String,
    audio_ms: u64,
    first_partial_audio_ms: Option<u64>,
    first_partial_processing_ms: Option<u64>,
    estimated_first_visible_ms: Option<u64>,
    partial_changes: usize,
    segments: Vec<HybridSegment>,
    sherpa_text: String,
    whisper_text: String,
    committed_text: String,
    sherpa_edits: EditCounts,
    whisper_edits: EditCounts,
    committed_edits: EditCounts,
    sherpa_wer: f64,
    whisper_wer: f64,
    committed_wer: f64,
    reference_punctuation: usize,
    sherpa_punctuation: usize,
    whisper_punctuation: usize,
    committed_punctuation: usize,
    duplicate_commit_rejections: usize,
    terminology_casing_misses: Vec<String>,
}

#[derive(Serialize)]
struct HybridReport {
    engine: String,
    sherpa_runtime: String,
    whisper_runtime: String,
    sherpa_model: String,
    whisper_model: String,
    endpoint: EndpointConfig,
    lazy_whisper: bool,
    appended_silence_ms_per_repeat: u64,
    sherpa_load_ms: u64,
    whisper_load_ms: u64,
    ready_before_audio: ProcessSnapshot,
    completed: ProcessSnapshot,
    streaming_wall_ms: u64,
    streaming_cpu_ms: u64,
    finalization_wall_ms: u64,
    finalization_cpu_ms: u64,
    endpoint_to_final_median_ms: u64,
    endpoint_to_final_p90_ms: u64,
    endpoint_to_final_p95_ms: u64,
    endpoint_to_final_worst_ms: u64,
    total_reference_words: usize,
    sherpa_word_errors: usize,
    whisper_word_errors: usize,
    committed_word_errors: usize,
    sherpa_wer: f64,
    whisper_wer: f64,
    committed_wer: f64,
    fixtures: Vec<HybridMeasurement>,
}

#[derive(Default)]
struct CommitLog {
    ids: HashSet<u64>,
    text: Vec<String>,
    duplicate_rejections: usize,
}

impl CommitLog {
    fn commit(&mut self, id: u64, text: &str) -> bool {
        if text.is_empty() || !self.ids.insert(id) {
            self.duplicate_rejections += usize::from(!text.is_empty());
            return false;
        }
        self.text.push(text.to_owned());
        true
    }
}

fn main() -> Result<()> {
    let args: Vec<_> = env::args().collect();
    if args.get(1).map(String::as_str) == Some("hybrid-stdin") {
        if !matches!(args.len(), 4 | 5) {
            return Err("usage: probe hybrid-stdin <sherpa-model-dir> <whisper-model> [responsive|balanced|patient]".into());
        }
        let mut input = String::new();
        std::io::stdin().read_to_string(&mut input)?;
        let capture: LiveCaptureInput = serde_json::from_str(&input)?;
        if !matches!(capture.slot.as_str(), "short" | "paragraph" | "terminology")
            || capture.expected.trim().is_empty()
            || !(8_000..=48_000).contains(&capture.sample_rate)
            || capture.pcm.is_empty()
            || capture.pcm.len() > 90 * capture.sample_rate as usize
        {
            return Err("live capture exceeds the bounded probe contract".into());
        }
        let samples = capture
            .pcm
            .iter()
            .map(|sample| *sample as f32 / i16::MAX as f32)
            .collect::<Vec<_>>();
        let corpus = Corpus {
            schema_version: 1,
            fixtures: vec![Fixture {
                id: format!("live-{}", capture.slot),
                transcript: capture.expected,
                kind: "speech".into(),
                file: String::new(),
                samples: Some(resample(&samples, capture.sample_rate)),
            }],
        };
        let report = run_hybrid(
            Path::new(&args[2]),
            Path::new(&args[3]),
            Path::new("."),
            corpus,
            endpoint_config(args.get(4).map(String::as_str).unwrap_or("balanced"))?,
            false,
        )?;
        println!("{}", serde_json::to_string_pretty(&report)?);
        return Ok(());
    }
    if args.get(1).map(String::as_str) == Some("hybrid") {
        if !matches!(args.len(), 5 | 6) {
            return Err("usage: probe hybrid <sherpa-model-dir> <whisper-model> <corpus.json> [responsive|balanced|patient]".into());
        }
        let corpus_path = PathBuf::from(&args[4]);
        let corpus = load_corpus(&corpus_path)?;
        let root = corpus_path.parent().ok_or("corpus path has no parent")?;
        let endpoint = endpoint_config(args.get(5).map(String::as_str).unwrap_or("balanced"))?;
        let report = run_hybrid(
            Path::new(&args[2]),
            Path::new(&args[3]),
            root,
            corpus,
            endpoint,
            env::var("REDLINE_PROBE_LAZY_WHISPER").as_deref() == Ok("1"),
        )?;
        println!("{}", serde_json::to_string_pretty(&report)?);
        return Ok(());
    }
    if args.len() != 4 || !matches!(args.get(1).map(String::as_str), Some("sherpa" | "whisper")) {
        return Err("usage: probe <sherpa|whisper> <model-path> <corpus.json>".into());
    }
    let model = PathBuf::from(&args[2]);
    let corpus_path = PathBuf::from(&args[3]);
    let corpus = load_corpus(&corpus_path)?;
    let root = corpus_path.parent().ok_or("corpus path has no parent")?;
    let report = if args[1] == "sherpa" {
        run_sherpa(&model, root, corpus)?
    } else {
        run_whisper(&model, root, corpus)?
    };
    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}

fn load_corpus(path: &Path) -> Result<Corpus> {
    let mut corpus: Corpus = serde_json::from_str(&fs::read_to_string(path)?)?;
    if let Ok(id) = env::var("REDLINE_PROBE_FIXTURE") {
        let ids: HashSet<_> = id.split(',').collect();
        corpus
            .fixtures
            .retain(|fixture| ids.contains(fixture.id.as_str()));
        if corpus.fixtures.is_empty() {
            return Err(format!("fixture not found: {id}").into());
        }
    }
    Ok(corpus)
}

fn endpoint_config(name: &str) -> Result<EndpointConfig> {
    Ok(match name {
        "responsive" => EndpointConfig {
            name: "responsive",
            rule1_trailing_silence: 2.0,
            rule2_trailing_silence: 0.8,
            rule3_utterance_length: 15.0,
        },
        "balanced" => EndpointConfig {
            name: "balanced",
            rule1_trailing_silence: 2.4,
            rule2_trailing_silence: 1.2,
            rule3_utterance_length: 20.0,
        },
        "patient" => EndpointConfig {
            name: "patient",
            rule1_trailing_silence: 3.0,
            rule2_trailing_silence: 1.8,
            rule3_utterance_length: 30.0,
        },
        _ => return Err(format!("unknown endpoint profile: {name}").into()),
    })
}

fn sherpa_config(model: &Path, endpoint: EndpointConfig) -> OnlineRecognizerConfig {
    let mut config = OnlineRecognizerConfig::default();
    let file = |name: &str| model.join(name).display().to_string();
    config.model_config.transducer.encoder = Some(file("encoder-epoch-99-avg-1.int8.onnx"));
    config.model_config.transducer.decoder = Some(file("decoder-epoch-99-avg-1.onnx"));
    config.model_config.transducer.joiner = Some(file("joiner-epoch-99-avg-1.int8.onnx"));
    config.model_config.tokens = Some(file("tokens.txt"));
    config.model_config.num_threads = threads(4);
    config.decoding_method = Some("greedy_search".into());
    config.enable_endpoint = true;
    config.rule1_min_trailing_silence = endpoint.rule1_trailing_silence;
    config.rule2_min_trailing_silence = endpoint.rule2_trailing_silence;
    config.rule3_min_utterance_length = endpoint.rule3_utterance_length;
    config
}

fn run_sherpa(model: &Path, root: &Path, corpus: Corpus) -> Result<Report> {
    let timer = Instant::now();
    let config = sherpa_config(model, endpoint_config("balanced")?);
    let recognizer =
        OnlineRecognizer::create(&config).ok_or("sherpa recognizer creation failed")?;
    let load_ms = timer.elapsed().as_millis() as u64;
    let mut rows = Vec::new();
    for mut fixture in corpus.fixtures {
        let base_samples = read_wav(&root.join(&fixture.file))?;
        let repeat = env::var("REDLINE_PROBE_REPEAT")
            .ok()
            .and_then(|value| value.parse::<usize>().ok())
            .unwrap_or(1)
            .clamp(1, 100);
        let samples = base_samples.repeat(repeat);
        if repeat > 1 {
            fixture.transcript = vec![fixture.transcript.clone(); repeat].join(" ");
        }
        let audio_ms = samples.len() as u64 * 1_000 / RATE as u64;
        let stream = recognizer.create_stream();
        let started = Instant::now();
        let mut partials = Vec::new();
        let mut committed = Vec::new();
        let mut first_audio = None;
        let mut first_wall = None;
        for (index, chunk) in samples.chunks(1_600).enumerate() {
            stream.accept_waveform(RATE as i32, chunk);
            decode_ready(&recognizer, &stream);
            let text = sherpa_text(&recognizer, &stream);
            if !text.is_empty() && partials.last() != Some(&text) {
                if first_audio.is_none() {
                    first_audio = Some(
                        (((index + 1) * 1_600).min(samples.len()) as u64 * 1_000) / RATE as u64,
                    );
                    first_wall = Some(started.elapsed().as_millis() as u64);
                }
                partials.push(text);
            }
            if recognizer.is_endpoint(&stream) {
                let text = sherpa_text(&recognizer, &stream);
                if !text.is_empty() {
                    committed.push(text);
                }
                recognizer.reset(&stream);
            }
        }
        stream.input_finished();
        decode_ready(&recognizer, &stream);
        let tail = sherpa_text(&recognizer, &stream);
        if !tail.is_empty() {
            if partials.last() != Some(&tail) {
                partials.push(tail.clone());
            }
            committed.push(tail);
        }
        let final_text = committed.join(" ");
        let elapsed = started.elapsed().as_millis() as u64;
        rows.push(measure(
            fixture,
            final_text,
            audio_ms,
            first_audio,
            first_wall,
            elapsed,
            partials,
        ));
    }
    Ok(report(
        "sherpa-onnx streaming Zipformer",
        "1.13.8",
        model,
        load_ms,
        corpus.schema_version,
        rows,
    ))
}

fn run_hybrid(
    sherpa_model: &Path,
    whisper_model: &Path,
    root: &Path,
    corpus: Corpus,
    endpoint: EndpointConfig,
    lazy_whisper: bool,
) -> Result<HybridReport> {
    let load_started = Instant::now();
    let recognizer = OnlineRecognizer::create(&sherpa_config(sherpa_model, endpoint))
        .ok_or("sherpa recognizer creation failed")?;
    let sherpa_load_ms = load_started.elapsed().as_millis() as u64;

    let mut whisper_load_ms = 0;
    let mut whisper = if lazy_whisper {
        None
    } else {
        let started = Instant::now();
        let context = WhisperContext::new_with_params(
            whisper_model.to_string_lossy().as_ref(),
            WhisperContextParameters::default(),
        )?;
        whisper_load_ms = started.elapsed().as_millis() as u64;
        Some(context)
    };
    let ready_before_audio = process_snapshot();

    let mut rows = Vec::new();
    let mut all_finalization_ms = Vec::new();
    let mut streaming_wall_ms = 0;
    let mut streaming_cpu_ms = 0;
    let mut finalization_wall_ms = 0;
    let mut finalization_cpu_ms = 0;
    let appended_silence_ms = env::var("REDLINE_PROBE_APPEND_SILENCE_MS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(3_000)
        .min(10_000);

    for mut fixture in corpus.fixtures {
        let base_samples = fixture
            .samples
            .take()
            .map(Ok)
            .unwrap_or_else(|| read_wav(&root.join(&fixture.file)))?;
        let repeat = env::var("REDLINE_PROBE_REPEAT")
            .ok()
            .and_then(|value| value.parse::<usize>().ok())
            .unwrap_or(1)
            .clamp(1, 200);
        let silence = vec![0.0; appended_silence_ms as usize * RATE as usize / 1_000];
        let mut samples = Vec::with_capacity((base_samples.len() + silence.len()) * repeat);
        for _ in 0..repeat {
            samples.extend_from_slice(&base_samples);
            samples.extend_from_slice(&silence);
        }
        if repeat > 1 {
            fixture.transcript = vec![fixture.transcript.clone(); repeat].join(" ");
        }
        let audio_ms = samples.len() as u64 * 1_000 / RATE as u64;
        let stream = recognizer.create_stream();
        let mut partials = Vec::new();
        let mut first_partial_audio_ms = None;
        let mut first_partial_processing_ms = None;
        let mut segment_samples = Vec::new();
        let mut segments = Vec::new();
        let mut commits = CommitLog::default();
        let mut next_segment_id = 1;
        let mut fed_samples = 0;
        let mut whisper_worker_available_ms = 0;
        let fixture_started = Instant::now();

        for chunk in samples.chunks(1_600) {
            segment_samples.extend_from_slice(chunk);
            fed_samples += chunk.len();
            let cpu_before = process_snapshot().cpu_ms;
            let started = Instant::now();
            stream.accept_waveform(RATE as i32, chunk);
            decode_ready(&recognizer, &stream);
            streaming_wall_ms += started.elapsed().as_millis() as u64;
            streaming_cpu_ms += process_snapshot().cpu_ms.saturating_sub(cpu_before);

            let current = sherpa_text(&recognizer, &stream);
            if !current.is_empty() && partials.last() != Some(&current) {
                first_partial_audio_ms.get_or_insert(fed_samples as u64 * 1_000 / RATE as u64);
                first_partial_processing_ms
                    .get_or_insert(fixture_started.elapsed().as_millis() as u64);
                partials.push(current.clone());
            }
            let safety_cap = segment_samples.len() >= MAX_SEGMENT_SECONDS * RATE as usize;
            if recognizer.is_endpoint(&stream) || safety_cap {
                if !current.is_empty() {
                    let reason = if safety_cap { "safety-cap" } else { "sherpa" };
                    let mut segment = finalize_hybrid_segment(
                        next_segment_id,
                        reason,
                        fed_samples as u64 * 1_000 / RATE as u64,
                        &current,
                        &segment_samples,
                        whisper_model,
                        &mut whisper,
                        &mut whisper_load_ms,
                        &mut commits,
                    )?;
                    schedule_segment(&mut segment, &mut whisper_worker_available_ms);
                    finalization_wall_ms += segment.whisper_finalization_ms;
                    finalization_cpu_ms += segment.whisper_cpu_ms;
                    all_finalization_ms.push(segment.endpoint_to_final_ms);
                    segments.push(segment);
                    next_segment_id += 1;
                }
                recognizer.reset(&stream);
                segment_samples.clear();
            }
        }

        stream.input_finished();
        let cpu_before = process_snapshot().cpu_ms;
        let started = Instant::now();
        decode_ready(&recognizer, &stream);
        streaming_wall_ms += started.elapsed().as_millis() as u64;
        streaming_cpu_ms += process_snapshot().cpu_ms.saturating_sub(cpu_before);
        let tail = sherpa_text(&recognizer, &stream);
        if !tail.is_empty() && !segment_samples.is_empty() {
            if partials.last() != Some(&tail) {
                partials.push(tail.clone());
            }
            let mut segment = finalize_hybrid_segment(
                next_segment_id,
                "input-finished",
                audio_ms,
                &tail,
                &segment_samples,
                whisper_model,
                &mut whisper,
                &mut whisper_load_ms,
                &mut commits,
            )?;
            schedule_segment(&mut segment, &mut whisper_worker_available_ms);
            finalization_wall_ms += segment.whisper_finalization_ms;
            finalization_cpu_ms += segment.whisper_cpu_ms;
            all_finalization_ms.push(segment.endpoint_to_final_ms);
            segments.push(segment);
        }

        let sherpa_text = segments
            .iter()
            .map(|segment| segment.sherpa_text.as_str())
            .collect::<Vec<_>>()
            .join(" ");
        let whisper_text = segments
            .iter()
            .map(|segment| segment.whisper_text.as_str())
            .collect::<Vec<_>>()
            .join(" ");
        let committed_text = commits.text.join(" ");
        let expected_words = words(&fixture.transcript);
        let sherpa_edits = edit_counts(&expected_words, &words(&sherpa_text));
        let whisper_edits = edit_counts(&expected_words, &words(&whisper_text));
        let committed_edits = edit_counts(&expected_words, &words(&committed_text));
        let reference_words = expected_words.len();
        let reference_punctuation = punctuation_count(&fixture.transcript);
        let sherpa_punctuation = punctuation_count(&sherpa_text);
        let whisper_punctuation = punctuation_count(&whisper_text);
        let committed_punctuation = punctuation_count(&committed_text);
        let terminology_casing_misses =
            terminology_casing_misses(&fixture.transcript, &committed_text);
        rows.push(HybridMeasurement {
            id: fixture.id,
            kind: fixture.kind,
            expected: fixture.transcript.clone(),
            audio_ms,
            first_partial_audio_ms,
            first_partial_processing_ms,
            estimated_first_visible_ms: first_partial_audio_ms
                .zip(first_partial_processing_ms)
                .map(|(audio, processing)| audio + processing),
            partial_changes: partials.len().saturating_sub(1),
            segments,
            sherpa_text,
            whisper_text,
            committed_text: committed_text.clone(),
            sherpa_edits,
            whisper_edits,
            committed_edits,
            sherpa_wer: wer(sherpa_edits, reference_words),
            whisper_wer: wer(whisper_edits, reference_words),
            committed_wer: wer(committed_edits, reference_words),
            reference_punctuation,
            sherpa_punctuation,
            whisper_punctuation,
            committed_punctuation,
            duplicate_commit_rejections: commits.duplicate_rejections,
            terminology_casing_misses,
        });
    }

    let total_reference_words = rows
        .iter()
        .map(|row| words(&row.expected).len())
        .sum::<usize>();
    let sherpa_word_errors = rows.iter().map(|row| row.sherpa_edits.total()).sum();
    let whisper_word_errors = rows.iter().map(|row| row.whisper_edits.total()).sum();
    let committed_word_errors = rows.iter().map(|row| row.committed_edits.total()).sum();
    Ok(HybridReport {
        engine: "sherpa partials/endpoints + one Whisper finalization per segment".into(),
        sherpa_runtime: "sherpa-onnx 1.13.8".into(),
        whisper_runtime: "whisper-rs 0.16.0".into(),
        sherpa_model: sherpa_model.display().to_string(),
        whisper_model: whisper_model.display().to_string(),
        endpoint,
        lazy_whisper,
        appended_silence_ms_per_repeat: appended_silence_ms,
        sherpa_load_ms,
        whisper_load_ms,
        ready_before_audio,
        completed: process_snapshot(),
        streaming_wall_ms,
        streaming_cpu_ms,
        finalization_wall_ms,
        finalization_cpu_ms,
        endpoint_to_final_median_ms: percentile(&all_finalization_ms, 0.50),
        endpoint_to_final_p90_ms: percentile(&all_finalization_ms, 0.90),
        endpoint_to_final_p95_ms: percentile(&all_finalization_ms, 0.95),
        endpoint_to_final_worst_ms: all_finalization_ms.into_iter().max().unwrap_or(0),
        total_reference_words,
        sherpa_word_errors,
        whisper_word_errors,
        committed_word_errors,
        sherpa_wer: ratio(sherpa_word_errors, total_reference_words),
        whisper_wer: ratio(whisper_word_errors, total_reference_words),
        committed_wer: ratio(committed_word_errors, total_reference_words),
        fixtures: rows,
    })
}

#[allow(clippy::too_many_arguments)]
fn finalize_hybrid_segment(
    id: u64,
    reason: &str,
    endpoint_audio_ms: u64,
    sherpa_text: &str,
    samples: &[f32],
    whisper_model: &Path,
    whisper: &mut Option<WhisperContext>,
    whisper_load_ms: &mut u64,
    commits: &mut CommitLog,
) -> Result<HybridSegment> {
    let cpu_before = process_snapshot().cpu_ms;
    let started = Instant::now();
    if whisper.is_none() {
        let load_started = Instant::now();
        *whisper = Some(WhisperContext::new_with_params(
            whisper_model.to_string_lossy().as_ref(),
            WhisperContextParameters::default(),
        )?);
        *whisper_load_ms = load_started.elapsed().as_millis() as u64;
    }
    let mut state = whisper
        .as_ref()
        .ok_or("Whisper failed to load")?
        .create_state()?;
    let whisper_text = whisper_text(&mut state, samples)?;
    let finalization_ms = started.elapsed().as_millis() as u64;
    let whisper_cpu_ms = process_snapshot().cpu_ms.saturating_sub(cpu_before);
    let committed_text = if whisper_text.is_empty() {
        sherpa_text.trim().to_owned()
    } else {
        whisper_text.trim().to_owned()
    };
    let commit_started = Instant::now();
    commits.commit(id, &committed_text);
    let simulated_commit_us = commit_started.elapsed().as_micros();
    Ok(HybridSegment {
        id,
        reason: reason.into(),
        duration_ms: samples.len() as u64 * 1_000 / RATE as u64,
        endpoint_audio_ms,
        trailing_silence_ms: trailing_silence_ms(samples),
        sherpa_text: sherpa_text.into(),
        whisper_text,
        committed_text,
        whisper_finalization_ms: finalization_ms,
        whisper_cpu_ms,
        queue_delay_ms: 0,
        endpoint_to_final_ms: 0,
        final_available_audio_clock_ms: 0,
        simulated_commit_us,
    })
}

fn schedule_segment(segment: &mut HybridSegment, worker_available_ms: &mut u64) {
    let start = (*worker_available_ms).max(segment.endpoint_audio_ms);
    segment.queue_delay_ms = start.saturating_sub(segment.endpoint_audio_ms);
    segment.final_available_audio_clock_ms = start + segment.whisper_finalization_ms;
    segment.endpoint_to_final_ms =
        segment.final_available_audio_clock_ms - segment.endpoint_audio_ms;
    *worker_available_ms = segment.final_available_audio_clock_ms;
}

fn run_whisper(model: &Path, root: &Path, corpus: Corpus) -> Result<Report> {
    let timer = Instant::now();
    let context = WhisperContext::new_with_params(
        model.to_string_lossy().as_ref(),
        WhisperContextParameters::default(),
    )?;
    let load_ms = timer.elapsed().as_millis() as u64;
    let mut rows = Vec::new();
    for mut fixture in corpus.fixtures {
        let base_samples = read_wav(&root.join(&fixture.file))?;
        let repeat = env::var("REDLINE_PROBE_REPEAT")
            .ok()
            .and_then(|value| value.parse::<usize>().ok())
            .unwrap_or(1)
            .clamp(1, 100);
        let samples = base_samples.repeat(repeat);
        if repeat > 1 {
            fixture.transcript = vec![fixture.transcript.clone(); repeat].join(" ");
        }
        let audio_ms = samples.len() as u64 * 1_000 / RATE as u64;
        let started = Instant::now();
        let mut state = context.create_state()?;
        let mut partials = Vec::new();
        let mut first_audio = None;
        let mut first_wall = None;
        let mut end = 32_000.min(samples.len());
        loop {
            let text = whisper_text(&mut state, &samples[..end])?;
            if !text.is_empty() && partials.last() != Some(&text) {
                if first_audio.is_none() {
                    first_audio = Some(end as u64 * 1_000 / RATE as u64);
                    first_wall = Some(started.elapsed().as_millis() as u64);
                }
                partials.push(text);
            }
            if end == samples.len() {
                break;
            }
            end = (end + 32_000).min(samples.len());
        }
        let final_text = partials.last().cloned().unwrap_or_default();
        let elapsed = started.elapsed().as_millis() as u64;
        rows.push(measure(
            fixture,
            final_text,
            audio_ms,
            first_audio,
            first_wall,
            elapsed,
            partials,
        ));
    }
    Ok(report(
        "whisper.cpp cumulative 2s windows",
        "whisper-rs 0.16.0",
        model,
        load_ms,
        corpus.schema_version,
        rows,
    ))
}

fn decode_ready(recognizer: &OnlineRecognizer, stream: &OnlineStream) {
    while recognizer.is_ready(stream) {
        recognizer.decode(stream);
    }
}

fn sherpa_text(recognizer: &OnlineRecognizer, stream: &OnlineStream) -> String {
    recognizer
        .get_result(stream)
        .map(|r| r.text.trim().to_owned())
        .unwrap_or_default()
}

fn whisper_text(state: &mut WhisperState, samples: &[f32]) -> Result<String> {
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_language(Some("en"));
    params.set_n_threads(threads(8));
    params.set_no_context(true);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_special(false);
    params.set_print_timestamps(false);
    params.set_suppress_blank(true);
    params.set_translate(false);
    state.full(params, samples)?;
    let text = state
        .as_iter()
        .filter(|segment| segment.no_speech_probability() < 0.6)
        .map(|segment| segment.to_string())
        .collect::<String>()
        .trim()
        .to_owned();
    Ok(
        if matches!(text.as_str(), "[BLANK_AUDIO]" | "(silence)" | "[silence]") {
            String::new()
        } else {
            text
        },
    )
}

fn measure(
    fixture: Fixture,
    transcript: String,
    audio_ms: u64,
    first_audio: Option<u64>,
    first_wall: Option<u64>,
    processing_ms: u64,
    partials: Vec<String>,
) -> Measurement {
    let expected = words(&fixture.transcript);
    let actual = words(&transcript);
    let errors = distance(&expected, &actual);
    let count = expected.len();
    Measurement {
        id: fixture.id,
        kind: fixture.kind,
        expected: fixture.transcript,
        transcript,
        audio_ms,
        first_partial_audio_ms: first_audio,
        first_partial_wall_ms: first_wall,
        estimated_first_visible_ms: first_audio.zip(first_wall).map(|(a, w)| a + w),
        processing_ms,
        real_time_factor: if audio_ms == 0 {
            0.0
        } else {
            processing_ms as f64 / audio_ms as f64
        },
        partial_changes: partials.len().saturating_sub(1),
        partials,
        word_errors: errors,
        reference_words: count,
        wer: if count == 0 {
            if actual.is_empty() {
                0.0
            } else {
                1.0
            }
        } else {
            errors as f64 / count as f64
        },
    }
}

fn report(
    engine: &str,
    version: &str,
    model: &Path,
    load: u64,
    schema: u32,
    rows: Vec<Measurement>,
) -> Report {
    let errors = rows.iter().map(|r| r.word_errors).sum();
    let words = rows.iter().map(|r| r.reference_words).sum();
    Report {
        engine: engine.into(),
        runtime_version: version.into(),
        model: model.display().to_string(),
        model_load_ms: load,
        corpus_schema_version: schema,
        aggregate_wer: if words == 0 {
            0.0
        } else {
            errors as f64 / words as f64
        },
        total_word_errors: errors,
        total_reference_words: words,
        fixtures: rows,
    }
}

fn read_wav(path: &Path) -> Result<Vec<f32>> {
    let mut reader = hound::WavReader::open(path)?;
    let spec = reader.spec();
    let samples = match spec.sample_format {
        hound::SampleFormat::Float => reader
            .samples::<f32>()
            .collect::<std::result::Result<Vec<_>, _>>()?,
        hound::SampleFormat::Int if spec.bits_per_sample <= 16 => reader
            .samples::<i16>()
            .map(|s| s.map(|v| v as f32 / i16::MAX as f32))
            .collect::<std::result::Result<Vec<_>, _>>()?,
        hound::SampleFormat::Int => {
            let scale = (1_i64 << (spec.bits_per_sample - 1)) as f32;
            reader
                .samples::<i32>()
                .map(|s| s.map(|v| v as f32 / scale))
                .collect::<std::result::Result<Vec<_>, _>>()?
        }
    };
    let channels = spec.channels as usize;
    let mono: Vec<_> = samples
        .chunks(channels)
        .map(|frame| frame.iter().sum::<f32>() / channels as f32)
        .collect();
    Ok(resample(&mono, spec.sample_rate))
}

fn resample(input: &[f32], source_rate: u32) -> Vec<f32> {
    if input.is_empty() || source_rate == RATE {
        return input.to_vec();
    }
    let len = input.len() * RATE as usize / source_rate as usize;
    (0..len)
        .map(|i| {
            let at = i as f64 * source_rate as f64 / RATE as f64;
            let left = at.floor() as usize;
            let right = (left + 1).min(input.len() - 1);
            let fraction = (at - left as f64) as f32;
            input[left] * (1.0 - fraction) + input[right] * fraction
        })
        .collect()
}

fn words(text: &str) -> Vec<String> {
    text.split(|c: char| !c.is_alphanumeric() && c != '\'')
        .filter(|word| !word.is_empty())
        .map(str::to_lowercase)
        .collect()
}

fn wer(edits: EditCounts, reference_words: usize) -> f64 {
    if reference_words == 0 {
        f64::from(edits.total() > 0)
    } else {
        edits.total() as f64 / reference_words as f64
    }
}

fn ratio(numerator: usize, denominator: usize) -> f64 {
    if denominator == 0 {
        f64::from(numerator > 0)
    } else {
        numerator as f64 / denominator as f64
    }
}

fn edit_counts(expected: &[String], actual: &[String]) -> EditCounts {
    let mut costs = vec![vec![0; actual.len() + 1]; expected.len() + 1];
    for (row, cells) in costs.iter_mut().enumerate() {
        cells[0] = row;
    }
    for (column, cost) in costs[0].iter_mut().enumerate() {
        *cost = column;
    }
    for row in 1..=expected.len() {
        for column in 1..=actual.len() {
            costs[row][column] = if expected[row - 1] == actual[column - 1] {
                costs[row - 1][column - 1]
            } else {
                1 + costs[row - 1][column - 1]
                    .min(costs[row - 1][column])
                    .min(costs[row][column - 1])
            };
        }
    }
    let (mut row, mut column) = (expected.len(), actual.len());
    let mut edits = EditCounts::default();
    while row > 0 || column > 0 {
        if row > 0 && column > 0 && expected[row - 1] == actual[column - 1] {
            row -= 1;
            column -= 1;
        } else if row > 0 && column > 0 && costs[row][column] == costs[row - 1][column - 1] + 1 {
            edits.substitutions += 1;
            row -= 1;
            column -= 1;
        } else if row > 0 && costs[row][column] == costs[row - 1][column] + 1 {
            edits.deletions += 1;
            row -= 1;
        } else {
            edits.insertions += 1;
            column -= 1;
        }
    }
    edits
}

fn punctuation_count(text: &str) -> usize {
    text.chars()
        .filter(|character| ".,;:!?".contains(*character))
        .count()
}

fn trailing_silence_ms(samples: &[f32]) -> u64 {
    let trailing = samples
        .iter()
        .rev()
        .take_while(|sample| sample.abs() < 0.001)
        .count();
    trailing as u64 * 1_000 / RATE as u64
}

fn terminology_casing_misses(reference: &str, actual: &str) -> Vec<String> {
    const TERMS: &[&str] = &[
        "YouTube",
        "GitHub",
        "LinkedIn Learning",
        "Facebook Marketplace",
        "PowerShell",
        "ChatGPT",
        "REDLINE",
        "AXIOM",
        "ICARUS",
    ];
    let reference_lower = reference.to_lowercase();
    TERMS
        .iter()
        .filter(|term| reference_lower.contains(&term.to_lowercase()) && !actual.contains(**term))
        .map(|term| (*term).to_owned())
        .collect()
}

fn percentile(values: &[u64], percentile: f64) -> u64 {
    if values.is_empty() {
        return 0;
    }
    let mut sorted = values.to_vec();
    sorted.sort_unstable();
    let index = ((sorted.len() as f64 * percentile).ceil() as usize)
        .saturating_sub(1)
        .min(sorted.len() - 1);
    sorted[index]
}

#[cfg(windows)]
fn process_snapshot() -> ProcessSnapshot {
    unsafe {
        let process = GetCurrentProcess();
        let mut counters = PROCESS_MEMORY_COUNTERS {
            cb: size_of::<PROCESS_MEMORY_COUNTERS>() as u32,
            ..Default::default()
        };
        let _ = K32GetProcessMemoryInfo(process, &mut counters, counters.cb);
        let mut creation = FILETIME::default();
        let mut exit = FILETIME::default();
        let mut kernel = FILETIME::default();
        let mut user = FILETIME::default();
        let _ = GetProcessTimes(process, &mut creation, &mut exit, &mut kernel, &mut user);
        let ticks =
            |time: FILETIME| ((time.dwHighDateTime as u64) << 32) | time.dwLowDateTime as u64;
        ProcessSnapshot {
            cpu_ms: (ticks(kernel) + ticks(user)) / 10_000,
            peak_working_set_bytes: counters.PeakWorkingSetSize as u64,
            working_set_bytes: counters.WorkingSetSize as u64,
        }
    }
}

#[cfg(not(windows))]
fn process_snapshot() -> ProcessSnapshot {
    ProcessSnapshot::default()
}

fn distance(expected: &[String], actual: &[String]) -> usize {
    edit_counts(expected, actual).total()
}

fn threads(limit: usize) -> i32 {
    std::thread::available_parallelism()
        .map(usize::from)
        .unwrap_or(2)
        .clamp(1, limit) as i32
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn metrics_are_sound() {
        assert_eq!(
            distance(&words("one two three"), &words("one too three")),
            1
        );
        assert_eq!(
            edit_counts(&words("one two three"), &words("one too four three")),
            EditCounts {
                substitutions: 1,
                deletions: 0,
                insertions: 1,
            }
        );
        assert_eq!(resample(&[0.0; 48_000], 48_000).len(), 16_000);
        assert_eq!(percentile(&[10, 20, 30, 40], 0.90), 40);
    }

    #[test]
    fn a_segment_commits_once() {
        let mut commits = CommitLog::default();
        assert!(commits.commit(7, "first phrase"));
        assert!(!commits.commit(7, "first phrase"));
        assert_eq!(commits.text, ["first phrase"]);
        assert_eq!(commits.duplicate_rejections, 1);
    }

    #[test]
    fn a_busy_finalizer_reports_queue_delay() {
        let mut segment = HybridSegment {
            id: 2,
            reason: "sherpa".into(),
            duration_ms: 2_000,
            endpoint_audio_ms: 5_000,
            trailing_silence_ms: 1_200,
            sherpa_text: "two".into(),
            whisper_text: "Two.".into(),
            committed_text: "Two.".into(),
            whisper_finalization_ms: 3_000,
            whisper_cpu_ms: 0,
            queue_delay_ms: 0,
            endpoint_to_final_ms: 0,
            final_available_audio_clock_ms: 0,
            simulated_commit_us: 0,
        };
        let mut available = 6_000;
        schedule_segment(&mut segment, &mut available);
        assert_eq!(segment.queue_delay_ms, 1_000);
        assert_eq!(segment.endpoint_to_final_ms, 4_000);
        assert_eq!(available, 9_000);
    }
}
