// functions/_api/__tests__/cors.test.ts
// TDD tests for CORS middleware on public routes.

import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { app } from '../app';
import { buildAllowedOrigins, corsHeaders } from '../cors';
import { applyMigrations } from './setup';
import type { Env } from '../app';

const testEnv = env as unknown as Env;

beforeEach(async () => {
  await applyMigrations(env as any);
});

// ---------------------------------------------------------------------------
// Unit tests for CORS helpers
// ---------------------------------------------------------------------------
describe('buildAllowedOrigins', () => {
  it('returns defaults when env var is absent', () => {
    const s = buildAllowedOrigins(undefined);
    expect(s.has('http://localhost:8788')).toBe(true);
    expect(s.has('https://nwksencounter.com')).toBe(true);
    expect(s.has('https://www.nwksencounter.com')).toBe(true);
    expect(s.has('https://nwks-encounter-site.pages.dev')).toBe(true);
  });

  it('returns defaults when env var is empty string', () => {
    const s = buildAllowedOrigins('');
    expect(s.has('http://localhost:8788')).toBe(true);
  });

  it('parses comma-separated origins from env var', () => {
    const s = buildAllowedOrigins('https://a.example.com,https://b.example.com');
    expect(s.has('https://a.example.com')).toBe(true);
    expect(s.has('https://b.example.com')).toBe(true);
    expect(s.has('http://localhost:8788')).toBe(false);
  });

  it('trims whitespace around entries', () => {
    const s = buildAllowedOrigins('  https://a.example.com , https://b.example.com  ');
    expect(s.has('https://a.example.com')).toBe(true);
    expect(s.has('https://b.example.com')).toBe(true);
  });
});

describe('corsHeaders helper', () => {
  const allowed = new Set(['https://nwksencounter.com', 'http://localhost:8788']);

  it('returns null when origin is null', () => {
    expect(corsHeaders(null, allowed)).toBeNull();
  });

  it('returns null when origin is not in allowlist', () => {
    expect(corsHeaders('https://evil.example.com', allowed)).toBeNull();
  });

  it('returns CORS headers with echoed origin when allowed', () => {
    const h = corsHeaders('https://nwksencounter.com', allowed);
    expect(h).not.toBeNull();
    expect(h!['Access-Control-Allow-Origin']).toBe('https://nwksencounter.com');
    expect(h!['Access-Control-Allow-Methods']).toContain('POST');
    expect(h!['Access-Control-Allow-Methods']).toContain('OPTIONS');
    expect(h!['Access-Control-Allow-Headers']).toBe('Content-Type');
    expect(h!['Vary']).toBe('Origin');
  });

  it('does not use wildcard — echoes the request origin exactly', () => {
    const h = corsHeaders('http://localhost:8788', allowed);
    expect(h!['Access-Control-Allow-Origin']).toBe('http://localhost:8788');
    expect(h!['Access-Control-Allow-Origin']).not.toBe('*');
  });
});

// ---------------------------------------------------------------------------
// Integration: /api/health (CORS allowed)
// ---------------------------------------------------------------------------
describe('CORS on /api/health', () => {
  it('echoes allowed origin on GET /api/health', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/health', {
        headers: { Origin: 'https://nwksencounter.com' },
      }),
      testEnv
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://nwksencounter.com');
    expect(res.headers.get('Vary')).toBe('Origin');
  });

  it('does not emit CORS headers for a disallowed origin on /api/health', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/health', {
        headers: { Origin: 'https://evil.example.com' },
      }),
      testEnv
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('OPTIONS preflight on /api/health returns 204 with CORS headers for allowed origin', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/health', {
        method: 'OPTIONS',
        headers: { Origin: 'http://localhost:8788' },
      }),
      testEnv
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:8788');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('OPTIONS');
  });
});

// ---------------------------------------------------------------------------
// Integration: /api/register/* (CORS allowed)
// ---------------------------------------------------------------------------
describe('CORS on /api/register/* — allowed origin', () => {
  it('OPTIONS preflight returns 204 with full CORS headers', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/register/mens/attendee', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://nwks-encounter-site.pages.dev',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type',
        },
      }),
      testEnv
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://nwks-encounter-site.pages.dev'
    );
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
    expect(res.headers.get('Vary')).toBe('Origin');
  });

  it('POST from allowed origin carries Access-Control-Allow-Origin in response', async () => {
    // We expect a 400/409 from validation/db but the CORS header must be present
    const res = await app.fetch(
      new Request('http://localhost/api/register/mens/attendee', {
        method: 'POST',
        headers: {
          Origin: 'https://nwksencounter.com',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cf_turnstile_response: '__TEST_BYPASS__', first_name: 'X', last_name: 'Y' }),
      }),
      testEnv
    );
    // Status may be 400 (validation) or 409 (no current event) — doesn't matter
    expect([400, 409, 422, 429]).toContain(res.status);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://nwksencounter.com');
  });
});

describe('CORS on /api/register/* — disallowed origin', () => {
  it('OPTIONS preflight for disallowed origin returns 204 but NO CORS headers', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/register/mens/attendee', {
        method: 'OPTIONS',
        headers: { Origin: 'https://evil.example.com' },
      }),
      testEnv
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('POST from disallowed origin gets no CORS headers', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/register/mens/attendee', {
        method: 'POST',
        headers: {
          Origin: 'https://evil.example.com',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      }),
      testEnv
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Integration: /api/public/* (CORS allowed)
// ---------------------------------------------------------------------------
describe('CORS on /api/public/* — allowed origin', () => {
  it('GET /api/public/events/current with allowed origin has CORS header', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/public/events/current?program=mens', {
        headers: { Origin: 'http://localhost:8788' },
      }),
      testEnv
    );
    // 404 is fine — there's no event seeded; CORS header is what matters
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:8788');
    expect(res.headers.get('Vary')).toBe('Origin');
  });

  it('OPTIONS preflight on /api/public/events/current returns 204 + CORS headers', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/public/events/current', {
        method: 'OPTIONS',
        headers: { Origin: 'https://www.nwksencounter.com' },
      }),
      testEnv
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://www.nwksencounter.com');
  });
});

// ---------------------------------------------------------------------------
// Integration: admin and auth routes — must NOT get permissive CORS
// ---------------------------------------------------------------------------
describe('CORS absent on /api/admin/* routes', () => {
  it('GET /api/admin/dashboard with allowed origin has NO CORS headers', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/admin/dashboard', {
        headers: { Origin: 'https://nwksencounter.com' },
      }),
      testEnv
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('OPTIONS /api/admin/dashboard does not return CORS allow-origin', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/admin/dashboard', {
        method: 'OPTIONS',
        headers: { Origin: 'https://nwksencounter.com' },
      }),
      testEnv
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('CORS absent on /api/auth/* routes', () => {
  it('POST /api/auth/login with allowed origin has NO CORS headers', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: {
          Origin: 'https://nwksencounter.com',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: 'x@x.com', password: 'y' }),
      }),
      testEnv
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
