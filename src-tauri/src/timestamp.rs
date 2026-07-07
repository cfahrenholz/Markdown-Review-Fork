use std::time::{SystemTime, UNIX_EPOCH};
use time::OffsetDateTime;

/// Matches JS `new Date().toISOString()`: fixed 3-digit milliseconds, "Z" suffix.
pub fn now_iso8601() -> String {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let millis_total = elapsed.as_millis();
    let secs = (millis_total / 1000) as i64;
    let millis = (millis_total % 1000) as u32;
    let datetime = OffsetDateTime::from_unix_timestamp(secs).unwrap_or(OffsetDateTime::UNIX_EPOCH);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        datetime.year(),
        u8::from(datetime.month()),
        datetime.day(),
        datetime.hour(),
        datetime.minute(),
        datetime.second(),
        millis
    )
}
