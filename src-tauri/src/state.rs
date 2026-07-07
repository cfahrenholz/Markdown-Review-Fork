use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Clone)]
pub struct DocPaths {
    pub target_path: PathBuf,
    pub feedback_path: PathBuf,
}

/// Window-per-file model: each Tauri window is responsible for exactly one
/// markdown file, looked up by window label.
#[derive(Default)]
pub struct AppState {
    windows: Mutex<HashMap<String, DocPaths>>,
    open_docs: Mutex<HashMap<PathBuf, String>>,
}

impl AppState {
    pub fn register(&self, label: String, target_path: PathBuf, feedback_path: PathBuf) {
        self.open_docs.lock().unwrap().insert(target_path.clone(), label.clone());
        self.windows.lock().unwrap().insert(label, DocPaths { target_path, feedback_path });
    }

    pub fn unregister(&self, label: &str) {
        if let Some(paths) = self.windows.lock().unwrap().remove(label) {
            self.open_docs.lock().unwrap().remove(&paths.target_path);
        }
    }

    pub fn paths_for(&self, label: &str) -> Option<DocPaths> {
        self.windows.lock().unwrap().get(label).cloned()
    }

    pub fn label_for_path(&self, path: &PathBuf) -> Option<String> {
        self.open_docs.lock().unwrap().get(path).cloned()
    }

    pub fn has_open_docs(&self) -> bool {
        !self.open_docs.lock().unwrap().is_empty()
    }
}
