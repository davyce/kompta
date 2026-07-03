# KOMPTA Desktop (Windows / Linux)

Native desktop shell for KOMPTA, built with [Tauri v2](https://v2.tauri.app/). It wraps
the existing `../frontend` React + TypeScript + Vite app — no code is duplicated, the
Tauri window simply loads the same web app bundle used for `kompta0.com`.

macOS and iOS already have dedicated native SwiftUI apps in `../kompta-apple/` — this
project targets Windows and Linux only (though it also runs on macOS, which is useful
for local development/testing since Tauri's abstraction is cross-platform).

## Prerequisites

- Node.js (already required for `../frontend`)
- Rust toolchain (`rustup`, stable channel) — https://rustup.rs
- Platform build dependencies for Tauri:
  - **Linux**: `webkit2gtk-4.1`, `libayatana-appindicator3`, build-essential, etc.
    See https://v2.tauri.app/start/prerequisites/#linux
  - **Windows**: Microsoft C++ Build Tools + WebView2 (preinstalled on Windows 11).
    See https://v2.tauri.app/start/prerequisites/#windows
  - **macOS**: Xcode command line tools (`xcode-select --install`).

## Setup

```bash
cd kompta-desktop
npm install
```

## Development

```bash
npm run dev
# runs `tauri dev`, which starts `../frontend`'s Vite dev server (port 3001)
# and opens it in a native window with hot-reload.
```

Dev mode talks to the local backend the same way the web app does (relative `/api`,
proxied by Vite to `http://127.0.0.1:8010`).

## Production build

```bash
npm run build
# runs `tauri build`, which:
#   1. builds ../frontend with `vite build --mode desktop`
#      (uses ../frontend/.env.desktop → VITE_API_URL=https://kompta0.com/api,
#      since the packaged app has no same-origin reverse proxy the way
#      kompta0.com does for the web build's relative "/api")
#   2. compiles the Rust/Tauri shell in release mode
#   3. bundles a native installer for the current platform
#      (.dmg/.app on macOS, .msi/.exe on Windows, .deb/.AppImage on Linux)
```

Windows and Linux installers must be built on (or cross-compiled for) their
respective target OS / CI — this repo does not attempt cross-compilation from macOS.
A macOS build is a useful local smoke test since the Tauri config and Rust shell code
are the same across all three platforms.

Build artifacts land in `src-tauri/target/release/bundle/`.

## App identity

- Identifier: `com.adansonia.kompta.desktop`
- Product name / window title: `KOMPTA`
- Icons: generated from `../backend/app/static/kompta-logo.png` via
  `npx tauri icon <path>` into `src-tauri/icons/`.

## Native niceties already wired up

- System tray icon with "Afficher KOMPTA" / "Quitter" menu (`src-tauri/src/lib.rs`)
- Native OS notifications, clipboard, dialog, filesystem and HTTP plugins
- Window defaults: 1280×800, resizable, min size 900×600, centered on launch
- Content-Security-Policy restricted to `kompta0.com` (see `src-tauri/tauri.conf.json`)
