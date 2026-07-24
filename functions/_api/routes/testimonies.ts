// functions/_api/routes/testimonies.ts — Admin Testimonies & Teachings API

import { Hono } from 'hono';
import type { Env } from '../app';
import type { AppVariables } from '../auth';
import { requireAuth, requireProgram } from '../auth';
import { nowIso } from '../db';
import type { Program } from '../db';
import { sendEmail } from '../email';

export const testimoniesRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

testimoniesRouter.use('*', requireAuth(), requireProgram());

// ---------------------------------------------------------------------------
// GET /api/admin/testimonies/new-count
// Must be registered BEFORE /:id to avoid param conflict
// ---------------------------------------------------------------------------
testimoniesRouter.get('/new-count', async (c) => {
  const program = c.get('program') as Program;

  const programNew = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM testimonies WHERE program = ? AND status = 'new'`
  ).bind(program).first<{ n: number }>();

  const unassignedNew = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM testimonies WHERE program IS NULL AND status = 'new'`
  ).first<{ n: number }>();

  return c.json({
    ok: true,
    program_new: programNew?.n ?? 0,
    unassigned_new: unassignedNew?.n ?? 0,
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/testimonies
// ?status=    optional status filter
// ?type=      optional type filter
// ?assigned=unassigned  show only program-NULL rows
// Default: show program=activeProgram OR program IS NULL
// ---------------------------------------------------------------------------
testimoniesRouter.get('/', async (c) => {
  const program = c.get('program') as Program;
  const status = c.req.query('status') ?? null;
  const type = c.req.query('type') ?? null;
  const assigned = c.req.query('assigned') ?? null;

  const conditions: string[] = [];
  const bindings: (string | null)[] = [];

  if (assigned === 'unassigned') {
    conditions.push('t.program IS NULL');
  } else {
    conditions.push('(t.program = ? OR t.program IS NULL)');
    bindings.push(program);
  }

  if (status) {
    conditions.push('t.status = ?');
    bindings.push(status);
  }

  if (type) {
    conditions.push('t.type = ?');
    bindings.push(type);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = await c.env.DB.prepare(
    `SELECT t.*,
            p.first_name, p.last_name,
            (SELECT COUNT(*) FROM testimony_attachments a WHERE a.testimony_id = t.id) AS attachment_count,
            (SELECT COUNT(*) FROM testimony_comments co WHERE co.testimony_id = t.id) AS comment_count
     FROM testimonies t
     LEFT JOIN people p ON p.id = t.person_id
     ${where}
     ORDER BY t.received_at DESC, t.created_at DESC`
  ).bind(...bindings).all();

  return c.json({ ok: true, testimonies: rows.results });
});

// ---------------------------------------------------------------------------
// GET /api/admin/testimonies/:id
// Program isolation: active program OR program IS NULL (unassigned)
// ---------------------------------------------------------------------------
testimoniesRouter.get('/:id', async (c) => {
  const program = c.get('program') as Program;
  const id = Number(c.req.param('id'));

  const testimony = await c.env.DB.prepare(
    `SELECT t.*, p.first_name, p.last_name, p.email AS person_email, p.program AS person_program
     FROM testimonies t
     LEFT JOIN people p ON p.id = t.person_id
     WHERE t.id = ? AND (t.program = ? OR t.program IS NULL)`
  ).bind(id, program).first<Record<string, unknown>>();

  if (!testimony) return c.json({ ok: false, error: 'not found' }, 404);

  const attachments = await c.env.DB.prepare(
    `SELECT id, filename, content_type, size, r2_key, link_url, created_at
     FROM testimony_attachments WHERE testimony_id = ? ORDER BY id`
  ).bind(id).all();

  const comments = await c.env.DB.prepare(
    `SELECT tc.id, tc.body, tc.created_at, au.name AS admin_name
     FROM testimony_comments tc
     LEFT JOIN admin_users au ON au.id = tc.admin_user_id
     WHERE tc.testimony_id = ? ORDER BY tc.created_at`
  ).bind(id).all();

  // Build person summary if matched
  let person: Record<string, unknown> | null = null;
  if (testimony.person_id) {
    person = {
      id: testimony.person_id,
      first_name: testimony.first_name,
      last_name: testimony.last_name,
      email: testimony.person_email,
      program: testimony.person_program,
    };
  }

  // Strip person fields from testimony object for cleaner response
  const { first_name, last_name, person_email, person_program, ...testimonyCore } = testimony;

  return c.json({
    ok: true,
    testimony: testimonyCore,
    attachments: attachments.results,
    comments: comments.results,
    person,
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/testimonies/:id/comment
// ---------------------------------------------------------------------------
testimoniesRouter.post('/:id/comment', async (c) => {
  const program = c.get('program') as Program;
  const user = c.get('user') as { id: number };
  const id = Number(c.req.param('id'));

  // Check access
  const testimony = await c.env.DB.prepare(
    `SELECT id FROM testimonies WHERE id = ? AND (program = ? OR program IS NULL)`
  ).bind(id, program).first<{ id: number }>();
  if (!testimony) return c.json({ ok: false, error: 'not found' }, 404);

  let body: { body?: string } = {};
  try {
    body = await c.req.json<{ body?: string }>();
  } catch {
    // empty body
  }
  if (!body.body || body.body.trim() === '') {
    return c.json({ ok: false, error: 'body is required' }, 400);
  }

  const now = nowIso();
  const { meta } = await c.env.DB.prepare(
    `INSERT INTO testimony_comments (testimony_id, admin_user_id, body, created_at)
     VALUES (?, ?, ?, ?)`
  ).bind(id, user.id, body.body.trim(), now).run();

  const commentId = meta.last_row_id as number;
  return c.json({
    ok: true,
    comment: { id: commentId, body: body.body.trim(), created_at: now },
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/testimonies/:id/reply
// Sends a reply email to from_email; sets status='replied'; writes email_log.
// ---------------------------------------------------------------------------
testimoniesRouter.post('/:id/reply', async (c) => {
  const program = c.get('program') as Program;
  const id = Number(c.req.param('id'));

  const testimony = await c.env.DB.prepare(
    `SELECT id, from_email, from_name FROM testimonies WHERE id = ? AND (program = ? OR program IS NULL)`
  ).bind(id, program).first<{ id: number; from_email: string; from_name: string }>();
  if (!testimony) return c.json({ ok: false, error: 'not found' }, 404);

  let body: { subject?: string; body_html?: string; body_text?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    // empty body
  }
  if (!body.subject || !body.body_text) {
    return c.json({ ok: false, error: 'subject and body_text are required' }, 400);
  }

  await sendEmail(c.env, {
    to: testimony.from_email,
    subject: body.subject,
    html: body.body_html ?? body.body_text,
    text: body.body_text,
    type: 'transactional',
    program,
  });

  await c.env.DB.prepare(
    `UPDATE testimonies SET status = 'replied' WHERE id = ?`
  ).bind(id).run();

  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/testimonies/:id
// Update status, type, or person_id (reassign).
// Program isolation: can act on own-program + unassigned; not other program.
// ---------------------------------------------------------------------------
testimoniesRouter.patch('/:id', async (c) => {
  const program = c.get('program') as Program;
  const id = Number(c.req.param('id'));

  const testimony = await c.env.DB.prepare(
    `SELECT id, program, person_id FROM testimonies WHERE id = ? AND (program = ? OR program IS NULL)`
  ).bind(id, program).first<{ id: number; program: string | null; person_id: number | null }>();
  if (!testimony) return c.json({ ok: false, error: 'not found' }, 404);

  let body: { status?: string; type?: string; person_id?: number | null } = {};
  try {
    body = await c.req.json();
  } catch {
    // empty body
  }

  const updates: string[] = [];
  const bindings: (string | number | null)[] = [];

  if (body.status !== undefined) {
    const allowed = ['new', 'read', 'replied', 'archived'];
    if (!allowed.includes(body.status)) {
      return c.json({ ok: false, error: 'invalid status' }, 400);
    }
    updates.push('status = ?');
    bindings.push(body.status);
  }

  if (body.type !== undefined) {
    const allowed = ['testimony', 'teaching'];
    if (!allowed.includes(body.type)) {
      return c.json({ ok: false, error: 'invalid type' }, 400);
    }
    updates.push('type = ?');
    bindings.push(body.type);
  }

  if ('person_id' in body) {
    if (body.person_id === null || body.person_id === undefined) {
      // Unassign
      updates.push('person_id = NULL');
      updates.push('program = NULL');
    } else {
      // Reassign — look up new person's program
      const person = await c.env.DB.prepare(
        `SELECT id, program FROM people WHERE id = ? AND merged_into_id IS NULL`
      ).bind(body.person_id).first<{ id: number; program: string }>();
      if (!person) {
        return c.json({ ok: false, error: 'person not found' }, 404);
      }
      updates.push('person_id = ?');
      bindings.push(person.id);
      updates.push('program = ?');
      bindings.push(person.program);
    }
  }

  if (updates.length === 0) {
    return c.json({ ok: false, error: 'no fields to update' }, 400);
  }

  bindings.push(id);
  await c.env.DB.prepare(
    `UPDATE testimonies SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...bindings).run();

  const updated = await c.env.DB.prepare(
    `SELECT id, status, type, person_id, program FROM testimonies WHERE id = ?`
  ).bind(id).first<{ id: number; status: string; type: string; person_id: number | null; program: string | null }>();

  return c.json({ ok: true, testimony: updated });
});
