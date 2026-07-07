mod commands;
mod document;
mod editor_markdown;
mod ids;
mod sanitize;
mod state;
mod thread;
mod timestamp;
mod window;

use std::path::PathBuf;
use std::time::Duration;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_document,
            commands::save_comment,
            commands::save_editor,
            commands::patch_comment,
        ])
        .setup(|app| {
            let args: Vec<String> = std::env::args().collect();
            let file_arg = args
                .iter()
                .skip(1)
                .find(|a| a.to_lowercase().ends_with(".md"));

            match file_arg {
                Some(path) => {
                    let path_buf = PathBuf::from(path);
                    if let Err(err) = window::open_document_window(&app.handle(), path_buf) {
                        eprintln!("Failed to open document window: {err}");
                        app.handle().exit(1);
                    }
                }
                None => {}
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Ready = event {
                let app = app_handle.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_millis(250));
                    if app.state::<AppState>().has_open_docs() {
                        return;
                    }
                    window::open_with_file_picker(app);
                });
            }

            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let tauri::RunEvent::Opened { urls } = event {
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        if let Err(err) = window::open_document_window(app_handle, path) {
                            eprintln!("Failed to open document window: {err}");
                        }
                    }
                }
            }
        });
}
