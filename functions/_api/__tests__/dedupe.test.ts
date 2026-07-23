import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { applyMigrations } from './setup';
import { upsertPerson, recomputeRollups, findPossibleDuplicates } from '../dedupe';
import { nowIso } from '../db';
import type { Env } from '../app';

const testEnv = () => env as unknown as Env;
const DB = () => (env as any).DB as D1Database;

async function insertEvent(program: 'mens' | 'women'): Promise<number> {
  const ts = nowIso();
  const { meta } = await DB()
    .prepare(
      `INSERT INTO events (program, year, is_current, created_at, updated_at)
       VALUES (?, 2026, 1, ?, ?)`
    )
    .bind(program, ts, ts)
    .run();
  return meta.last_row_id as number;
}

async function insertRegistration(
  program: 'mens' | 'women',
  eventId: number,
  personId: number,
  role: 'attendee' | 'server'
): Promise<void> {
  const ts = nowIso();
  await DB()
    .prepare(
      `INSERT INTO registrations
         (program, event_id, person_id, role, first_name, last_name, created_at)
       VALUES (?, ?, ?, ?, 'Test', 'Person', ?)`
    )
    .bind(program, eventId, personId, role, ts)
    .run();
}

describe('dedupe.ts', () => {
  beforeEach(async () => {
    await applyMigrations(env as any);
  });

  // ──────────────────────────────────────────────
  // upsertPerson()
  // ──────────────────────────────────────────────
  describe('upsertPerson()', () => {
    it('inserts a new person and returns matched=false', async () => {
      const result = await upsertPerson(testEnv(), 'mens', {
        first_name: 'John',
        last_name: 'Smith',
        email: 'john@example.com',
      });
      expect(typeof result.person_id).toBe('number');
      expect(result.person_id).toBeGreaterThan(0);
      expect(result.matched).toBe(false);
    });

    it('sets first_seen_year and last_activity_year = year on insert', async () => {
      const { person_id } = await upsertPerson(
        testEnv(), 'mens',
        { first_name: 'Yearly', last_name: 'Guy', email: 'yearly@example.com' },
        2025
      );
      const row = await DB()
        .prepare('SELECT first_seen_year, last_activity_year FROM people WHERE id = ?')
        .bind(person_id)
        .first<{ first_seen_year: number; last_activity_year: number }>();
      expect(row!.first_seen_year).toBe(2025);
      expect(row!.last_activity_year).toBe(2025);
    });

    it('sets times_attended = times_served = 0 on new insert', async () => {
      const { person_id } = await upsertPerson(testEnv(), 'mens', {
        first_name: 'Zero',
        last_name: 'Counts',
        email: 'zero@example.com',
      });
      const row = await DB()
        .prepare('SELECT times_attended, times_served FROM people WHERE id = ?')
        .bind(person_id)
        .first<{ times_attended: number; times_served: number }>();
      expect(row!.times_attended).toBe(0);
      expect(row!.times_served).toBe(0);
    });

    it('matches an existing person by email (matched=true, same id)', async () => {
      const first = await upsertPerson(testEnv(), 'mens', {
        first_name: 'John',
        last_name: 'Smith',
        email: 'john@example.com',
      });

      const second = await upsertPerson(testEnv(), 'mens', {
        first_name: 'Johnny',
        last_name: 'Smith',
        email: 'john@example.com',
      });

      expect(second.matched).toBe(true);
      expect(second.person_id).toBe(first.person_id);
    });

    it('email match is case-insensitive', async () => {
      const first = await upsertPerson(testEnv(), 'mens', {
        first_name: 'Case',
        last_name: 'Test',
        email: 'UPPER@example.com',
      });

      const second = await upsertPerson(testEnv(), 'mens', {
        first_name: 'Case',
        last_name: 'Test',
        email: 'upper@example.com',
      });

      expect(second.matched).toBe(true);
      expect(second.person_id).toBe(first.person_id);
    });

    it('does not match across programs (email)', async () => {
      const m = await upsertPerson(testEnv(), 'mens', {
        first_name: 'Joan',
        last_name: 'Brown',
        email: 'joan@example.com',
      });

      const w = await upsertPerson(testEnv(), 'women', {
        first_name: 'Joan',
        last_name: 'Brown',
        email: 'joan@example.com',
      });

      expect(w.person_id).not.toBe(m.person_id);
      expect(w.matched).toBe(false);
    });

    it('fuzzy-matches by last_name + phone when no email', async () => {
      const first = await upsertPerson(testEnv(), 'mens', {
        first_name: 'Bob',
        last_name: 'Jones',
        phone: '5551234567',
      });

      const second = await upsertPerson(testEnv(), 'mens', {
        first_name: 'Bobby',
        last_name: 'Jones',
        phone: '5551234567',
      });

      expect(second.matched).toBe(true);
      expect(second.person_id).toBe(first.person_id);
    });

    it('fuzzy-matches by last_name + city when no email or phone', async () => {
      const first = await upsertPerson(testEnv(), 'mens', {
        first_name: 'Mike',
        last_name: 'Williams',
        city: 'Colby',
      });

      const second = await upsertPerson(testEnv(), 'mens', {
        first_name: 'Michael',
        last_name: 'Williams',
        city: 'colby', // case-insensitive
      });

      expect(second.matched).toBe(true);
      expect(second.person_id).toBe(first.person_id);
    });

    it('fuzzy city match is case-insensitive', async () => {
      const first = await upsertPerson(testEnv(), 'mens', {
        first_name: 'Alex',
        last_name: 'Reed',
        city: 'GARDEN CITY',
      });

      const second = await upsertPerson(testEnv(), 'mens', {
        first_name: 'Alexander',
        last_name: 'Reed',
        city: 'garden city',
      });

      expect(second.matched).toBe(true);
      expect(second.person_id).toBe(first.person_id);
    });

    it('does not fuzzy-match when no phone/city provided', async () => {
      const a = await upsertPerson(testEnv(), 'mens', {
        first_name: 'Steve', last_name: 'Taylor',
      });
      const b = await upsertPerson(testEnv(), 'mens', {
        first_name: 'Steven', last_name: 'Taylor',
      });
      // No fuzzy fields — cannot confirm match, two separate rows
      expect(a.person_id).not.toBe(b.person_id);
      expect(b.matched).toBe(false);
    });

    it('fills in email on fuzzy match when email was null', async () => {
      const { person_id } = await upsertPerson(testEnv(), 'mens', {
        first_name: 'NoEmail',
        last_name: 'NoEmail',
        phone: '9990000000',
      });

      // Second upsert brings an email
      await upsertPerson(testEnv(), 'mens', {
        first_name: 'NoEmail',
        last_name: 'NoEmail',
        phone: '9990000000',
        email: 'nowemail@example.com',
      });

      const row = await DB()
        .prepare('SELECT email FROM people WHERE id = ?')
        .bind(person_id)
        .first<{ email: string | null }>();
      expect(row!.email).toBe('nowemail@example.com');
    });

    it('updates last_activity_year on email match', async () => {
      const { person_id } = await upsertPerson(
        testEnv(), 'mens',
        { first_name: 'Ann', last_name: 'Update', email: 'ann@example.com' },
        2024
      );

      await upsertPerson(
        testEnv(), 'mens',
        { first_name: 'Ann', last_name: 'Update', email: 'ann@example.com' },
        2026
      );

      const row = await DB()
        .prepare('SELECT last_activity_year FROM people WHERE id = ?')
        .bind(person_id)
        .first<{ last_activity_year: number }>();
      expect(row!.last_activity_year).toBe(2026);
    });

    it('sets first_seen_year only if currently null (does not overwrite)', async () => {
      const { person_id } = await upsertPerson(
        testEnv(), 'mens',
        { first_name: 'Orig', last_name: 'First', email: 'orig@example.com' },
        2023
      );

      await upsertPerson(
        testEnv(), 'mens',
        { first_name: 'Orig', last_name: 'First', email: 'orig@example.com' },
        2026
      );

      const row = await DB()
        .prepare('SELECT first_seen_year FROM people WHERE id = ?')
        .bind(person_id)
        .first<{ first_seen_year: number }>();
      expect(row!.first_seen_year).toBe(2023); // unchanged
    });
  });

  // ──────────────────────────────────────────────
  // recomputeRollups()
  // ──────────────────────────────────────────────
  describe('recomputeRollups()', () => {
    it('sets times_attended from attendee registrations', async () => {
      const eventId = await insertEvent('mens');
      const { person_id } = await upsertPerson(testEnv(), 'mens', {
        first_name: 'Cal',
        last_name: 'Reeves',
      });

      await insertRegistration('mens', eventId, person_id, 'attendee');
      await recomputeRollups(testEnv(), person_id);

      const row = await DB()
        .prepare('SELECT times_attended, times_served FROM people WHERE id = ?')
        .bind(person_id)
        .first<{ times_attended: number; times_served: number }>();

      expect(row!.times_attended).toBe(1);
      expect(row!.times_served).toBe(0);
    });

    it('sets times_served from server registrations', async () => {
      const eventId = await insertEvent('mens');
      const { person_id } = await upsertPerson(testEnv(), 'mens', {
        first_name: 'Dan',
        last_name: 'Moore',
      });

      await insertRegistration('mens', eventId, person_id, 'server');
      await recomputeRollups(testEnv(), person_id);

      const row = await DB()
        .prepare('SELECT times_attended, times_served FROM people WHERE id = ?')
        .bind(person_id)
        .first<{ times_attended: number; times_served: number }>();

      expect(row!.times_attended).toBe(0);
      expect(row!.times_served).toBe(1);
    });

    it('counts both roles correctly when person has both', async () => {
      const eventId1 = await insertEvent('mens');
      // Need a second event for the second registration
      const ts = nowIso();
      const { meta } = await DB()
        .prepare(
          `INSERT INTO events (program, year, is_current, created_at, updated_at)
           VALUES ('mens', 2025, 0, ?, ?)`
        )
        .bind(ts, ts)
        .run();
      const eventId2 = meta.last_row_id as number;

      const { person_id } = await upsertPerson(testEnv(), 'mens', {
        first_name: 'Both',
        last_name: 'Roles',
      });

      await insertRegistration('mens', eventId1, person_id, 'attendee');
      await insertRegistration('mens', eventId2, person_id, 'server');
      await recomputeRollups(testEnv(), person_id);

      const row = await DB()
        .prepare('SELECT times_attended, times_served FROM people WHERE id = ?')
        .bind(person_id)
        .first<{ times_attended: number; times_served: number }>();

      expect(row!.times_attended).toBe(1);
      expect(row!.times_served).toBe(1);
    });

    it('resets to 0 after all registrations removed', async () => {
      const eventId = await insertEvent('mens');
      const { person_id } = await upsertPerson(testEnv(), 'mens', {
        first_name: 'Clean',
        last_name: 'Slate',
      });

      await insertRegistration('mens', eventId, person_id, 'attendee');
      await recomputeRollups(testEnv(), person_id);

      // Remove the registration
      await DB()
        .prepare('DELETE FROM registrations WHERE person_id = ?')
        .bind(person_id)
        .run();

      await recomputeRollups(testEnv(), person_id);

      const row = await DB()
        .prepare('SELECT times_attended, times_served FROM people WHERE id = ?')
        .bind(person_id)
        .first<{ times_attended: number; times_served: number }>();

      expect(row!.times_attended).toBe(0);
      expect(row!.times_served).toBe(0);
    });
  });

  // ──────────────────────────────────────────────
  // findPossibleDuplicates()
  // ──────────────────────────────────────────────
  describe('findPossibleDuplicates()', () => {
    it('returns other people with the same last_name in the same program', async () => {
      const a = await upsertPerson(testEnv(), 'mens', {
        first_name: 'Tom', last_name: 'Wilson', email: 'tom1@example.com',
      });
      const b = await upsertPerson(testEnv(), 'mens', {
        first_name: 'Thomas', last_name: 'Wilson', email: 'tom2@example.com',
      });

      const dupes = await findPossibleDuplicates(testEnv(), a.person_id);
      expect(dupes.some(p => p.id === b.person_id)).toBe(true);
      expect(dupes.every(p => p.id !== a.person_id)).toBe(true);
    });

    it('does not include the person themselves', async () => {
      const { person_id } = await upsertPerson(testEnv(), 'mens', {
        first_name: 'Solo', last_name: 'Unique',
      });

      const dupes = await findPossibleDuplicates(testEnv(), person_id);
      expect(dupes.every(p => p.id !== person_id)).toBe(true);
    });

    it('does not return people from the other program', async () => {
      const m = await upsertPerson(testEnv(), 'mens', {
        first_name: 'Sam', last_name: 'Cross', email: 'samm@example.com',
      });
      await upsertPerson(testEnv(), 'women', {
        first_name: 'Samantha', last_name: 'Cross', email: 'samw@example.com',
      });

      const dupes = await findPossibleDuplicates(testEnv(), m.person_id);
      expect(dupes.every(p => p.program === 'mens')).toBe(true);
    });

    it('excludes merged-into people from results', async () => {
      const a = await upsertPerson(testEnv(), 'mens', {
        first_name: 'Merge', last_name: 'Target', email: 'target@example.com',
      });
      const b = await upsertPerson(testEnv(), 'mens', {
        first_name: 'Merge', last_name: 'Target', email: 'merged@example.com',
      });
      const c = await upsertPerson(testEnv(), 'mens', {
        first_name: 'Merge', last_name: 'Target', email: 'active@example.com',
      });

      // Mark b as merged into a
      await DB()
        .prepare('UPDATE people SET merged_into_id = ? WHERE id = ?')
        .bind(a.person_id, b.person_id)
        .run();

      const dupes = await findPossibleDuplicates(testEnv(), a.person_id);
      expect(dupes.every(p => p.id !== b.person_id)).toBe(true); // b excluded (merged)
      expect(dupes.some(p => p.id === c.person_id)).toBe(true);  // c included
    });

    it('last_name match is case-insensitive', async () => {
      const a = await upsertPerson(testEnv(), 'mens', {
        first_name: 'Lower', last_name: 'case', email: 'lower@example.com',
      });
      const b = await upsertPerson(testEnv(), 'mens', {
        first_name: 'Upper', last_name: 'CASE', email: 'upper2@example.com',
      });

      const dupes = await findPossibleDuplicates(testEnv(), a.person_id);
      expect(dupes.some(p => p.id === b.person_id)).toBe(true);
    });

    it('returns empty array when no other person shares last_name', async () => {
      const { person_id } = await upsertPerson(testEnv(), 'mens', {
        first_name: 'Only', last_name: 'Snowflake',
      });

      const dupes = await findPossibleDuplicates(testEnv(), person_id);
      expect(dupes).toHaveLength(0);
    });

    it('returns empty array for unknown personId', async () => {
      const dupes = await findPossibleDuplicates(testEnv(), 999999);
      expect(dupes).toHaveLength(0);
    });
  });
});
