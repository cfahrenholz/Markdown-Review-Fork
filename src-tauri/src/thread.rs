use serde_json::{json, Value};

/// Reconstructs a thread array from legacy comment/resolution/followUps fields
/// when `item.thread` is absent.
pub fn legacy_thread(item: &Value) -> Vec<Value> {
    let mut thread = Vec::new();
    let id = item.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();

    let comment = item.get("comment").and_then(|v| v.as_str()).unwrap_or("");
    if !comment.is_empty() {
        let created_by = item
            .get("createdBy")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .unwrap_or("reviewer");
        thread.push(json!({
            "id": format!("{}-comment", id),
            "type": "comment",
            "createdAt": item.get("createdAt").cloned().unwrap_or(Value::Null),
            "createdBy": created_by,
            "body": comment,
        }));
    }

    let resolution = item.get("resolution").and_then(|v| v.as_str()).unwrap_or("");
    if !resolution.is_empty() {
        thread.push(json!({
            "id": format!("{}-redaction", id),
            "type": "redaction",
            "createdAt": item.get("updatedAt").cloned().unwrap_or(Value::Null),
            "createdBy": "codex",
            "body": resolution,
        }));
    }

    if let Some(follow_ups) = item.get("followUps").and_then(|v| v.as_array()) {
        for follow_up in follow_ups {
            let created_by = follow_up
                .get("createdBy")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .unwrap_or("reviewer");
            thread.push(json!({
                "id": follow_up.get("id").cloned().unwrap_or(Value::Null),
                "type": "steer",
                "createdAt": follow_up.get("createdAt").cloned().unwrap_or(Value::Null),
                "createdBy": created_by,
                "body": follow_up.get("comment").cloned().unwrap_or(Value::Null),
            }));
        }
    }

    thread
}
