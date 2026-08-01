// functions/_api/routes/interest.ts
// Express Interest — the public waitlist submit, and the admin queue view.
//
// The public endpoint lives under /api/register/* so it inherits the same CORS
// treatment as registration; the admin one lives under /api/admin/*.

import { Hono } from 'hono';
import type { Env } from '../app';
import { requireAuth, requireProgram } from '../auth';
import { nowIso } from '../db';
import type { Program } from '../db';

export const interestPublicRouter = new Hono<{ Bindings: Env }>();
export const interestAdminRouter = new Hono<{ Bindings: Env }>();

/** Deliberately identical for a new entry and a repeat one — see below. */
const ACCEPTED = {
  ok: true,
  message: "You're on the list. We'll email you when the next Encounter opens.",
} as const;

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// ---------------------------------------------------------------------------
// POST /api/register/interest  (public)
// ---------------------------------------------------------------------------
interestPublicRouter.post('/interest', async (c) => {
  let body: {
    program?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'Invalid JSON body.' }, 400);
  }

  const program = body.program === 'womens' ? 'women' : body.program;
  if (program !== 'mens' && program !== 'women') {
    return c.json({ ok: false, error: 'program must be "mens" or "women"' }, 400);
  }

  const first_name = (body.first_name ?? '').trim();
  const last_name = (body.last_name ?? '').trim();
  const emailRaw = (body.email ?? '').trim();
  const phone = (body.phone ?? '').trim() || null;

  if (!first_name) return c.json({ ok: false, error: 'First name is required.' }, 400);
  if (!last_name) return c.json({ ok: false, error: 'Last name is required.' }, 400);
  if (!emailRaw) return c.json({ ok: false, error: 'Email is required.' }, 400);
  if (!isEmail(emailRaw)) return c.json({ ok: false, error: 'Please enter a valid email address.' }, 400);

  // Stored lowercase so the UNIQUE(event_id, email) index actually dedupes
  // people who capitalise their address differently the second time.
  const email = emailRaw.toLowerCase();

  const event = await c.env.DB.prepare(
    `SELECT id, attendee_registration_open, attendee_limit
     FROM events WHERE program = ? AND is_current = 1 LIMIT 1`
  ).bind(program).first<{
    id: number;
    attendee_registration_open: number;
    attendee_limit: number | null;
  }>();

  if (!event) {
    return c.json({ ok: false, error: 'There is no upcoming Encounter open right now.' }, 404);
  }

  // Re-derive "closed" server-side rather than trusting the client: a tab left
  // open since before the cap filled must not park someone in a queue they
  // could have registered for, and vice versa.
  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM registrations
     WHERE program = ? AND event_id = ? AND role = 'attendee' AND status = 'registered'`
  ).bind(program, event.id).first<{ n: number }>();
  const full = event.attendee_limit != null && (countRow?.n ?? 0) >= event.attendee_limit;
  const open = event.attendee_registration_open === 1 && !full;

  if (open) {
    return c.json(
      {
        ok: false,
        registration_open: true,
        error: 'Registration is open — you can sign up right now.',
      },
      409
    );
  }

  // Upsert. A repeat submission updates the existing row (they may be fixing a
  // typo) instead of queueing a second invite to the same address.
  await c.env.DB.prepare(
    `INSERT INTO interest_queue (program, event_id, first_name, last_name, email, phone, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(event_id, email) DO UPDATE SET
       first_name = excluded.first_name,
       last_name  = excluded.last_name,
       phone      = excluded.phone`
  ).bind(program, event.id, first_name, last_name, email, phone, nowIso()).run();

  // The response is byte-identical whether this was a new entry or a repeat.
  // Anything else turns the form into an oracle for "is this address on file".
  return c.json(ACCEPTED, 202);
});

// ---------------------------------------------------------------------------
// GET /api/admin/interest?event_id=  (admin)
// Defaults to the program's current encounter.
// ---------------------------------------------------------------------------
interestAdminRouter.use('*', requireAuth(), requireProgram());

interestAdminRouter.get('/', async (c) => {
  const program = c.get('program') as Program;
  const eventIdParam = c.req.query('event_id');

  let eventId: number | null = eventIdParam ? Number(eventIdParam) : null;
  if (eventId == null) {
    const current = await c.env.DB.prepare(
      `SELECT id FROM events WHERE program = ? AND is_current = 1 LIMIT 1`
    ).bind(program).first<{ id: number }>();
    eventId = current?.id ?? null;
  }

  if (eventId == null || !Number.isInteger(eventId)) {
    return c.json({ ok: true, rows: [], total: 0 });
  }

  const { results } = await c.env.DB.prepare(
    `SELECT id, first_name, last_name, email, phone, status,
            notified_at, notified_event_id, created_at
     FROM interest_queue
     WHERE program = ? AND event_id = ?
     ORDER BY created_at ASC`
  ).bind(program, eventId).all();

  return c.json({ ok: true, rows: results, total: results.length, event_id: eventId });
});
