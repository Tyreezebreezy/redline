use serde::{Deserialize, Serialize};
use sherpa_onnx::{OnlineRecognizer, OnlineRecognizerConfig, OnlineStream};
use std::{
    env,
    error::Error,
    fs,
    path::{Path, PathBuf},
    time::Instant,
};
use whisper_rs::{
    FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters, WhisperState,
};

type Result<T> = std::result::Result<T, Box<dyn Error>>;
const RATE: u32 = 16_000;

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

fn main() -> Result<()> {
    let args: Vec<_> = env::args().collect();
    if args.len() != 4 || !matches!(args[1].as_str(), "sherpa" | "whisper") {
        return Err("usage: probe <sherpa|whisper> <model-path> <corpus.json>".into());
    }
    let model = PathBuf::from(&args[2]);
    let corpus_path = PathBuf::from(&args[3]);
    let mut corpus: Corpus = serde_json::from_str(&fs::read_to_string(&corpus_path)?)?;
    if let Ok(id) = env::var("REDLINE_PROBE_FIXTURE") {
        corpus.fixtures.retain(|fixture| fixture.id == id);
        if corpus.fixtures.is_empty() {
            return Err(format!("fixture not found: {id}").into());
        }
    }
    let root = corpus_path.parent().ok_or("corpus path has no parent")?;
    let report = if args[1] == "sherpa" {
        run_sherpa(&model, root, corpus)?
    } else {
        run_whisper(&model, root, corpus)?
    };
    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}

fn run_sherpa(model: &Path, root: &Path, corpus: Corpus) -> Result<Report> {
    let timer = Instant::now();
    let mut config = OnlineRecognizerConfig::default();
    let file = |name: &str| model.join(name).display().to_string();
    config.model_config.transducer.encoder = Some(file("encoder-epoch-99-avg-1.int8.onnx"));
    config.model_config.transducer.decoder = Some(file("decoder-epoch-99-avg-1.onnx"));
    config.model_config.transducer.joiner = Some(file("joiner-epoch-99-avg-1.int8.onnx"));
    config.model_config.tokens = Some(file("tokens.txt"));
    config.model_config.num_threads = threads(4);
    config.decoding_method = Some("greedy_search".into());
    config.enable_endpoint = true;
    config.rule1_min_trailing_silence = 2.4;
    config.rule2_min_trailing_silence = 1.2;
    config.rule3_min_utterance_length = 20.0;
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

fn distance(expected: &[String], actual: &[String]) -> usize {
    let mut previous: Vec<_> = (0..=actual.len()).collect();
    for (row, expected_word) in expected.iter().enumerate() {
        let mut current = vec![row + 1; actual.len() + 1];
        for (column, actual_word) in actual.iter().enumerate() {
            current[column + 1] = if expected_word == actual_word {
                previous[column]
            } else {
                1 + previous[column]
                    .min(previous[column + 1])
                    .min(current[column])
            };
        }
        previous = current;
    }
    previous[actual.len()]
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
        assert_eq!(resample(&[0.0; 48_000], 48_000).len(), 16_000);
    }
}
