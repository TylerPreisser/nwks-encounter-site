// Express Interest: the public submit endpoint, the admin queue view, and the
// roster/detail data the Attendees & Servers pages depend on.

import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { app } from '../app';
import { applyMigrations, seedAdmin } from './setup';
import type { Env } from '../app';

const testEnv = env as unknown as Env;
const db = () => (env as unknown as { DB: D1Database }).DB;

async function getAuthCookie(): Promise<string> {
  const res = await app.fetch(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@nwksencounter.com', password: 'TestPass1!' }),
    }),
    testEnv
  );
  const token = (res.headers.get('Set-Cookie') ?? '').match(/nwks_session=([^;]+)/)?.[1] ?? '';
  return `nwks_session=${token}`;
}

function adminReq(method: string, path: string, cookie: string, program = 'mens', body?: unknown) {
  const sep = path.includes('?') ? '&' : '?';
  return new Request(`http://localhost${path}${sep}program=${program}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const VALID_INTEREST = {
  program: 'mens',
  first_name: 'Jim',
  last_name: 'Halpert',
  email: 'jim@example.com',
  phone: '(785) 555-0100',
};

function interestReq(body: unknown) {
  return new Request('http://localhost/api/register/interest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Closes attendee enrollment on the men's current encounter (id 1). */
async function closeEnrollment() {
  await db().prepare(`UPDATE events SET attendee_registration_open = 0 WHERE id = 1`).run();
}

let cookie: string;

beforeEach(async () => {
  await applyMigrations(env as unknown as { DB: D1Database });
  await seedAdmin();
  cookie = await getAuthCookie();
});

describe('POST /api/register/interest', () => {
  it('accepts a submission when enrollment is CLOSED', async () => {
    await closeEnrollment();
    const res = await app.fetch(interestReq(VALID_INTEREST), testEnv);
    expect(res.status).toBe(202);

    const row = await db()
      .prepare(`SELECT program, event_id, first_name, email, phone, status FROM interest_queue WHERE email = ?`)
      .bind('jim@example.com')
      .first<Record<string, unknown>>();
    expect(row).toMatchObject({
      program: 'mens', event_id: 1, first_name: 'Jim', status: 'waiting',
    });
  });

  it('accepts a submission when the encounter is at CAP', async () => {
    // Cap of 0 means the very next attendee is one too many.
    await db().prepare(`UPDATE events SET attendee_limit = 0 WHERE id = 1`).run();
    const res = await app.fetch(interestReq(VALID_INTEREST), testEnv);
    expect(res.status).toBe(202);
  });

  it('409s when enrollment is OPEN — they should just register', async () => {
    const res = await app.fetch(interestReq(VALID_INTEREST), testEnv);
    expect(res.status).toBe(409);
    const body = await res.json<{ error: string; registration_open: boolean }>();
    expect(body.registration_open).toBe(true);

    const row = await db()
      .prepare(`SELECT id FROM interest_queue WHERE email = ?`)
      .bind('jim@example.com')
      .first();
    expect(row).toBeNull();
  });

  it('dedupes a repeat submission instead of queueing a second invite', async () => {
    await closeEnrollment();
    await app.fetch(interestReq(VALID_INTEREST), testEnv);
    const res = await app.fetch(
      interestReq({ ...VALID_INTEREST, phone: '(785) 555-0199' }),
      testEnv
    );
    expect(res.status).toBe(202);

    const { results } = await db()
      .prepare(`SELECT phone FROM interest_queue WHERE email = ?`)
      .bind('jim@example.com')
      .all<{ phone: string }>();
    expect(results).toHaveLength(1);
    // The newer submission wins — they may be correcting a typo.
    expect(results[0].phone).toBe('(785) 555-0199');
  });

  it('matches on email case-insensitively', async () => {
    await closeEnrollment();
    await app.fetch(interestReq(VALID_INTEREST), testEnv);
    await app.fetch(interestReq({ ...VALID_INTEREST, email: 'JIM@Example.com' }), testEnv);

    const { results } = await db()
      .prepare(`SELECT id FROM interest_queue`)
      .all<{ id: number }>();
    expect(results).toHaveLength(1);
  });

  it.each([
    ['missing first_name', { ...VALID_INTEREST, first_name: '' }],
    ['missing last_name', { ...VALID_INTEREST, last_name: '' }],
    ['missing email', { ...VALID_INTEREST, email: '' }],
    ['malformed email', { ...VALID_INTEREST, email: 'not-an-email' }],
    ['bad program', { ...VALID_INTEREST, program: 'coed' }],
  ])('400s on %s', async (_label, body) => {
    await closeEnrollment();
    const res = await app.fetch(interestReq(body), testEnv);
    expect(res.status).toBe(400);
  });

  it('404s when the program has no current encounter', async () => {
    await db().prepare(`UPDATE events SET is_current = 0 WHERE program = 'mens'`).run();
    const res = await app.fetch(interestReq(VALID_INTEREST), testEnv);
    expect(res.status).toBe(404);
  });

  it('never discloses whether the email is already known', async () => {
    await closeEnrollment();
    const first = await app.fetch(interestReq(VALID_INTEREST), testEnv);
    const second = await app.fetch(interestReq(VALID_INTEREST), testEnv);
    expect(await first.text()).toBe(await second.text());
  });
});

describe('GET /api/admin/interest', () => {
  beforeEach(async () => {
    await closeEnrollment();
    await app.fetch(interestReq(VALID_INTEREST), testEnv);
    await app.fetch(interestReq({ ...VALID_INTEREST, email: 'pam@example.com', first_name: 'Pam' }), testEnv);
  });

  it('lists the queue for the current encounter with a total', async () => {
    const res = await app.fetch(adminReq('GET', '/api/admin/interest', cookie), testEnv);
    expect(res.status).toBe(200);
    const body = await res.json<{ rows: { email: string }[]; total: number }>();
    expect(body.total).toBe(2);
    expect(body.rows.map((r) => r.email).sort()).toEqual(['jim@example.com', 'pam@example.com']);
  });

  it('scopes to the requested encounter', async () => {
    const res = await app.fetch(adminReq('GET', '/api/admin/interest?event_id=2', cookie), testEnv);
    const body = await res.json<{ total: number }>();
    expect(body.total).toBe(0);
  });

  it('does not leak the other program', async () => {
    const res = await app.fetch(adminReq('GET', '/api/admin/interest', cookie, 'women'), testEnv);
    const body = await res.json<{ total: number }>();
    expect(body.total).toBe(0);
  });

  it('401s without a session', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/admin/interest?program=mens'),
      testEnv
    );
    expect(res.status).toBe(401);
  });
});

describe('rollover notifies the interest queue', () => {
  beforeEach(async () => {
    await closeEnrollment();
    await app.fetch(interestReq(VALID_INTEREST), testEnv);
  });

  it('emails waiting entries and marks them notified against the new encounter', async () => {
    const res = await app.fetch(
      adminReq('POST', '/api/admin/events/rollover', cookie, 'mens', {
        year: 2027, season: 'spring', confirm_year: 2027, force: true,
      }),
      testEnv
    );
    expect(res.status).toBe(201);
    const body = await res.json<{ interest_notified: number; new_event: { id: number } }>();
    expect(body.interest_notified).toBe(1);

    const row = await db()
      .prepare(`SELECT status, notified_at, notified_event_id FROM interest_queue WHERE email = ?`)
      .bind('jim@example.com')
      .first<{ status: string; notified_at: string; notified_event_id: number }>();
    expect(row?.status).toBe('notified');
    expect(row?.notified_at).toBeTruthy();
    expect(row?.notified_event_id).toBe(body.new_event.id);
  });

  it('logs the invite email against the interest_invite template', async () => {
    await app.fetch(
      adminReq('POST', '/api/admin/events/rollover', cookie, 'mens', {
        year: 2027, season: 'spring', confirm_year: 2027, force: true,
      }),
      testEnv
    );
    const log = await db()
      .prepare(`SELECT to_email, template_key, type FROM email_log WHERE template_key = 'interest_invite'`)
      .first<{ to_email: string; template_key: string; type: string }>();
    expect(log).toMatchObject({
      to_email: 'jim@example.com', template_key: 'interest_invite', type: 'transactional',
    });
  });

  it('leaves the queue alone when notify_interest is false', async () => {
    const res = await app.fetch(
      adminReq('POST', '/api/admin/events/rollover', cookie, 'mens', {
        year: 2027, season: 'spring', confirm_year: 2027, force: true, notify_interest: false,
      }),
      testEnv
    );
    const body = await res.json<{ interest_notified: number }>();
    expect(body.interest_notified).toBe(0);

    const row = await db()
      .prepare(`SELECT status FROM interest_queue WHERE email = ?`)
      .bind('jim@example.com')
      .first<{ status: string }>();
    expect(row?.status).toBe('waiting');
  });

  it('reports the pending count on the rollover preview', async () => {
    const res = await app.fetch(adminReq('GET', '/api/admin/events/rollover/preview', cookie), testEnv);
    const body = await res.json<{ interest_count: number }>();
    expect(body.interest_count).toBe(1);
  });

  it('starts the NEW encounter with an empty queue', async () => {
    const rollover = await app.fetch(
      adminReq('POST', '/api/admin/events/rollover', cookie, 'mens', {
        year: 2027, season: 'spring', confirm_year: 2027, force: true,
      }),
      testEnv
    );
    const { new_event } = await rollover.json<{ new_event: { id: number } }>();

    const res = await app.fetch(
      adminReq('GET', `/api/admin/interest?event_id=${new_event.id}`, cookie),
      testEnv
    );
    const body = await res.json<{ total: number }>();
    expect(body.total).toBe(0);

    // ...but the old encounter's list survives for history.
    const old = await app.fetch(adminReq('GET', '/api/admin/interest?event_id=1', cookie), testEnv);
    expect((await old.json<{ total: number }>()).total).toBe(1);
  });
});

describe('roster data for the Attendees / Servers pages', () => {
  beforeEach(async () => {
    // A returning attendee and a first-time server, both on encounter 1.
    const now = new Date().toISOString();
    await db().prepare(
      `INSERT INTO people (id, program, first_name, last_name, email, times_attended, times_served, created_at, updated_at)
       VALUES (10, 'mens', 'Jim', 'Halpert', 'jim@example.com', 3, 0, ?, ?),
              (11, 'mens', 'Dwight', 'Schrute', 'dwight@example.com', 1, 0, ?, ?)`
    ).bind(now, now, now, now).run();

    await db().prepare(
      `INSERT INTO registrations
         (program, event_id, person_id, role, first_name, last_name, email, phone,
          launch_location, shirt_size, dietary_health, extra, status, created_at)
       VALUES ('mens', 1, 10, 'attendee', 'Jim', 'Halpert', 'jim@example.com', '(785) 555-0100',
               'Colby', 'XL', 'Peanut allergy', '{"zip":"67601"}', 'registered', ?),
              ('mens', 1, 11, 'server', 'Dwight', 'Schrute', 'dwight@example.com', '(785) 555-0111',
               'Hays', 'L', '', '{}', 'registered', ?)`
    ).bind(now, now).run();
  });

  it('returns attendance badge data so the roster can flag first-timers', async () => {
    const res = await app.fetch(
      adminReq('GET', '/api/admin/registrations?role=attendee', cookie),
      testEnv
    );
    const body = await res.json<{ rows: { first_name: string; times_attended: number; is_first_timer: number }[] }>();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].first_name).toBe('Jim');
    expect(body.rows[0].times_attended).toBe(3);
    expect(body.rows[0].is_first_timer).toBe(0);
  });

  it('flags a first-timer', async () => {
    const res = await app.fetch(
      adminReq('GET', '/api/admin/registrations?role=server', cookie),
      testEnv
    );
    const body = await res.json<{ rows: { is_first_timer: number }[] }>();
    expect(body.rows[0].is_first_timer).toBe(1);
  });

  it('carries dietary_health so the roster can surface it', async () => {
    const res = await app.fetch(
      adminReq('GET', '/api/admin/registrations?role=attendee', cookie),
      testEnv
    );
    const body = await res.json<{ rows: { dietary_health: string }[] }>();
    expect(body.rows[0].dietary_health).toBe('Peanut allergy');
  });

  it('keeps attendees and servers strictly separate', async () => {
    const attendees = await app.fetch(adminReq('GET', '/api/admin/registrations?role=attendee', cookie), testEnv);
    const servers = await app.fetch(adminReq('GET', '/api/admin/registrations?role=server', cookie), testEnv);
    expect((await attendees.json<{ total: number }>()).total).toBe(1);
    expect((await servers.json<{ total: number }>()).total).toBe(1);
  });

  it('returns the season on each history row so the detail page can label it', async () => {
    const res = await app.fetch(adminReq('GET', '/api/admin/people/10', cookie), testEnv);
    const body = await res.json<{ history: { season: string; year: number; display_name: string }[] }>();
    expect(body.history[0].season).toBe('fall');
    expect(body.history[0].display_name).toBe('Fall 2026');
  });
});
