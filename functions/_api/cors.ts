// functions/_api/cors.ts — CORS middleware for public API routes only.
//
// Admin (/api/admin/*) and auth (/api/auth/*) routes are same-origin cookie-based;
// they do NOT use this middleware.
//
// Allowed origins: comma-separated list in env var CORS_ORIGINS, or the built-in
// defaults when that var is absent or empty.

import type { Context, Next } from 'hono';
import type { Env } from './app';

const BUILTIN_ORIGINS = [
  'http://localhost:8788',
  'http://localhost:8787',
  'http://127.0.0.1:8788',
  'https://nwks-encounter-site.pages.dev',
  'https://nwksencounter.com',
  'https://www.nwksencounter.com',
];

/** Parse CORS_ORIGINS env var (comma-separated) into a Set. */
export function buildAllowedOrigins(corsOriginsEnv: string | undefined): Set<string> {
  if (!corsOriginsEnv || corsOriginsEnv.trim() === '') {
    return new Set(BUILTIN_ORIGINS);
  }
  const parsed = corsOriginsEnv
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return new Set(parsed);
}

/**
 * Return the CORS response headers if the request Origin is in the allowlist,
 * or null if the origin is absent / not allowed.
 */
export function corsHeaders(
  requestOrigin: string | null,
  allowed: Set<string>
): Record<string, string> | null {
  if (!requestOrigin || !allowed.has(requestOrigin)) return null;
  return {
    'Access-Control-Allow-Origin': requestOrigin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

type PublicBindings = { Bindings: Env };

/**
 * Hono middleware that:
 *  - answers OPTIONS preflights with 204 + CORS headers (if origin is allowed),
 *  - appends CORS headers to actual responses when the origin is allowed.
 */
export function corsMiddleware(
  c: Context<PublicBindings>,
  next: Next
): Response | Promise<Response> {
  const allowed = buildAllowedOrigins(c.env?.CORS_ORIGINS);
  const origin = c.req.header('Origin') ?? null;
  const headers = corsHeaders(origin, allowed);

  // Preflight
  if (c.req.method === 'OPTIONS') {
    if (headers) {
      return new Response(null, { status: 204, headers });
    }
    // Origin not allowed — return plain 204 with no CORS headers
    return new Response(null, { status: 204 });
  }

  // Actual request — let route handler run, then inject headers
  return next().then(() => {
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        c.res.headers.set(k, v);
      }
    }
    return c.res;
  });
}
