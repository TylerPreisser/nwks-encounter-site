import { Hono } from 'hono';
import type { Env } from '../app';
import { requireAuth, requireProgram } from '../auth';
import { nowIso } from '../db';
import { needsNextEvent } from '../events-advance';
import type { Program } from '../events-advance';

export const eventsRouter = new Hono<{ Bindings: Env }>();

// All routes require auth + program
eventsRouter.use('*', requireAuth(), requireProgram());

// GET /api/admin/events?program=
eventsRouter.get('/', async (c) => {
  const program = c.get('program') as Program;
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM events WHERE program = ? ORDER BY year DESC`
  ).bind(program).all();

  // Compute today as YYYY-MM-DD (UTC)
  const todayYmd = new Date().toISOString().slice(0, 10);
  const needs_next = await needsNextEvent(c.env.DB, program, todayYmd);

  return c.json({ ok: true, events: results, needs_next_event: needs_next });
});

// POST /api/admin/events  — create a new event for the program+year
eventsRouter.post('/', async (c) => {
  const program = c.get('program');
  const body = await c.req.json<{
    year: number;
    title?: string;
    start_date?: string;
    end_date?: string;
    launch_locations?: string[];
    attendee_registration_open?: boolean;
    server_registration_open?: boolean;
  }>();

  // Validation
  if (!body.year || typeof body.year !== 'number' || body.year < 2020 || body.year > 2100) {
    return c.json({ ok: false, error: 'year must be a number between 2020 and 2100' }, 400);
  }
  if (body.start_date && !/^\d{4}-\d{2}-\d{2}$/.test(body.start_date)) {
    return c.json({ ok: false, error: 'start_date must be YYYY-MM-DD' }, 400);
  }
  if (body.end_date && !/^\d{4}-\d{2}-\d{2}$/.test(body.end_date)) {
    return c.json({ ok: false, error: 'end_date must be YYYY-MM-DD' }, 400);
  }
  if (body.launch_locations !== undefined && !Array.isArray(body.launch_locations)) {
    return c.json({ ok: false, error: 'launch_locations must be an array of strings' }, 400);
  }

  const now = nowIso();
  const launchJson = JSON.stringify(body.launch_locations ?? []);
  const attendeeOpen = body.attendee_registration_open !== false ? 1 : 0;
  const serverOpen = body.server_registration_open !== false ? 1 : 0;

  try {
    const result = await c.env.DB.prepare(
      `INSERT INTO events
         (program, year, title, start_date, end_date, launch_locations,
          attendee_registration_open, server_registration_open, is_current, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
    ).bind(
      program, body.year, body.title ?? null, body.start_date ?? null, body.end_date ?? null,
      launchJson, attendeeOpen, serverOpen, now, now
    ).run();
    const id = result.meta.last_row_id;
    const event = await c.env.DB.prepare(`SELECT * FROM events WHERE id = ?`).bind(id).first();
    return c.json({ ok: true, event }, 201);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE')) {
      return c.json({ ok: false, error: `An event already exists for ${program} ${body.year}` }, 409);
    }
    throw err;
  }
});

// GET /api/admin/events/rollover/preview
// Feeds the "Start Next Encounter" button: the current encounter, its counts,
// whether it has ended, and a suggested next year.
eventsRouter.get('/rollover/preview', async (c) => {
  const program = c.get('program') as Program;
  const current = await c.env.DB.prepare(
    `SELECT * FROM events WHERE program = ? AND is_current = 1`
  ).bind(program).first<{ id: number; year: number; end_date: string | null }>();

  if (!current) return c.json({ ok: true, current: null });

  const reg = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM registrations WHERE event_id = ? AND status = 'registered'`
  ).bind(current.id).first<{ n: number }>();
  const board = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM testimonies WHERE event_id = ? AND status != 'archived'`
  ).bind(current.id).first<{ n: number }>();

  const todayYmd = new Date().toISOString().slice(0, 10);
  const ended = !current.end_date || current.end_date < todayYmd;

  return c.json({
    ok: true,
    current,
    registered_count: reg?.n ?? 0,
    board_count: board?.n ?? 0,
    ended,
    suggested_year: current.year + 1,
  });
});

