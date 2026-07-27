import { Hono } from 'hono';
import type { Env } from '../app';

export const publicRouter = new Hono<{ Bindings: Env }>();

// GET /api/public/events/current?program=mens|women
// Returns the is_current event for the given program.
// Cache-Control: public, max-age=300 (5 min) — safe because admin set-current is rare.
publicRouter.get('/events/current', async (c) => {
  const program = c.req.query('program');
  if (program !== 'mens' && program !== 'women') {
    return c.json({ ok: false, error: 'program must be "mens" or "women"' }, 400);
  }

  const event = await c.env.DB.prepare(
    `SELECT id, program, year, title, start_date, end_date, launch_locations,
            attendee_registration_open, server_registration_open,
            attendee_limit, attendee_full_message
     FROM events
     WHERE program = ? AND is_current = 1
     LIMIT 1`
  ).bind(program).first<{
    id: number;
    program: string;
    year: number;
    title: string | null;
    start_date: string | null;
    end_date: string | null;
    launch_locations: string;
    attendee_registration_open: number;
    server_registration_open: number;
    attendee_limit: number | null;
    attendee_full_message: string | null;
  }>();

  if (!event) {
    return c.json({ ok: false, error: 'no current event' }, 404);
  }

  // Confirmed attendee count vs the cap → is attendee registration full?
  const countRow = await c.env.DB
    .prepare(`SELECT COUNT(*) AS n FROM registrations WHERE program = ? AND event_id = ? AND role = 'attendee' AND status = 'registered'`)
    .bind(program, event.id)
    .first<{ n: number }>();
  const attendee_count = countRow?.n ?? 0;
  const attendee_full = event.attendee_limit != null && attendee_count >= event.attendee_limit;

  // Parse launch_locations JSON before returning
  const parsed = {
    ...event,
    launch_locations: JSON.parse(event.launch_locations) as string[],
    attendee_registration_open: event.attendee_registration_open === 1,
    server_registration_open: event.server_registration_open === 1,
    attendee_count,
    attendee_full,
    // Attendee sign-up is effectively open only when toggled on AND not full.
    attendee_open: event.attendee_registration_open === 1 && !attendee_full,
  };

  return c.json(
    { ok: true, event: parsed },
    200,
    { 'Cache-Control': 'public, max-age=300' }
  );
});
