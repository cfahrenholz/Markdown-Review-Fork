#!/usr/bin/env node
/**
 * Cross-platform start script for Markdown Review.
 *
 * macOS   → `open -na "Markdown Review.app" --args <file>`
 *           Falls back to `cargo run` when no bundle exists in dist/.
 * Windows → spawns `dist/markdown-review.exe` (or `dist/Markdown Review.exe`)
 *           Falls back to `cargo run` when no exe exists in dist/.
 * Linux   → executes `dist/markdown-review` directly
 *           Falls back to `cargo run` when no binary exists in dist/.
 *
 * Usage:
 *   node scripts/start.mjs                          # open file-picker dialog
 *   node scripts/start.mjs path/to/file.md          # open specific file
 *   node scripts/start.mjs /absolute/path/file.md   # absolute path
 */

import { spawnSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { platform } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC_TAURI = join(ROOT, 'src-tauri');
const DIST = join(ROOT, 'dist');
const os = platform();

// Resolve relative paths against the caller's working directory
const fileArgs = process.argv.slice(2).map((arg) => {
  const isAbsolute = arg.startsWith('/') || /^[A-Za-z]:[\\/]/.test(arg);
  return isAbsolute ? arg : resolve(process.cwd(), arg);
});

function cargoRun(extraArgs) {
  const result = spawnSync(
    'cargo',
    ['run', '--manifest-path', join(SRC_TAURI, 'Cargo.toml'), '--', ...extraArgs],
    { stdio: 'inherit', shell: os === 'win32' },
  );
  process.exit(result.status ?? 1);
}

if (os === 'darwin') {
  const appBundle = join(DIST, 'Markdown Review.app');
  if (existsSync(appBundle)) {
    const openArgs = ['-na', appBundle];
    if (fileArgs.length > 0) openArgs.push('--args', ...fileArgs);
    spawnSync('open', openArgs, { stdio: 'inherit' });
  } else {
    cargoRun(fileArgs);
  }
} else if (os === 'win32') {
  let exePath = null;
  for (const name of ['Markdown Review.exe', 'markdown-review.exe']) {
    const p = join(DIST, name);
    if (existsSync(p)) {
      exePath = p;
      break;
    }
  }
  if (exePath) {
    spawn(exePath, fileArgs, { stdio: 'inherit', detached: true, shell: false }).unref();
  } else {
    cargoRun(fileArgs);
  }
} else {
  // Linux / other Unix
  const binPath = join(DIST, 'markdown-review');
  if (existsSync(binPath)) {
    spawn(binPath, fileArgs, { stdio: 'inherit' });
  } else {
    cargoRun(fileArgs);
  }
}
