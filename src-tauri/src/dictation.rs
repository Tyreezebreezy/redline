use crate::local_ai::{LocalAiGate, LocalAiTask};
use rubato::{
    Fft, FixedSync, Resampler, WindowFunction, audioadapter::Adapter,
    audioadapter_buffers::owned::InterleavedOwned,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs::File,
    io::Read,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::Instant,
};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

const MODEL_SHA256: &str = "a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002";
const TARGET_SAMPLE_RATE: u32 = 16_000;
const MAX_INPUT_SAMPLE_RATE: u32 = 48_000;
const MAX_DURATION_SECONDS: u64 = 90;
const MAX_PCM_BYTES: usize =
    MAX_INPUT_SAMPLE_RATE as usize * MAX_DURATION_SECONDS as usize * size_of::<i16>();
const MIN_AUDIO_SECONDS: f32 = 0.25;
const MIN_RMS: f32 = 0.003;

type DictationResult<T> = Result<T, String>;

#[derive(Clone)]
pub struct DictationService {
    capture: Arc<Mutex<CaptureState>>,
    gate: LocalAiGate,
    provider: Arc<Mutex<WhisperCppProvider>>,
}

#[derive(Default)]
struct CaptureState {
    active: Option<ActiveSession>,
    processing: Option<ProcessingSession>,
}

struct ActiveSession {
    id: String,
    sample_rate: u32,
    started: Instant,
}

struct CapturedAudio {
    samples: Vec<f32>,
    sample_rate: u32,
    timed_out: bool,
}

struct ProcessingSession {
    id: String,
    cancelled: Arc<AtomicBool>,
}

struct DictationGateGuard {
    gate: LocalAiGate,
    session_id: String,
}

impl Drop for DictationGateGuard {
    fn drop(&mut self) {
        self.gate.release(LocalAiTask::Dictation, &self.session_id);
    }
}

