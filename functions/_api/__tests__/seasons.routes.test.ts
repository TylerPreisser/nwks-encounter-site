// Season-aware admin events API + the one-click enrollment toggle.

import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { app } from '../app';
import { applyMigrations, seedAdmin } from './setup';
import type { Env } from '../app';

const testEnv = env as unknown as Env;

async function getAuthCookie(): Promise<string> {
  let _trusted = '';
  // Seeded admins are treated as past first-run setup: a password alone no
  // longer yields a session, and these tests only need "an authenticated admin".
  {
    const { markEnrolled } = await import('./setup');
    const { issueTrustedDevice } = await import('../security');
    const _db = (env as unknown as { DB: D1Database }).DB;
    const _rows = await _db.prepare(`SELECT id FROM admin_users`).all<{ id: number }>();
    for (const _r of _rows.results) await markEnrolled(_r.id);
    const _first = _rows.results[0];
    if (_first) {
      const _t = await issueTrustedDevice(
        env as never, _first.id,
        new Request('http://localhost/', { headers: { 'CF-Connecting-IP': '127.0.0.1' } })
      );
      _trusted = `nwks_trusted=${_t}`;
    }
  }
  const res = await app.fetch(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(_trusted ? { Cookie: _trusted } : {}) },
      body: JSON.stringify({ email: 'admin@nwksencounter.com', password: 'TestPass1!' }),
    }),
    testEnv
  );
  const token = (res.headers.get('Set-Cookie') ?? '').match(/nwks_session=([^;]+)/)?.[1] ?? '';
  return `nwks_session=${token}`;
}

