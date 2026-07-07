use regex::Regex;
use serde_json::{json, Value};
use std::collections::HashMap;

use crate::document::line_number_from_offset;
use crate::sanitize::anchor_hash;
use crate::timestamp::now_iso8601;

fn normalize_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Strips `⟦rb:start:<id>⟧` / `⟦rb:end:<id>⟧` marker tokens, recomputes each
/// comment's anchor from the resulting clean text, and returns the clean
/// markdown.
///
/// Indexing is done on `char` (Unicode scalar) counts rather than bytes, to
/// approximate JS's UTF-16-code-unit-based `.length`/`.slice()`. This is an
/// exact match for BMP-only text (the expected case here); astral-plane
/// characters (rare emoji) are a known, accepted divergence.
pub fn parse_editor_markdown(markdown_with_markers: &str, doc: &mut Value) -> String {
    let token_pattern = Regex::new(r"⟦rb:(start|end):([A-Za-z0-9_-]+)⟧").unwrap();

    let mut positions: HashMap<String, (Option<usize>, Option<usize>)> = HashMap::new();
    let mut clean_chars: Vec<char> = Vec::with_capacity(markdown_with_markers.len());
    let mut last_index = 0usize;

    for m in token_pattern.captures_iter(markdown_with_markers) {
        let whole = m.get(0).unwrap();
        let kind = m.get(1).unwrap().as_str();
        let id = m.get(2).unwrap().as_str();

        clean_chars.extend(markdown_with_markers[last_index..whole.start()].chars());

        let entry = positions.entry(id.to_string()).or_insert((None, None));
        if kind == "start" {
            entry.0 = Some(clean_chars.len());
        } else {
            entry.1 = Some(clean_chars.len());
        }
        last_index = whole.end();
    }
    clean_chars.extend(markdown_with_markers[last_index..].chars());

    let clean: String = clean_chars.iter().collect();
    let now = now_iso8601();

    if let Some(comments) = doc.get_mut("comments").and_then(|c| c.as_array_mut()) {
        for comment in comments.iter_mut() {
            let id = match comment.get("id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => continue,
            };
            let (start, end) = match positions.get(&id) {
                Some(&(Some(s), Some(e))) if e >= s => (s, e),
                _ => continue,
            };

            let quote_full: String = clean_chars[start..end].iter().collect();
            let quote_capped: String = quote_full.chars().take(2000).collect();
            let preview_capped: String = normalize_whitespace(&quote_full).chars().take(100).collect();

            let prefix_start = start.saturating_sub(500);
            let prefix: String = clean_chars[prefix_start..start].iter().collect();
            let suffix_end = (end + 500).min(clean_chars.len());
            let suffix: String = clean_chars[end..suffix_end].iter().collect();

            let start_line = line_number_from_offset(&clean, start);
            let end_line = line_number_from_offset(&clean, end);
            let hash = anchor_hash(&prefix, &quote_full, &suffix);

            comment["quote"] = json!(quote_capped);
            comment["quotePreview"] = json!(preview_capped);
            comment["prefix"] = json!(prefix);
            comment["suffix"] = json!(suffix);
            comment["startOffset"] = json!(start);
            comment["endOffset"] = json!(end);
            comment["startLine"] = json!(start_line);
            comment["endLine"] = json!(end_line);
            comment["anchorHash"] = json!(hash);
            comment["updatedAt"] = json!(now);

            let status_is_edited = comment.get("status").and_then(|v| v.as_str()) == Some("edited");
            let has_applied = comment.get("applied").map(|a| a.is_object()).unwrap_or(false);
            if status_is_edited && has_applied {
                let applied = comment.get_mut("applied").unwrap();
                applied["newQuote"] = json!(quote_capped);
                applied["newStartLine"] = json!(start_line);
                applied["newEndLine"] = json!(end_line);
                applied["newStartOffset"] = json!(start);
                applied["newEndOffset"] = json!(end);
                let already_applied = applied.get("appliedAt").map(|v| !v.is_null()).unwrap_or(false);
                if !already_applied {
                    applied["appliedAt"] = json!(now);
                }
            }
        }
    }

    clean
}
