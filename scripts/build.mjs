#!/usr/bin/env node
/**
 * build.mjs — assembles dist/ for Cloudflare Pages deploy.
 *
 * Steps:
 *   1. Clean dist/
 *   2. Copy index.html  → dist/index.html
 *   3. Copy assets/     → dist/assets/   (if present)
 *   4. Copy public/     → dist/           (if present; preserves subdir structure)
 *   5. vite build admin → dist/admin/     (skipped gracefully if admin/ absent)
 */

import { existsSync, rmSync, mkdirSync, cpSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dist = join(root, 'dist');

// 1. Clean dist/
if (existsSync(dist)) {
  rmSync(dist, { recursive: true, force: true });
}
mkdirSync(dist, { recursive: true });

// 2. Copy index.html
const indexSrc = join(root, 'index.html');
if (existsSync(indexSrc)) {
  copyFileSync(indexSrc, join(dist, 'index.html'));
  console.log('[build] Copied index.html → dist/index.html');
} else {
  console.warn('[build] WARNING: index.html not found at root — skipping.');
}

// 3. Copy assets/
const assetsSrc = join(root, 'assets');
if (existsSync(assetsSrc)) {
  cpSync(assetsSrc, join(dist, 'assets'), { recursive: true });
  console.log('[build] Copied assets/ → dist/assets/');
}

// 4. Copy public/ (flattened into dist/ so dist/_routes.json, dist/register/... etc. are served at root)
const publicSrc = join(root, 'public');
if (existsSync(publicSrc)) {
  cpSync(publicSrc, dist, { recursive: true });
  console.log('[build] Copied public/ → dist/');
}

// 5. Build admin SPA (skip gracefully if admin/ absent or has no real build entry)
const adminDir = join(root, 'admin');
const adminHasEntry =
  existsSync(join(adminDir, 'index.html')) ||
  existsSync(join(adminDir, 'vite.config.ts')) ||
  existsSync(join(adminDir, 'vite.config.js')) ||
  existsSync(join(adminDir, 'package.json'));

if (!existsSync(adminDir) || !adminHasEntry) {
  console.log('[build] admin/ has no Vite build entry — skipping admin SPA build (will be added in P2).');
} else {
  console.log('[build] Building admin SPA...');
  execSync('npx vite build', {
    cwd: adminDir,
    stdio: 'inherit',
    env: { ...process.env, OUTDIR: join(dist, 'admin') },
  });
  console.log('[build] Admin SPA built → dist/admin/');
}

console.log('[build] Build complete → dist/');