struct WhisperCppProvider {
    model_path: PathBuf,
    context: Option<WhisperContext>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureInfo {
    device_name: String,
    max_duration_seconds: u64,
    sample_rate: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechTranscript {
    pub text: String,
    pub audio_duration_ms: u64,
    pub model_load_ms: u64,
    pub processing_ms: u64,
    pub real_time_factor: f64,
    pub timed_out: bool,
}

struct ProviderTranscript {
    text: String,
    model_load_ms: u64,
}

trait SpeechToTextProvider {
    fn transcribe(&mut self, samples: &[f32]) -> DictationResult<ProviderTranscript>;
}

impl DictationService {
    pub fn new(model_path: PathBuf, gate: LocalAiGate) -> Self {
        Self {
            capture: Arc::new(Mutex::new(CaptureState::default())),
            gate,
            provider: Arc::new(Mutex::new(WhisperCppProvider {
                model_path,
                context: None,
            })),
        }
    }

    pub fn start(
        &self,
        session_id: String,
        device_name: String,
        sample_rate: u32,
    ) -> DictationResult<CaptureInfo> {
        validate_session_id(&session_id)?;
        if device_name.trim().is_empty() || device_name.chars().count() > 256 {
            return Err("Microphone identity is invalid.".into());
        }
        validate_sample_rate(sample_rate)?;
        self.gate.claim(LocalAiTask::Dictation, &session_id)?;
        let mut state = match self.capture.lock() {
            Ok(state) => state,
            Err(_) => {
                self.gate.release(LocalAiTask::Dictation, &session_id);
                return Err("Dictation state is unavailable.".into());
            }
        };
        if state.active.is_some() || state.processing.is_some() {
            self.gate.release(LocalAiTask::Dictation, &session_id);
            return Err("Another dictation session is already active.".into());
        }
        state.active = Some(ActiveSession {
            id: session_id.clone(),
            sample_rate,
            started: Instant::now(),
        });

        Ok(CaptureInfo {
            device_name,
            max_duration_seconds: MAX_DURATION_SECONDS,
            sample_rate,
        })
    }

    pub fn stop(
        &self,
        session_id: String,
        sample_rate: u32,
        timed_out: bool,
        mut pcm: Vec<u8>,
    ) -> DictationResult<SpeechTranscript> {
        validate_session_id(&session_id)?;
        let _gate = DictationGateGuard {
            gate: self.gate.clone(),
            session_id: session_id.clone(),
        };
        let (started, cancelled) = {
            let mut state = self
                .capture
                .lock()
                .map_err(|_| "Dictation state is unavailable.")?;
            let active = if state
                .active
                .as_ref()
                .is_some_and(|active| active.id == session_id)
            {
                state.active.take().expect("active session disappeared")
            } else {
                return Err("The dictation session is no longer active.".into());
            };
            if active.sample_rate != sample_rate {
                return Err("The captured audio sample rate changed unexpectedly.".into());
            }
            validate_pcm(&pcm, sample_rate)?;
            let cancelled = Arc::new(AtomicBool::new(false));
            state.processing = Some(ProcessingSession {
                id: session_id.clone(),
                cancelled: Arc::clone(&cancelled),
            });
            (active.started, cancelled)
        };

        let samples = pcm
            .chunks_exact(2)
            .map(|bytes| i16::from_le_bytes([bytes[0], bytes[1]]) as f32 / 32_768.0)
            .collect();
        pcm.fill(0);
        let result = self.transcribe_capture(CapturedAudio {
            samples,
            sample_rate,
            timed_out: timed_out || started.elapsed().as_secs() >= MAX_DURATION_SECONDS,
        });
        let mut state = self
            .capture
            .lock()
            .map_err(|_| "Dictation state is unavailable.")?;
        if state
            .processing
            .as_ref()
            .is_some_and(|processing| processing.id == session_id)
        {
            state.processing = None;
        }
        if cancelled.load(Ordering::Acquire) {
            return Err("Dictation was cancelled.".into());
        }
        result
    }

    pub fn cancel(&self, session_id: String) -> DictationResult<()> {
        validate_session_id(&session_id)?;
        let mut state = self
            .capture
            .lock()
            .map_err(|_| "Dictation state is unavailable.")?;
        if state
            .active
            .as_ref()
            .is_some_and(|active| active.id == session_id)
        {
            state.active = None;
            self.gate.release(LocalAiTask::Dictation, &session_id);
        } else if let Some(processing) = state
            .processing
            .as_ref()
            .filter(|processing| processing.id == session_id)
        {
            processing.cancelled.store(true, Ordering::Release);
        } else {
            return Ok(());
        }
        Ok(())
    }

    fn transcribe_capture(&self, captured: CapturedAudio) -> DictationResult<SpeechTranscript> {
        let input = captured.samples;
        let audio_duration_ms =
            (input.len() as u64 * 1_000).saturating_div(u64::from(captured.sample_rate));
        let audio = resample_to_whisper(input, captured.sample_rate)?;
        let processing_started = Instant::now();
        let transcript = self
            .provider
            .lock()
            .map_err(|_| "Speech recognition is unavailable.")?
            .transcribe(&audio)?;
        let processing_ms = processing_started.elapsed().as_millis() as u64;
        Ok(SpeechTranscript {
            text: transcript.text,
            audio_duration_ms,
            model_load_ms: transcript.model_load_ms,
            processing_ms,
            real_time_factor: if audio_duration_ms == 0 {
                0.0
            } else {
                processing_ms as f64 / audio_duration_ms as f64
            },
            timed_out: captured.timed_out,
        })
    }
}

impl SpeechToTextProvider for WhisperCppProvider {
    fn transcribe(&mut self, samples: &[f32]) -> DictationResult<ProviderTranscript> {
        if samples.len() < (TARGET_SAMPLE_RATE as f32 * MIN_AUDIO_SECONDS) as usize
            || root_mean_square(samples) < MIN_RMS
        {
            return Ok(ProviderTranscript {
                text: String::new(),
                model_load_ms: 0,
            });
        }

        let load_started = Instant::now();
        let cold = self.context.is_none();
        if cold {
            verify_model(&self.model_path)?;
            self.context = Some(
                WhisperContext::new_with_params(
                    self.model_path.to_string_lossy().as_ref(),
                    WhisperContextParameters::default(),
                )
                .map_err(|error| {
                    format!("REDLINE could not initialize the speech model: {error}")
                })?,
            );
        }
        let model_load_ms = if cold {
            load_started.elapsed().as_millis() as u64
        } else {
            0
        };
        let context = self
            .context
            .as_ref()
            .expect("verified model context missing");
        let mut state = context
            .create_state()
            .map_err(|error| format!("REDLINE could not create a speech session: {error}"))?;
        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_language(Some("en"));
        params.set_n_threads(
            std::thread::available_parallelism()
                .map(usize::from)
                .unwrap_or(2)
                .clamp(1, 8) as i32,
        );
        params.set_no_context(true);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_special(false);
        params.set_print_timestamps(false);
        params.set_suppress_blank(true);
        params.set_translate(false);
        state
            .full(params, samples)
            .map_err(|error| format!("Local transcription failed: {error}"))?;

        let text = state
            .as_iter()
            .filter(|segment| segment.no_speech_probability() < 0.6)
            .map(|segment| segment.to_string())
            .collect::<String>()
            .trim()
            .to_owned();
        let text = if matches!(text.as_str(), "[BLANK_AUDIO]" | "(silence)" | "[silence]") {
            String::new()
        } else {
            text
        };
        Ok(ProviderTranscript {
            text,
            model_load_ms,
        })
    }
}

fn validate_session_id(session_id: &str) -> DictationResult<()> {
    if !(8..=64).contains(&session_id.len())
        || !session_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
    {
        return Err("Dictation session identifier is invalid.".into());
    }
    Ok(())
}

fn validate_sample_rate(sample_rate: u32) -> DictationResult<()> {
    if (8_000..=MAX_INPUT_SAMPLE_RATE).contains(&sample_rate) {
        Ok(())
    } else {
        Err("The browser microphone sample rate is not supported.".into())
    }
}

fn validate_pcm(pcm: &[u8], sample_rate: u32) -> DictationResult<()> {
    validate_sample_rate(sample_rate)?;
    let session_limit = sample_rate as usize * MAX_DURATION_SECONDS as usize * size_of::<i16>();
    if pcm.is_empty() || !pcm.len().is_multiple_of(size_of::<i16>()) {
        return Err("Captured audio is empty or malformed.".into());
    }
    if pcm.len() > session_limit || pcm.len() > MAX_PCM_BYTES {
        return Err("Captured audio exceeds the 90-second limit.".into());
    }
    Ok(())
}

pub fn resample_to_whisper(samples: Vec<f32>, sample_rate: u32) -> DictationResult<Vec<f32>> {
    if sample_rate == TARGET_SAMPLE_RATE {
        return Ok(samples);
    }
    if samples.is_empty() || !(8_000..=MAX_INPUT_SAMPLE_RATE).contains(&sample_rate) {
        return Err("Captured audio has an invalid sample rate or no samples.".into());
    }
    let frames = samples.len();
    let input = InterleavedOwned::new_from(samples, 1, frames)
        .map_err(|error| format!("Captured audio is invalid: {error}"))?;
    let mut resampler = Fft::<f32>::new_custom(
        sample_rate as usize,
        TARGET_SAMPLE_RATE as usize,
        1_024,
        1,
        1,
        WindowFunction::BlackmanHarris2,
        FixedSync::Both,
    )
    .map_err(|error| format!("REDLINE could not prepare audio conversion: {error}"))?;
    let output = resampler
        .process_all(&input, input.frames(), None)
        .map_err(|error| format!("REDLINE could not convert microphone audio: {error}"))?;
    Ok(output.take_data())
}

fn root_mean_square(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    (samples.iter().map(|sample| sample * sample).sum::<f32>() / samples.len() as f32).sqrt()
}

pub fn verify_model(path: &Path) -> DictationResult<()> {
    let mut file = File::open(path).map_err(|_| "The bundled speech model is unavailable.")?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 1024 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|_| "The bundled speech model could not be verified.")?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    let actual = hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    if actual != MODEL_SHA256 {
        return Err("The bundled speech model failed its integrity check.".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Corpus {
        schema_version: u8,
        fixtures: Vec<Fixture>,
    }

    #[derive(serde::Deserialize)]
    struct Fixture {
        id: String,
        category: String,
        transcript: String,
        kind: String,
        file: String,
    }

    #[test]
    fn model_matches_pinned_identity() {
        verify_model(
            &Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/models/ggml-base.en.bin"),
        )
        .unwrap();
    }

    #[test]
    fn resampling_is_bounded_and_preserves_signal() {
        let samples = (0..48_000)
            .map(|index| (2.0 * std::f32::consts::PI * 440.0 * index as f32 / 48_000.0).sin() * 0.2)
            .collect();
        let output = resample_to_whisper(samples, 48_000).unwrap();
        assert!((15_900..=16_100).contains(&output.len()));
        assert!(root_mean_square(&output) > 0.1);
    }

    #[test]
    fn silence_and_session_ids_are_rejected_safely() {
        assert_eq!(root_mean_square(&vec![0.0; 16_000]), 0.0);
        assert!(validate_session_id("safe-session-01").is_ok());
        assert!(validate_session_id("bad session").is_err());
    }

    #[test]
    fn raw_pcm_is_bounded_and_cancellation_clears_session() {
        assert!(validate_pcm(&vec![0_u8; 48_000 * 2], 48_000).is_ok());
        assert!(validate_pcm(&[0_u8], 48_000).is_err());
        assert!(validate_pcm(&vec![0_u8; MAX_PCM_BYTES + 2], 48_000).is_err());
        let service = DictationService::new(PathBuf::from("unused-model"), LocalAiGate::default());
        service
            .start(
                "invalid-session-01".into(),
                "Test microphone".into(),
                48_000,
            )
            .unwrap();
        assert!(
            service
                .stop("invalid-session-01".into(), 48_000, false, vec![0])
                .is_err()
        );
        assert!(service.capture.lock().unwrap().active.is_none());
        service
            .start("cancel-session-01".into(), "Test microphone".into(), 48_000)
            .unwrap();
        service.cancel("cancel-session-01".into()).unwrap();
        assert!(service.capture.lock().unwrap().active.is_none());
    }

    #[test]
    fn dictation_corpus_declares_exactly_26_bounded_fixtures() {
        let corpus: Corpus =
            serde_json::from_str(include_str!("../../benchmarks/dictation-corpus.json")).unwrap();
        assert_eq!(corpus.schema_version, 1);
        assert_eq!(corpus.fixtures.len(), 26);
        assert!(corpus.fixtures.iter().all(|fixture| {
            !fixture.id.is_empty()
                && !fixture.category.is_empty()
                && !fixture.file.is_empty()
                && matches!(
                    fixture.kind.as_str(),
                    "speech" | "silence" | "noise" | "short-silence"
                )
        }));
    }

    #[test]
    #[ignore = "loads the bundled model and runs two CPU inference passes"]
    fn model_initializes_once_and_reuses_context() {
        let mut provider = WhisperCppProvider {
            model_path: Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("resources/models/ggml-base.en.bin"),
            context: None,
        };
        let samples = (0..TARGET_SAMPLE_RATE)
            .map(|index| {
                (2.0 * std::f32::consts::PI * 440.0 * index as f32 / TARGET_SAMPLE_RATE as f32)
                    .sin()
                    * 0.01
            })
            .collect::<Vec<_>>();
        let cold_started = Instant::now();
        let cold = provider.transcribe(&samples).unwrap();
        let cold_elapsed = cold_started.elapsed();
        let warm_started = Instant::now();
        let warm = provider.transcribe(&samples).unwrap();
        let warm_elapsed = warm_started.elapsed();
        assert!(cold.model_load_ms > 0);
        assert_eq!(warm.model_load_ms, 0);
        println!(
            "cold_load_ms={} cold_total_ms={} warm_total_ms={}",
            cold.model_load_ms,
            cold_elapsed.as_millis(),
            warm_elapsed.as_millis()
        );
    }

    #[test]
    #[ignore = "release benchmark with generated deterministic audio fixtures"]
    fn benchmark_dictation_corpus() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let corpus: Corpus = serde_json::from_str(
            &std::fs::read_to_string(root.join("benchmarks/dictation-corpus.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(corpus.schema_version, 1);
        assert_eq!(corpus.fixtures.len(), 26);
        let mut provider = WhisperCppProvider {
            model_path: Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("resources/models/ggml-base.en.bin"),
            context: None,
        };
        let mut total_edits = 0;
        let mut total_words = 0;
        let mut exact = 0;
        let started = Instant::now();
        println!("id,category,audio_ms,load_ms,processing_ms,rtf,word_edits,reference_words,exact");
        for fixture in corpus.fixtures {
            let path = root.join("benchmarks").join(&fixture.file);
            let mut reader = hound::WavReader::open(&path)
                .unwrap_or_else(|error| panic!("Missing fixture {}: {error}", path.display()));
            let spec = reader.spec();
            assert_eq!(spec.channels, 1, "{} must be mono", fixture.id);
            let samples: Vec<f32> = match spec.sample_format {
                hound::SampleFormat::Int => reader
                    .samples::<i16>()
                    .map(|sample| sample.unwrap() as f32 / i16::MAX as f32)
                    .collect(),
                hound::SampleFormat::Float => reader.samples::<f32>().map(Result::unwrap).collect(),
            };
            let audio_ms = samples.len() as u64 * 1_000 / u64::from(spec.sample_rate);
            let samples = resample_to_whisper(samples, spec.sample_rate).unwrap();
            let processing = Instant::now();
            let result = provider.transcribe(&samples).unwrap();
            let processing_ms = processing.elapsed().as_millis() as u64;
            let expected = normalized_words(&fixture.transcript);
            let actual = normalized_words(&result.text);
            let edits = word_distance(&expected, &actual);
            let is_exact = expected == actual;
            total_edits += edits;
            total_words += expected.len();
            exact += usize::from(is_exact);
            println!(
                "{},{},{audio_ms},{},{processing_ms},{:.3},{edits},{},{is_exact}",
                fixture.id,
                fixture.category,
                result.model_load_ms,
                processing_ms as f64 / audio_ms.max(1) as f64,
                expected.len(),
            );
            if matches!(fixture.kind.as_str(), "silence" | "noise" | "short-silence") {
                assert!(
                    result.text.is_empty(),
                    "{} produced false speech: {}",
                    fixture.id,
                    result.text
                );
            }
        }
        println!(
            "summary fixtures=26 exact={exact} wer={:.3} elapsed_ms={}",
            total_edits as f64 / total_words.max(1) as f64,
            started.elapsed().as_millis(),
        );
    }

    fn normalized_words(text: &str) -> Vec<String> {
        text.split_whitespace()
            .map(|word| {
                word.trim_matches(|character: char| {
                    !character.is_alphanumeric() && character != '\'' && character != '’'
                })
                .to_lowercase()
            })
            .filter(|word| !word.is_empty())
            .collect()
    }

    fn word_distance(expected: &[String], actual: &[String]) -> usize {
        let mut row: Vec<usize> = (0..=actual.len()).collect();
        for (expected_index, expected_word) in expected.iter().enumerate() {
            let mut previous = row[0];
            row[0] = expected_index + 1;
            for (actual_index, actual_word) in actual.iter().enumerate() {
                let current = row[actual_index + 1];
                row[actual_index + 1] = (previous + usize::from(expected_word != actual_word))
                    .min(row[actual_index + 1] + 1)
                    .min(row[actual_index] + 1);
                previous = current;
            }
        }
        row[actual.len()]
    }
}
