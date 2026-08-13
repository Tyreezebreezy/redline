use std::env;
use std::ffi::c_void;
use std::process::ExitCode;
use std::ptr;
use std::slice;
use std::thread;
use std::time::{Duration, Instant};
use windows::core::{Error, HRESULT, PCWSTR};
use windows::Win32::Foundation::{CloseHandle, HANDLE, WAIT_OBJECT_0};
use windows::Win32::Media::Audio::{
    eCapture, eConsole, IAudioCaptureClient, IAudioClient, IMMDevice, IMMDeviceEnumerator,
    MMDeviceEnumerator, AUDCLNT_BUFFERFLAGS_DATA_DISCONTINUITY, AUDCLNT_BUFFERFLAGS_SILENT,
    AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_EVENTCALLBACK, WAVEFORMATEX,
    WAVEFORMATEXTENSIBLE,
};
use windows::Win32::Media::KernelStreaming::{KSDATAFORMAT_SUBTYPE_PCM, WAVE_FORMAT_EXTENSIBLE};
use windows::Win32::Media::Multimedia::KSDATAFORMAT_SUBTYPE_IEEE_FLOAT;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL,
    COINIT_MULTITHREADED,
};
use windows::Win32::System::Threading::{CreateEventW, WaitForSingleObject};

type ProbeResult<T> = Result<T, String>;

#[derive(Clone, Copy, Debug)]
enum Mode {
    Timer,
    Event,
}

impl Mode {
    fn label(self) -> &'static str {
        match self {
            Self::Timer => "timer",
            Self::Event => "event",
        }
    }

    fn flags(self) -> u32 {
        match self {
            Self::Timer => 0,
            Self::Event => AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
        }
    }
}

#[derive(Clone, Copy)]
struct Options {
    mode: Mode,
    cycles: u32,
    seconds: u64,
    prepare_seconds: u64,
}

struct ComGuard;

impl Drop for ComGuard {
    fn drop(&mut self) {
        unsafe { CoUninitialize() };
    }
}

struct FormatAllocation(*mut WAVEFORMATEX);

impl Drop for FormatAllocation {
    fn drop(&mut self) {
        unsafe { CoTaskMemFree(Some(self.0.cast::<c_void>())) };
    }
}

struct EventHandle(HANDLE);

impl Drop for EventHandle {
    fn drop(&mut self) {
        let _ = unsafe { CloseHandle(self.0) };
    }
}

#[derive(Clone, Copy)]
struct FormatDetails {
    channels: u16,
    sample_rate: u32,
    avg_bytes_per_second: u32,
    block_align: u16,
    container_bits: u16,
    valid_bits: u16,
    subformat: windows::core::GUID,
}

struct CaptureStats {
    bytes: usize,
    packets: u32,
    silent_packets: u32,
    discontinuities: u32,
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
    let com_result = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    if com_result.is_err() {
        return Err(hresult_detail("CoInitializeEx", com_result));
    }
    let _com = ComGuard;
    println!(
        "PROBE_START pid={} mode={} cycles={} capture_seconds={} binding=windows-0.62.2",
        std::process::id(),
        options.mode.label(),
        options.cycles,
        options.seconds
    );
    report_endpoint_and_format()?;

    if options.prepare_seconds > 0 {
        println!(
            "SPEAK_PROMPT Begin speaking into the default microphone in {} seconds and continue through cycle 1.",
            options.prepare_seconds
        );
        thread::sleep(Duration::from_secs(options.prepare_seconds));
    }

    let mut non_silent_cycles = 0;
    for cycle in 1..=options.cycles {
        let stats = capture_cycle(options.mode, options.seconds, cycle)?;
        let non_silent = stats.peak >= 0.001;
        non_silent_cycles += u32::from(non_silent);
        println!(
            "CYCLE_PASS mode={} cycle={cycle}/{} bytes={} packets={} silent_packets={} discontinuities={} peak={:.6} rms={:.6} non_silent={non_silent}",
            options.mode.label(),
            options.cycles,
            stats.bytes,
            stats.packets,
            stats.silent_packets,
            stats.discontinuities,
            stats.peak,
            stats.rms
        );
    }
    if non_silent_cycles == 0 {
        return Err(format!(
            "mode={} stage=signal_validation no cycle crossed normalized peak threshold 0.001",
            options.mode.label()
        ));
    }
    println!(
        "PROBE_PASS mode={} cycles={} non_silent_cycles={} all_streams_stopped_reset_and_released=true",
        options.mode.label(),
        options.cycles,
        non_silent_cycles
    );
    Ok(())
}

