// functions/_api/__tests__/events-advance.test.ts
// TDD tests for needsNextEvent (advancement is now MANUAL via the rollover
// button; the auto-advance function was retired).

import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { applyMigrations } from './setup';
import { needsNextEvent } from '../events-advance';
import type { Env } from '../app';

const testEnv = env as unknown as Env;

// ── Seed helpers ──────────────────────────────────────────────────────────────

/** Insert an event row; returns its id. */
async function insertEvent(opts: {
  program: 'mens' | 'women';
  year: number;
  start_date?: string;
  end_date?: string;
  is_current?: 0 | 1;
}): Promise<number> {
  const now = new Date().toISOString();
  const { meta } = await testEnv.DB.prepare(
    `INSERT INTO events
       (program, year, title, start_date, end_date, launch_locations,
        attendee_registration_open, server_registration_open, is_current, created_at, updated_at)
     VALUES (?, ?, NULL, ?, ?, '[]', 1, 1, ?, ?, ?)`
  ).bind(
    opts.program,
    opts.year,
    opts.start_date ?? null,
    opts.end_date ?? null,
    opts.is_current ?? 0,
    now,
    now,
  ).run();
  return meta.last_row_id as number;
}

// ── needsNextEvent unit tests ─────────────────────────────────────────────────

describe('needsNextEvent', () => {
  beforeEach(async () => {
    await applyMigrations(env as any);
    await testEnv.DB.prepare('DELETE FROM events').run();
  });

  it('returns true when current event ended and no future event exists', async () => {
    await insertEvent({ program: 'mens', year: 2025, end_date: '2025-08-09', is_current: 1 });
    const flag = await needsNextEvent(testEnv.DB, 'mens', '2026-01-01');
    expect(flag).toBe(true);
  });

  it('returns false when current event is still ongoing', async () => {
    await insertEvent({ program: 'mens', year: 2026, end_date: '2026-08-08', is_current: 1 });
    const flag = await needsNextEvent(testEnv.DB, 'mens', '2026-08-07');
    expect(flag).toBe(false);
  });

  it('returns false when current event ended but a future event exists', async () => {
    await insertEvent({ program: 'mens', year: 2025, end_date: '2025-08-09', is_current: 1 });
    await insertEvent({ program: 'mens', year: 2026, end_date: '2026-08-08', is_current: 0 });
    const flag = await needsNextEvent(testEnv.DB, 'mens', '2026-01-01');
    expect(flag).toBe(false);
  });

  it('returns false when no current event exists at all', async () => {
    const flag = await needsNextEvent(testEnv.DB, 'mens', '2026-01-01');
    expect(flag).toBe(false);
  });
});

// ── GET /api/admin/events needs_next_event field ──────────────────────────────

import { app } from '../app';
import { seedAdmin } from './setup';

describe('GET /api/admin/events includes needs_next_event', () => {
  let cookie: string;

  beforeEach(async () => {
    await applyMigrations(env as any);
    await testEnv.DB.prepare('DELETE FROM events').run();
    const { id: adminId } = await seedAdmin();
    // Past first-run setup: a password alone no longer yields a session.
    const { markEnrolled } = await import('./setup');
    const { issueTrustedDevice } = await import('../security');
    await markEnrolled(adminId);
    const _t = await issueTrustedDevice(
      env as never, adminId,
      new Request('http://localhost/', { headers: { 'CF-Connecting-IP': '127.0.0.1' } })
    );
    const loginRes = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `nwks_trusted=${_t}` },
        body: JSON.stringify({ email: 'admin@nwksencounter.com', password: 'TestPass1!' }),
      }),
      testEnv
    );
    const setCookie = loginRes.headers.get('Set-Cookie') ?? '';
    const token = setCookie.match(/nwks_session=([^;]+)/)?.[1] ?? '';
    cookie = `nwks_session=${token}`;
  });

  it('needs_next_event=false when current event is ongoing', async () => {
    await insertEvent({ program: 'mens', year: 2026, end_date: '2099-12-31', is_current: 1 });
    const res = await app.fetch(
      new Request('http://localhost/api/admin/events?program=mens', { headers: { Cookie: cookie } }),
      testEnv
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; needs_next_event: boolean }>();
    expect(body.needs_next_event).toBe(false);
  });

  it('needs_next_event=true when current event ended and no future event', async () => {
    await insertEvent({ program: 'mens', year: 2025, end_date: '2025-08-09', is_current: 1 });
    // Use a far-future today to guarantee the event ended
    // We can't mock Date here easily, so insert an event that definitely ended
    const res = await app.fetch(
      new Request('http://localhost/api/admin/events?program=mens', { headers: { Cookie: cookie } }),
      testEnv
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; needs_next_event: boolean }>();
    // end_date 2025-08-09 < today (2026+), no future event → true
    expect(body.needs_next_event).toBe(true);
  });

  it('needs_next_event=false when current event ended but a future event exists', async () => {
    await insertEvent({ program: 'mens', year: 2025, end_date: '2025-08-09', is_current: 1 });
    await insertEvent({ program: 'mens', year: 2099, end_date: '2099-08-08', is_current: 0 });
    const res = await app.fetch(
      new Request('http://localhost/api/admin/events?program=mens', { headers: { Cookie: cookie } }),
      testEnv
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; needs_next_event: boolean }>();
    expect(body.needs_next_event).toBe(false);
  });
});
