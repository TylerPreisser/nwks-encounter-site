import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { applyMigrations } from './setup';
import {
  nowIso, currentYear, getPerson, getActivePeople, getCurrentEvent,
  type Program,
} from '../db';

const DB = () => (env as any).DB as D1Database;

describe('db.ts helpers', () => {
  beforeEach(async () => {
    await applyMigrations(env as unknown as { DB: D1Database });
  });

  describe('nowIso()', () => {
    it('returns a valid ISO-8601 UTC string', () => {
      const iso = nowIso();
      expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(new Date(iso).toISOString()).toBe(iso);
    });
  });

  describe('currentYear()', () => {
    it('returns a 4-digit year matching UTC year', () => {
      const year = currentYear();
      expect(year).toBeGreaterThanOrEqual(2026);
      expect(year).toBe(new Date().getUTCFullYear());
    });
  });

  describe('getPerson()', () => {
    it('returns null for a missing id', async () => {
      const result = await getPerson(DB(), 999999);
      expect(result).toBeNull();
    });

    it('returns the person row for a known id', async () => {
      const ts = nowIso();
      const { meta } = await DB()
        .prepare(
          `INSERT INTO people (program, first_name, last_name, created_at, updated_at)
           VALUES ('mens', 'John', 'Doe', ?, ?)`
        )
        .bind(ts, ts)
        .run();
      const id = meta.last_row_id as number;

      const person = await getPerson(DB(), id);
      expect(person).not.toBeNull();
      expect(person!.first_name).toBe('John');
      expect(person!.last_name).toBe('Doe');
      expect(person!.program).toBe('mens');
      expect(person!.times_attended).toBe(0);
      expect(person!.times_served).toBe(0);
    });
  });

  describe('getActivePeople()', () => {
    it('excludes merged-away rows', async () => {
      const ts = nowIso();
      const { meta: m1 } = await DB()
        .prepare(`INSERT INTO people (program, first_name, last_name, created_at, updated_at) VALUES ('mens','Alice','Smith',?,?)`)
        .bind(ts, ts).run();
      const id1 = m1.last_row_id as number;

      const { meta: m2 } = await DB()
        .prepare(`INSERT INTO people (program, first_name, last_name, merged_into_id, created_at, updated_at) VALUES ('mens','Alicia','Smith',?,?,?)`)
        .bind(id1, ts, ts).run();
      void m2;

      const people = await getActivePeople(DB(), 'mens');
      expect(people.length).toBe(1);
      expect(people[0].first_name).toBe('Alice');
    });

    it('does not return rows from the other program', async () => {
      const ts = nowIso();
      await DB()
        .prepare(`INSERT INTO people (program, first_name, last_name, created_at, updated_at) VALUES ('women','Carol','Jones',?,?)`)
        .bind(ts, ts).run();
      const people = await getActivePeople(DB(), 'mens');
      expect(people.every((p) => p.program === 'mens')).toBe(true);
    });
  });

  describe('getCurrentEvent()', () => {
    it('returns null when no event is marked current', async () => {
      // Clear is_current on seed events so we can test the null path.
      await DB().prepare('UPDATE events SET is_current=0').run();
      const result = await getCurrentEvent(DB(), 'mens');
      expect(result).toBeNull();
    });

    it('returns the event with is_current=true (boolean) and parsed launch_locations', async () => {
      const ts = nowIso();
      // Upsert the seeded mens 2026 row with our test-specific launch_locations.
      await DB()
        .prepare(
          `INSERT OR REPLACE INTO events (program, year, is_current, launch_locations, created_at, updated_at)
           VALUES ('mens', 2026, 1, ?, ?, ?)`
        )
        .bind(JSON.stringify(['Garden City', 'Colby']), ts, ts).run();

      const ev = await getCurrentEvent(DB(), 'mens');
      expect(ev).not.toBeNull();
      expect(ev!.year).toBe(2026);
      expect(ev!.is_current).toBe(true);
      expect(ev!.launch_locations).toEqual(['Garden City', 'Colby']);
      expect(ev!.attendee_registration_open).toBe(true);
      expect(ev!.server_registration_open).toBe(true);
    });

    it('returns null for a different program', async () => {
      // Seed has women 2026 with is_current=1; clear it so mens truly has nothing current.
      await DB().prepare("UPDATE events SET is_current=0 WHERE program='mens'").run();
      const result = await getCurrentEvent(DB(), 'mens');
      expect(result).toBeNull();
    });

    it('returns empty array for launch_locations when stored as []', async () => {
      const ts = nowIso();
      // Upsert the seeded mens 2026 row with explicit empty launch_locations.
      await DB()
        .prepare(
          `INSERT OR REPLACE INTO events (program, year, is_current, launch_locations, created_at, updated_at)
           VALUES ('mens', 2026, 1, '[]', ?, ?)`
        )
        .bind(ts, ts).run();

      const ev = await getCurrentEvent(DB(), 'mens');
      expect(ev).not.toBeNull();
      expect(ev!.launch_locations).toEqual([]);
    });

    // Type-level compile check: ensure Program type is exported and usable
    it('Program type compiles as union literal', () => {
      const p1: Program = 'mens';
      const p2: Program = 'women';
      expect(['mens', 'women']).toContain(p1);
      expect(['mens', 'women']).toContain(p2);
    });
  });
});