fn parse_options() -> ProbeResult<Options> {
    let mut options = Options {
        mode: Mode::Timer,
        cycles: 20,
        seconds: 3,
        prepare_seconds: 5,
    };
    let mut args = env::args().skip(1);
    while let Some(argument) = args.next() {
        let value = args
            .next()
            .ok_or_else(|| format!("stage=arguments missing value for {argument}"))?;
        match argument.as_str() {
            "--mode" => {
                options.mode = match value.as_str() {
                    "timer" => Mode::Timer,
                    "event" => Mode::Event,
                    _ => return Err("stage=arguments --mode must be timer or event".into()),
                }
            }
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
    if options.cycles == 0 || options.seconds == 0 || options.seconds > 5 {
        return Err("stage=arguments require cycles > 0 and seconds in 1..=5".into());
    }
    Ok(options)
}

fn report_endpoint_and_format() -> ProbeResult<()> {
    let device = default_capture_device()?;
    let id = unsafe { device.GetId() }.map_err(|error| error_detail("IMMDevice::GetId", error))?;
    let id_text = unsafe { id.to_string() }
        .map_err(|error| format!("stage=PWSTR::to_string error={error}"))?;
    unsafe { CoTaskMemFree(Some(id.0.cast::<c_void>())) };
    let client = activate_client(&device)?;
    let format = get_mix_format(&client)?;
    let details = format_details(format.0)?;
    let mut default_period = 0;
    let mut minimum_period = 0;
    stage("IAudioClient::GetDevicePeriod", unsafe {
        client.GetDevicePeriod(Some(&mut default_period), Some(&mut minimum_period))
    })?;
    println!("ENDPOINT id={id_text:?} known_name=\"Mic/Inst (Samson G-Track Pro)\"");
    report_format(format.0, details)?;
    println!(
        "PERIOD default_hns={default_period} minimum_hns={minimum_period} default_ms={:.3} minimum_ms={:.3}",
        default_period as f64 / 10_000.0,
        minimum_period as f64 / 10_000.0
    );
    Ok(())
}

fn capture_cycle(mode: Mode, seconds: u64, cycle: u32) -> ProbeResult<CaptureStats> {
    let device = default_capture_device()?;
    let client = activate_client(&device)?;
    let format = get_mix_format(&client)?;
    let details = format_details(format.0)?;
    let before_hash = format_fingerprint(format.0)?;
    let mut closest_match = ptr::null_mut();
    let support_hr = unsafe {
        client.IsFormatSupported(AUDCLNT_SHAREMODE_SHARED, format.0, Some(&mut closest_match))
    };
    println!(
        "HRESULT mode={} cycle={cycle} stage=IAudioClient::IsFormatSupported value=0x{:08X} closest_match_null={}",
        mode.label(),
        support_hr.0 as u32,
        closest_match.is_null()
    );
    if !closest_match.is_null() {
        unsafe { CoTaskMemFree(Some(closest_match.cast::<c_void>())) };
    }
    let after_support_hash = format_fingerprint(format.0)?;
    if before_hash != after_support_hash {
        return Err(format!(
            "mode={} cycle={cycle} stage=format_integrity format changed during IsFormatSupported before=0x{before_hash:016X} after=0x{after_support_hash:016X}",
            mode.label()
        ));
    }
    println!(
        "INITIALIZE_ARGS mode={} cycle={cycle} share_mode=AUDCLNT_SHAREMODE_SHARED stream_flags=0x{:08X} hns_buffer_duration=0 hns_periodicity=0 session_guid=NULL format_ptr={:p} format_fingerprint=0x{before_hash:016X}",
        mode.label(),
        mode.flags(),
        format.0
    );
    let initialize =
        unsafe { client.Initialize(AUDCLNT_SHAREMODE_SHARED, mode.flags(), 0, 0, format.0, None) };
    match initialize {
        Ok(()) => println!(
            "HRESULT mode={} cycle={cycle} stage=IAudioClient::Initialize value=0x00000000",
            mode.label()
        ),
        Err(error) => {
            return Err(format!(
                "mode={} cycle={cycle} {}",
                mode.label(),
                error_detail("IAudioClient::Initialize", error)
            ))
        }
    }
    let after_initialize_hash = format_fingerprint(format.0)?;
    if before_hash != after_initialize_hash {
        return Err(format!(
            "mode={} cycle={cycle} stage=format_integrity format changed during Initialize before=0x{before_hash:016X} after=0x{after_initialize_hash:016X}",
            mode.label()
        ));
    }

    let event = if matches!(mode, Mode::Event) {
        let handle = stage("CreateEventW", unsafe {
            CreateEventW(None, false, false, PCWSTR::null())
        })?;
        stage("IAudioClient::SetEventHandle", unsafe {
            client.SetEventHandle(handle)
        })?;
        println!(
            "HRESULT mode={} cycle={cycle} stage=IAudioClient::SetEventHandle value=0x00000000",
            mode.label()
        );
        Some(EventHandle(handle))
    } else {
        None
    };

    let buffer_frames = stage("IAudioClient::GetBufferSize", unsafe {
        client.GetBufferSize()
    })?;
    let capture = stage("IAudioClient::GetService<IAudioCaptureClient>", unsafe {
        client.GetService::<IAudioCaptureClient>()
    })?;
    let buffer_bytes = buffer_frames as usize * details.block_align as usize;
    let hard_limit = details.avg_bytes_per_second as usize * seconds as usize + 2 * buffer_bytes;
    let mut bytes = Vec::with_capacity(hard_limit);
    let mut packets = 0;
    let mut silent_packets = 0;
    let mut discontinuities = 0;
    stage("IAudioClient::Start", unsafe { client.Start() })?;
    println!(
        "STREAM_STARTED mode={} cycle={cycle} buffer_frames={buffer_frames} buffer_bytes={buffer_bytes} hard_limit_bytes={hard_limit}",
        mode.label()
    );
    let started = Instant::now();
    let capture_result = (|| {
        while started.elapsed() < Duration::from_secs(seconds) {
            drain_packets(
                &capture,
                details.block_align as usize,
                hard_limit,
                &mut bytes,
                &mut packets,
                &mut silent_packets,
                &mut discontinuities,
            )?;
            if started.elapsed() >= Duration::from_secs(seconds) {
                break;
            }
            if let Some(event) = &event {
                let wait = unsafe { WaitForSingleObject(event.0, 2_000) };
                if wait != WAIT_OBJECT_0 {
                    return Err(format!("stage=WaitForSingleObject result=0x{:08X}", wait.0));
                }
            } else {
                thread::sleep(Duration::from_millis(2));
            }
        }
        Ok(())
    })();
    let stop_result = stage("IAudioClient::Stop", unsafe { client.Stop() });
    let reset_result = stage("IAudioClient::Reset", unsafe { client.Reset() });
    capture_result?;
    stop_result?;
    reset_result?;
    println!(
        "STREAM_RELEASED mode={} cycle={cycle} stop_hr=0x00000000 reset_hr=0x00000000",
        mode.label()
    );

    let (peak, rms) = signal_levels(&bytes, details)?;
    Ok(CaptureStats {
        bytes: bytes.len(),
        packets,
        silent_packets,
        discontinuities,
        peak,
        rms,
    })
}

#[allow(clippy::too_many_arguments)]
fn drain_packets(
    capture: &IAudioCaptureClient,
    block_align: usize,
    hard_limit: usize,
    bytes: &mut Vec<u8>,
    packets: &mut u32,
    silent_packets: &mut u32,
    discontinuities: &mut u32,
) -> ProbeResult<()> {
    loop {
        let available = unsafe { capture.GetNextPacketSize() }
            .map_err(|error| error_detail("IAudioCaptureClient::GetNextPacketSize", error))?;
        if available == 0 {
            return Ok(());
        }
        let mut data = ptr::null_mut();
        let mut frames = 0;
        let mut flags = 0;
        unsafe { capture.GetBuffer(&mut data, &mut frames, &mut flags, None, None) }
            .map_err(|error| error_detail("IAudioCaptureClient::GetBuffer", error))?;
        let packet_bytes = frames as usize * block_align;
        let append_result = if bytes.len() + packet_bytes > hard_limit {
            Err(format!(
                "stage=bounded_memory captured_bytes={} packet_bytes={packet_bytes} hard_limit_bytes={hard_limit}",
                bytes.len()
            ))
        } else {
            if flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 != 0 {
                bytes.resize(bytes.len() + packet_bytes, 0);
                *silent_packets += 1;
            } else {
                if data.is_null() && packet_bytes > 0 {
                    unsafe { capture.ReleaseBuffer(frames) }.map_err(|error| {
                        error_detail("IAudioCaptureClient::ReleaseBuffer", error)
                    })?;
                    return Err(
                        "stage=IAudioCaptureClient::GetBuffer non-silent packet had null data"
                            .into(),
                    );
                }
                bytes.extend_from_slice(unsafe { slice::from_raw_parts(data, packet_bytes) });
            }
            *discontinuities +=
                u32::from(flags & AUDCLNT_BUFFERFLAGS_DATA_DISCONTINUITY.0 as u32 != 0);
            *packets += 1;
            Ok(())
        };
        unsafe { capture.ReleaseBuffer(frames) }
            .map_err(|error| error_detail("IAudioCaptureClient::ReleaseBuffer", error))?;
        append_result?;
    }
}

fn default_capture_device() -> ProbeResult<IMMDevice> {
    let enumerator: IMMDeviceEnumerator = stage("CoCreateInstance<MMDeviceEnumerator>", unsafe {
        CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
    })?;
    stage("IMMDeviceEnumerator::GetDefaultAudioEndpoint", unsafe {
        enumerator.GetDefaultAudioEndpoint(eCapture, eConsole)
    })
}

fn activate_client(device: &IMMDevice) -> ProbeResult<IAudioClient> {
    stage("IMMDevice::Activate<IAudioClient>", unsafe {
        device.Activate::<IAudioClient>(CLSCTX_ALL, None)
    })
}

fn get_mix_format(client: &IAudioClient) -> ProbeResult<FormatAllocation> {
    let pointer = stage("IAudioClient::GetMixFormat", unsafe {
        client.GetMixFormat()
    })?;
    if pointer.is_null() {
        return Err("stage=IAudioClient::GetMixFormat returned a null pointer".into());
    }
    Ok(FormatAllocation(pointer))
}

fn format_details(format: *const WAVEFORMATEX) -> ProbeResult<FormatDetails> {
    let base = unsafe { ptr::read_unaligned(format) };
    let format_tag = base.wFormatTag;
    let extension_size = base.cbSize;
    if format_tag as u32 != WAVE_FORMAT_EXTENSIBLE || extension_size < 22 {
        return Err(format!(
            "stage=format_validation expected WAVEFORMATEXTENSIBLE tag=0xFFFE cbSize>=22, got tag=0x{:04X} cbSize={}",
            format_tag, extension_size
        ));
    }
    let extensible = unsafe { ptr::read_unaligned(format.cast::<WAVEFORMATEXTENSIBLE>()) };
    Ok(FormatDetails {
        channels: base.nChannels,
        sample_rate: base.nSamplesPerSec,
        avg_bytes_per_second: base.nAvgBytesPerSec,
        block_align: base.nBlockAlign,
        container_bits: base.wBitsPerSample,
        valid_bits: unsafe { extensible.Samples.wValidBitsPerSample },
        subformat: extensible.SubFormat,
    })
}

fn report_format(format: *const WAVEFORMATEX, details: FormatDetails) -> ProbeResult<()> {
    let base = unsafe { ptr::read_unaligned(format) };
    let extensible = unsafe { ptr::read_unaligned(format.cast::<WAVEFORMATEXTENSIBLE>()) };
    let format_tag = base.wFormatTag;
    let extension_size = base.cbSize;
    let channel_mask = extensible.dwChannelMask;
    let subformat = extensible.SubFormat;
    let fingerprint = format_fingerprint(format)?;
    println!(
        "RAW_MIX_FORMAT ptr={format:p} bytes={} fingerprint=0x{fingerprint:016X} wFormatTag=0x{:04X} cbSize={} channels={} sample_rate_hz={} avg_bytes_per_sec={} block_align={} container_bits={} valid_bits={} channel_mask=0x{channel_mask:08X} subformat={subformat:?}",
        std::mem::size_of::<WAVEFORMATEX>() + extension_size as usize,
        format_tag,
        extension_size,
        details.channels,
        details.sample_rate,
        details.avg_bytes_per_second,
        details.block_align,
        details.container_bits,
        details.valid_bits,
    );
    Ok(())
}

fn format_fingerprint(format: *const WAVEFORMATEX) -> ProbeResult<u64> {
    let base = unsafe { ptr::read_unaligned(format) };
    let length = std::mem::size_of::<WAVEFORMATEX>() + base.cbSize as usize;
    if !(std::mem::size_of::<WAVEFORMATEX>()..=256).contains(&length) {
        return Err(format!(
            "stage=format_fingerprint invalid byte length {length}"
        ));
    }
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in unsafe { slice::from_raw_parts(format.cast::<u8>(), length) } {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    Ok(hash)
}

fn signal_levels(data: &[u8], details: FormatDetails) -> ProbeResult<(f64, f64)> {
    let sample_bytes = details.block_align as usize / details.channels as usize;
    let mut count = 0_u64;
    let mut peak = 0.0_f64;
    let mut sum_squares = 0.0_f64;
    for bytes in data.chunks_exact(sample_bytes) {
        let sample = match (details.subformat, sample_bytes) {
            (KSDATAFORMAT_SUBTYPE_IEEE_FLOAT, 4) => {
                f32::from_le_bytes(bytes.try_into().unwrap()) as f64
            }
            (KSDATAFORMAT_SUBTYPE_IEEE_FLOAT, 8) => f64::from_le_bytes(bytes.try_into().unwrap()),
            (KSDATAFORMAT_SUBTYPE_PCM, 1) => (bytes[0] as f64 - 128.0) / 128.0,
            (KSDATAFORMAT_SUBTYPE_PCM, 2) => {
                i16::from_le_bytes(bytes.try_into().unwrap()) as f64 / 32768.0
            }
            (KSDATAFORMAT_SUBTYPE_PCM, 3) => {
                let signed = i32::from_le_bytes([
                    bytes[0],
                    bytes[1],
                    bytes[2],
                    if bytes[2] & 0x80 == 0 { 0 } else { 0xff },
                ]);
                signed as f64 / 8_388_608.0
            }
            (KSDATAFORMAT_SUBTYPE_PCM, 4) => {
                i32::from_le_bytes(bytes.try_into().unwrap()) as f64 / 2_147_483_648.0
            }
            _ => {
                return Err(format!(
                "stage=signal_decode unsupported subformat={:?} bytes_per_sample={sample_bytes}",
                details.subformat
            ))
            }
        };
        if sample.is_finite() {
            peak = peak.max(sample.abs());
            sum_squares += sample * sample;
            count += 1;
        }
    }
    if count == 0 {
        return Err("stage=signal_decode capture contained no complete finite samples".into());
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

fn hresult_detail(stage: &str, result: HRESULT) -> String {
    let error = Error::from(result);
    error_detail(stage, error)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fingerprints_all_extensible_bytes() {
        let mut format = WAVEFORMATEXTENSIBLE::default();
        format.Format.wFormatTag = WAVE_FORMAT_EXTENSIBLE as u16;
        format.Format.cbSize = 22;
        format.Format.nChannels = 2;
        format.Format.nBlockAlign = 8;
        format.Format.nAvgBytesPerSec = 384_000;
        format.SubFormat = KSDATAFORMAT_SUBTYPE_IEEE_FLOAT;
        let pointer = (&format as *const WAVEFORMATEXTENSIBLE).cast::<WAVEFORMATEX>();
        let first = format_fingerprint(pointer).unwrap();
        unsafe { ptr::addr_of_mut!(format.dwChannelMask).write_unaligned(3) };
        assert_ne!(first, format_fingerprint(pointer).unwrap());
    }
}
