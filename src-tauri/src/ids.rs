use std::time::{SystemTime, UNIX_EPOCH};

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn to_base36(mut n: u128) -> String {
    if n == 0 {
        return "0".to_string();
    }
    const DIGITS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let mut buf = Vec::new();
    while n > 0 {
        buf.push(DIGITS[(n % 36) as usize]);
        n /= 36;
    }
    buf.reverse();
    String::from_utf8(buf).unwrap()
}

/// Not byte-identical to JS's `Date.now().toString(36)`, only required to be
/// unique and stable in the same style (base36 timestamp).
pub fn base36_timestamp() -> String {
    to_base36(now_millis())
}

pub fn short_id(prefix: &str) -> String {
    format!("{}-{}", prefix, base36_timestamp())
}
