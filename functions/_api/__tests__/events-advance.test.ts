// functions/_api/__tests__/events-advance.test.ts
// TDD tests for advanceCurrentEvents + needsNextEvent.

import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { applyMigrations } from './setup';
import { advanceCurrentEvents, needsNextEvent } from '../events-advance';
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

/** Read a single is_current value by event id. */
async function getIsCurrent(id: number): Promise<number | undefined> {
  const row = await testEnv.DB.prepare(
    `SELECT is_current FROM events WHERE id = ?`
  ).bind(id).first<{ is_current: number }>();
  return row?.is_current;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('advanceCurrentEvents', () => {
  beforeEach(async () => {
    await applyMigrations(env as any);
    // Clear seed events so we can set up our own state
    await testEnv.DB.prepare('DELETE FROM events').run();
  });

  it('advances to the next event when the current one has ended and a future one exists', async () => {
    const oldId = await insertEvent({ program: 'mens', year: 2025, start_date: '2025-08-07', end_date: '2025-08-09', is_current: 1 });
    const nextId = await insertEvent({ program: 'mens', year: 2026, start_date: '2026-08-06', end_date: '2026-08-08', is_current: 0 });

    const { results } = await advanceCurrentEvents(testEnv, '2026-01-01');

    const mensResult = results.find((r) => r.program === 'mens')!;
    expect(mensResult.advanced).toBe(true);
    expect(mensResult.fromEventId).toBe(oldId);
    expect(mensResult.toEventId).toBe(nextId);
    expect(mensResult.needs_next_event).toBe(false);

    expect(await getIsCurrent(oldId)).toBe(0);
    expect(await getIsCurrent(nextId)).toBe(1);
  });

  it('does NOT advance when the current event is still ongoing (end_date >= today)', async () => {
    const currentId = await insertEvent({ program: 'mens', year: 2026, start_date: '2026-08-06', end_date: '2026-08-08', is_current: 1 });

    const { results } = await advanceCurrentEvents(testEnv, '2026-08-07');

    const mensResult = results.find((r) => r.program === 'mens')!;
    expect(mensResult.advanced).toBe(false);
    expect(mensResult.needs_next_event).toBe(false);

    // is_current unchanged
    expect(await getIsCurrent(currentId)).toBe(1);
  });

  it('sets needs_next_event=true when current ended and no future event exists', async () => {
    const oldId = await insertEvent({ program: 'mens', year: 2025, start_date: '2025-08-07', end_date: '2025-08-09', is_current: 1 });

    const { results } = await advanceCurrentEvents(testEnv, '2026-01-01');

    const mensResult = results.find((r) => r.program === 'mens')!;
    expect(mensResult.advanced).toBe(false);
    expect(mensResult.needs_next_event).toBe(true);

    // Old event still current (no swap happened)
    expect(await getIsCurrent(oldId)).toBe(1);
  });

  it('program isolation: advancing mens never touches womens is_current', async () => {
    const mensOld = await insertEvent({ program: 'mens', year: 2025, start_date: '2025-08-07', end_date: '2025-08-09', is_current: 1 });
    const mensNext = await insertEvent({ program: 'mens', year: 2026, start_date: '2026-08-06', end_date: '2026-08-08', is_current: 0 });
    const womenCurrent = await insertEvent({ program: 'women', year: 2026, start_date: '2026-07-17', end_date: '2026-07-19', is_current: 1 });

    await advanceCurrentEvents(testEnv, '2026-01-01');

    // mens advanced
    expect(await getIsCurrent(mensOld)).toBe(0);
    expect(await getIsCurrent(mensNext)).toBe(1);

    // women untouched (its end_date >= today, still ongoing)
    expect(await getIsCurrent(womenCurrent)).toBe(1);
  });

  it('one-current invariant: only one event is current per program after advance', async () => {
    // Set up two mens events where the old one ended
    const mensOld = await insertEvent({ program: 'mens', year: 2025, start_date: '2025-08-07', end_date: '2025-08-09', is_current: 1 });
    await insertEvent({ program: 'mens', year: 2026, start_date: '2026-08-06', end_date: '2026-08-08', is_current: 0 });
    await insertEvent({ program: 'mens', year: 2027, start_date: '2027-08-05', end_date: '2027-08-07', is_current: 0 });

    await advanceCurrentEvents(testEnv, '2026-01-01');

    const { results: rows } = await testEnv.DB.prepare(
      `SELECT id, is_current FROM events WHERE program = 'mens'`
    ).all<{ id: number; is_current: number }>();

    const currentOnes = rows.filter((r) => r.is_current === 1);
    expect(currentOnes).toHaveLength(1);
    // Should have picked the earliest future event (2026), not 2025
    const { id: currentId } = currentOnes[0];
    const row = await testEnv.DB.prepare(`SELECT year FROM events WHERE id = ?`).bind(currentId).first<{ year: number }>();
    expect(row?.year).toBe(2026);

    // Old event is no longer current
    expect(await getIsCurrent(mensOld)).toBe(0);
  });

  it('is idempotent: calling twice does not double-advance', async () => {
    const oldId = await insertEvent({ program: 'mens', year: 2025, start_date: '2025-08-07', end_date: '2025-08-09', is_current: 1 });
    const nextId = await insertEvent({ program: 'mens', year: 2026, start_date: '2026-08-06', end_date: '2026-08-08', is_current: 0 });

    // First call advances
    await advanceCurrentEvents(testEnv, '2026-01-01');
    // Second call — nextId is now current and its end_date >= today, so no further advance
    const { results } = await advanceCurrentEvents(testEnv, '2026-01-01');

    const mensResult = results.find((r) => r.program === 'mens')!;
    expect(mensResult.advanced).toBe(false);

    expect(await getIsCurrent(oldId)).toBe(0);
    expect(await getIsCurrent(nextId)).toBe(1);
  });

  it('returns advanced=false + needs_next=false when no current event is set', async () => {
    // No events at all
    const { results } = await advanceCurrentEvents(testEnv, '2026-08-10');

    const mensResult = results.find((r) => r.program === 'mens')!;
    expect(mensResult.advanced).toBe(false);
    expect(mensResult.needs_next_event).toBe(false);
  });
});

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
    await seedAdmin();
    const loginRes = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
