fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "load_workspace",
            "open_document",
            "save_document",
            "delete_document",
            "list_trash",
            "restore_deleted_document",
            "list_document_revisions",
            "restore_document_revision",
            "add_dictionary_term",
            "remove_dictionary_term",
            "start_dictation",
            "stop_dictation",
            "cancel_dictation",
            "transform_status",
            "generate_transform",
            "cancel_transform",
        ]),
    ))
    .expect("failed to build REDLINE");
}
