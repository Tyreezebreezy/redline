use std::ffi::c_void;
use std::process::ExitCode;
use std::ptr;
use std::slice;
use std::thread;
use std::time::Duration;
use windows::core::{Error, GUID, PWSTR};
use windows::Win32::Media::MediaFoundation::{
    IMFActivate, IMFAttributes, IMFMediaSource, IMFMediaType, MFAudioFormat_PCM,
    MFCreateAttributes, MFCreateMediaType, MFCreateSourceReaderFromMediaSource,
    MFEnumDeviceSources, MFMediaType_Audio, MFShutdown, MFStartup, MFSTARTUP_FULL,
    MF_DEVSOURCE_ATTRIBUTE_FRIENDLY_NAME, MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE,
    MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE_AUDCAP_ENDPOINT_ID,
    MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE_AUDCAP_GUID, MF_MT_AUDIO_AVG_BYTES_PER_SECOND,
    MF_MT_AUDIO_BITS_PER_SAMPLE, MF_MT_AUDIO_BLOCK_ALIGNMENT, MF_MT_AUDIO_NUM_CHANNELS,
    MF_MT_AUDIO_SAMPLES_PER_SECOND, MF_MT_MAJOR_TYPE, MF_MT_SUBTYPE, MF_SOURCE_READERF_ENDOFSTREAM,
    MF_SOURCE_READER_ALL_STREAMS, MF_SOURCE_READER_FIRST_AUDIO_STREAM, MF_VERSION,
};
use windows::Win32::System::Com::{
    CoInitializeEx, CoTaskMemFree, CoUninitialize, COINIT_MULTITHREADED,
};

const TARGET_NAME: &str = "Mic/Inst (Samson G-Track Pro)";

type ProbeResult<T> = Result<T, String>;

#[derive(Clone, Copy)]
struct Options {
    cycles: u32,
    seconds: u64,
    prepare_seconds: u64,
}

struct PlatformGuard;

impl Drop for PlatformGuard {
    fn drop(&mut self) {
        let _ = unsafe { MFShutdown() };
        unsafe { CoUninitialize() };
    }
}

struct SourceGuard {
    source: Option<IMFMediaSource>,
}

impl SourceGuard {
    fn new(source: IMFMediaSource) -> Self {
        Self {
            source: Some(source),
        }
    }

    fn get(&self) -> &IMFMediaSource {
        self.source.as_ref().unwrap()
    }

    fn shutdown(&mut self) -> ProbeResult<()> {
        if let Some(source) = self.source.take() {
            stage("IMFMediaSource::Shutdown", unsafe { source.Shutdown() })?;
            println!("HRESULT stage=IMFMediaSource::Shutdown value=0x00000000");
        }
        Ok(())
    }
}

impl Drop for SourceGuard {
    fn drop(&mut self) {
        if let Some(source) = self.source.take() {
            let _ = unsafe { source.Shutdown() };
        }
    }
}

#[derive(Clone, Copy)]
struct AudioType {
    major: GUID,
    subtype: GUID,
    channels: u32,
    sample_rate: u32,
    bits_per_sample: u32,
    block_align: u32,
    avg_bytes_per_second: u32,
}

