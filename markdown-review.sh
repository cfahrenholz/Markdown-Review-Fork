#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CALLER_DIR="$(pwd)"
APP_BUNDLE="$SCRIPT_DIR/dist/Markdown Review.app"

ARGS=()
if [[ $# -gt 0 ]]; then
  TARGET="$1"
  shift
  if [[ "$TARGET" != /* ]]; then
    TARGET="$CALLER_DIR/$TARGET"
  fi
  ARGS+=("$TARGET")
fi
ARGS+=("$@")

if [[ -d "$APP_BUNDLE" ]]; then
  open -na "$APP_BUNDLE" --args "${ARGS[@]}"
else
  cd "$SCRIPT_DIR/src-tauri"
  cargo run -- "${ARGS[@]}"
fi
