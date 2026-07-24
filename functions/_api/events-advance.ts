// functions/_api/events-advance.ts
// Auto-advancement of the "current" encounter event per program.
//
// advanceCurrentEvents(env, todayYmd):
//   For each program ('mens', 'women'):
//     1. If the current event (is_current=1) has end_date < todayYmd → it has ended.
//     2. Look for the earliest upcoming event (end_date >= todayYmd) that isn't
//        already current.  If found → atomically swap is_current (batch).
//     3. If no future event exists → set needs_next_event=true for that program.
//
// Idempotent: safe to call every 15 min via cron.
// Pure: takes env + todayYmd as parameters, no global state.

import type { Env } from './app';
import { nowIso } from './db';

export type Program = 'mens' | 'women';

export interface ProgramAdvanceResult {
  program: Program;
  /** Whether the old current event had ended and we found a future one to advance to. */
  advanced: boolean;
  /** ID of the old event that lost is_current (only set when advanced=true). */
  fromEventId?: number;
  /** ID of the new event that gained is_current (only set when advanced=true). */
  toEventId?: number;
  /** True when the current event has ended AND there is no future event to advance to. */
  needs_next_event: boolean;
}

export interface AdvanceResult {
  results: ProgramAdvanceResult[];
}

const PROGRAMS: Program[] = ['mens', 'women'];

/**
 * Advances is_current for each program when the current event has ended.
 *
 * @param env    - Cloudflare Worker env (must have DB binding)
 * @param todayYmd - Today's date as 'YYYY-MM-DD' (used for string comparisons)
 */
export async function advanceCurrentEvents(
  env: Env,
  todayYmd: string
): Promise<AdvanceResult> {
  const results: ProgramAdvanceResult[] = [];

  for (const program of PROGRAMS) {
    // Find the current event for this program
    const currentEvent = await env.DB.prepare(
      `SELECT id, end_date FROM events
       WHERE program = ? AND is_current = 1
       LIMIT 1`
    ).bind(program).first<{ id: number; end_date: string | null }>();

    // No current event set — nothing to advance, no needs_next signal
    if (!currentEvent) {
      results.push({ program, advanced: false, needs_next_event: false });
      continue;
    }

    // Current event is still ongoing (no end_date or end_date >= today)
    if (!currentEvent.end_date || currentEvent.end_date >= todayYmd) {
      results.push({ program, advanced: false, needs_next_event: false });
      continue;
    }

    // Current event has ended — look for the next upcoming event
    const nextEvent = await env.DB.prepare(
      `SELECT id FROM events
       WHERE program = ? AND is_current = 0 AND end_date >= ?
       ORDER BY start_date ASC, year ASC
       LIMIT 1`
    ).bind(program, todayYmd).first<{ id: number }>();

    if (nextEvent) {
      // Atomically swap: unset old current, set new current
      const ts = nowIso();
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE events SET is_current = 0, updated_at = ? WHERE id = ?`
        ).bind(ts, currentEvent.id),
        env.DB.prepare(
          `UPDATE events SET is_current = 1, updated_at = ? WHERE id = ?`
        ).bind(ts, nextEvent.id),
      ]);

      results.push({
        program,
        advanced: true,
        fromEventId: currentEvent.id,
        toEventId: nextEvent.id,
        needs_next_event: false,
      });
    } else {
      // No future event exists — signal the admin
      results.push({
        program,
        advanced: false,
        needs_next_event: true,
      });
    }
  }

  return { results };
}

/**
 * Computes the needs_next_event flag for a single program without mutating any
 * rows.  Used by the admin events API so it can surface the banner.
 *
 * Returns true when:
 *   - There IS a current event AND its end_date has passed AND
 *   - There is NO future event available to advance to.
 */
export async function needsNextEvent(
  db: D1Database,
  program: Program,
  todayYmd: string
): Promise<boolean> {
  const currentEvent = await db.prepare(
    `SELECT id, end_date FROM events
     WHERE program = ? AND is_current = 1
     LIMIT 1`
  ).bind(program).first<{ id: number; end_date: string | null }>();

  if (!currentEvent || !currentEvent.end_date) return false;
  if (currentEvent.end_date >= todayYmd) return false;

  const futureEvent = await db.prepare(
    `SELECT id FROM events
     WHERE program = ? AND is_current = 0 AND end_date >= ?
     LIMIT 1`
  ).bind(program, todayYmd).first<{ id: number }>();

  return futureEvent === null;
}