struct CaptureStats {
    bytes: usize,
    samples: u32,
    first_timestamp_hns: i64,
    last_timestamp_hns: i64,
    peak: f64,
    rms: f64,
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("PROBE_FAIL {error}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> ProbeResult<()> {
    let options = parse_options()?;
    let com = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    if com.is_err() {
        return Err(hresult_detail("CoInitializeEx", com));
    }
    stage("MFStartup", unsafe {
        MFStartup(MF_VERSION, MFSTARTUP_FULL)
    })?;
    let platform = PlatformGuard;
    println!("HRESULT stage=MFStartup value=0x00000000 version=0x{MF_VERSION:08X}");
    println!(
        "PROBE_START pid={} cycles={} capture_seconds={} binding=windows-0.62.2",
        std::process::id(),
        options.cycles,
        options.seconds
    );
    enumerate_and_report()?;

    if options.prepare_seconds > 0 {
        println!(
            "SPEAK_PROMPT Begin speaking into the Samson in {} seconds and continue through cycle 1.",
            options.prepare_seconds
        );
        thread::sleep(Duration::from_secs(options.prepare_seconds));
    }

    let mut non_silent_cycles = 0;
    for cycle in 1..=options.cycles {
        let stats = capture_cycle(cycle, options.seconds)?;
        let non_silent = stats.peak >= 0.001;
        non_silent_cycles += u32::from(non_silent);
        println!(
            "CYCLE_PASS cycle={cycle}/{} bytes={} samples={} first_timestamp_hns={} last_timestamp_hns={} peak={:.6} rms={:.6} non_silent={non_silent} source_shutdown=true",
            options.cycles,
            stats.bytes,
            stats.samples,
            stats.first_timestamp_hns,
            stats.last_timestamp_hns,
            stats.peak,
            stats.rms
        );
    }
    if non_silent_cycles == 0 {
        return Err(
            "stage=signal_validation no cycle crossed normalized peak threshold 0.001".into(),
        );
    }
    println!(
        "PROBE_PASS cycles={} non_silent_cycles={} all_sources_shutdown_and_released=true",
        options.cycles, non_silent_cycles
    );
    drop(platform);
    println!("HRESULT stage=MFShutdown value=0x00000000");
    Ok(())
}

fn parse_options() -> ProbeResult<Options> {
    let mut options = Options {
        cycles: 20,
        seconds: 3,
        prepare_seconds: 5,
    };
    let mut args = std::env::args().skip(1);
    while let Some(argument) = args.next() {
        let value = args
            .next()
            .ok_or_else(|| format!("stage=arguments missing value for {argument}"))?;
        match argument.as_str() {
            "--cycles" => {
                options.cycles = value
                    .parse()
                    .map_err(|_| "stage=arguments --cycles must be an integer".to_string())?
            }
            "--seconds" => {
                options.seconds = value
                    .parse()
                    .map_err(|_| "stage=arguments --seconds must be an integer".to_string())?
            }
            "--prepare-seconds" => {
                options.prepare_seconds = value.parse().map_err(|_| {
                    "stage=arguments --prepare-seconds must be an integer".to_string()
                })?
            }
            _ => return Err(format!("stage=arguments unknown option {argument}")),
        }
    }
    if options.cycles == 0 || !(3..=5).contains(&options.seconds) {
        return Err("stage=arguments require cycles > 0 and seconds in 3..=5".into());
    }
    Ok(options)
}

fn enumerate_and_report() -> ProbeResult<()> {
    let devices = enumerate_audio_devices()?;
    println!("DEVICE_COUNT {}", devices.len());
    let mut found = false;
    for (index, activation) in devices.iter().enumerate() {
        let name = allocated_string(activation, &MF_DEVSOURCE_ATTRIBUTE_FRIENDLY_NAME)?;
        let endpoint = allocated_string(
            activation,
            &MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE_AUDCAP_ENDPOINT_ID,
        )?;
        found |= name == TARGET_NAME;
        println!("DEVICE index={index} name={name:?} endpoint_id={endpoint:?}");
    }
    if !found {
        return Err(format!(
            "stage=device_selection target={TARGET_NAME:?} not found"
        ));
    }
    Ok(())
}

fn capture_cycle(cycle: u32, seconds: u64) -> ProbeResult<CaptureStats> {
    let devices = enumerate_audio_devices()?;
    let activation = select_samson(&devices)?;
    let endpoint = allocated_string(
        &activation,
        &MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE_AUDCAP_ENDPOINT_ID,
    )?;
    println!("OPEN cycle={cycle} device={TARGET_NAME:?} endpoint_id={endpoint:?}");
    let source: IMFMediaSource = stage("IMFActivate::ActivateObject<IMFMediaSource>", unsafe {
        activation.ActivateObject()
    })?;
    println!("HRESULT cycle={cycle} stage=IMFActivate::ActivateObject value=0x00000000");
    let mut source = SourceGuard::new(source);
    let reader = stage("MFCreateSourceReaderFromMediaSource", unsafe {
        MFCreateSourceReaderFromMediaSource(source.get(), None)
    })?;
    println!("HRESULT cycle={cycle} stage=MFCreateSourceReaderFromMediaSource value=0x00000000");
    let stream = MF_SOURCE_READER_FIRST_AUDIO_STREAM.0 as u32;
    let all_streams = MF_SOURCE_READER_ALL_STREAMS.0 as u32;
    stage("IMFSourceReader::SetStreamSelection(all,false)", unsafe {
        reader.SetStreamSelection(all_streams, false)
    })?;
    stage("IMFSourceReader::SetStreamSelection(audio,true)", unsafe {
        reader.SetStreamSelection(stream, true)
    })?;
    let native = stage("IMFSourceReader::GetNativeMediaType", unsafe {
        reader.GetNativeMediaType(stream, 0)
    })?;
    let native_type = audio_type(&native)?;
    report_audio_type("NATIVE_MEDIA_TYPE", cycle, native_type);

    let pcm = stage("MFCreateMediaType", unsafe { MFCreateMediaType() })?;
    stage("IMFMediaType::SetGUID(MF_MT_MAJOR_TYPE)", unsafe {
        pcm.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Audio)
    })?;
    stage("IMFMediaType::SetGUID(MF_MT_SUBTYPE)", unsafe {
        pcm.SetGUID(&MF_MT_SUBTYPE, &MFAudioFormat_PCM)
    })?;
    stage("IMFSourceReader::SetCurrentMediaType(PCM)", unsafe {
        reader.SetCurrentMediaType(stream, None, &pcm)
    })?;
    println!(
        "HRESULT cycle={cycle} stage=IMFSourceReader::SetCurrentMediaType(PCM) value=0x00000000"
    );
    let output = stage("IMFSourceReader::GetCurrentMediaType", unsafe {
        reader.GetCurrentMediaType(stream)
    })?;
    let output_type = audio_type(&output)?;
    report_audio_type("OUTPUT_MEDIA_TYPE", cycle, output_type);
    if output_type.subtype != MFAudioFormat_PCM {
        return Err(format!(
            "cycle={cycle} stage=output_validation expected PCM subtype, got {:?}",
            output_type.subtype
        ));
    }

