fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("failed to run REDLINE WebView2 capture probe");
}
