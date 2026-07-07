#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"
PROFILE="release"
TARGET="aarch64-apple-darwin"
CARGO_TAURI_ARGS=()

if [[ "${1:-}" == "--debug" ]]; then
  PROFILE="debug"
  CARGO_TAURI_ARGS+=(--debug)
fi

cd "$SCRIPT_DIR/src-tauri"
if [[ ${#CARGO_TAURI_ARGS[@]} -gt 0 ]]; then
  cargo tauri build --target "$TARGET" "${CARGO_TAURI_ARGS[@]}"
else
  cargo tauri build --target "$TARGET"
fi

BUNDLE_DIR="target/$TARGET/$PROFILE/bundle/macos"
for app in "$BUNDLE_DIR"/*.app; do
  /usr/libexec/PlistBuddy -c "Delete :LSRequiresCarbon" "$app/Contents/Info.plist" 2>/dev/null || true
done

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"
cp -R "$BUNDLE_DIR"/*.app "$DIST_DIR/"

DMG_DIR="target/$PROFILE/bundle/dmg"
if compgen -G "$DMG_DIR"/*.dmg > /dev/null; then
  cp "$DMG_DIR"/*.dmg "$DIST_DIR/"
fi

echo "App liegt in: $DIST_DIR"
