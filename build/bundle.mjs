#!/usr/bin/env node
// build/bundle.mjs — Node ESM, zero deps.
// Reads src/index.html, inlines every <link rel=stylesheet>, every <script src>,
// and every asset (img src / link href / CSS url()) that points into assets/ as a
// base64 data: URI, then writes a single self-contained dist/index.html.
// Idempotent: always rebuilt fresh from src/ + assets/, never reads dist/.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC_DIR = resolve(ROOT, 'src');
const SRC_INDEX = resolve(SRC_DIR, 'index.html');
const DIST_DIR = resolve(ROOT, 'dist');
const DIST_INDEX = resolve(DIST_DIR, 'index.html');

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

const inlined = { styles: [], scripts: [], assets: [] };

function mimeFor(filePath) {
  return MIME_BY_EXT[extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function toDataUri(absPath) {
  const bytes = readFileSync(absPath);
  return `data:${mimeFor(absPath)};base64,${bytes.toString('base64')}`;
}

// Rewrite any url(...) / src="..." / href="..." path that contains "assets/" into
// a base64 data: URI, resolving relative to `baseDir`.
function inlineAssetRefsIn(text, baseDir, label) {
  // CSS url(...)
  text = text.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (whole, quote, refPath) => {
    if (!refPath.includes('assets/')) return whole;
    const abs = resolve(baseDir, refPath);
    inlined.assets.push(`${label}: ${refPath}`);
    return `url(${toDataUri(abs)})`;
  });
  // <img src="..."> / <link href="..."> style attribute refs (generic attr="...assets/...")
  text = text.replace(/(src|href)=(["'])([^"']*assets\/[^"']+)\2/g, (whole, attr, quote, refPath) => {
    const abs = resolve(baseDir, refPath);
    inlined.assets.push(`${label}: ${refPath}`);
    return `${attr}=${quote}${toDataUri(abs)}${quote}`;
  });
  return text;
}

// Guard: curly/smart quotes used as HTML attribute delimiters (e.g. class=”x”) are
// invalid and silently break class/id/href parsing → collapsed layout that still
// passes text-content greps. Fail the build loudly if any are found.
function checkSmartQuotes(html) {
  const bad = [];
  html.split('\n').forEach((line, i) => {
    if (/=[“”‘’]/.test(line)) bad.push(`  line ${i + 1}: ${line.trim().slice(0, 80)}`);
  });
  if (bad.length) {
    console.error('bundle.mjs: FAILED — smart/curly quotes used as attribute delimiters in src/index.html:');
    console.error(bad.join('\n'));
    console.error('Fix: replace “ ” ‘ ’ around attribute values with straight " or \'.');
    process.exit(1);
  }
}

function bundle() {
  let html = readFileSync(SRC_INDEX, 'utf8');
  checkSmartQuotes(html);

  // 1) Inline each <link rel="stylesheet" href="..."> as <style>, in document order.
  html = html.replace(
    /<link\s+rel=["']stylesheet["']\s+href=["']([^"']+)["']\s*\/?>/g,
    (whole, href) => {
      const cssPath = resolve(SRC_DIR, href);
      let css = readFileSync(cssPath, 'utf8');
      css = inlineAssetRefsIn(css, dirname(cssPath), `css:${href}`);
      inlined.styles.push(href);
      return `<style>\n${css}\n</style>`;
    }
  );

  // 2) Inline each <script src="..."></script> as <script>, preserving order.
  html = html.replace(
    /<script\s+src=["']([^"']+)["']\s*><\/script>/g,
    (whole, src) => {
      const jsPath = resolve(SRC_DIR, src);
      const js = readFileSync(jsPath, 'utf8');
      inlined.scripts.push(src);
      return `<script>\n${js}\n</script>`;
    }
  );

  // 3) Inline any remaining asset references (e.g. <img src="../assets/...">) as base64.
  html = inlineAssetRefsIn(html, SRC_DIR, 'html');

  if (!existsSync(DIST_DIR)) mkdirSync(DIST_DIR, { recursive: true });
  writeFileSync(DIST_INDEX, html, 'utf8');

  return html;
}

function verify(html) {
  const leftoverLink = /<link\s+rel=["']stylesheet["']/.test(html);
  const leftoverScript = /<script\s+src=/.test(html);
  const leftoverAssetRef = /(src|href)=["'][^"']*assets\/[^"']*["']/.test(html) || /url\([^)]*assets\//.test(html);
  if (leftoverLink || leftoverScript || leftoverAssetRef) {
    console.error('bundle.mjs: verification FAILED — leftover external refs remain:', {
      leftoverLink,
      leftoverScript,
      leftoverAssetRef
    });
    process.exitCode = 1;
    return false;
  }
  return true;
}

const html = bundle();
const ok = verify(html);

console.log(`Inlined ${inlined.styles.length} stylesheet(s):`, inlined.styles);
console.log(`Inlined ${inlined.scripts.length} script(s):`, inlined.scripts);
console.log(`Inlined ${inlined.assets.length} asset(s):`, inlined.assets);
console.log(`Wrote ${DIST_INDEX} (${Buffer.byteLength(html, 'utf8')} bytes)`);
if (ok) console.log('bundle.mjs: OK — dist/index.html is self-contained.');
