use serde::Serialize;
use serde_json::{json, Value};
use std::fs;
use std::path::Path;
use tauri::{Manager, WebviewWindow};

use crate::document::{display_name, feedback_document, file_mtime_ms, write_feedback};
use crate::editor_markdown::parse_editor_markdown;
use crate::ids::short_id;
use crate::sanitize::sanitize_comment;
use crate::state::{AppState, DocPaths};
use crate::thread::legacy_thread;
use crate::timestamp::now_iso8601;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentPayload {
    pub file: String,
    pub absolute_path: String,
    pub feedback_path: String,
    pub document_mtime_ms: Option<f64>,
    pub feedback_mtime_ms: Option<f64>,
    pub markdown: String,
    pub feedback: Value,
}

fn doc_paths(window: &WebviewWindow) -> Result<DocPaths, String> {
    window
        .state::<AppState>()
        .paths_for(window.label())
        .ok_or_else(|| "No document associated with this window".to_string())
}

fn load_payload(target_path: &Path, feedback_path: &Path) -> Result<DocumentPayload, String> {
    let markdown = fs::read_to_string(target_path).map_err(|e| e.to_string())?;
    Ok(DocumentPayload {
        file: display_name(target_path),
        absolute_path: target_path.to_string_lossy().to_string(),
        feedback_path: feedback_path.to_string_lossy().to_string(),
        document_mtime_ms: file_mtime_ms(target_path),
        feedback_mtime_ms: file_mtime_ms(feedback_path),
        markdown,
        feedback: feedback_document(feedback_path, target_path),
    })
}

#[tauri::command]
pub fn get_document(window: WebviewWindow) -> Result<DocumentPayload, String> {
    let paths = doc_paths(&window)?;
    load_payload(&paths.target_path, &paths.feedback_path)
}

#[tauri::command]
pub fn save_comment(window: WebviewWindow, input: Value) -> Result<Value, String> {
    let paths = doc_paths(&window)?;
    let comment = sanitize_comment(&input);
    if comment.get("comment").and_then(|v| v.as_str()).unwrap_or("").is_empty() {
        return Err("Comment text is required".to_string());
    }

    let mut doc = feedback_document(&paths.feedback_path, &paths.target_path);
    let id = comment.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let comments = doc
        .get_mut("comments")
        .and_then(|c| c.as_array_mut())
        .ok_or_else(|| "Malformed feedback document".to_string())?;

    let existing_index = comments
        .iter()
        .position(|c| c.get("id").and_then(|v| v.as_str()) == Some(id.as_str()));

    if let Some(index) = existing_index {
        if let (Some(existing_obj), Some(new_obj)) = (comments[index].as_object_mut(), comment.as_object()) {
            for (key, value) in new_obj {
                existing_obj.insert(key.clone(), value.clone());
            }
            existing_obj.insert("updatedAt".to_string(), json!(now_iso8601()));
        }
    } else {
        comments.push(comment);
    }

    write_feedback(&mut doc, &paths.target_path, &paths.feedback_path)?;
    Ok(json!({ "feedback": doc }))
}

#[tauri::command]
pub fn save_editor(window: WebviewWindow, markdown_with_markers: String) -> Result<DocumentPayload, String> {
    let paths = doc_paths(&window)?;
    let mut doc = feedback_document(&paths.feedback_path, &paths.target_path);
    let markdown = parse_editor_markdown(&markdown_with_markers, &mut doc);
    fs::write(&paths.target_path, &markdown).map_err(|e| e.to_string())?;
    write_feedback(&mut doc, &paths.target_path, &paths.feedback_path)?;

    Ok(DocumentPayload {
        file: display_name(&paths.target_path),
        absolute_path: paths.target_path.to_string_lossy().to_string(),
        feedback_path: paths.feedback_path.to_string_lossy().to_string(),
        document_mtime_ms: file_mtime_ms(&paths.target_path),
        feedback_mtime_ms: file_mtime_ms(&paths.feedback_path),
        markdown,
        feedback: doc,
    })
}

#[tauri::command]
pub fn patch_comment(window: WebviewWindow, id: String, patch: Value) -> Result<Value, String> {
    let paths = doc_paths(&window)?;
    let mut doc = feedback_document(&paths.feedback_path, &paths.target_path);
    let now = now_iso8601();

    let comments = doc
        .get_mut("comments")
        .and_then(|c| c.as_array_mut())
        .ok_or_else(|| "Malformed feedback document".to_string())?;
    let item = comments
        .iter_mut()
        .find(|c| c.get("id").and_then(|v| v.as_str()) == Some(id.as_str()))
        .ok_or_else(|| "Comment not found".to_string())?;

    if let Some(status) = patch.get("status").and_then(|v| v.as_str()) {
        item["status"] = json!(status);
    }
    if let Some(comment_text) = patch.get("comment").and_then(|v| v.as_str()) {
        item["comment"] = json!(comment_text.trim());
    }
    if let Some(resolution) = patch.get("resolution").and_then(|v| v.as_str()) {
        item["resolution"] = json!(resolution.trim());
    }
    if let Some(follow_up_text) = patch.get("followUp").and_then(|v| v.as_str()) {
        let follow_up_text = follow_up_text.trim().to_string();

        if !item.get("thread").map(|t| t.is_array()).unwrap_or(false) {
            item["thread"] = json!(legacy_thread(item));
        }
        if !item.get("followUps").map(|v| v.is_array()).unwrap_or(false) {
            item["followUps"] = json!([]);
        }

        let follow_up_id = short_id("fu");
        let follow_up = json!({
            "id": follow_up_id.clone(),
            "createdAt": now.clone(),
            "createdBy": "reviewer",
            "comment": follow_up_text.clone(),
        });

        item["followUps"].as_array_mut().unwrap().push(follow_up);
        item["thread"].as_array_mut().unwrap().push(json!({
            "id": follow_up_id,
            "type": "steer",
            "createdAt": now.clone(),
            "createdBy": "reviewer",
            "body": follow_up_text,
        }));
    }
    item["updatedAt"] = json!(now);

    write_feedback(&mut doc, &paths.target_path, &paths.feedback_path)?;
    Ok(json!({ "feedback": doc }))
}
