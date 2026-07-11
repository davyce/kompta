#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$ROOT_DIR/kompta-apple/Kompta.xcodeproj"
SCHEME="Kompta"
CONFIGURATION="Debug"
BUNDLE_ID="com.adansonia.kompta"

# ENABLE_DEBUG_DYLIB=NO is required: Xcode 16's default debug-dylib build produces a thin
# launcher stub that only runs when launched FROM Xcode. Launched via `simctl` it aborts
# ("entry point not found in debug dylib") → SBMainWorkspace denial. NO yields a normal
# monolithic binary that launches headlessly.
echo "==> Build iOS Simulator: $SCHEME"
xcodebuild \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -destination "generic/platform=iOS Simulator" \
  -configuration "$CONFIGURATION" \
  ENABLE_DEBUG_DYLIB=NO \
  build

PRODUCTS_DIR="$(
  xcodebuild \
    -project "$PROJECT" \
    -scheme "$SCHEME" \
    -destination "generic/platform=iOS Simulator" \
    -configuration "$CONFIGURATION" \
    ENABLE_DEBUG_DYLIB=NO \
    -showBuildSettings 2>/dev/null |
    awk -F'= ' '/BUILT_PRODUCTS_DIR =/ { print $2; exit }'
)"
APP_PATH="$PRODUCTS_DIR/KOMPTA.app"

if [[ ! -d "$APP_PATH" ]]; then
  echo "App iOS introuvable: $APP_PATH" >&2
  exit 1
fi

DEVICE_ID="${1:-}"
if [[ -z "$DEVICE_ID" ]]; then
  DEVICE_ID="$(
    xcrun simctl list devices available |
      awk -F '[()]' '/iPhone/ && ($0 ~ /Booted|Shutdown/) { print $2; exit }'
  )"
fi

if [[ -z "$DEVICE_ID" ]]; then
  echo "Aucun simulateur iPhone disponible. Liste actuelle:" >&2
  xcrun simctl list devices available >&2
  exit 1
fi

echo "==> Boot iPhone Simulator: $DEVICE_ID"
xcrun simctl boot "$DEVICE_ID" >/dev/null 2>&1 || true
xcrun simctl bootstatus "$DEVICE_ID" -b
open -a Simulator

echo "==> Install: $APP_PATH"
xcrun simctl install "$DEVICE_ID" "$APP_PATH"

echo "==> Launch: $BUNDLE_ID"
xcrun simctl launch "$DEVICE_ID" "$BUNDLE_ID"

