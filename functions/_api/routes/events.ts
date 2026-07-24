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
