// functions/_api/dedupe.ts — person matching, rollup recompute, duplicate detection

import { nowIso, currentYear, type Program, type Person, type PersonInput } from './db';
import type { Env } from './app';

/**
 * Finds or creates a people record for the given program + fields.
 *
 * Match priority:
 *   1. Exact email match (program + lowercased email, excluding merged rows).
 *   2. Fuzzy: same last_name AND (phone digits-only match OR city case-insensitive match),
 *      excluding merged rows.
 *
 * On match: updates last_activity_year (and first_seen_year if currently null),
 *   fills in any newly-provided contact fields, bumps updated_at.
 * On insert: sets first_seen_year = last_activity_year = year (if given),
 *   times_attended = times_served = 0.
 *
 * @param year  Optional event year; defaults to currentYear() when not supplied.
 */
export async function upsertPerson(
  env: Env,
  program: Program,
  fields: PersonInput,
  year?: number
): Promise<{ person_id: number; matched: boolean }> {
  const db = env.DB;
  const now = nowIso();
  const eventYear = year ?? currentYear();

  // --- 1. Exact email match ---
  if (fields.email && fields.email.trim() !== '') {
    const emailLower = fields.email.trim().toLowerCase();

    const existing = await db
      .prepare(
        `SELECT id, first_seen_year FROM people
         WHERE program = ? AND LOWER(email) = ? AND merged_into_id IS NULL
         LIMIT 1`
      )
      .bind(program, emailLower)
      .first<{ id: number; first_seen_year: number | null }>();

    if (existing) {
      await db
        .prepare(
          `UPDATE people
           SET last_activity_year = ?,
               first_seen_year = COALESCE(first_seen_year, ?),
               updated_at = ?
           WHERE id = ?`
        )
        .bind(eventYear, eventYear, now, existing.id)
        .run();
      return { person_id: existing.id, matched: true };
    }
  }

  // --- 2. Fuzzy match: last_name + (phone OR city) ---
  const lastName = fields.last_name?.trim();
  if (lastName) {
    const phone = fields.phone?.trim() ?? null;
    const city = fields.city?.trim() ?? null;
    const hasFuzzyField = (phone && phone !== '') || (city && city !== '');

    if (hasFuzzyField) {
      const fuzzy = await db
        .prepare(
          `SELECT id, email, first_seen_year FROM people
           WHERE program = ?
             AND LOWER(last_name) = LOWER(?)
             AND merged_into_id IS NULL
             AND (
               (? IS NOT NULL AND ? != '' AND phone = ?)
               OR
               (? IS NOT NULL AND ? != '' AND LOWER(city) = LOWER(?))
             )
           LIMIT 1`
        )
        .bind(
          program,
          lastName,
          phone, phone, phone,
          city,  city,  city
        )
        .first<{ id: number; email: string | null; first_seen_year: number | null }>();

      if (fuzzy) {
        const newFirstSeen = fuzzy.first_seen_year ?? eventYear;
        // Fill in email if it was null and we now have one
        if (fields.email && fields.email.trim() && !fuzzy.email) {
          await db
            .prepare(
              `UPDATE people
               SET email = ?,
                   last_activity_year = ?,
                   first_seen_year = COALESCE(first_seen_year, ?),
                   updated_at = ?
               WHERE id = ?`
            )
            .bind(fields.email.trim(), eventYear, newFirstSeen, now, fuzzy.id)
            .run();
        } else {
          await db
            .prepare(
              `UPDATE people
               SET last_activity_year = ?,
                   first_seen_year = COALESCE(first_seen_year, ?),
                   updated_at = ?
               WHERE id = ?`
            )
            .bind(eventYear, newFirstSeen, now, fuzzy.id)
            .run();
        }
        return { person_id: fuzzy.id, matched: true };
      }
    }
  }

  // --- 3. Insert new person ---
  const { meta } = await db
    .prepare(
      `INSERT INTO people
         (program, first_name, last_name, email, phone, phone_type,
          address, city, state, church,
          times_attended, times_served,
          first_seen_year, last_activity_year,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`
    )
    .bind(
      program,
      fields.first_name.trim(),
      fields.last_name.trim(),
      fields.email?.trim() ?? null,
      fields.phone?.trim() ?? null,
      fields.phone_type?.trim() ?? null,
      fields.address?.trim() ?? null,
      fields.city?.trim() ?? null,
      fields.state?.trim() ?? null,
      fields.church?.trim() ?? null,
      eventYear,
      eventYear,
      now,
      now
    )
    .run();

  return { person_id: meta.last_row_id as number, matched: false };
}

/**
 * Recounts times_attended and times_served for a person from their registrations
 * and updates the people row.
 * Excludes cancelled registrations from both counts.
 */
export async function recomputeRollups(env: Env, personId: number): Promise<void> {
  const db = env.DB;

  const rows = await db
    .prepare(
      `SELECT role, COUNT(*) as cnt
       FROM registrations
       WHERE person_id = ?
         AND status NOT IN ('cancelled')
       GROUP BY role`
    )
    .bind(personId)
    .all<{ role: string; cnt: number }>();

  let timesAttended = 0;
  let timesServed = 0;
  for (const row of rows.results) {
    if (row.role === 'attendee') timesAttended = row.cnt;
    else if (row.role === 'server') timesServed = row.cnt;
  }

  await db
    .prepare(
      `UPDATE people
       SET times_attended = ?, times_served = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(timesAttended, timesServed, nowIso(), personId)
    .run();
}

/**
 * Returns other non-merged people in the same program who share last_name AND
 * (matching digits-only phone OR matching city, case-insensitive).
 * Excludes self and any rows with merged_into_id set.
 * NULL/empty phone or city do NOT count as a match on that branch.
 */
export async function findPossibleDuplicates(
  env: Env,
  personId: number
): Promise<Person[]> {
  const db = env.DB;

  // Get the person's own fields to compare against
  const self = await db
    .prepare(
      `SELECT program, last_name, phone, city FROM people WHERE id = ?`
    )
    .bind(personId)
    .first<{ program: string; last_name: string; phone: string | null; city: string | null }>();

  if (!self) return [];

  const phone = self.phone && self.phone.trim() !== '' ? self.phone.trim() : null;
  const city  = self.city  && self.city.trim()  !== '' ? self.city.trim()  : null;

  const result = await db
    .prepare(
      `SELECT id, program, first_name, last_name, email, phone, phone_type,
              address, city, state, church,
              times_attended, times_served,
              first_seen_year, last_activity_year,
              notes, merged_into_id, created_at, updated_at
       FROM people
       WHERE program = ?
         AND LOWER(last_name) = LOWER(?)
         AND id != ?
         AND merged_into_id IS NULL
         AND (
           (? IS NOT NULL AND ? != '' AND phone = ?)
           OR
           (? IS NOT NULL AND ? != '' AND LOWER(city) = LOWER(?))
         )
       ORDER BY last_name, first_name`
    )
    .bind(
      self.program,
      self.last_name,
      personId,
      phone, phone, phone,
      city,  city,  city
    )
    .all<Person>();

  return result.results;
}
