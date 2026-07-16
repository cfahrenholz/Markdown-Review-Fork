# Windows – Setup & Build Instructions

This document describes how to build and run **Markdown Review** on Windows.
The app core (Tauri + Rust) is already cross-platform; only the original shell
scripts were macOS-specific. The Node.js scripts in `scripts/` replace them for
Windows (and Linux).

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| [Rust / cargo](https://rustup.rs/) | stable | Install via rustup |
| [cargo-tauri CLI](https://tauri.app/start/) | 2.x | `cargo install tauri-cli --version "^2"` |
| [Node.js](https://nodejs.org/) | ≥ 18 | Only needed for `npm run build/start` |
| [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) | any | Usually pre-installed on Windows 10/11 |
| [NSIS](https://nsis.sourceforge.io/) | 3.x | Required to produce an installer; [install guide](https://tauri.app/distribute/windows-installer/) |

> **Tip:** The Tauri prerequisites page has a detailed Windows checklist:
> <https://tauri.app/start/prerequisites/>

## Build

```powershell
# Clone the repo
git clone https://github.com/cfahrenholz/Markdown-Review.git
cd Markdown-Review

# Build the release installer
npm run build
# or directly:
node scripts/build.mjs
```

The script runs `cargo tauri build` without a hardcoded target so it builds for
the host architecture automatically (x86_64 or ARM64).

Build artifacts are written to `dist/`:

| File | Description |
|------|-------------|
| `Markdown Review_<ver>_x64-setup.exe` | NSIS installer (recommended) |
| `Markdown Review_<ver>_x64.msi` | MSI installer |
| `markdown-review.exe` | Standalone binary (no installer) |

## Debug build

```powershell
node scripts/build.mjs --debug
# or
npm run build:debug
```

## Start

After a successful build:

```powershell
# Open the file-picker dialog
node scripts/start.mjs

# Open a specific Markdown file
node scripts/start.mjs path\to\file.md
```

If no bundle exists in `dist/` yet, the script falls back to `cargo run`
automatically (development mode).

## macOS users

Nothing changes for macOS. Use the existing scripts as before:

```bash
./build-mac.sh
./markdown-review.sh "path/to/file.md"
```

The new `npm run build` / `npm run start` scripts also work on macOS and Linux
as a cross-platform alternative.

## Troubleshooting

- **`cargo` not found** – install Rust via rustup and restart PowerShell/Terminal:
  ```powershell
  winget install Rustlang.Rustup
  cargo --version
  ```
- **`cargo tauri` not found** – install the CLI:
  ```powershell
  cargo install tauri-cli --version "^2"
  ```
- **WebView2 missing** – download the Evergreen Bootstrapper from Microsoft and
  run it, or let the NSIS installer handle it automatically.
- **NSIS not found during build** – install NSIS and make sure it is on `PATH`.
- **Icon missing** – the repository already ships `src-tauri/icons/icon.ico` and
  the Square\*Logo.png assets required by Windows bundles.
