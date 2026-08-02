// functions/_api/__tests__/registrations.routes.test.ts
// TDD integration tests for GET /api/admin/registrations and GET /api/admin/registrations/export.csv

import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { app } from '../app';
import { applyMigrations, seedAdmin } from './setup';
import { nowIso } from '../db';
import type { Env } from '../app';

const testEnv = env as unknown as Env;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedEvent(opts: {
  program: 'mens' | 'women';
  year?: number;
}): Promise<number> {
  const now = nowIso();
  const year = opts.year ?? 2026;
  const db = (env as unknown as { DB: D1Database }).DB;
  // INSERT OR REPLACE so this is safe when 0003_seed_events.sql already inserted the row.
  await db
    .prepare(
      `INSERT OR REPLACE INTO events
         (program, year, title, start_date, end_date, launch_locations,
          attendee_registration_open, server_registration_open, is_current, created_at, updated_at)
       VALUES (?, ?, 'Test Event', '2026-08-06', '2026-08-08', '["Oakley"]',
               1, 1, 1, ?, ?)`
    )
    .bind(opts.program, year, now, now)
    .run();
  const row = await db
    .prepare(`SELECT id FROM events WHERE program = ? AND year = ?`)
    .bind(opts.program, year)
    .first<{ id: number }>();
  return row!.id;
}

async function seedPerson(opts: {
  program: 'mens' | 'women';
  firstName?: string;
  lastName?: string;
  email?: string;
}): Promise<number> {
  const now = nowIso();
  const db = (env as unknown as { DB: D1Database }).DB;
  const email = opts.email ?? `person_${Math.random().toString(36).slice(2)}@example.com`;
  const { meta } = await db
    .prepare(
      `INSERT INTO people
         (program, first_name, last_name, email, times_attended, times_served, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, 0, ?, ?)`
    )
    .bind(
      opts.program,
      opts.firstName ?? 'First',
      opts.lastName ?? 'Last',
      email,
      now,
      now,
    )
    .run();
  return meta.last_row_id as number;
}