    let hard_limit = output_type.avg_bytes_per_second as usize * (seconds as usize + 1);
    let mut bytes = Vec::with_capacity(hard_limit);
    let mut sample_count = 0;
    let mut first_timestamp = None;
    let mut last_timestamp = 0;
    while bytes.len() < output_type.avg_bytes_per_second as usize * seconds as usize {
        let mut actual_stream = 0;
        let mut flags = 0;
        let mut timestamp = 0;
        let mut sample = None;
        stage("IMFSourceReader::ReadSample", unsafe {
            reader.ReadSample(
                stream,
                0,
                Some(&mut actual_stream),
                Some(&mut flags),
                Some(&mut timestamp),
                Some(&mut sample),
            )
        })?;
        if flags & MF_SOURCE_READERF_ENDOFSTREAM.0 as u32 != 0 {
            return Err(format!(
                "cycle={cycle} stage=IMFSourceReader::ReadSample unexpected end-of-stream flags=0x{flags:08X}"
            ));
        }
        let Some(sample) = sample else {
            continue;
        };
        let buffer = stage("IMFSample::ConvertToContiguousBuffer", unsafe {
            sample.ConvertToContiguousBuffer()
        })?;
        let length = stage("IMFMediaBuffer::GetCurrentLength", unsafe {
            buffer.GetCurrentLength()
        })? as usize;
        if bytes.len() + length > hard_limit {
            return Err(format!(
                "cycle={cycle} stage=bounded_memory captured_bytes={} sample_bytes={length} hard_limit_bytes={hard_limit}",
                bytes.len()
            ));
        }
        let mut data = ptr::null_mut();
        let mut current_length = 0;
        stage("IMFMediaBuffer::Lock", unsafe {
            buffer.Lock(&mut data, None, Some(&mut current_length))
        })?;
        let copy_result: ProbeResult<()> = if data.is_null() && current_length > 0 {
            Err("stage=IMFMediaBuffer::Lock returned null data for non-empty buffer".into())
        } else {
            bytes
                .extend_from_slice(unsafe { slice::from_raw_parts(data, current_length as usize) });
            Ok(())
        };
        let unlock_result = stage("IMFMediaBuffer::Unlock", unsafe { buffer.Unlock() });
        copy_result?;
        unlock_result?;
        sample_count += 1;
        first_timestamp.get_or_insert(timestamp);
        last_timestamp = timestamp;
    }

