// functions/_api/events-advance.ts
// Encounter "current event" helpers.
//
// Advancement of the current encounter is now MANUAL — the admin "Start Next
// Encounter" rollover button (POST /api/admin/events/rollover) creates the next
// encounter and flips is_current in one atomic step. The cron no longer auto-
// advances: doing so would fight the manual button and cut the post-encounter
// email window short. The cron only logs an advisory via needsNextEvent.

export type Program = 'mens' | 'women';

export const PROGRAMS: Program[] = ['mens', 'women'];

/**
 * Computes the needs_next_event flag for a single program without mutating any
 * rows. Used by the admin events API (banner) and the cron advisory log.
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
