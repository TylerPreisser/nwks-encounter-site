// src/js/config.js — NWKS Encounter front-end configuration constants.
// Inlined as the FIRST <script> in dist/index.html (see src/index.html load order).
//
// Set NWKS_API_BASE to the deployed backend origin at deploy time, e.g.:
//   window.NWKS_API_BASE = 'https://nwks-encounter-backend.pages.dev';
// Default is '' (same-origin) — works when the front-end is served from the
// same Cloudflare Pages project as the /api/register/* functions.
// An existing window.NWKS_API_BASE wins (set it before this script loads to override).
// GO-LIVE (2026-07-27): the DEPLOYED worlds site talks to the backend Pages project
// (registrations land in our D1; the page pulls editable content from
// /api/public/page-document). On localhost/127.0.0.1 (local dev + Playwright e2e,
// where the same server serves /api) we use same-origin so tests never hit prod.
window.NWKS_API_BASE = window.NWKS_API_BASE || (
  (typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname))
    ? ''
    : 'https://nwks-encounter-backend.pages.dev'
);

// Cloudflare Turnstile site key.  Leave blank for local/dev (sends the
// backend's documented test-bypass token instead of a real Turnstile widget).
// Set to the real public site key before production deploy.
window.NWKS_TURNSTILE_SITEKEY = window.NWKS_TURNSTILE_SITEKEY || '';