function req(method: string, path: string, cookie: string, program = 'mens', body?: unknown) {
  const sep = path.includes('?') ? '&' : '?';
  return new Request(`http://localhost${path}${sep}program=${program}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

let cookie: string;

beforeEach(async () => {
  await applyMigrations(env as unknown as { DB: D1Database });
  await seedAdmin();
  cookie = await getAuthCookie();
});

describe('GET /api/admin/events — seasons', () => {
  it('returns season and a derived display_name', async () => {
    const res = await app.fetch(req('GET', '/api/admin/events', cookie), testEnv);
    const body = await res.json<{ events: { season: string; display_name: string }[] }>();

    expect(res.status).toBe(200);
    expect(body.events[0].season).toBe('fall');
    expect(body.events[0].display_name).toBe('Fall 2026');
  });

  it('orders most-recent-first with fall ahead of spring in the same year', async () => {
    await app.fetch(
      req('POST', '/api/admin/events', cookie, 'mens', { year: 2027, season: 'spring' }),
      testEnv
    );
    await app.fetch(
      req('POST', '/api/admin/events', cookie, 'mens', { year: 2027, season: 'fall' }),
      testEnv
    );

    const res = await app.fetch(req('GET', '/api/admin/events', cookie), testEnv);
    const body = await res.json<{ events: { display_name: string }[] }>();

    expect(body.events.map((e) => e.display_name)).toEqual(['Fall 2027', 'Spring 2027', 'Fall 2026']);
  });
});

describe('POST /api/admin/events — seasons', () => {
  it('creates a spring encounter alongside an existing fall one', async () => {
    const res = await app.fetch(
      req('POST', '/api/admin/events', cookie, 'mens', {
        year: 2026, season: 'spring', title: "Men's Spring 2026",
      }),
      testEnv
    );
    expect(res.status).toBe(201);
    const body = await res.json<{ event: { season: string; display_name: string } }>();
    expect(body.event.season).toBe('spring');
    expect(body.event.display_name).toBe('Spring 2026');
  });

  it('rejects a missing season', async () => {
    const res = await app.fetch(
      req('POST', '/api/admin/events', cookie, 'mens', { year: 2027 }),
      testEnv
    );
    expect(res.status).toBe(400);
    expect((await res.json<{ error: string }>()).error).toMatch(/season/i);
  });

  it('rejects a season outside spring|fall', async () => {
    const res = await app.fetch(
      req('POST', '/api/admin/events', cookie, 'mens', { year: 2027, season: 'summer' }),
      testEnv
    );
    expect(res.status).toBe(400);
  });

  it('409s on a duplicate program+year+season, naming the encounter', async () => {
    const res = await app.fetch(
      req('POST', '/api/admin/events', cookie, 'mens', { year: 2026, season: 'fall' }),
      testEnv
    );
    expect(res.status).toBe(409);
    expect((await res.json<{ error: string }>()).error).toContain('Fall 2026');
  });
});

describe('rollover — seasons', () => {
  it('suggests fall 2026 -> spring 2027', async () => {
    const res = await app.fetch(req('GET', '/api/admin/events/rollover/preview', cookie), testEnv);
    const body = await res.json<{ suggested_year: number; suggested_season: string }>();
    expect(body.suggested_year).toBe(2027);
    expect(body.suggested_season).toBe('spring');
  });

  it('suggests spring -> fall of the SAME year', async () => {
    // Make a spring encounter current.
    const created = await app.fetch(
      req('POST', '/api/admin/events', cookie, 'mens', { year: 2027, season: 'spring' }),
      testEnv
    );
    const { event } = await created.json<{ event: { id: number } }>();
    await app.fetch(req('POST', `/api/admin/events/${event.id}/set-current`, cookie), testEnv);

    const res = await app.fetch(req('GET', '/api/admin/events/rollover/preview', cookie), testEnv);
    const body = await res.json<{ suggested_year: number; suggested_season: string }>();
    expect(body.suggested_year).toBe(2027);
    expect(body.suggested_season).toBe('fall');
  });

  it('creates the next encounter with its season and flips is_current', async () => {
    const res = await app.fetch(
      req('POST', '/api/admin/events/rollover', cookie, 'mens', {
        year: 2027, season: 'spring', confirm_year: 2027, force: true,
      }),
      testEnv
    );
    expect(res.status).toBe(201);
    const body = await res.json<{ new_event: { season: string; is_current: number; display_name: string } }>();
    expect(body.new_event.season).toBe('spring');
    expect(body.new_event.display_name).toBe('Spring 2027');
    expect(body.new_event.is_current).toBe(1);
  });

  it('rejects a rollover into a season that already exists', async () => {
    await app.fetch(
      req('POST', '/api/admin/events', cookie, 'mens', { year: 2027, season: 'spring' }),
      testEnv
    );
    const res = await app.fetch(
      req('POST', '/api/admin/events/rollover', cookie, 'mens', {
        year: 2027, season: 'spring', confirm_year: 2027, force: true,
      }),
      testEnv
    );
    expect(res.status).toBe(409);
  });
});

describe('POST /api/admin/events/:id/enrollment — one-click toggle', () => {
  it('closes attendee enrollment without touching servers', async () => {
    const res = await app.fetch(
      req('POST', '/api/admin/events/1/enrollment', cookie, 'mens', { attendee_open: false }),
      testEnv
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ event: { attendee_registration_open: number; server_registration_open: number } }>();
    expect(body.event.attendee_registration_open).toBe(0);
    expect(body.event.server_registration_open).toBe(1);
  });

  it('reopens attendee enrollment', async () => {
    await app.fetch(
      req('POST', '/api/admin/events/1/enrollment', cookie, 'mens', { attendee_open: false }),
      testEnv
    );
    const res = await app.fetch(
      req('POST', '/api/admin/events/1/enrollment', cookie, 'mens', { attendee_open: true }),
      testEnv
    );
    const body = await res.json<{ event: { attendee_registration_open: number } }>();
    expect(body.event.attendee_registration_open).toBe(1);
  });

  it('404s for an encounter belonging to the other program', async () => {
    const res = await app.fetch(
      req('POST', '/api/admin/events/2/enrollment', cookie, 'mens', { attendee_open: false }),
      testEnv
    );
    expect(res.status).toBe(404);
  });

  it('401s without a session', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/admin/events/1/enrollment?program=mens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendee_open: false }),
      }),
      testEnv
    );
    expect(res.status).toBe(401);
  });
});

describe('GET /api/public/events/current — seasons', () => {
  it('exposes season and display_name to the public site', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/public/events/current?program=mens'),
      testEnv
    );
    const body = await res.json<{ event: { season: string; display_name: string } }>();
    expect(body.event.season).toBe('fall');
    expect(body.event.display_name).toBe('Fall 2026');
  });
});
