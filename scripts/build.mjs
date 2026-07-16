#!/usr/bin/env node
/**
 * Cross-platform build script for Markdown Review.
 *
 * Runs `cargo tauri build` without a hardcoded --target so the toolchain
 * picks the correct target for the current platform automatically.
 *
 * macOS  → copies .app bundle (and .dmg if produced) to dist/
 * Windows → copies NSIS installer, MSI installer, and the raw .exe to dist/
 * Linux   → copies binary and any AppImage/.deb to dist/
 *
 * Usage:
 *   node scripts/build.mjs           # release build
 *   node scripts/build.mjs --debug   # debug build
 */

import { spawnSync } from 'child_process';
import { cpSync, mkdirSync, rmSync, existsSync, readdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { platform } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC_TAURI = join(ROOT, 'src-tauri');
const DIST = join(ROOT, 'dist');

const isDebug = process.argv.includes('--debug');
const profile = isDebug ? 'debug' : 'release';
const os = platform();

const cargoArgs = ['tauri', 'build'];
if (isDebug) cargoArgs.push('--debug');

console.log(`Building Markdown Review for platform: ${os} (profile: ${profile})`);

const result = spawnSync('cargo', cargoArgs, {
  cwd: SRC_TAURI,
  stdio: 'inherit',
  shell: false,
});

if (result.error) {
  if (result.error.code === 'ENOENT') {
    console.error('Build failed: `cargo` was not found in PATH.');
    console.error('Install Rust via https://rustup.rs/ and restart your terminal.');
    console.error('Then install cargo-tauri: cargo install tauri-cli --version "^2"');
  } else {
    console.error(`Build failed while spawning cargo: ${result.error.message}`);
  }
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`Build failed: cargo tauri build exited with code ${result.status}.`);
  process.exit(result.status ?? 1);
}

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

if (os === 'darwin') {
  const bundleDir = join(SRC_TAURI, 'target', profile, 'bundle', 'macos');
  if (existsSync(bundleDir)) {
    for (const entry of readdirSync(bundleDir)) {
      if (entry.endsWith('.app')) {
        cpSync(join(bundleDir, entry), join(DIST, entry), { recursive: true });
        // Remove LSRequiresCarbon if PlistBuddy is available (macOS-only, best-effort)
        const plist = join(DIST, entry, 'Contents', 'Info.plist');
        spawnSync('/usr/libexec/PlistBuddy', ['-c', 'Delete :LSRequiresCarbon', plist], {
          stdio: 'ignore',
        });
      }
    }
  }
  const dmgDir = join(SRC_TAURI, 'target', profile, 'bundle', 'dmg');
  if (existsSync(dmgDir)) {
    for (const entry of readdirSync(dmgDir)) {
      if (entry.endsWith('.dmg')) {
        copyFileSync(join(dmgDir, entry), join(DIST, entry));
      }
    }
  }
} else if (os === 'win32') {
  const releaseDir = join(SRC_TAURI, 'target', profile);

  // Raw binary produced by Cargo
  for (const name of ['markdown-review.exe', 'Markdown Review.exe']) {
    const p = join(releaseDir, name);
    if (existsSync(p)) {
      copyFileSync(p, join(DIST, name));
      break;
    }
  }

  // NSIS installer
  const nsisDir = join(releaseDir, 'bundle', 'nsis');
  if (existsSync(nsisDir)) {
    for (const entry of readdirSync(nsisDir)) {
      copyFileSync(join(nsisDir, entry), join(DIST, entry));
    }
  }

  // MSI installer
  const msiDir = join(releaseDir, 'bundle', 'msi');
  if (existsSync(msiDir)) {
    for (const entry of readdirSync(msiDir)) {
      copyFileSync(join(msiDir, entry), join(DIST, entry));
    }
  }
} else {
  // Linux
  const releaseDir = join(SRC_TAURI, 'target', profile);
  const binPath = join(releaseDir, 'markdown-review');
  if (existsSync(binPath)) {
    copyFileSync(binPath, join(DIST, 'markdown-review'));
  }

  const appimageDir = join(releaseDir, 'bundle', 'appimage');
  if (existsSync(appimageDir)) {
    for (const entry of readdirSync(appimageDir)) {
      if (entry.endsWith('.AppImage')) {
        copyFileSync(join(appimageDir, entry), join(DIST, entry));
      }
    }
  }

  const debDir = join(releaseDir, 'bundle', 'deb');
  if (existsSync(debDir)) {
    for (const entry of readdirSync(debDir)) {
      if (entry.endsWith('.deb')) {
        copyFileSync(join(debDir, entry), join(DIST, entry));
      }
    }
  }
}

const artifacts = readdirSync(DIST);
if (artifacts.length === 0) {
  console.error('Build completed but no artifacts were copied to dist/.');
  console.error(`Checked build outputs under: ${join(SRC_TAURI, 'target', profile)}`);
  console.error('Verify Tauri bundling prerequisites (WebView2/NSIS) and rerun the build.');
  process.exit(1);
}

console.log(`Build artifacts written to: ${DIST}`);
for (const artifact of artifacts) {
  console.log(` - ${artifact}`);
}
