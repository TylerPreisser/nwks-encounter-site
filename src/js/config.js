// src/js/config.js — NWKS Encounter front-end configuration constants.
// Inlined as the FIRST <script> in dist/index.html (see src/index.html load order).
//
// Set NWKS_API_BASE to the deployed backend origin at deploy time, e.g.:
//   window.NWKS_API_BASE = 'https://nwks-encounter-backend.pages.dev';
// Default is '' (same-origin) — works when the front-end is served from the
// same Cloudflare Pages project as the /api/register/* functions.
// An existing window.NWKS_API_BASE wins (set it before this script loads to override).
window.NWKS_API_BASE = window.NWKS_API_BASE || '';

// Cloudflare Turnstile site key.  Leave blank for local/dev (sends the
// backend's documented test-bypass token instead of a real Turnstile widget).
// Set to the real public site key before production deploy.
window.NWKS_TURNSTILE_SITEKEY = window.NWKS_TURNSTILE_SITEKEY || '';