    let (peak, rms) = signal_levels(&bytes, output_type)?;
    drop(reader);
    source.shutdown()?;
    Ok(CaptureStats {
        bytes: bytes.len(),
        samples: sample_count,
        first_timestamp_hns: first_timestamp.unwrap_or_default(),
        last_timestamp_hns: last_timestamp,
        peak,
        rms,
    })
}

fn enumerate_audio_devices() -> ProbeResult<Vec<IMFActivate>> {
    let mut attributes: Option<IMFAttributes> = None;
    stage("MFCreateAttributes", unsafe {
        MFCreateAttributes(&mut attributes, 1)
    })?;
    let attributes = attributes.ok_or("stage=MFCreateAttributes returned no attribute store")?;
    stage("IMFAttributes::SetGUID(audio capture source)", unsafe {
        attributes.SetGUID(
            &MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE,
            &MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE_AUDCAP_GUID,
        )
    })?;
    let mut array: *mut Option<IMFActivate> = ptr::null_mut();
    let mut count = 0;
    stage("MFEnumDeviceSources", unsafe {
        MFEnumDeviceSources(&attributes, &mut array, &mut count)
    })?;
    println!("HRESULT stage=MFEnumDeviceSources value=0x00000000 count={count}");
    if count > 0 && array.is_null() {
        return Err("stage=MFEnumDeviceSources returned null array with nonzero count".into());
    }
    let mut devices = Vec::with_capacity(count as usize);
    for index in 0..count as usize {
        let activation = unsafe { ptr::read(array.add(index)) }
            .ok_or_else(|| format!("stage=MFEnumDeviceSources device index {index} was null"))?;
        devices.push(activation);
    }
    unsafe { CoTaskMemFree(Some(array.cast::<c_void>())) };
    Ok(devices)
}

fn select_samson(devices: &[IMFActivate]) -> ProbeResult<IMFActivate> {
    for activation in devices {
        if allocated_string(activation, &MF_DEVSOURCE_ATTRIBUTE_FRIENDLY_NAME)? == TARGET_NAME {
            return Ok(activation.clone());
        }
    }
    Err(format!(
        "stage=device_selection target={TARGET_NAME:?} not found"
    ))
}

fn allocated_string(attributes: &IMFAttributes, key: &GUID) -> ProbeResult<String> {
    let mut value = PWSTR::null();
    let mut length = 0;
    stage("IMFAttributes::GetAllocatedString", unsafe {
        attributes.GetAllocatedString(key, &mut value, &mut length)
    })?;
    if value.is_null() {
        return Err("stage=IMFAttributes::GetAllocatedString returned null".into());
    }
    let text = unsafe { value.to_string() }
        .map_err(|error| format!("stage=PWSTR::to_string error={error}"));
    unsafe { CoTaskMemFree(Some(value.0.cast::<c_void>())) };
    text
}

fn audio_type(media_type: &IMFMediaType) -> ProbeResult<AudioType> {
    Ok(AudioType {
        major: get_guid(media_type, &MF_MT_MAJOR_TYPE, "MF_MT_MAJOR_TYPE")?,
        subtype: get_guid(media_type, &MF_MT_SUBTYPE, "MF_MT_SUBTYPE")?,
        channels: get_u32(
            media_type,
            &MF_MT_AUDIO_NUM_CHANNELS,
            "MF_MT_AUDIO_NUM_CHANNELS",
        )?,
        sample_rate: get_u32(
            media_type,
            &MF_MT_AUDIO_SAMPLES_PER_SECOND,
            "MF_MT_AUDIO_SAMPLES_PER_SECOND",
        )?,
        bits_per_sample: get_u32(
            media_type,
            &MF_MT_AUDIO_BITS_PER_SAMPLE,
            "MF_MT_AUDIO_BITS_PER_SAMPLE",
        )?,
        block_align: get_u32(
            media_type,
            &MF_MT_AUDIO_BLOCK_ALIGNMENT,
            "MF_MT_AUDIO_BLOCK_ALIGNMENT",
        )?,
        avg_bytes_per_second: get_u32(
            media_type,
            &MF_MT_AUDIO_AVG_BYTES_PER_SECOND,
            "MF_MT_AUDIO_AVG_BYTES_PER_SECOND",
        )?,
    })
}

