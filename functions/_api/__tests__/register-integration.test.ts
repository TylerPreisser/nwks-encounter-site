// functions/_api/__tests__/register-integration.test.ts
// Integration tests for POST /api/register/:program/:role
// These tests run against the full Hono app with a real D1 in Miniflare.

import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { applyMigrations } from './setup';
import { app } from '../app';
import { nowIso } from '../db';
import type { Env } from '../app';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedCurrentEvent(
  db: D1Database,
  program: 'mens' | 'women',
  opts: {
    attendee_registration_open?: 0 | 1;
    server_registration_open?: 0 | 1;
  } = {}
): Promise<number> {
  const now = nowIso();
  const { meta } = await db
    .prepare(
      `INSERT INTO events
         (program, year, title, start_date, end_date, launch_locations,
          attendee_registration_open, server_registration_open, is_current, created_at, updated_at)
       VALUES (?, 2026, 'Test Event', '2026-08-06', '2026-08-08', '["Hays","Norton"]',
               ?, ?, 1, ?, ?)`
    )
    .bind(
      program,
      opts.attendee_registration_open ?? 1,
      opts.server_registration_open ?? 1,
      now,
      now
    )
    .run();
  return meta.last_row_id as number;
}

function makeRequest(
  path: string,
  body: Record<string, unknown>,
  ip = '1.2.3.4'
): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': ip,
    },
    body: JSON.stringify(body),
  });
}

const VALID_MENS_ATTENDEE = {
  first_name: 'John',
  last_name: 'Doe',
  email: 'john.doe@example.com',
  phone: '7851234567',
  phone_type: 'Cell',
  address: '123 Main St',
  city: 'Hays',
  state: 'KS',
  launch_location: 'Hays',
  shirt_size: 'L',
  church: 'First Baptist',
  times_attended_self_report: 'This will be my first time!',
  invited_by: 'A friend',
  prayer_contact_name: 'Jane Doe',
  prayer_contact_phone: '7859876543',
  cf_turnstile_response: '__TEST_BYPASS__',
};

const VALID_MENS_SERVER = {
  first_name: 'Bob',
  last_name: 'Smith',
  email: 'bob.smith@example.com',
  phone: '7851112222',
  phone_type: 'Cell',
  address: '456 Oak Ave',
  city: 'Norton',
  state: 'KS',
  launch_location: 'Norton',
  shirt_size: 'M',
  church: 'Grace Community',
  times_served_self_report: 'This will be my first time serving!',
  prayer_contact_name: 'Alice Smith',
  prayer_contact_phone: '7853334444',
  cf_turnstile_response: '__TEST_BYPASS__',
};

