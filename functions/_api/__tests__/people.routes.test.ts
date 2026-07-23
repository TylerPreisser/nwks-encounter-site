// functions/_api/__tests__/people.routes.test.ts
// TDD integration tests for GET /api/admin/people/:id and POST /api/admin/people/:id/merge

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
  timesAttended?: number;
  timesServed?: number;
}): Promise<number> {
  const now = nowIso();
  const db = (env as unknown as { DB: D1Database }).DB;
  const email = opts.email ?? `person_${Math.random().toString(36).slice(2)}@example.com`;
  const { meta } = await db
    .prepare(
      `INSERT INTO people
         (program, first_name, last_name, email, times_attended, times_served, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      opts.program,
      opts.firstName ?? 'First',
      opts.lastName ?? 'Last',
      email,
      opts.timesAttended ?? 0,
      opts.timesServed ?? 0,
      now,
      now
    )
    .run();
  return meta.last_row_id as number;
}

async function seedRegistration(opts: {
  program: 'mens' | 'women';
  eventId: number;
  role: 'attendee' | 'server';
  personId?: number;
}): Promise<number> {
  const now = nowIso();
  const db = (env as unknown as { DB: D1Database }).DB;
  const personId =
    opts.personId ??
    (await seedPerson({ program: opts.program }));
  const { meta } = await db
    .prepare(
      `INSERT INTO registrations
         (program, event_id, person_id, role, first_name, last_name, created_at)
       VALUES (?, ?, ?, ?, 'First', 'Last', ?)`
    )
    .bind(opts.program, opts.eventId, personId, opts.role, now)
    .run();
  return meta.last_row_id as number;
}

async function getAuthCookie(): Promise<string> {
  const loginRes = await app.fetch(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@nwksencounter.com', password: 'TestPass1!' }),
    }),
    testEnv,
  );
  const setCookie = loginRes.headers.get('Set-Cookie') ?? '';
  const token = setCookie.match(/nwks_session=([^;]+)/)?.[1] ?? '';
  return `nwks_session=${token}`;
}

// ---------------------------------------------------------------------------
// GET /api/admin/people/:id
// ---------------------------------------------------------------------------

describe('GET /api/admin/people/:id', () => {
  beforeEach(async () => {
    await applyMigrations(env as any);
  });

  it('returns 401 without auth', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/admin/people/1?program=mens'),
      testEnv,
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown person', async () => {
    await seedAdmin();
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request('http://localhost/api/admin/people/9999?program=mens', {
        headers: { Cookie: cookie },
      }),
      testEnv,
    );
    expect(res.status).toBe(404);
  });

  it('returns person with badges and empty history for new person', async () => {
    await seedAdmin();
    const personId = await seedPerson({ program: 'mens', timesAttended: 0, timesServed: 0 });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request(`http://localhost/api/admin/people/${personId}?program=mens`, {
        headers: { Cookie: cookie },
      }),
      testEnv,
    );
    expect(res.status).toBe(200);
    const json = await res.json() as {
      ok: boolean;
      person: { id: number };
      badges: { times_attended: number; times_served: number; is_first_timer: boolean };
      history: unknown[];
      possible_duplicates: unknown[];
    };
    expect(json.ok).toBe(true);
    expect(json.person.id).toBe(personId);
    expect(json.badges.times_attended).toBe(0);
    expect(json.badges.is_first_timer).toBe(true);
    expect(json.history).toHaveLength(0);
  });

  it('returns registration history across events', async () => {
    await seedAdmin();
    const eventId1 = await seedEvent({ program: 'mens', year: 2024 });
    const eventId2 = await seedEvent({ program: 'mens', year: 2026 });
    const personId = await seedPerson({ program: 'mens' });
    await seedRegistration({ program: 'mens', eventId: eventId1, role: 'attendee', personId });
    await seedRegistration({ program: 'mens', eventId: eventId2, role: 'server', personId });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request(`http://localhost/api/admin/people/${personId}?program=mens`, {
        headers: { Cookie: cookie },
      }),
      testEnv,
    );
    const json = await res.json() as { ok: boolean; history: Array<{ event_id: number }> };
    expect(json.history).toHaveLength(2);
  });

  it('returns possible_duplicates array (may be empty)', async () => {
    await seedAdmin();
    const personId = await seedPerson({ program: 'mens' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request(`http://localhost/api/admin/people/${personId}?program=mens`, {
        headers: { Cookie: cookie },
      }),
      testEnv,
    );
    const json = await res.json() as { ok: boolean; possible_duplicates: unknown[] };
    expect(Array.isArray(json.possible_duplicates)).toBe(true);
  });

  it('does not return a merged-away person', async () => {
    await seedAdmin();
    const sourceId = await seedPerson({ program: 'mens', firstName: 'Dup' });
    const targetId = await seedPerson({ program: 'mens', firstName: 'Real' });
    const cookie = await getAuthCookie();
    // Merge source into target
    await app.fetch(
      new Request(`http://localhost/api/admin/people/${sourceId}/merge?program=mens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ into_id: targetId }),
      }),
      testEnv,
    );
    // Now fetching the merged-away person should 404
    const res = await app.fetch(
      new Request(`http://localhost/api/admin/people/${sourceId}?program=mens`, {
        headers: { Cookie: cookie },
      }),
      testEnv,
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/people/:id/merge
// ---------------------------------------------------------------------------

describe('POST /api/admin/people/:id/merge', () => {
  beforeEach(async () => {
    await applyMigrations(env as any);
  });

  it('returns 401 without auth', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/admin/people/1/merge?program=mens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ into_id: 2 }),
      }),
      testEnv,
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when into_id is missing', async () => {
    await seedAdmin();
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request('http://localhost/api/admin/people/1/merge?program=mens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({}),
      }),
      testEnv,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when merging a person into themselves', async () => {
    await seedAdmin();
    const personId = await seedPerson({ program: 'mens' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request(`http://localhost/api/admin/people/${personId}/merge?program=mens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ into_id: personId }),
      }),
      testEnv,
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when source person does not exist', async () => {
    await seedAdmin();
    const targetId = await seedPerson({ program: 'mens' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request(`http://localhost/api/admin/people/9999/merge?program=mens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ into_id: targetId }),
      }),
      testEnv,
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when target person does not exist', async () => {
    await seedAdmin();
    const sourceId = await seedPerson({ program: 'mens' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      new Request(`http://localhost/api/admin/people/${sourceId}/merge?program=mens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ into_id: 9999 }),
      }),
      testEnv,
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when merging into an already-merged person', async () => {
    await seedAdmin();
    const a = await seedPerson({ program: 'mens', firstName: 'A' });
    const b = await seedPerson({ program: 'mens', firstName: 'B' });
    const c = await seedPerson({ program: 'mens', firstName: 'C' });
    const cookie = await getAuthCookie();
    // Merge B into C first
    await app.fetch(
      new Request(`http://localhost/api/admin/people/${b}/merge?program=mens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ into_id: c }),
      }),
      testEnv,
    );
    // Now try to merge A into B (which is already merged)
    const res = await app.fetch(
      new Request(`http://localhost/api/admin/people/${a}/merge?program=mens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ into_id: b }),
      }),
      testEnv,
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when cross-program merge is attempted', async () => {
    await seedAdmin();
    const mensId = await seedPerson({ program: 'mens' });
    const womenId = await seedPerson({ program: 'women' });
    const cookie = await getAuthCookie();
    // Try to merge a mens person into a women person (querying from mens program)
    const res = await app.fetch(
      new Request(`http://localhost/api/admin/people/${mensId}/merge?program=mens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ into_id: womenId }),
      }),
      testEnv,
    );
    // Target is in women program, queried under mens — should be 404 (not found in mens)
    expect(res.status).toBe(404);
  });

  it('moves registrations, sets merged_into_id, and recomputes rollups', async () => {
    await seedAdmin();
    const eventId = await seedEvent({ program: 'mens' });
    const sourceId = await seedPerson({ program: 'mens', firstName: 'Dup' });
    const targetId = await seedPerson({ program: 'mens', firstName: 'Real' });
    await seedRegistration({ program: 'mens', eventId, role: 'attendee', personId: sourceId });
    const cookie = await getAuthCookie();

    const res = await app.fetch(
      new Request(`http://localhost/api/admin/people/${sourceId}/merge?program=mens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ into_id: targetId }),
      }),
      testEnv,
    );
    expect(res.status).toBe(200);
    const json = await res.json() as { ok: boolean; person: { id: number; times_attended: number } };
    expect(json.ok).toBe(true);
    expect(json.person.id).toBe(targetId);
    // target should now have times_attended incremented from the moved registration
    expect(json.person.times_attended).toBeGreaterThanOrEqual(1);

    // Defense-in-depth: all moved registrations must still carry the correct program
    const db = (env as unknown as { DB: D1Database }).DB;
    const moved = await db
      .prepare(`SELECT program FROM registrations WHERE person_id = ?`)
      .bind(targetId)
      .all<{ program: string }>();
    expect(moved.results.every((r) => r.program === 'mens')).toBe(true);
  });

  it('merged-away person no longer appears as a duplicate candidate', async () => {
    await seedAdmin();
    // Create two people with same last name and city (would be duplicates)
    const sourceId = await seedPerson({
      program: 'mens',
      firstName: 'Dup',
      lastName: 'Smith',
      email: `dup_${Math.random().toString(36).slice(2)}@test.com`,
    });
    const targetId = await seedPerson({
      program: 'mens',
      firstName: 'Real',
      lastName: 'Smith',
      email: `real_${Math.random().toString(36).slice(2)}@test.com`,
    });
    const cookie = await getAuthCookie();

    // Merge source into target
    await app.fetch(
      new Request(`http://localhost/api/admin/people/${sourceId}/merge?program=mens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ into_id: targetId }),
      }),
      testEnv,
    );

    // Get target profile — source should not appear in possible_duplicates
    const profileRes = await app.fetch(
      new Request(`http://localhost/api/admin/people/${targetId}?program=mens`, {
        headers: { Cookie: cookie },
      }),
      testEnv,
    );
    const profileJson = await profileRes.json() as {
      ok: boolean;
      possible_duplicates: Array<{ id: number }>;
    };
    const dupIds = profileJson.possible_duplicates.map((p) => p.id);
    expect(dupIds).not.toContain(sourceId);
  });
});
