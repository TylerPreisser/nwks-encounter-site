// functions/_api/__tests__/events.test.ts
// TDD integration tests for admin Events API (/api/admin/events)

import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { app } from '../app';
import { applyMigrations, seedAdmin } from './setup';
import type { Env } from '../app';

const testEnv = env as unknown as Env;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Logs in using the default seeded admin credentials and returns a Cookie
 * header value. Accepts optional email/password overrides.
 */
async function getAuthCookie(opts: { email?: string; password?: string } = {}): Promise<string> {
  const email = opts.email ?? 'admin@nwksencounter.com';
  const password = opts.password ?? 'TestPass1!';
  const loginRes = await app.fetch(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
    testEnv
  );
  const setCookie = loginRes.headers.get('Set-Cookie') ?? '';
  const token = setCookie.match(/nwks_session=([^;]+)/)?.[1] ?? '';
  return `nwks_session=${token}`;
}

/**
 * Builds a Request for the events API with the given method, path, cookie,
 * program query param, and optional JSON body.
 */
function makeReq(
  method: string,
  path: string,
  cookie: string,
  program: string,
  body?: unknown
): Request {
  const url = `http://localhost${path}?program=${program}`;
  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Admin Events API', () => {
  let cookie: string;

  beforeEach(async () => {
    await applyMigrations(env as any);
    await seedAdmin();
    cookie = await getAuthCookie();
  });

  // ── GET list ──────────────────────────────────────────────────────────────

  it('GET /api/admin/events returns empty list when no events exist', async () => {
    const res = await app.fetch(makeReq('GET', '/api/admin/events', cookie, 'mens'), testEnv);
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; events: unknown[] }>();
    expect(body.ok).toBe(true);
    expect(body.events).toEqual([]);
  });

  it('GET /api/admin/events scopes results to the requested program', async () => {
    await testEnv.DB.prepare(
      `INSERT INTO events (program, year, launch_locations, attendee_registration_open, server_registration_open, is_current, created_at, updated_at)
       VALUES ('mens', 2026, '[]', 1, 1, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
    ).run();
    await testEnv.DB.prepare(
      `INSERT INTO events (program, year, launch_locations, attendee_registration_open, server_registration_open, is_current, created_at, updated_at)
       VALUES ('women', 2026, '[]', 1, 1, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
    ).run();

    const res = await app.fetch(makeReq('GET', '/api/admin/events', cookie, 'mens'), testEnv);
    const body = await res.json<{ ok: boolean; events: Array<{ program: string }> }>();
    expect(body.events).toHaveLength(1);
    expect(body.events[0].program).toBe('mens');
  });

  // ── POST create ───────────────────────────────────────────────────────────

  it('POST /api/admin/events creates an event', async () => {
    const res = await app.fetch(
      makeReq('POST', '/api/admin/events', cookie, 'mens', {
        year: 2026,
        title: "Men's Encounter 2026",
        start_date: '2026-08-06',
        end_date: '2026-08-08',
        launch_locations: ['Colby', 'Hays', 'Dodge City'],
      }),
      testEnv
    );
    expect(res.status).toBe(201);
    const body = await res.json<{ ok: boolean; event: Record<string, unknown> }>();
    expect(body.ok).toBe(true);
    expect(body.event.year).toBe(2026);
    expect(body.event.program).toBe('mens');
    expect(body.event.start_date).toBe('2026-08-06');
    expect(JSON.parse(body.event.launch_locations as string)).toEqual(['Colby', 'Hays', 'Dodge City']);
    expect(body.event.is_current).toBe(0);
  });

  it('POST /api/admin/events returns 409 on duplicate program+year', async () => {
    const payload = { year: 2026 };
    await app.fetch(makeReq('POST', '/api/admin/events', cookie, 'mens', payload), testEnv);
    const res2 = await app.fetch(makeReq('POST', '/api/admin/events', cookie, 'mens', payload), testEnv);
    expect(res2.status).toBe(409);
  });

  it('POST /api/admin/events returns 400 for invalid start_date format', async () => {
    const res = await app.fetch(
      makeReq('POST', '/api/admin/events', cookie, 'mens', { year: 2026, start_date: '08-06-2026' }),
      testEnv
    );
    expect(res.status).toBe(400);
  });

  it('POST /api/admin/events returns 400 for invalid launch_locations type', async () => {
    const res = await app.fetch(
      makeReq('POST', '/api/admin/events', cookie, 'mens', { year: 2026, launch_locations: 'Colby' }),
      testEnv
    );
    expect(res.status).toBe(400);
  });

  // ── PATCH update ──────────────────────────────────────────────────────────

  it('PATCH /api/admin/events/:id updates title and dates', async () => {
    const createRes = await app.fetch(
      makeReq('POST', '/api/admin/events', cookie, 'mens', { year: 2026 }),
      testEnv
    );
    const { event } = await createRes.json<{ event: { id: number } }>();

    const res = await app.fetch(
      makeReq('PATCH', `/api/admin/events/${event.id}`, cookie, 'mens', {
        title: 'Updated Title',
        start_date: '2026-08-06',
        end_date: '2026-08-08',
      }),
      testEnv
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; event: Record<string, unknown> }>();
    expect(body.event.title).toBe('Updated Title');
  });

  it('PATCH /api/admin/events/:id returns 404 for wrong program', async () => {
    const createRes = await app.fetch(
      makeReq('POST', '/api/admin/events', cookie, 'mens', { year: 2026 }),
      testEnv
    );
    const { event } = await createRes.json<{ event: { id: number } }>();

    // Same admin user, but requesting with program=women — should 404 (program isolation)
    const res = await app.fetch(
      makeReq('PATCH', `/api/admin/events/${event.id}`, cookie, 'women', { title: 'X' }),
      testEnv
    );
    expect(res.status).toBe(404);
  });

  // ── set-current invariant ─────────────────────────────────────────────────

  it('POST /api/admin/events/:id/set-current enforces one-current invariant within program', async () => {
    // Create two mens events
    const r1 = await app.fetch(
      makeReq('POST', '/api/admin/events', cookie, 'mens', { year: 2025 }),
      testEnv
    );
    const r2 = await app.fetch(
      makeReq('POST', '/api/admin/events', cookie, 'mens', { year: 2026 }),
      testEnv
    );
    const { event: ev1 } = await r1.json<{ event: { id: number } }>();
    const { event: ev2 } = await r2.json<{ event: { id: number } }>();

    // Set ev1 current
    await app.fetch(makeReq('POST', `/api/admin/events/${ev1.id}/set-current`, cookie, 'mens'), testEnv);

    // Now set ev2 current — ev1 must become 0
    await app.fetch(makeReq('POST', `/api/admin/events/${ev2.id}/set-current`, cookie, 'mens'), testEnv);

    const listRes = await app.fetch(makeReq('GET', '/api/admin/events', cookie, 'mens'), testEnv);
    const { events } = await listRes.json<{ events: Array<{ id: number; is_current: number }> }>();
    const currentEvents = events.filter((e) => e.is_current === 1);
    expect(currentEvents).toHaveLength(1);
    expect(currentEvents[0].id).toBe(ev2.id);
  });

  it('set-current for mens does NOT affect womens is_current', async () => {
    // Create one event per program
    const mr = await app.fetch(
      makeReq('POST', '/api/admin/events', cookie, 'mens', { year: 2026 }),
      testEnv
    );
    const { event: mensEv } = await mr.json<{ event: { id: number } }>();

    const wr = await app.fetch(
      makeReq('POST', '/api/admin/events', cookie, 'women', { year: 2026 }),
      testEnv
    );
    const { event: womenEv } = await wr.json<{ event: { id: number } }>();

    // Set both current
    await app.fetch(makeReq('POST', `/api/admin/events/${mensEv.id}/set-current`, cookie, 'mens'), testEnv);
    await app.fetch(makeReq('POST', `/api/admin/events/${womenEv.id}/set-current`, cookie, 'women'), testEnv);

    // Trigger men's set-current again — should NOT change women's event
    await app.fetch(makeReq('POST', `/api/admin/events/${mensEv.id}/set-current`, cookie, 'mens'), testEnv);

    const wRow = await testEnv.DB.prepare(
      `SELECT is_current FROM events WHERE id = ?`
    ).bind(womenEv.id).first<{ is_current: number }>();
    expect(wRow?.is_current).toBe(1);
  });

  // ── Auth guard ────────────────────────────────────────────────────────────

  it('returns 401 without a valid session', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/admin/events?program=mens'),
      testEnv
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 without program param', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/admin/events', {
        headers: { Cookie: cookie },
      }),
      testEnv
    );
    expect(res.status).toBe(400);
  });
});
