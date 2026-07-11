#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$ROOT_DIR/kompta-apple/Kompta.xcodeproj"
SCHEME="KomptaMac"
CONFIGURATION="Debug"

echo "==> Build macOS desktop: $SCHEME"
xcodebuild \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -destination "platform=macOS" \
  -configuration "$CONFIGURATION" \
  build

PRODUCTS_DIR="$(
  xcodebuild \
    -project "$PROJECT" \
    -scheme "$SCHEME" \
    -destination "platform=macOS" \
    -configuration "$CONFIGURATION" \
    -showBuildSettings 2>/dev/null |
    awk -F'= ' '/BUILT_PRODUCTS_DIR =/ { print $2; exit }'
)"
APP_PATH="$PRODUCTS_DIR/KOMPTA.app"

if [[ ! -d "$APP_PATH" ]]; then
  echo "App macOS introuvable: $APP_PATH" >&2
  exit 1
fi

echo "==> Open desktop app: $APP_PATH"
open "$APP_PATH"

