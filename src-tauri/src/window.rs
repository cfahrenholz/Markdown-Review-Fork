use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;

use crate::state::AppState;

pub fn window_label_for(path: &Path) -> String {
    let mut hasher = Sha256::new();
    hasher.update(path.to_string_lossy().as_bytes());
    let digest = hasher.finalize();
    let hex = format!("{:x}", digest);
    format!("doc-{}", &hex[..16])
}

pub fn feedback_path_for(target: &Path) -> PathBuf {
    let mut name = target.as_os_str().to_os_string();
    name.push(".feedback.json");
    PathBuf::from(name)
}

/// Opens a window for `path`, or focuses the existing window if that exact
/// (canonical) file is already open. Each document gets one window.
pub fn open_document_window(app: &AppHandle, path: PathBuf) -> Result<(), String> {
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("{}: {}", path.display(), e))?;
    let state = app.state::<AppState>();

    if let Some(existing_label) = state.label_for_path(&canonical) {
        if let Some(window) = app.get_webview_window(&existing_label) {
            let _ = window.set_focus();
            let _ = window.unminimize();
            return Ok(());
        }
        state.unregister(&existing_label);
    }

    let label = window_label_for(&canonical);
    let feedback_path = feedback_path_for(&canonical);
    state.register(label.clone(), canonical.clone(), feedback_path);

    let title = format!(
        "Markdown Review \u{2013} {}",
        canonical
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default()
    );

    let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html".into()))
        .title(title)
        .inner_size(1200.0, 800.0)
        .build()
        .map_err(|e| e.to_string())?;

    let app_handle = app.clone();
    let label_for_close = label.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            app_handle.state::<AppState>().unregister(&label_for_close);
        }
    });

    Ok(())
}

/// Fallback when the app is launched with no file (e.g. bare Dock-icon
/// click): show a native "choose a .md file" dialog instead of a blank
/// window.
pub fn open_with_file_picker(app: AppHandle) {
    app.dialog()
        .file()
        .add_filter("Markdown", &["md"])
        .pick_file(move |file_path| {
            let Some(file_path) = file_path else { return };
            let Some(path) = file_path.into_path().ok() else { return };
            if let Err(err) = open_document_window(&app, path) {
                eprintln!("Failed to open document window: {err}");
            }
        });
}