async function seedRegistration(opts: {
  program: 'mens' | 'women';
  eventId: number;
  role: 'attendee' | 'server';
  firstName?: string;
  lastName?: string;
  email?: string;
}): Promise<number> {
  const now = nowIso();
  const db = (env as unknown as { DB: D1Database }).DB;
  const personId = await seedPerson({
    program: opts.program,
    firstName: opts.firstName,
    lastName: opts.lastName,
    email: opts.email,
  });
  const firstName = opts.firstName ?? 'First';
  const lastName = opts.lastName ?? 'Last';
  const email = opts.email ?? `reg_${Math.random().toString(36).slice(2)}@example.com`;
  const { meta } = await db
    .prepare(
      `INSERT INTO registrations
         (program, event_id, person_id, role, first_name, last_name, email, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(opts.program, opts.eventId, personId, opts.role, firstName, lastName, email, now)
    .run();
  return meta.last_row_id as number;
}

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
  const loginRes = await app.fetch(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(_trusted ? { Cookie: _trusted } : {}) },
      body: JSON.stringify({ email: 'admin@nwksencounter.com', password: 'TestPass1!' }),
    }),
    testEnv,
  );
  const setCookie = loginRes.headers.get('Set-Cookie') ?? '';
  const token = setCookie.match(/nwks_session=([^;]+)/)?.[1] ?? '';
  return `nwks_session=${token}`;
}

// ---------------------------------------------------------------------------
// GET /api/admin/registrations
// ---------------------------------------------------------------------------

describe('GET /api/admin/registrations', () => {
  beforeEach(async () => {
    await applyMigrations(env as any);
  });

  it('returns 401 without auth', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/admin/registrations?program=mens'),
      testEnv,
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 without program param', async () => {
    await seedAdmin();
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request('http://localhost/api/admin/registrations', {
        headers: { Cookie: cookie },
      }),
      testEnv,
    );
    expect(res.status).toBe(400);
  });

  it('returns empty list when no registrations', async () => {
    await seedAdmin();
    await seedEvent({ program: 'mens' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request('http://localhost/api/admin/registrations?program=mens'),
      testEnv,
    );
    // Without auth should be 401 — with auth should be 200
    const authRes = await app.fetch(
      new Request('http://localhost/api/admin/registrations?program=mens', {
        headers: { Cookie: cookie },
      }),
      testEnv,
    );
    const json = await authRes.json() as { ok: boolean; rows: unknown[]; total: number };
    expect(json.ok).toBe(true);
    expect(json.rows).toHaveLength(0);
    expect(json.total).toBe(0);
  });

  it('filters by event_id', async () => {
    await seedAdmin();
    const eventId = await seedEvent({ program: 'mens' });
    const eventId2 = await seedEvent({ program: 'mens', year: 2025 });
    await seedRegistration({ program: 'mens', eventId, role: 'attendee' });
    await seedRegistration({ program: 'mens', eventId: eventId2, role: 'attendee' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request(`http://localhost/api/admin/registrations?program=mens&event_id=${eventId}`, {
        headers: { Cookie: cookie },
      }),
      testEnv,
    );
    const json = await res.json() as { ok: boolean; rows: unknown[]; total: number };
    expect(json.total).toBe(1);
  });

  it('filters by role', async () => {
    await seedAdmin();
    const eventId = await seedEvent({ program: 'mens' });
    await seedRegistration({ program: 'mens', eventId, role: 'attendee' });
    await seedRegistration({ program: 'mens', eventId, role: 'server' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request(`http://localhost/api/admin/registrations?program=mens&role=server`, {
        headers: { Cookie: cookie },
      }),
      testEnv,
    );
    const json = await res.json() as { ok: boolean; rows: unknown[]; total: number };
    expect(json.total).toBe(1);
  });

  it('searches by first_name, last_name, and email via q param', async () => {
    await seedAdmin();
    const eventId = await seedEvent({ program: 'mens' });
    await seedRegistration({
      program: 'mens', eventId, role: 'attendee',
      firstName: 'John', lastName: 'Smith', email: 'john@example.com',
    });
    await seedRegistration({
      program: 'mens', eventId, role: 'attendee',
      firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com',
    });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request(`http://localhost/api/admin/registrations?program=mens&q=john`, {
        headers: { Cookie: cookie },
      }),
      testEnv,
    );
    const json = await res.json() as { ok: boolean; rows: Array<{ first_name: string }>; total: number };
    expect(json.total).toBe(1);
    expect(json.rows[0].first_name).toBe('John');
  });

  it('paginates results with page param', async () => {
    await seedAdmin();
    const eventId = await seedEvent({ program: 'mens' });
    for (let i = 0; i < 55; i++) {
      await seedRegistration({ program: 'mens', eventId, role: 'attendee', firstName: `User${i}` });
    }
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request(`http://localhost/api/admin/registrations?program=mens&page=2`, {
        headers: { Cookie: cookie },
      }),
      testEnv,
    );
    const json = await res.json() as {
      ok: boolean;
      rows: unknown[];
      total: number;
      page: number;
      per_page: number;
    };
    expect(json.total).toBe(55);
    expect(json.page).toBe(2);
    expect(json.rows.length).toBeLessThanOrEqual(50);
    expect(json.rows.length).toBeGreaterThan(0);
  });

  it('excludes registrations from another program', async () => {
    await seedAdmin();
    const mensEventId = await seedEvent({ program: 'mens' });
    const womenEventId = await seedEvent({ program: 'women' });
    await seedRegistration({ program: 'mens', eventId: mensEventId, role: 'attendee' });
    await seedRegistration({ program: 'women', eventId: womenEventId, role: 'attendee' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request(`http://localhost/api/admin/registrations?program=mens`, {
        headers: { Cookie: cookie },
      }),
      testEnv,
    );
    const json = await res.json() as { ok: boolean; rows: unknown[]; total: number };
    expect(json.total).toBe(1);
  });

  it('returns page and per_page in response', async () => {
    await seedAdmin();
    await seedEvent({ program: 'mens' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request(`http://localhost/api/admin/registrations?program=mens`, {
        headers: { Cookie: cookie },
      }),
      testEnv,
    );
    const json = await res.json() as { ok: boolean; page: number; per_page: number };
    expect(json.page).toBe(1);
    expect(json.per_page).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/registrations/export.csv
// ---------------------------------------------------------------------------

describe('GET /api/admin/registrations/export.csv', () => {
  beforeEach(async () => {
    await applyMigrations(env as any);
  });

  it('returns 401 without auth', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/admin/registrations/export.csv?program=mens'),
      testEnv,
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 without program param', async () => {
    await seedAdmin();
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request('http://localhost/api/admin/registrations/export.csv', {
        headers: { Cookie: cookie },
      }),
      testEnv,
    );
    expect(res.status).toBe(400);
  });

  it('responds with text/csv content-type and attachment disposition', async () => {
    await seedAdmin();
    await seedEvent({ program: 'mens' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request('http://localhost/api/admin/registrations/export.csv?program=mens', {
        headers: { Cookie: cookie },
      }),
      testEnv,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    const disposition = res.headers.get('Content-Disposition') ?? '';
    expect(disposition).toContain('attachment');
    expect(disposition).toContain('registrations.csv');
  });

  it('includes header row and data rows in correct CSV format', async () => {
    await seedAdmin();
    const eventId = await seedEvent({ program: 'mens' });
    await seedRegistration({
      program: 'mens', eventId, role: 'attendee',
      firstName: 'Bob', lastName: 'Jones', email: 'bob@example.com',
    });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request(
        `http://localhost/api/admin/registrations/export.csv?program=mens&event_id=${eventId}`,
        { headers: { Cookie: cookie } },
      ),
      testEnv,
    );
    const text = await res.text();
    const lines = text.trim().split('\n');
    expect(lines.length).toBe(2); // header + 1 data row
    expect(lines[0]).toContain('first_name');
    expect(lines[0]).toContain('last_name');
    expect(lines[0]).toContain('email');
    expect(lines[0]).toContain('role');
    expect(lines[1]).toContain('Bob');
    expect(lines[1]).toContain('Jones');
  });

  it('escapes commas and double-quotes in CSV values per RFC 4180', async () => {
    await seedAdmin();
    const eventId = await seedEvent({ program: 'mens' });
    // firstName contains comma, lastName contains double-quote
    await seedRegistration({
      program: 'mens', eventId, role: 'attendee',
      firstName: 'Al,ice', lastName: 'O\'Brien "the third"',
    });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request(
        `http://localhost/api/admin/registrations/export.csv?program=mens&event_id=${eventId}`,
        { headers: { Cookie: cookie } },
      ),
      testEnv,
    );
    const text = await res.text();
    // Values containing commas must be wrapped in quotes
    expect(text).toContain('"Al,ice"');
    // Internal double-quotes must be doubled (RFC 4180)
    expect(text).toContain('"O\'Brien ""the third"""');
  });

  it('escapes newlines in CSV values', async () => {
    await seedAdmin();
    const eventId = await seedEvent({ program: 'mens' });
    await seedRegistration({
      program: 'mens', eventId, role: 'attendee',
      firstName: 'Line\nBreak',
    });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request(
        `http://localhost/api/admin/registrations/export.csv?program=mens&event_id=${eventId}`,
        { headers: { Cookie: cookie } },
      ),
      testEnv,
    );
    const text = await res.text();
    expect(text).toContain('"Line\nBreak"');
  });

  it('filters export by role', async () => {
    await seedAdmin();
    const eventId = await seedEvent({ program: 'mens' });
    await seedRegistration({ program: 'mens', eventId, role: 'attendee', firstName: 'Att' });
    await seedRegistration({ program: 'mens', eventId, role: 'server', firstName: 'Srv' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request(
        `http://localhost/api/admin/registrations/export.csv?program=mens&event_id=${eventId}&role=server`,
        { headers: { Cookie: cookie } },
      ),
      testEnv,
    );
    const text = await res.text();
    expect(text).toContain('Srv');
    expect(text).not.toContain('Att');
  });

  it('filters export by event_id', async () => {
    await seedAdmin();
    const eventId = await seedEvent({ program: 'mens' });
    const eventId2 = await seedEvent({ program: 'mens', year: 2025 });
    await seedRegistration({ program: 'mens', eventId, role: 'attendee', firstName: 'InEvent' });
    await seedRegistration({ program: 'mens', eventId: eventId2, role: 'attendee', firstName: 'OtherEvent' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request(
        `http://localhost/api/admin/registrations/export.csv?program=mens&event_id=${eventId}`,
        { headers: { Cookie: cookie } },
      ),
      testEnv,
    );
    const text = await res.text();
    expect(text).toContain('InEvent');
    expect(text).not.toContain('OtherEvent');
  });

  it('returns only the requested program in CSV export', async () => {
    await seedAdmin();
    const mensEventId = await seedEvent({ program: 'mens' });
    const womenEventId = await seedEvent({ program: 'women' });
    await seedRegistration({ program: 'mens', eventId: mensEventId, role: 'attendee', firstName: 'MensOnly' });
    await seedRegistration({ program: 'women', eventId: womenEventId, role: 'attendee', firstName: 'WomenOnly' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request(
        `http://localhost/api/admin/registrations/export.csv?program=mens`,
        { headers: { Cookie: cookie } },
      ),
      testEnv,
    );
    const text = await res.text();
    expect(text).toContain('MensOnly');
    expect(text).not.toContain('WomenOnly');
  });

  it('returns just a header row when no data matches filters', async () => {
    await seedAdmin();
    await seedEvent({ program: 'mens' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request(
        `http://localhost/api/admin/registrations/export.csv?program=mens`,
        { headers: { Cookie: cookie } },
      ),
      testEnv,
    );
    const text = await res.text();
    // Should be exactly 1 line: the header row (trim removes trailing \r\n)
    const lines = text.trim().split('\n');
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('first_name');
  });

  it('includes extra fields as extra_* columns in the CSV header and data', async () => {
    await seedAdmin();
    const eventId = await seedEvent({ program: 'mens' });
    const db = (env as unknown as { DB: D1Database }).DB;
    const now = nowIso();
    const personId = await seedPerson({ program: 'mens', firstName: 'ExtraTest' });
    // Insert registration with extra JSON
    await db.prepare(
      `INSERT INTO registrations
         (program, event_id, person_id, role, first_name, last_name, extra, created_at)
       VALUES (?, ?, ?, 'attendee', 'ExtraTest', 'Last', ?, ?)`
    ).bind('mens', eventId, personId, JSON.stringify({ zip: '67748', sandwich_preference: 'Turkey' }), now).run();

    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request(
        `http://localhost/api/admin/registrations/export.csv?program=mens&event_id=${eventId}`,
        { headers: { Cookie: cookie } },
      ),
      testEnv,
    );
    const text = await res.text();
    const lines = text.trim().split('\n');
    expect(lines.length).toBe(2); // header + 1 data row
    // Header should contain extra_* columns
    expect(lines[0]).toContain('extra_zip');
    expect(lines[0]).toContain('extra_sandwich_preference');
    // Data row should contain the values
    expect(lines[1]).toContain('67748');
    expect(lines[1]).toContain('Turkey');
  });

  it('includes extra_* columns with empty values when extra is empty', async () => {
    await seedAdmin();
    const eventId = await seedEvent({ program: 'mens' });
    const db = (env as unknown as { DB: D1Database }).DB;
    const now = nowIso();
    const personId = await seedPerson({ program: 'mens', firstName: 'EmptyExtra' });
    await db.prepare(
      `INSERT INTO registrations
         (program, event_id, person_id, role, first_name, last_name, extra, created_at)
       VALUES (?, ?, ?, 'attendee', 'EmptyExtra', 'Last', '{}', ?)`
    ).bind('mens', eventId, personId, now).run();

    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request(
        `http://localhost/api/admin/registrations/export.csv?program=mens&event_id=${eventId}`,
        { headers: { Cookie: cookie } },
      ),
      testEnv,
    );
    const text = await res.text();
    const lines = text.trim().split('\n');
    // When no extra keys exist across all rows, no extra_* columns should appear
    expect(lines[0]).not.toContain('extra_');
    expect(lines[0]).toContain('first_name');
  });
});
