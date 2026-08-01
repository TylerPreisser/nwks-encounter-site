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
    // Remove seed events (0003_seed_events.sql) so we can test the empty-list path.
    await testEnv.DB.prepare('DELETE FROM events').run();
    const res = await app.fetch(makeReq('GET', '/api/admin/events', cookie, 'mens'), testEnv);
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; events: unknown[] }>();
    expect(body.ok).toBe(true);
    expect(body.events).toEqual([]);
  });

  it('GET /api/admin/events scopes results to the requested program', async () => {
    // Seed rows for both programs already exist from 0003_seed_events.sql; use OR IGNORE.
    await testEnv.DB.prepare(
      `INSERT OR IGNORE INTO events (program, year, launch_locations, attendee_registration_open, server_registration_open, is_current, created_at, updated_at)
       VALUES ('mens', 2026, '[]', 1, 1, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
    ).run();
    await testEnv.DB.prepare(
      `INSERT OR IGNORE INTO events (program, year, launch_locations, attendee_registration_open, server_registration_open, is_current, created_at, updated_at)
       VALUES ('women', 2026, '[]', 1, 1, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
    ).run();

    const res = await app.fetch(makeReq('GET', '/api/admin/events', cookie, 'mens'), testEnv);
    const body = await res.json<{ ok: boolean; events: Array<{ program: string }> }>();
    expect(body.events).toHaveLength(1);
    expect(body.events[0].program).toBe('mens');
  });

  // ── POST create ───────────────────────────────────────────────────────────

  it('POST /api/admin/events creates an event', async () => {
    // Use year 2027 since the seed migration (0003) already owns mens/2026.
    const res = await app.fetch(
      makeReq('POST', '/api/admin/events', cookie, 'mens', {
        year: 2027, season: 'spring',
        title: "Men's Encounter 2027",
        start_date: '2027-08-06',
        end_date: '2027-08-08',
        launch_locations: ['Colby', 'Hays', 'Dodge City'],
      }),
      testEnv
    );
    expect(res.status).toBe(201);
    const body = await res.json<{ ok: boolean; event: Record<string, unknown> }>();
    expect(body.ok).toBe(true);
    expect(body.event.year).toBe(2027);
    expect(body.event.program).toBe('mens');
    expect(body.event.start_date).toBe('2027-08-06');
    expect(JSON.parse(body.event.launch_locations as string)).toEqual(['Colby', 'Hays', 'Dodge City']);
    expect(body.event.is_current).toBe(0);
  });

  it('POST /api/admin/events returns 409 on duplicate program+year', async () => {
    // Use year 2027 (not 2026 which the seed already owns); first POST creates, second gets 409.
    const payload = { year: 2027, season: 'spring' };
    await app.fetch(makeReq('POST', '/api/admin/events', cookie, 'mens', payload), testEnv);
    const res2 = await app.fetch(makeReq('POST', '/api/admin/events', cookie, 'mens', payload), testEnv);
    expect(res2.status).toBe(409);
  });

  it('POST /api/admin/events returns 400 for invalid start_date format', async () => {
    // Use year 2027 (seed owns 2026); validation error is thrown before the INSERT anyway.
    const res = await app.fetch(
      makeReq('POST', '/api/admin/events', cookie, 'mens', { year: 2027, season: 'spring', start_date: '08-06-2027' }),
      testEnv
    );
    expect(res.status).toBe(400);
  });

  it('POST /api/admin/events returns 400 for invalid launch_locations type', async () => {
    // Use year 2027 (seed owns 2026); validation error is thrown before the INSERT anyway.
    const res = await app.fetch(
      makeReq('POST', '/api/admin/events', cookie, 'mens', { year: 2027, season: 'spring', launch_locations: 'Colby' }),
      testEnv
    );
    expect(res.status).toBe(400);
  });

  // ── PATCH update ──────────────────────────────────────────────────────────

  it('PATCH /api/admin/events/:id updates title and dates', async () => {
    // Use year 2027 since seed owns mens/2026.
    const createRes = await app.fetch(
      makeReq('POST', '/api/admin/events', cookie, 'mens', { year: 2027, season: 'spring' }),
      testEnv
    );
    const { event } = await createRes.json<{ event: { id: number } }>();

    const res = await app.fetch(
      makeReq('PATCH', `/api/admin/events/${event.id}`, cookie, 'mens', {
        title: 'Updated Title',
        start_date: '2027-08-06',
        end_date: '2027-08-08',
      }),
      testEnv
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; event: Record<string, unknown> }>();
    expect(body.event.title).toBe('Updated Title');
  });

  it('PATCH /api/admin/events/:id returns 404 for wrong program', async () => {
    // Use year 2027 since seed owns mens/2026.
    const createRes = await app.fetch(
      makeReq('POST', '/api/admin/events', cookie, 'mens', { year: 2027, season: 'spring' }),
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
    // Use years 2025 + 2027 (seed owns mens/2026).
    const r1 = await app.fetch(
      makeReq('POST', '/api/admin/events', cookie, 'mens', { year: 2025, season: 'spring' }),
      testEnv
    );
    const r2 = await app.fetch(
      makeReq('POST', '/api/admin/events', cookie, 'mens', { year: 2027, season: 'spring' }),
      testEnv
    );
    const { event: ev1 } = await r1.json<{ event: { id: number } }>();
    const { event: ev2 } = await r2.json<{ event: { id: number } }>();

    // Set ev1 current
    await app.fetch(makeReq('POST', `/api/admin/events/${ev1.id}/set-current`, cookie, 'mens'), testEnv);

    // Now set ev2 current — ev1 (and seed 2026) must become 0
    await app.fetch(makeReq('POST', `/api/admin/events/${ev2.id}/set-current`, cookie, 'mens'), testEnv);

    const listRes = await app.fetch(makeReq('GET', '/api/admin/events', cookie, 'mens'), testEnv);
    const { events } = await listRes.json<{ events: Array<{ id: number; is_current: number }> }>();
    const currentEvents = events.filter((e) => e.is_current === 1);
    expect(currentEvents).toHaveLength(1);
    expect(currentEvents[0].id).toBe(ev2.id);
  });

  it('set-current for mens does NOT affect womens is_current', async () => {
    // Use year 2027 (seed owns both mens/2026 and women/2026).
    const mr = await app.fetch(
      makeReq('POST', '/api/admin/events', cookie, 'mens', { year: 2027, season: 'spring' }),
      testEnv
    );
    const { event: mensEv } = await mr.json<{ event: { id: number } }>();

    const wr = await app.fetch(
      makeReq('POST', '/api/admin/events', cookie, 'women', { year: 2027, season: 'spring' }),
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

// ---------------------------------------------------------------------------
// Encounter rollover — "Start Next Encounter" (archive board + open next)
// ---------------------------------------------------------------------------

describe('Encounter rollover', () => {
  let cookie: string;

  beforeEach(async () => {
    await applyMigrations(env as any);
    await seedAdmin();
    cookie = await getAuthCookie();
    await testEnv.DB.prepare('DELETE FROM events').run();
  });

  /** Insert a current men's 2026 encounter with the given end_date; returns id. */
  async function insertCurrentMens(endDate: string): Promise<number> {
    const now = new Date().toISOString();
    const { meta } = await testEnv.DB.prepare(
      `INSERT INTO events (program, year, title, start_date, end_date, launch_locations,
         attendee_registration_open, server_registration_open, is_current, created_at, updated_at)
       VALUES ('mens', 2026, 'Men 2026', '2026-08-06', ?, '["Colby"]', 1, 1, 1, ?, ?)`
    ).bind(endDate, now, now).run();
    return meta.last_row_id as number;
  }

  async function insertTestimony(eventId: number, status: string): Promise<void> {
    const now = new Date().toISOString();
    await testEnv.DB.prepare(
      `INSERT INTO testimonies (type, program, from_email, from_name, status, event_id, created_at)
       VALUES ('testimony', 'mens', 't@x.com', 'T', ?, ?, ?)`
    ).bind(status, eventId, now).run();
  }

  it('archives the board, creates + activates the next encounter in one step', async () => {
    const oldId = await insertCurrentMens('2020-08-08'); // ended long ago
    await insertTestimony(oldId, 'approved');
    await insertTestimony(oldId, 'draft_1_review');

    const res = await app.fetch(makeReq('POST', '/api/admin/events/rollover', cookie, 'mens', {
      year: 2027, season: 'spring', start_date: '2027-08-05', end_date: '2027-08-07',
      launch_locations: ['Colby', 'Hays'], attendee_limit: 120, confirm_year: 2027,
    }), testEnv);
    expect(res.status).toBe(201);
    const body = await res.json<{ ok: boolean; archived_count: number; new_event: Record<string, number>; previous_event: Record<string, number> }>();
    expect(body.ok).toBe(true);
    expect(body.archived_count).toBe(2);
    expect(body.new_event.year).toBe(2027);
    expect(body.new_event.is_current).toBe(1);
    expect(body.new_event.attendee_limit).toBe(120);
    expect(body.previous_event.is_current).toBe(0);

    const arch = await testEnv.DB.prepare(
      `SELECT COUNT(*) n FROM testimonies WHERE event_id=? AND status='archived'`
    ).bind(oldId).first<{ n: number }>();
    expect(arch?.n).toBe(2);

    const fresh = await testEnv.DB.prepare(
      `SELECT COUNT(*) n FROM testimonies WHERE event_id=? AND status!='archived'`
    ).bind(body.new_event.id).first<{ n: number }>();
    expect(fresh?.n).toBe(0);

    const cur = await testEnv.DB.prepare(
      `SELECT COUNT(*) n FROM events WHERE program='mens' AND is_current=1`
    ).first<{ n: number }>();
    expect(cur?.n).toBe(1);
  });

  it('refuses rollover when the current encounter has not ended', async () => {
    await insertCurrentMens('2099-08-08');
    const res = await app.fetch(makeReq('POST', '/api/admin/events/rollover', cookie, 'mens', {
      year: 2100, season: 'spring', start_date: '2100-08-05', end_date: '2100-08-07', confirm_year: 2100,
    }), testEnv);
    expect(res.status).toBe(409);
  });

  it('force=true overrides the not-ended guard', async () => {
    await insertCurrentMens('2099-08-08');
    const res = await app.fetch(makeReq('POST', '/api/admin/events/rollover', cookie, 'mens', {
      year: 2098, season: 'spring', start_date: '2098-08-05', end_date: '2098-08-07', confirm_year: 2098, force: true,
    }), testEnv);
    expect(res.status).toBe(201);
  });

  it('rejects when confirm_year does not match year', async () => {
    await insertCurrentMens('2020-08-08');
    const res = await app.fetch(makeReq('POST', '/api/admin/events/rollover', cookie, 'mens', {
      year: 2027, season: 'spring', confirm_year: 2026, start_date: '2027-08-05', end_date: '2027-08-07',
    }), testEnv);
    expect(res.status).toBe(400);
  });

  it('409 when there is no current encounter', async () => {
    const res = await app.fetch(makeReq('POST', '/api/admin/events/rollover', cookie, 'mens', {
      year: 2027, season: 'spring', confirm_year: 2027, start_date: '2027-08-05', end_date: '2027-08-07',
    }), testEnv);
    expect(res.status).toBe(409);
  });

  it('409 when the target year AND season already exist', async () => {
    await insertCurrentMens('2020-08-08');
    const now = new Date().toISOString();
    await testEnv.DB.prepare(
      `INSERT INTO events (program, year, season, launch_locations, attendee_registration_open, server_registration_open, is_current, created_at, updated_at)
       VALUES ('mens', 2027, 'spring', '[]', 1, 1, 0, ?, ?)`
    ).bind(now, now).run();
    const res = await app.fetch(makeReq('POST', '/api/admin/events/rollover', cookie, 'mens', {
      year: 2027, season: 'spring', confirm_year: 2027, start_date: '2027-08-05', end_date: '2027-08-07',
    }), testEnv);
    expect(res.status).toBe(409);
  });

  it('allows rolling into spring when only FALL of that year exists', async () => {
    // The whole point of seasons: two encounters share a year. A fall 2027
    // encounter must not block creating spring 2027.
    await insertCurrentMens('2020-08-08');
    const now = new Date().toISOString();
    await testEnv.DB.prepare(
      `INSERT INTO events (program, year, season, launch_locations, attendee_registration_open, server_registration_open, is_current, created_at, updated_at)
       VALUES ('mens', 2027, 'fall', '[]', 1, 1, 0, ?, ?)`
    ).bind(now, now).run();
    const res = await app.fetch(makeReq('POST', '/api/admin/events/rollover', cookie, 'mens', {
      year: 2027, season: 'spring', confirm_year: 2027, start_date: '2027-04-05', end_date: '2027-04-07',
    }), testEnv);
    expect(res.status).toBe(201);
  });

  it('preview returns the current encounter, counts, ended flag, suggested year', async () => {
    const oldId = await insertCurrentMens('2020-08-08');
    await insertTestimony(oldId, 'approved');
    const res = await app.fetch(makeReq('GET', '/api/admin/events/rollover/preview', cookie, 'mens'), testEnv);
    expect(res.status).toBe(200);
    const body = await res.json<{ current: { id: number }; board_count: number; ended: boolean; suggested_year: number }>();
    expect(body.current.id).toBe(oldId);
    expect(body.board_count).toBe(1);
    expect(body.ended).toBe(true);
    expect(body.suggested_year).toBe(2027);
  });

  it('preview returns current=null when no current encounter exists', async () => {
    const res = await app.fetch(makeReq('GET', '/api/admin/events/rollover/preview', cookie, 'mens'), testEnv);
    expect(res.status).toBe(200);
    const body = await res.json<{ current: unknown }>();
    expect(body.current).toBeNull();
  });
});
