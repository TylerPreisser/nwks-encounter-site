import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { applyMigrations } from './setup';
import { nowIso } from '../db';

/**
 * Seasons: an encounter is identified by (program, year, season) — NWKS runs a
 * spring and a fall encounter per program per year. The pre-season schema had
 * UNIQUE(program, year), which made Spring 2026 + Fall 2026 impossible.
 */

const db = () => (env as unknown as { DB: D1Database }).DB;

async function insertEvent(
  program: 'mens' | 'women',
  year: number,
  season: 'spring' | 'fall',
  title = `${program} ${season} ${year}`
) {
  const ts = nowIso();
  return db()
    .prepare(
      `INSERT INTO events
         (program, year, season, title, start_date, end_date, launch_locations,
          attendee_registration_open, server_registration_open, is_current,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, NULL, '[]', 1, 1, 0, ?, ?)`
    )
    .bind(program, year, season, title, ts, ts)
    .run();
}

describe('events.season', () => {
  beforeEach(async () => {
    await applyMigrations(env as unknown as { DB: D1Database });
  });

  it('allows a spring AND a fall encounter in the same program-year', async () => {
    await insertEvent('mens', 2027, 'spring');
    await insertEvent('mens', 2027, 'fall');

    const { results } = await db()
      .prepare(`SELECT season FROM events WHERE program = 'mens' AND year = 2027 ORDER BY season`)
      .all<{ season: string }>();

    expect(results.map((r) => r.season)).toEqual(['fall', 'spring']);
  });

  it('rejects a duplicate season within the same program-year', async () => {
    await insertEvent('mens', 2028, 'spring');
    await expect(insertEvent('mens', 2028, 'spring')).rejects.toThrow(/UNIQUE/i);
  });

  it('keeps the two programs independent', async () => {
    await insertEvent('mens', 2029, 'spring');
    await expect(insertEvent('women', 2029, 'spring')).resolves.toBeTruthy();
  });

  it('rejects a season outside spring|fall', async () => {
    const ts = nowIso();
    await expect(
      db()
        .prepare(
          `INSERT INTO events (program, year, season, title, launch_locations,
             attendee_registration_open, server_registration_open, is_current, created_at, updated_at)
           VALUES ('mens', 2030, 'summer', 'x', '[]', 1, 1, 0, ?, ?)`
        )
        .bind(ts, ts)
        .run()
    ).rejects.toThrow(/CHECK/i);
  });

  it('labels the two seeded 2026 encounters as fall and preserves their ids', async () => {
    const { results } = await db()
      .prepare(`SELECT id, program, year, season, start_date FROM events ORDER BY id`)
      .all<{ id: number; program: string; year: number; season: string; start_date: string }>();

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ id: 1, program: 'mens', year: 2026, season: 'fall' });
    expect(results[1]).toMatchObject({ id: 2, program: 'women', year: 2026, season: 'fall' });
    // The rebuild must not renumber ids — registrations.event_id points at them.
    expect(results[0].start_date).toBe('2026-08-06');
  });

  it('orders fall ahead of spring within a year (most recent first)', async () => {
    await insertEvent('mens', 2027, 'spring');
    await insertEvent('mens', 2027, 'fall');

    const { results } = await db()
      .prepare(
        `SELECT year, season FROM events WHERE program = 'mens'
         ORDER BY year DESC, CASE season WHEN 'fall' THEN 1 ELSE 0 END DESC`
      )
      .all<{ year: number; season: string }>();

    expect(results.map((r) => `${r.season} ${r.year}`)).toEqual([
      'fall 2027',
      'spring 2027',
      'fall 2026',
    ]);
  });

  it('preserves the foreign key from registrations to the rebuilt events table', async () => {
    const ts = nowIso();
    await db()
      .prepare(
        `INSERT INTO people (program, first_name, last_name, email, created_at, updated_at)
         VALUES ('mens', 'Jim', 'Halpert', 'jim@example.com', ?, ?)`
      )
      .bind(ts, ts)
      .run();

    await expect(
      db()
        .prepare(
          `INSERT INTO registrations
             (program, event_id, person_id, role, first_name, last_name, email, extra, status, created_at)
           VALUES ('mens', 1, 1, 'attendee', 'Jim', 'Halpert', 'jim@example.com', '{}', 'registered', ?)`
        )
        .bind(ts)
        .run()
    ).resolves.toBeTruthy();
  });
});