const testEnv = env as unknown as Env;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/register/:program/:role — integration', () => {
  beforeEach(async () => {
    await applyMigrations(env as any);
  });

  // ── Happy path: mens/attendee ────────────────────────────────────────────
  it('happy path: creates person + registration, returns ids (mens/attendee)', async () => {
    await seedCurrentEvent(env.DB as D1Database, 'mens');

    const res = await app.fetch(
      makeRequest('/api/register/mens/attendee', VALID_MENS_ATTENDEE),
      testEnv
    );

    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.ok).toBe(true);
    expect(typeof body.registration_id).toBe('number');
    expect(typeof body.person_id).toBe('number');
    expect(body.registration_id).toBeGreaterThan(0);
    expect(body.person_id).toBeGreaterThan(0);
  });

  // ── Registration row is written with correct data ────────────────────────
  it('creates registration row with correct fields snapshot', async () => {
    await seedCurrentEvent(env.DB as D1Database, 'mens');

    const res = await app.fetch(
      makeRequest('/api/register/mens/attendee', VALID_MENS_ATTENDEE),
      testEnv
    );
    const body = await res.json<any>();
    expect(body.ok).toBe(true);

    const reg = await (env.DB as D1Database)
      .prepare('SELECT * FROM registrations WHERE id = ?')
      .bind(body.registration_id)
      .first<any>();

    expect(reg).toBeTruthy();
    expect(reg.program).toBe('mens');
    expect(reg.role).toBe('attendee');
    expect(reg.status).toBe('registered');
    expect(reg.first_name).toBe('John');
    expect(reg.last_name).toBe('Doe');
    expect(reg.email).toBe('john.doe@example.com');
    expect(reg.person_id).toBe(body.person_id);
  });

  // ── Rollups are updated after registration ───────────────────────────────
  it('recomputes rollups: times_attended = 1 after attendee registration', async () => {
    await seedCurrentEvent(env.DB as D1Database, 'mens');

    const res = await app.fetch(
      makeRequest('/api/register/mens/attendee', VALID_MENS_ATTENDEE),
      testEnv
    );
    const body = await res.json<any>();
    expect(body.ok).toBe(true);

    const person = await (env.DB as D1Database)
      .prepare('SELECT times_attended, times_served FROM people WHERE id = ?')
      .bind(body.person_id)
      .first<any>();

    expect(person.times_attended).toBe(1);
    expect(person.times_served).toBe(0);
  });

  // ── Email log is written ─────────────────────────────────────────────────
  it('writes an email_log row after registration (EMAIL_ENABLED=false → queued)', async () => {
    await seedCurrentEvent(env.DB as D1Database, 'mens');

    const res = await app.fetch(
      makeRequest('/api/register/mens/attendee', VALID_MENS_ATTENDEE),
      testEnv
    );
    const body = await res.json<any>();
    expect(body.ok).toBe(true);

    const logRows = await (env.DB as D1Database)
      .prepare('SELECT * FROM email_log WHERE person_id = ?')
      .bind(body.person_id)
      .all<any>();

    // EMAIL_ENABLED='false' → sendEmail writes a log row with status='queued'
    expect(logRows.results.length).toBeGreaterThan(0);
    const log = logRows.results[0];
    expect(log.program).toBe('mens');
    expect(log.template_key).toBe('welcome');
    expect(log.type).toBe('transactional');
    expect(log.to_email).toBe('john.doe@example.com');
  });

  // ── Happy path: mens/server ──────────────────────────────────────────────
  it('happy path: mens/server registration works and rolls up times_served', async () => {
    await seedCurrentEvent(env.DB as D1Database, 'mens');

    const res = await app.fetch(
      makeRequest('/api/register/mens/server', VALID_MENS_SERVER),
      testEnv
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.ok).toBe(true);
    expect(typeof body.registration_id).toBe('number');

    // Rollup: times_served = 1
    const person = await (env.DB as D1Database)
      .prepare('SELECT times_attended, times_served FROM people WHERE id = ?')
      .bind(body.person_id)
      .first<any>();
    expect(person.times_served).toBe(1);
    expect(person.times_attended).toBe(0);
  });

  // ── Duplicate email: reuses same person ─────────────────────────────────
  it('duplicate email: reuses same person (no duplicate people row)', async () => {
    await seedCurrentEvent(env.DB as D1Database, 'mens');

    const res1 = await app.fetch(
      makeRequest('/api/register/mens/attendee', VALID_MENS_ATTENDEE),
      testEnv
    );
    const body1 = await res1.json<any>();
    expect(body1.ok).toBe(true);

    // Register again with same email
    const res2 = await app.fetch(
      makeRequest('/api/register/mens/attendee', {
        ...VALID_MENS_ATTENDEE,
        first_name: 'Johnny', // slightly different first name
      }),
      testEnv
    );
    const body2 = await res2.json<any>();
    expect(body2.ok).toBe(true);
    // Same person_id (deduped by email)
    expect(body2.person_id).toBe(body1.person_id);

    // Only one person row should exist for this email
    const people = await (env.DB as D1Database)
      .prepare("SELECT COUNT(*) as cnt FROM people WHERE email = 'john.doe@example.com'")
      .first<any>();
    expect(people.cnt).toBe(1);

    // Rollup: times_attended = 2
    const person = await (env.DB as D1Database)
      .prepare('SELECT times_attended FROM people WHERE id = ?')
      .bind(body1.person_id)
      .first<any>();
    expect(person.times_attended).toBe(2);
  });

  // ── Invalid program → 400 ────────────────────────────────────────────────
  it('invalid program slug → 400', async () => {
    const res = await app.fetch(
      makeRequest('/api/register/boys/attendee', VALID_MENS_ATTENDEE),
      testEnv
    );
    expect(res.status).toBe(400);
    const body = await res.json<any>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/invalid program/i);
  });

  // ── Invalid role → 400 ───────────────────────────────────────────────────
  it('invalid role slug → 400', async () => {
    const res = await app.fetch(
      makeRequest('/api/register/mens/leader', VALID_MENS_ATTENDEE),
      testEnv
    );
    expect(res.status).toBe(400);
    const body = await res.json<any>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/invalid role/i);
  });

  // ── Validation failure → 400 ─────────────────────────────────────────────
  it('missing required fields → 400 with error message', async () => {
    await seedCurrentEvent(env.DB as D1Database, 'mens');

    const res = await app.fetch(
      makeRequest('/api/register/mens/attendee', {
        // missing most required fields
        first_name: 'John',
        cf_turnstile_response: '__TEST_BYPASS__',
      }),
      testEnv
    );
    expect(res.status).toBe(400);
    const body = await res.json<any>();
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
  });

  // ── No current event → 400 ───────────────────────────────────────────────
  it('no current event for program → 400', async () => {
    // Deliberately do NOT seed an event

    const res = await app.fetch(
      makeRequest('/api/register/mens/attendee', VALID_MENS_ATTENDEE),
      testEnv
    );
    expect(res.status).toBe(400);
    const body = await res.json<any>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/no current event/i);
  });

  // ── Attendee registration closed → 409 ──────────────────────────────────
  it('attendee_registration_open=0 → 409', async () => {
    await seedCurrentEvent(env.DB as D1Database, 'mens', {
      attendee_registration_open: 0,
    });

    const res = await app.fetch(
      makeRequest('/api/register/mens/attendee', VALID_MENS_ATTENDEE),
      testEnv
    );
    expect(res.status).toBe(409);
    const body = await res.json<any>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/registration is not open/i);
  });

  // ── Server registration closed → 409 ────────────────────────────────────
  it('server_registration_open=0 → 409', async () => {
    await seedCurrentEvent(env.DB as D1Database, 'mens', {
      server_registration_open: 0,
    });

    const res = await app.fetch(
      makeRequest('/api/register/mens/server', VALID_MENS_SERVER),
      testEnv
    );
    expect(res.status).toBe(409);
    const body = await res.json<any>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/registration is not open/i);
  });

  // ── Turnstile failure → 422 ──────────────────────────────────────────────
  it('missing Turnstile token → 422', async () => {
    await seedCurrentEvent(env.DB as D1Database, 'mens');

    // Omit cf_turnstile_response so token is absent
    const { cf_turnstile_response: _omitted, ...bodyWithoutToken } = VALID_MENS_ATTENDEE;

    const res = await app.fetch(
      makeRequest('/api/register/mens/attendee', bodyWithoutToken),
      testEnv
    );
    expect(res.status).toBe(422);
    const body = await res.json<any>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/bot verification/i);
  });

  // ── Rate limit: 4th request from same IP → 429 ──────────────────────────
  it('4th request from same IP within window → 429', async () => {
    await seedCurrentEvent(env.DB as D1Database, 'mens');
    // Use a unique IP to avoid cross-test KV bleed
    const ip = '192.168.99.1';

    // First 3 requests (each with unique email to avoid DB conflicts)
    for (let i = 0; i < 3; i++) {
      const res = await app.fetch(
        makeRequest(
          '/api/register/mens/attendee',
          { ...VALID_MENS_ATTENDEE, email: `ratelimit${i}@example.com` },
          ip
        ),
        testEnv
      );
      // Rate limit should NOT fire on first 3
      expect(res.status).not.toBe(429);
    }

    // 4th attempt from same IP → rate limited
    const res4 = await app.fetch(
      makeRequest(
        '/api/register/mens/attendee',
        { ...VALID_MENS_ATTENDEE, email: 'ratelimit4@example.com' },
        ip
      ),
      testEnv
    );
    expect(res4.status).toBe(429);
    const body4 = await res4.json<any>();
    expect(body4.ok).toBe(false);
    expect(body4.error).toMatch(/too many/i);
  });
});
