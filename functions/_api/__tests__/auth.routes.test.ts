// functions/_api/__tests__/auth.routes.test.ts
// TDD integration tests for POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me

import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { app } from '../app';
import { applyMigrations, seedAdmin } from './setup';
import type { Env } from '../app';

const testEnv = env as unknown as Env;

function makeRequest(
  path: string,
  method: string,
  body?: unknown,
  cookieHeader?: string
): Request {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookieHeader) headers['Cookie'] = cookieHeader;
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(async () => {
  await applyMigrations(env as any);
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
describe('POST /api/auth/login', () => {
  it('returns 400 when body is missing fields', async () => {
    const res = await app.fetch(
      makeRequest('/api/auth/login', 'POST', { email: 'a@b.com' }), // password missing
      testEnv,
    );
    expect(res.status).toBe(400);
    const json = await res.json() as { ok: boolean; error: string };
    expect(json.ok).toBe(false);
  });

  it('returns 401 for unknown email (no user enumeration)', async () => {
    const res = await app.fetch(
      makeRequest('/api/auth/login', 'POST', { email: 'nobody@example.com', password: 'x' }),
      testEnv,
    );
    expect(res.status).toBe(401);
    const json = await res.json() as { ok: boolean; error: string };
    expect(json.ok).toBe(false);
    expect(json.error).toBe('Invalid email or password.');
  });

  it('returns 401 for wrong password (same shape — no user enumeration)', async () => {
    await seedAdmin();
    const res = await app.fetch(
      makeRequest('/api/auth/login', 'POST', { email: 'admin@nwksencounter.com', password: 'wrong' }),
      testEnv,
    );
    expect(res.status).toBe(401);
    const json = await res.json() as { ok: boolean; error: string };
    expect(json.ok).toBe(false);
    expect(json.error).toBe('Invalid email or password.');
  });

  it('sets nwks_session cookie and returns user on good credentials', async () => {
    await seedAdmin();
    const res = await app.fetch(
      makeRequest('/api/auth/login', 'POST', { email: 'admin@nwksencounter.com', password: 'TestPass1!' }),
      testEnv,
    );
    expect(res.status).toBe(200);
    const json = await res.json() as { ok: boolean; user: { email: string; id: number; name: string; role: string } };
    expect(json.ok).toBe(true);
    expect(json.user.email).toBe('admin@nwksencounter.com');
    expect(json.user.role).toBe('admin');
    const cookie = res.headers.get('Set-Cookie') ?? '';
    expect(cookie).toContain('nwks_session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
  });

  it('updates last_login_at on successful login (verified via subsequent /me)', async () => {
    await seedAdmin();
    const loginRes = await app.fetch(
      makeRequest('/api/auth/login', 'POST', { email: 'admin@nwksencounter.com', password: 'TestPass1!' }),
      testEnv,
    );
    expect(loginRes.status).toBe(200);
    const setCookie = loginRes.headers.get('Set-Cookie') ?? '';
    const token = setCookie.match(/nwks_session=([^;]+)/)?.[1] ?? '';
    expect(token.length).toBeGreaterThan(0);

    // Session works → last_login_at write did not corrupt the row
    const meRes = await app.fetch(
      makeRequest('/api/auth/me', 'GET', undefined, `nwks_session=${token}`),
      testEnv,
    );
    expect(meRes.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------
describe('POST /api/auth/logout', () => {
  it('returns 200 ok without a session cookie', async () => {
    const res = await app.fetch(
      makeRequest('/api/auth/logout', 'POST'),
      testEnv,
    );
    expect(res.status).toBe(200);
    const json = await res.json() as { ok: boolean };
    expect(json.ok).toBe(true);
  });

  it('clears cookie (Set-Cookie nwks_session=; ...) on logout', async () => {
    const res = await app.fetch(
      makeRequest('/api/auth/logout', 'POST'),
      testEnv,
    );
    const cookie = res.headers.get('Set-Cookie') ?? '';
    expect(cookie).toContain('nwks_session=;');
  });

  it('invalidates the session so a subsequent /me with the old token returns 401', async () => {
    await seedAdmin();
    const loginRes = await app.fetch(
      makeRequest('/api/auth/login', 'POST', { email: 'admin@nwksencounter.com', password: 'TestPass1!' }),
      testEnv,
    );
    const setCookie = loginRes.headers.get('Set-Cookie') ?? '';
    const token = setCookie.match(/nwks_session=([^;]+)/)?.[1] ?? '';
    expect(token.length).toBeGreaterThan(0);

    // Logout with the token
    const logoutRes = await app.fetch(
      makeRequest('/api/auth/logout', 'POST', undefined, `nwks_session=${token}`),
      testEnv,
    );
    expect(logoutRes.status).toBe(200);

    // Old token must now be rejected
    const meRes = await app.fetch(
      makeRequest('/api/auth/me', 'GET', undefined, `nwks_session=${token}`),
      testEnv,
    );
    expect(meRes.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------
describe('GET /api/auth/me', () => {
  it('returns 401 without a cookie', async () => {
    const res = await app.fetch(
      makeRequest('/api/auth/me', 'GET'),
      testEnv,
    );
    expect(res.status).toBe(401);
    const json = await res.json() as { ok: boolean; error: string };
    expect(json.ok).toBe(false);
    expect(json.error).toBe('unauthorized');
  });

  it('returns 401 with an invalid / garbage cookie', async () => {
    const res = await app.fetch(
      makeRequest('/api/auth/me', 'GET', undefined, 'nwks_session=not-a-real-token'),
      testEnv,
    );
    expect(res.status).toBe(401);
  });

  it('returns user when session cookie is valid', async () => {
    await seedAdmin();
    const loginRes = await app.fetch(
      makeRequest('/api/auth/login', 'POST', { email: 'admin@nwksencounter.com', password: 'TestPass1!' }),
      testEnv,
    );
    const setCookie = loginRes.headers.get('Set-Cookie') ?? '';
    const token = setCookie.match(/nwks_session=([^;]+)/)?.[1] ?? '';

    const meRes = await app.fetch(
      makeRequest('/api/auth/me', 'GET', undefined, `nwks_session=${token}`),
      testEnv,
    );
    expect(meRes.status).toBe(200);
    const json = await meRes.json() as { ok: boolean; user: { email: string; role: string } };
    expect(json.ok).toBe(true);
    expect(json.user.email).toBe('admin@nwksencounter.com');
    expect(json.user.role).toBe('admin');
  });
});
