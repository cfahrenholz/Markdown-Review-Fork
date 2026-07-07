use serde_json::{Map, Value};
use sha2::{Digest, Sha256};

use crate::ids::{base36_timestamp, short_id};
use crate::timestamp::now_iso8601;

const VALID_STATUSES: [&str; 6] = [
    "commented", "edited", "approved", "open", "addressed", "resolved",
];

pub fn anchor_hash(prefix: &str, quote: &str, suffix: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(prefix.as_bytes());
    hasher.update(quote.as_bytes());
    hasher.update(suffix.as_bytes());
    let digest = hasher.finalize();
    format!("{:x}", digest)[..16].to_string()
}

fn normalize_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn tail_chars(value: &str, max: usize) -> String {
    let chars: Vec<char> = value.chars().collect();
    let start = chars.len().saturating_sub(max);
    chars[start..].iter().collect()
}

fn head_chars(value: &str, max: usize) -> String {
    value.chars().take(max).collect()
}

fn str_field(input: &Value, key: &str) -> String {
    input.get(key).and_then(|v| v.as_str()).unwrap_or("").to_string()
}

fn option_i64_to_value(value: Option<i64>) -> Value {
    match value {
        Some(v) => Value::from(v),
        None => Value::Null,
    }
}

/// Normalizes incoming comment data from the webview; the `anchorHash` is
/// computed from the raw (uncapped) prefix/quote/suffix.
pub fn sanitize_comment(input: &Value) -> Value {
    let now = now_iso8601();

    let start_offset = input.get("startOffset").and_then(|v| v.as_i64());
    let end_offset_raw = input.get("endOffset").and_then(|v| v.as_i64());
    let end_offset = match (start_offset, end_offset_raw) {
        (Some(s), Some(e)) if e >= s => Some(e),
        _ => None,
    };

    let comment_text = head_chars(str_field(input, "comment").trim(), 5000);

    let id = input
        .get("id")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("fb-{}", base36_timestamp()));

    let status_in = str_field(input, "status");
    let status = if VALID_STATUSES.contains(&status_in.as_str()) {
        status_in
    } else {
        "commented".to_string()
    };

    let raw_prefix = str_field(input, "prefix");
    let raw_quote = str_field(input, "quote");
    let raw_suffix = str_field(input, "suffix");

    let quote = head_chars(&raw_quote, 2000);

    let quote_preview_source = {
        let qp = str_field(input, "quotePreview");
        if !qp.is_empty() { qp } else { raw_quote.clone() }
    };
    let quote_preview = head_chars(&normalize_whitespace(&quote_preview_source), 100);

    let prefix = tail_chars(&raw_prefix, 500);
    let suffix = head_chars(&raw_suffix, 500);

    let start_line = input.get("startLine").and_then(|v| v.as_i64());
    let end_line = input.get("endLine").and_then(|v| v.as_i64());

    let created_by_raw = str_field(input, "createdBy");
    let created_by = head_chars(
        if created_by_raw.is_empty() { "reviewer" } else { &created_by_raw },
        80,
    );

    let created_at = input
        .get("createdAt")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| now.clone());

    let resolution = input.get("resolution").and_then(|v| v.as_str()).unwrap_or("").to_string();

    let hash = anchor_hash(&raw_prefix, &raw_quote, &raw_suffix);

    let mut thread_entry = Map::new();
    thread_entry.insert("id".to_string(), Value::String(short_id("th")));
    thread_entry.insert("type".to_string(), Value::String("comment".to_string()));
    thread_entry.insert("createdAt".to_string(), Value::String(created_at.clone()));
    thread_entry.insert("createdBy".to_string(), Value::String(created_by.clone()));
    thread_entry.insert("body".to_string(), Value::String(comment_text.clone()));

    let mut map = Map::new();
    map.insert("id".to_string(), Value::String(id));
    map.insert("status".to_string(), Value::String(status));
    map.insert("quote".to_string(), Value::String(quote));
    map.insert("quotePreview".to_string(), Value::String(quote_preview));
    map.insert("prefix".to_string(), Value::String(prefix));
    map.insert("suffix".to_string(), Value::String(suffix));
    map.insert("startLine".to_string(), option_i64_to_value(start_line));
    map.insert("endLine".to_string(), option_i64_to_value(end_line));
    map.insert("startOffset".to_string(), option_i64_to_value(start_offset));
    map.insert("endOffset".to_string(), option_i64_to_value(end_offset));
    map.insert(
        "contextLength".to_string(),
        option_i64_to_value(input.get("contextLength").and_then(|v| v.as_i64())),
    );
    map.insert("anchorHash".to_string(), Value::String(hash));
    map.insert("comment".to_string(), Value::String(comment_text));
    map.insert("createdBy".to_string(), Value::String(created_by));
    map.insert("createdAt".to_string(), Value::String(created_at));
    map.insert("updatedAt".to_string(), Value::String(now));
    map.insert("resolution".to_string(), Value::String(resolution));
    map.insert("thread".to_string(), Value::Array(vec![Value::Object(thread_entry)]));

    Value::Object(map)
}
