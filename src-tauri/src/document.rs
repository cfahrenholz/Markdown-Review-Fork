use serde_json::{json, Value};
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

use crate::timestamp::now_iso8601;

pub fn feedback_document(feedback_path: &Path, target_path: &Path) -> Value {
    if !feedback_path.exists() {
        return json!({
            "version": 1,
            "file": display_name(target_path),
            "sourcePath": target_path.to_string_lossy(),
            "comments": [],
            "updatedAt": Value::Null,
        });
    }

    let raw = fs::read_to_string(feedback_path).unwrap_or_default();
    let mut parsed: Value = serde_json::from_str(&raw).unwrap_or_else(|_| json!({}));
    if !parsed.get("comments").map(|c| c.is_array()).unwrap_or(false) {
        parsed["comments"] = json!([]);
    }
    parsed
}

pub fn file_mtime_ms(path: &Path) -> Option<f64> {
    let metadata = fs::metadata(path).ok()?;
    let modified = metadata.modified().ok()?;
    let duration = modified.duration_since(UNIX_EPOCH).ok()?;
    Some(duration.as_secs_f64() * 1000.0)
}

pub fn write_feedback(doc: &mut Value, target_path: &Path, feedback_path: &Path) -> Result<(), String> {
    doc["version"] = json!(1);
    doc["file"] = json!(display_name(target_path));
    doc["sourcePath"] = json!(target_path.to_string_lossy());
    doc["updatedAt"] = json!(now_iso8601());
    let body = serde_json::to_string_pretty(doc).map_err(|e| e.to_string())?;
    fs::write(feedback_path, format!("{}\n", body)).map_err(|e| e.to_string())
}

pub fn display_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}

/// Matches JS `text.slice(0, offset).split(/\r?\n/).length`: each `\n`
/// (optionally preceded by `\r`) is exactly one split point.
pub fn line_number_from_offset(text: &str, char_offset: usize) -> usize {
    let prefix: String = text.chars().take(char_offset).collect();
    prefix.matches('\n').count() + 1
}
