use std::fs;

use tauri::{Manager, State, ipc::InvokeBody};

use crate::{
    CommandResult, DocumentStore,
    dictation::{CaptureInfo, DictationService, SpeechTranscript},
    local_ai::LocalAiGate,
    transform::{
        MODEL_FILE, TransformRequest, TransformResponse, TransformService, TransformStatus,
    },
};

#[tauri::command]
fn start_dictation(
    session_id: String,
    device_name: String,
    sample_rate: u32,
    service: State<'_, DictationService>,
) -> CommandResult<CaptureInfo> {
    service.start(session_id, device_name, sample_rate)
}

#[tauri::command]
async fn stop_dictation(
    request: tauri::ipc::Request<'_>,
    service: State<'_, DictationService>,
) -> CommandResult<SpeechTranscript> {
    let header = |name: &str| {
        request
            .headers()
            .get(name)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned)
            .ok_or_else(|| format!("Missing dictation IPC header: {name}."))
    };
    let session_id = header("x-redline-session-id")?;
    let sample_rate = header("x-redline-sample-rate")?
        .parse::<u32>()
        .map_err(|_| "Dictation IPC sample rate is invalid.".to_owned())?;
    let timed_out = match header("x-redline-timed-out")?.as_str() {
        "true" => true,
        "false" => false,
        _ => return Err("Dictation IPC timeout state is invalid.".into()),
    };
    let InvokeBody::Raw(pcm) = request.body() else {
        return Err("Dictation audio must use raw binary IPC.".into());
    };
    let pcm = pcm.clone();
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        service.stop(session_id, sample_rate, timed_out, pcm)
    })
    .await
    .map_err(|error| format!("Local transcription task failed: {error}"))?
}

#[tauri::command]
fn cancel_dictation(session_id: String, service: State<'_, DictationService>) -> CommandResult<()> {
    service.cancel(session_id)
}

#[tauri::command]
fn transform_status(service: State<'_, TransformService>) -> TransformStatus {
    service.status()
}

#[tauri::command]
async fn generate_transform(
    request: TransformRequest,
    service: State<'_, TransformService>,
) -> CommandResult<TransformResponse> {
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.generate(request))
        .await
        .map_err(|error| format!("Local Transform task failed: {error}"))?
}

#[tauri::command]
fn cancel_transform(request_id: String, service: State<'_, TransformService>) -> CommandResult<()> {
    service.cancel(&request_id)
}

pub(crate) fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let directory = app.path().app_local_data_dir()?;
            fs::create_dir_all(&directory)?;
            app.manage(DocumentStore::open(&directory.join("redline.sqlite3"))?);
            let gate = LocalAiGate::default();
            let whisper_model = app.path().resolve(
                "resources/models/ggml-base.en.bin",
                tauri::path::BaseDirectory::Resource,
            )?;
            let bundled_transform_model = app.path().resolve(
                format!("resources/models/{MODEL_FILE}"),
                tauri::path::BaseDirectory::Resource,
            )?;
            let optional_transform_model = directory.join("models").join(MODEL_FILE);
            app.manage(DictationService::new(whisper_model, gate.clone()));
            app.manage(TransformService::new(
                bundled_transform_model,
                optional_transform_model,
                gate,
            ));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            crate::load_workspace,
            crate::open_document,
            crate::save_document,
            crate::delete_document,
            crate::list_trash,
            crate::restore_deleted_document,
            crate::list_document_revisions,
            crate::restore_document_revision,
            crate::add_dictionary_term,
            crate::remove_dictionary_term,
            start_dictation,
            stop_dictation,
            cancel_dictation,
            transform_status,
            generate_transform,
            cancel_transform,
        ])
        .run(tauri::generate_context!())
        .expect("error while running REDLINE");
}