// POST /api/admin/events/rollover
// The "Start Next Encounter" action (per program). ONE atomic step:
//   1. archive this encounter's board (clean sweep -> that year's history),
//   2. create the next encounter from the submitted form,
//   3. make the next encounter current (old one deactivated).
// Guards: current must exist; must have ended (unless force); confirm_year must
// match year (typed confirmation). Registrations stay put — already year-tagged.
eventsRouter.post('/rollover', async (c) => {
  const program = c.get('program') as Program;
  const body = await c.req.json<{
    year: number;
    title?: string;
    start_date?: string;
    end_date?: string;
    launch_locations?: string[];
    attendee_registration_open?: boolean;
    server_registration_open?: boolean;
    attendee_limit?: number | null | '';
    attendee_full_message?: string | null;
    confirm_year?: number;
    force?: boolean;
  }>();

  const current = await c.env.DB.prepare(
    `SELECT id, year, end_date FROM events WHERE program = ? AND is_current = 1`
  ).bind(program).first<{ id: number; year: number; end_date: string | null }>();
  if (!current) {
    return c.json({ ok: false, error: 'No current encounter to roll over. Create or activate one first.' }, 409);
  }

  if (!body.year || typeof body.year !== 'number' || body.year < 2020 || body.year > 2100) {
    return c.json({ ok: false, error: 'year must be a number between 2020 and 2100' }, 400);
  }
  if (body.start_date && !/^\d{4}-\d{2}-\d{2}$/.test(body.start_date)) {
    return c.json({ ok: false, error: 'start_date must be YYYY-MM-DD' }, 400);
  }
  if (body.end_date && !/^\d{4}-\d{2}-\d{2}$/.test(body.end_date)) {
    return c.json({ ok: false, error: 'end_date must be YYYY-MM-DD' }, 400);
  }
  if (body.launch_locations !== undefined && !Array.isArray(body.launch_locations)) {
    return c.json({ ok: false, error: 'launch_locations must be an array of strings' }, 400);
  }
  if (body.confirm_year !== body.year) {
    return c.json({ ok: false, error: 'confirm_year must match year to confirm the rollover' }, 400);
  }

  // Protect the post-encounter email window: don't roll over until it has ended.
  const todayYmd = new Date().toISOString().slice(0, 10);
  if (!body.force && current.end_date && current.end_date >= todayYmd) {
    return c.json({ ok: false, error: 'current encounter has not ended yet', ended: false }, 409);
  }

  const archivable = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM testimonies WHERE event_id = ? AND status != 'archived'`
  ).bind(current.id).first<{ n: number }>();

  const now = nowIso();
  const launchJson = JSON.stringify(body.launch_locations ?? []);
  const attendeeOpen = body.attendee_registration_open !== false ? 1 : 0;
  const serverOpen = body.server_registration_open !== false ? 1 : 0;
  const attendeeLimit = body.attendee_limit === '' || body.attendee_limit == null ? null : Number(body.attendee_limit);
  const fullMsg = body.attendee_full_message ?? null;

  // Create the next encounter (is_current=0; the batch below flips it).
  let newId: number;
  try {
    const res = await c.env.DB.prepare(
      `INSERT INTO events
         (program, year, title, start_date, end_date, launch_locations,
          attendee_registration_open, server_registration_open,
          attendee_limit, attendee_full_message, is_current, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
    ).bind(
      program, body.year, body.title ?? null, body.start_date ?? null, body.end_date ?? null,
      launchJson, attendeeOpen, serverOpen, attendeeLimit, fullMsg, now, now
    ).run();
    newId = res.meta.last_row_id as number;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE')) {
      return c.json({ ok: false, error: `An encounter already exists for ${program} ${body.year}` }, 409);
    }
    throw err;
  }

  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE testimonies SET status = 'archived' WHERE event_id = ? AND status != 'archived'`
    ).bind(current.id),
    c.env.DB.prepare(
      `UPDATE events SET is_current = 0, updated_at = ? WHERE program = ? AND is_current = 1`
    ).bind(now, program),
    c.env.DB.prepare(
      `UPDATE events SET is_current = 1, updated_at = ? WHERE id = ?`
    ).bind(now, newId),
  ]);

  const previous = await c.env.DB.prepare(`SELECT * FROM events WHERE id = ?`).bind(current.id).first();
  const created = await c.env.DB.prepare(`SELECT * FROM events WHERE id = ?`).bind(newId).first();

  return c.json({
    ok: true,
    archived_count: archivable?.n ?? 0,
    previous_event: previous,
    new_event: created,
  }, 201);
});

// PATCH /api/admin/events/:id  — update mutable fields
eventsRouter.patch('/:id', async (c) => {
  const program = c.get('program');
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) {
    return c.json({ ok: false, error: 'invalid id' }, 400);
  }

  // Confirm ownership
  const existing = await c.env.DB.prepare(
    `SELECT * FROM events WHERE id = ? AND program = ?`
  ).bind(id, program).first<{ id: number }>();
  if (!existing) return c.json({ ok: false, error: 'not found' }, 404);

  const body = await c.req.json<{
    title?: string;
    start_date?: string | null;
    end_date?: string | null;
    launch_locations?: string[];
    attendee_registration_open?: boolean;
    server_registration_open?: boolean;
    attendee_limit?: number | null | '';
    attendee_full_message?: string | null;
  }>();

  if (body.start_date && !/^\d{4}-\d{2}-\d{2}$/.test(body.start_date)) {
    return c.json({ ok: false, error: 'start_date must be YYYY-MM-DD' }, 400);
  }
  if (body.end_date && !/^\d{4}-\d{2}-\d{2}$/.test(body.end_date)) {
    return c.json({ ok: false, error: 'end_date must be YYYY-MM-DD' }, 400);
  }
  if (body.launch_locations !== undefined && !Array.isArray(body.launch_locations)) {
    return c.json({ ok: false, error: 'launch_locations must be an array of strings' }, 400);
  }

  const sets: string[] = [];
  const vals: unknown[] = [];

  if ('title' in body)                      { sets.push('title = ?');                       vals.push(body.title ?? null); }
  if ('start_date' in body)                 { sets.push('start_date = ?');                  vals.push(body.start_date ?? null); }
  if ('end_date' in body)                   { sets.push('end_date = ?');                    vals.push(body.end_date ?? null); }
  if ('launch_locations' in body)           { sets.push('launch_locations = ?');            vals.push(JSON.stringify(body.launch_locations)); }
  if ('attendee_registration_open' in body) { sets.push('attendee_registration_open = ?'); vals.push(body.attendee_registration_open ? 1 : 0); }
  if ('server_registration_open' in body)   { sets.push('server_registration_open = ?');   vals.push(body.server_registration_open ? 1 : 0); }
  if ('attendee_limit' in body)             { sets.push('attendee_limit = ?');             vals.push(body.attendee_limit === '' || body.attendee_limit == null ? null : Number(body.attendee_limit)); }
  if ('attendee_full_message' in body)      { sets.push('attendee_full_message = ?');      vals.push(body.attendee_full_message ?? null); }

  if (sets.length === 0) return c.json({ ok: false, error: 'no fields to update' }, 400);

  sets.push('updated_at = ?');
  vals.push(nowIso());
  vals.push(id);
  vals.push(program);

  await c.env.DB.prepare(
    `UPDATE events SET ${sets.join(', ')} WHERE id = ? AND program = ?`
  ).bind(...vals).run();

  const updated = await c.env.DB.prepare(`SELECT * FROM events WHERE id = ?`).bind(id).first();
  return c.json({ ok: true, event: updated });
});

// POST /api/admin/events/:id/set-current
// Sets is_current=1 for this event and 0 for all others in the same program.
// This is an atomic two-statement batch — enforces the one-current invariant.
eventsRouter.post('/:id/set-current', async (c) => {
  const program = c.get('program');
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) {
    return c.json({ ok: false, error: 'invalid id' }, 400);
  }

  const existing = await c.env.DB.prepare(
    `SELECT id FROM events WHERE id = ? AND program = ?`
  ).bind(id, program).first<{ id: number }>();
  if (!existing) return c.json({ ok: false, error: 'not found' }, 404);

  const now = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE events SET is_current = 0, updated_at = ? WHERE program = ? AND is_current = 1`
    ).bind(now, program),
    c.env.DB.prepare(
      `UPDATE events SET is_current = 1, updated_at = ? WHERE id = ?`
    ).bind(now, id),
  ]);

  const updated = await c.env.DB.prepare(`SELECT * FROM events WHERE id = ?`).bind(id).first();
  return c.json({ ok: true, event: updated });
});