fn get_guid(attributes: &IMFAttributes, key: &GUID, name: &str) -> ProbeResult<GUID> {
    unsafe { attributes.GetGUID(key) }.map_err(|error| error_detail(name, error))
}

fn get_u32(attributes: &IMFAttributes, key: &GUID, name: &str) -> ProbeResult<u32> {
    unsafe { attributes.GetUINT32(key) }.map_err(|error| error_detail(name, error))
}

fn report_audio_type(label: &str, cycle: u32, media_type: AudioType) {
    let format = if media_type.subtype == MFAudioFormat_PCM {
        "PCM"
    } else {
        "non-PCM"
    };
    println!(
        "{label} cycle={cycle} major={:?} subtype={:?} format={format} channels={} sample_rate_hz={} bits_per_sample={} block_align={} avg_bytes_per_second={}",
        media_type.major,
        media_type.subtype,
        media_type.channels,
        media_type.sample_rate,
        media_type.bits_per_sample,
        media_type.block_align,
        media_type.avg_bytes_per_second
    );
}

fn signal_levels(data: &[u8], media_type: AudioType) -> ProbeResult<(f64, f64)> {
    if media_type.subtype != MFAudioFormat_PCM {
        return Err(format!(
            "stage=signal_decode unsupported subtype={:?}",
            media_type.subtype
        ));
    }
    let sample_bytes = media_type.block_align as usize / media_type.channels as usize;
    let mut count = 0_u64;
    let mut peak = 0.0_f64;
    let mut sum_squares = 0.0_f64;
    for bytes in data.chunks_exact(sample_bytes) {
        let sample = match sample_bytes {
            1 => (bytes[0] as f64 - 128.0) / 128.0,
            2 => i16::from_le_bytes(bytes.try_into().unwrap()) as f64 / 32768.0,
            3 => {
                let signed = i32::from_le_bytes([
                    bytes[0],
                    bytes[1],
                    bytes[2],
                    if bytes[2] & 0x80 == 0 { 0 } else { 0xff },
                ]);
                signed as f64 / 8_388_608.0
            }
            4 => i32::from_le_bytes(bytes.try_into().unwrap()) as f64 / 2_147_483_648.0,
            _ => {
                return Err(format!(
                    "stage=signal_decode unsupported bytes_per_sample={sample_bytes}"
                ))
            }
        };
        peak = peak.max(sample.abs());
        sum_squares += sample * sample;
        count += 1;
    }
    if count == 0 {
        return Err("stage=signal_decode capture contained no complete samples".into());
    }
    Ok((peak, (sum_squares / count as f64).sqrt()))
}

fn stage<T>(name: &str, result: windows::core::Result<T>) -> ProbeResult<T> {
    result.map_err(|error| error_detail(name, error))
}

fn error_detail(stage: &str, error: Error) -> String {
    format!(
        "stage={stage} hresult=0x{:08X} message={} debug={error:?}",
        error.code().0 as u32,
        error.message()
    )
}

fn hresult_detail(stage: &str, result: windows::core::HRESULT) -> String {
    error_detail(stage, Error::from(result))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_pcm16_levels() {
        let media_type = AudioType {
            major: MFMediaType_Audio,
            subtype: MFAudioFormat_PCM,
            channels: 2,
            sample_rate: 48_000,
            bits_per_sample: 16,
            block_align: 4,
            avg_bytes_per_second: 192_000,
        };
        let bytes = [0_i16, 16_384, -8_192, 32_767]
            .into_iter()
            .flat_map(i16::to_le_bytes)
            .collect::<Vec<_>>();
        let (peak, rms) = signal_levels(&bytes, media_type).unwrap();
        assert!((peak - 32_767.0 / 32_768.0).abs() < 1e-9);
        assert!((rms - 0.572808645).abs() < 1e-8);
    }
}
