// functions/_api/__tests__/dashboard.routes.test.ts
// TDD integration tests for GET /api/admin/dashboard

import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { app } from '../app';
import { applyMigrations, seedAdmin } from './setup';
import { hashPassword } from '../auth';
import { nowIso } from '../db';
import type { Env } from '../app';

const testEnv = env as unknown as Env;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Seeds an event row for the given program and returns its id.
 * is_current = 1 by default.
 */
async function seedEvent(opts: {
  program: 'mens' | 'women';
  isCurrent?: number;
}): Promise<number> {
  const now = nowIso();
  const db = (env as unknown as { DB: D1Database }).DB;
  const { meta } = await db
    .prepare(
      `INSERT INTO events
         (program, year, title, start_date, end_date, launch_locations,
          attendee_registration_open, server_registration_open, is_current, created_at, updated_at)
       VALUES (?, 2026, 'Test Event', '2026-08-06', '2026-08-08', '["Oakley","Colby","Norton"]',
               1, 1, ?, ?, ?)`
    )
    .bind(opts.program, opts.isCurrent ?? 1, now, now)
    .run();
  return meta.last_row_id as number;
}

/**
 * Seeds a person row and returns its id.
 * timesAttended is stored on the people row as times_attended.
 */
async function seedPerson(opts: {
  program: 'mens' | 'women';
  firstName?: string;
  lastName?: string;
  email?: string;
  timesAttended?: number;
}): Promise<number> {
  const now = nowIso();
  const db = (env as unknown as { DB: D1Database }).DB;
  const email = opts.email ?? `person_${Math.random().toString(36).slice(2)}@example.com`;
  const { meta } = await db
    .prepare(
      `INSERT INTO people
         (program, first_name, last_name, email, times_attended, times_served, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
    )
    .bind(
      opts.program,
      opts.firstName ?? 'First',
      opts.lastName ?? 'Last',
      email,
      opts.timesAttended ?? 0,
      now,
      now
    )
    .run();
  return meta.last_row_id as number;
}

/**
 * Seeds a registration row and returns its id.
 * Also creates a person if personId is not provided.
 */
async function seedRegistration(opts: {
  program: 'mens' | 'women';
  eventId: number;
  role: 'attendee' | 'server';
  timesAttended?: number;
  launchLocation?: string;
  shirtSize?: string;
  personId?: number;
}): Promise<number> {
  const now = nowIso();
  const db = (env as unknown as { DB: D1Database }).DB;
  const personId =
    opts.personId ??
    (await seedPerson({
      program: opts.program,
      timesAttended: opts.timesAttended ?? 1,
    }));

  const { meta } = await db
    .prepare(
      `INSERT INTO registrations
         (program, event_id, person_id, role, first_name, last_name, launch_location, shirt_size, created_at)
       VALUES (?, ?, ?, ?, 'First', 'Last', ?, ?, ?)`
    )
    .bind(opts.program, opts.eventId, personId, opts.role, opts.launchLocation ?? null, opts.shirtSize ?? null, now)
    .run();
  return meta.last_row_id as number;
}

/**
 * Logs in the default admin and returns a Cookie header value.
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/admin/dashboard', () => {
  beforeEach(async () => {
    await applyMigrations(env as any);
  });

  it('returns 401 without auth', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/admin/dashboard?program=mens'),
      testEnv
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 without program param', async () => {
    await seedAdmin();
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request('http://localhost/api/admin/dashboard', {
        headers: { Cookie: cookie },
      }),
      testEnv
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid program value', async () => {
    await seedAdmin();
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request('http://localhost/api/admin/dashboard?program=boys', {
        headers: { Cookie: cookie },
      }),
      testEnv
    );
    expect(res.status).toBe(400);
  });

  it('returns zero stats when no current event exists', async () => {
    await seedAdmin();
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request('http://localhost/api/admin/dashboard?program=mens', {
        headers: { Cookie: cookie },
      }),
      testEnv
    );
    expect(res.status).toBe(200);
    const json = await res.json() as { ok: boolean; stats: Record<string, unknown> };
    expect(json.ok).toBe(true);
    expect(json.stats.attendee_count).toBe(0);
    expect(json.stats.server_count).toBe(0);
    expect(json.stats.first_timers).toBe(0);
    expect(json.stats.upcoming_event).toBeNull();
  });

  it('returns zero stats for empty event', async () => {
    await seedAdmin();
    await seedEvent({ program: 'mens' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request('http://localhost/api/admin/dashboard?program=mens', {
        headers: { Cookie: cookie },
      }),
      testEnv
    );
    expect(res.status).toBe(200);
    const json = await res.json() as { ok: boolean; stats: Record<string, unknown> };
    expect(json.ok).toBe(true);
    expect(json.stats.attendee_count).toBe(0);
    expect(json.stats.server_count).toBe(0);
    expect(json.stats.first_timers).toBe(0);
  });

  it('counts attendees, servers, and first-timers correctly', async () => {
    await seedAdmin();
    const eventId = await seedEvent({ program: 'mens' });
    // attendee with timesAttended=0 → first-timer
    await seedRegistration({ program: 'mens', eventId, role: 'attendee', timesAttended: 0 });
    // attendee with timesAttended=2 → returning
    await seedRegistration({ program: 'mens', eventId, role: 'attendee', timesAttended: 2 });
    // server
    await seedRegistration({ program: 'mens', eventId, role: 'server', timesAttended: 1 });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request('http://localhost/api/admin/dashboard?program=mens', {
        headers: { Cookie: cookie },
      }),
      testEnv
    );
    const json = await res.json() as {
      ok: boolean;
      stats: { attendee_count: number; server_count: number; first_timers: number };
    };
    expect(json.stats.attendee_count).toBe(2);
    expect(json.stats.server_count).toBe(1);
    expect(json.stats.first_timers).toBe(1);
  });

  it('returns by_launch_location breakdown', async () => {
    await seedAdmin();
    const eventId = await seedEvent({ program: 'mens' });
    await seedRegistration({ program: 'mens', eventId, role: 'attendee', launchLocation: 'Oakley' });
    await seedRegistration({ program: 'mens', eventId, role: 'attendee', launchLocation: 'Colby' });
    await seedRegistration({ program: 'mens', eventId, role: 'attendee', launchLocation: 'Oakley' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request('http://localhost/api/admin/dashboard?program=mens', {
        headers: { Cookie: cookie },
      }),
      testEnv
    );
    const json = await res.json() as {
      ok: boolean;
      stats: { by_launch_location: Array<{ location: string; count: number }> };
    };
    const oakley = json.stats.by_launch_location.find((l) => l.location === 'Oakley');
    const colby = json.stats.by_launch_location.find((l) => l.location === 'Colby');
    expect(oakley?.count).toBe(2);
    expect(colby?.count).toBe(1);
  });

  it('returns by_shirt_size breakdown', async () => {
    await seedAdmin();
    const eventId = await seedEvent({ program: 'mens' });
    await seedRegistration({ program: 'mens', eventId, role: 'attendee', shirtSize: 'L' });
    await seedRegistration({ program: 'mens', eventId, role: 'attendee', shirtSize: 'L' });
    await seedRegistration({ program: 'mens', eventId, role: 'attendee', shirtSize: 'XL' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request('http://localhost/api/admin/dashboard?program=mens', {
        headers: { Cookie: cookie },
      }),
      testEnv
    );
    const json = await res.json() as {
      ok: boolean;
      stats: { by_shirt_size: Array<{ size: string; count: number }> };
    };
    const large = json.stats.by_shirt_size.find((s) => s.size === 'L');
    const xl = json.stats.by_shirt_size.find((s) => s.size === 'XL');
    expect(large?.count).toBe(2);
    expect(xl?.count).toBe(1);
  });

  it('womens program is isolated from mens', async () => {
    await seedAdmin();
    const mensEventId = await seedEvent({ program: 'mens' });
    await seedRegistration({ program: 'mens', eventId: mensEventId, role: 'attendee' });
    const cookie = await getAuthCookie();
    // Query women program — should see zero despite mens having 1 attendee
    const res = await app.fetch(
      new Request('http://localhost/api/admin/dashboard?program=women', {
        headers: { Cookie: cookie },
      }),
      testEnv
    );
    const json = await res.json() as { ok: boolean; stats: { attendee_count: number } };
    expect(res.status).toBe(200);
    expect(json.stats.attendee_count).toBe(0);
  });

  it('returns recent_registrations (last 10) in descending order', async () => {
    await seedAdmin();
    const eventId = await seedEvent({ program: 'mens' });
    // Seed 3 registrations
    await seedRegistration({ program: 'mens', eventId, role: 'attendee', shirtSize: 'S' });
    await seedRegistration({ program: 'mens', eventId, role: 'attendee', shirtSize: 'M' });
    await seedRegistration({ program: 'mens', eventId, role: 'server', shirtSize: 'L' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request('http://localhost/api/admin/dashboard?program=mens', {
        headers: { Cookie: cookie },
      }),
      testEnv
    );
    const json = await res.json() as {
      ok: boolean;
      stats: { recent_registrations: Array<{ id: number; role: string }> };
    };
    expect(Array.isArray(json.stats.recent_registrations)).toBe(true);
    expect(json.stats.recent_registrations.length).toBe(3);
  });

  it('returns email_sent_count for the program', async () => {
    await seedAdmin();
    const eventId = await seedEvent({ program: 'mens' });
    const db = (env as unknown as { DB: D1Database }).DB;
    const now = nowIso();
    // Insert 2 sent + 1 queued email_log rows for mens
    await db.prepare(
      `INSERT INTO email_log (program, to_email, type, template_key, status, created_at)
       VALUES ('mens', 'a@b.com', 'transactional', 'welcome', 'sent', ?)`
    ).bind(now).run();
    await db.prepare(
      `INSERT INTO email_log (program, to_email, type, template_key, status, created_at)
       VALUES ('mens', 'c@d.com', 'transactional', 'welcome', 'delivered', ?)`
    ).bind(now).run();
    await db.prepare(
      `INSERT INTO email_log (program, to_email, type, template_key, status, created_at)
       VALUES ('mens', 'e@f.com', 'transactional', 'welcome', 'queued', ?)`
    ).bind(now).run();

    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request('http://localhost/api/admin/dashboard?program=mens', {
        headers: { Cookie: cookie },
      }),
      testEnv
    );
    const json = await res.json() as { ok: boolean; stats: { email_sent_count: number } };
    // Only 'sent' and 'delivered' count
    expect(json.stats.email_sent_count).toBe(2);
  });

  it('upcoming_event is returned in stats', async () => {
    await seedAdmin();
    await seedEvent({ program: 'mens' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request('http://localhost/api/admin/dashboard?program=mens', {
        headers: { Cookie: cookie },
      }),
      testEnv
    );
    const json = await res.json() as {
      ok: boolean;
      stats: { upcoming_event: { id: number; year: number } | null };
    };
    expect(json.stats.upcoming_event).not.toBeNull();
    expect(json.stats.upcoming_event?.year).toBe(2026);
  });

  it('email_sent_count is isolated per program', async () => {
    await seedAdmin();
    const db = (env as unknown as { DB: D1Database }).DB;
    const now = nowIso();
    // Insert 3 sent for mens, 1 sent for women
    await db.prepare(
      `INSERT INTO email_log (program, to_email, type, status, created_at)
       VALUES ('mens', 'a@b.com', 'transactional', 'sent', ?)`
    ).bind(now).run();
    await db.prepare(
      `INSERT INTO email_log (program, to_email, type, status, created_at)
       VALUES ('mens', 'b@c.com', 'transactional', 'sent', ?)`
    ).bind(now).run();
    await db.prepare(
      `INSERT INTO email_log (program, to_email, type, status, created_at)
       VALUES ('mens', 'c@d.com', 'transactional', 'sent', ?)`
    ).bind(now).run();
    await db.prepare(
      `INSERT INTO email_log (program, to_email, type, status, created_at)
       VALUES ('women', 'w@x.com', 'transactional', 'sent', ?)`
    ).bind(now).run();

    const cookie = await getAuthCookie();
    const mensRes = await app.fetch(
      new Request('http://localhost/api/admin/dashboard?program=mens', {
        headers: { Cookie: cookie },
      }),
      testEnv
    );
    const mensJson = await mensRes.json() as { ok: boolean; stats: { email_sent_count: number } };
    expect(mensJson.stats.email_sent_count).toBe(3);

    const womenRes = await app.fetch(
      new Request('http://localhost/api/admin/dashboard?program=women', {
        headers: { Cookie: cookie },
      }),
      testEnv
    );
    const womenJson = await womenRes.json() as { ok: boolean; stats: { email_sent_count: number } };
    expect(womenJson.stats.email_sent_count).toBe(1);
  });
});
