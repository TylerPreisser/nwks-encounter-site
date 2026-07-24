// functions/_api/routes/testimonies.ts -- Admin Testimonies & Teachings API

import { Hono } from 'hono';
import type { Env } from '../app';
import type { AppVariables } from '../auth';
import { requireAuth, requireProgram } from '../auth';
import { nowIso } from '../db';
import type { Program } from '../db';
import { sendEmail } from '../email';

export const testimoniesRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

testimoniesRouter.use('*', requireAuth(), requireProgram());

// Valid board statuses (display order)
const BOARD_STATUSES = ['unfulfilled', 'waiting', 'draft_1', 'draft_2', 'awaiting', 'approved', 'archived'] as const;
type BoardStatus = typeof BOARD_STATUSES[number];

function isValidStatus(s: string): s is BoardStatus {
  return (BOARD_STATUSES as readonly string[]).includes(s);
}

// "Needs attention" = any non-approved, non-archived status
const NEEDS_ATTENTION_STATUSES = ['unfulfilled', 'waiting', 'draft_1', 'draft_2', 'awaiting'];

// ---------------------------------------------------------------------------
// GET /api/admin/testimonies/new-count
// "Needs attention" badge: items in the active program (+ unassigned)
// that are not yet approved or archived.
// Must be registered BEFORE /:id to avoid param conflict.
// ---------------------------------------------------------------------------
testimoniesRouter.get('/new-count', async (c) => {
  const program = c.get('program') as Program;

  const placeholders = NEEDS_ATTENTION_STATUSES.map(() => '?').join(',');

  const programCount = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM testimonies
     WHERE program = ? AND status IN (${placeholders})`
  ).bind(program, ...NEEDS_ATTENTION_STATUSES).first<{ n: number }>();

  const unassignedCount = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM testimonies
     WHERE program IS NULL AND status IN (${placeholders})`
  ).bind(...NEEDS_ATTENTION_STATUSES).first<{ n: number }>();

  return c.json({
    ok: true,
    program_new: programCount?.n ?? 0,
    unassigned_new: unassignedCount?.n ?? 0,
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/testimonies
// ?status=    filter by exact status
// ?type=      filter by type (testimony|teaching)
// ?assigned=unassigned  show only program-NULL rows
// ?fulfilled= 'true' => approved only; 'false' => not approved/archived
// Default: show program=activeProgram OR program IS NULL
// ---------------------------------------------------------------------------
testimoniesRouter.get('/', async (c) => {
  const program = c.get('program') as Program;
  const status = c.req.query('status') ?? null;
  const type = c.req.query('type') ?? null;
  const assigned = c.req.query('assigned') ?? null;
  const fulfilled = c.req.query('fulfilled') ?? null;

  const conditions: string[] = [];
  const bindings: (string | null)[] = [];

  if (assigned === 'unassigned') {
    conditions.push('t.program IS NULL');
  } else {
    conditions.push('(t.program = ? OR t.program IS NULL)');
    bindings.push(program);
  }

  if (status && isValidStatus(status)) {
    conditions.push('t.status = ?');
    bindings.push(status);
  } else if (fulfilled === 'true') {
    conditions.push("t.status = 'approved'");
  } else if (fulfilled === 'false') {
    conditions.push("t.status NOT IN ('approved', 'archived')");
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
     ORDER BY
       CASE t.status
         WHEN 'unfulfilled' THEN 1
         WHEN 'waiting'     THEN 2
         WHEN 'draft_1'     THEN 3
         WHEN 'draft_2'     THEN 4
         WHEN 'awaiting'    THEN 5
         WHEN 'approved'    THEN 6
         WHEN 'archived'    THEN 7
         ELSE 8
       END,
       t.received_at DESC, t.created_at DESC`
  ).bind(...bindings).all();

  return c.json({ ok: true, testimonies: rows.results });
});

// ---------------------------------------------------------------------------
// POST /api/admin/testimonies
// Create a needed item (unfulfilled).
// Body: { type, person_id?, title?, status? }
// Program is derived from assigned person, or stays null if unassigned.
// ---------------------------------------------------------------------------
testimoniesRouter.post('/', async (c) => {
  const program = c.get('program') as Program;

  let body: {
    type?: string;
    person_id?: number | null;
    title?: string | null;
    status?: string;
  } = {};
  try {
    body = await c.req.json();
  } catch {
    // empty body
  }

  // Validate type
  const type = body.type ?? 'testimony';
  if (!['testimony', 'teaching'].includes(type)) {
    return c.json({ ok: false, error: 'invalid type' }, 400);
  }

  // Validate status (default unfulfilled)
  const status = body.status ?? 'unfulfilled';
  if (!isValidStatus(status)) {
    return c.json({ ok: false, error: 'invalid status' }, 400);
  }

  // Resolve person + program
  let personId: number | null = null;
  let itemProgram: string | null = null;

  if (body.person_id != null) {
    const person = await c.env.DB.prepare(
      `SELECT id, program FROM people WHERE id = ? AND merged_into_id IS NULL`
    ).bind(body.person_id).first<{ id: number; program: string }>();
    if (!person) {
      return c.json({ ok: false, error: 'person not found' }, 404);
    }
    personId = person.id;
    itemProgram = person.program;
  } else {
    // No person assigned — default to current admin's program
    itemProgram = program;
  }

  const now = nowIso();
  const title = body.title?.trim() ?? null;

  const { meta } = await c.env.DB.prepare(
    `INSERT INTO testimonies
       (type, person_id, program, title, from_email, from_name,
        status, assigned_at, created_at)
     VALUES (?, ?, ?, ?, '', '', ?, ?, ?)`
  ).bind(
    type,
    personId,
    itemProgram,
    title,
    status,
    personId ? now : null,
    now
  ).run();

  const newId = meta.last_row_id as number;
  const created = await c.env.DB.prepare(
    `SELECT t.*, p.first_name, p.last_name,
            0 AS attachment_count, 0 AS comment_count
     FROM testimonies t
     LEFT JOIN people p ON p.id = t.person_id
     WHERE t.id = ?`
  ).bind(newId).first<Record<string, unknown>>();

  return c.json({ ok: true, testimony: created }, 201);
});

// ---------------------------------------------------------------------------
// GET /api/admin/testimonies/:id/view
// Returns a standalone HTML page for viewing the testimony submission in a new tab.
// Shows body_html / body_text, attachment links, and a note if no content yet.
// ---------------------------------------------------------------------------
testimoniesRouter.get('/:id/view', async (c) => {
  const program = c.get('program') as Program;
  const id = Number(c.req.param('id'));

  const testimony = await c.env.DB.prepare(
    `SELECT t.*, p.first_name, p.last_name
     FROM testimonies t
     LEFT JOIN people p ON p.id = t.person_id
     WHERE t.id = ? AND (t.program = ? OR t.program IS NULL)`
  ).bind(id, program).first<Record<string, unknown>>();

  if (!testimony) return c.json({ ok: false, error: 'not found' }, 404);

  const attachments = await c.env.DB.prepare(
    `SELECT id, filename, content_type, r2_key, link_url FROM testimony_attachments WHERE testimony_id = ? ORDER BY id`
  ).bind(id).all<{ id: number; filename: string | null; content_type: string | null; r2_key: string | null; link_url: string | null }>();

  const personName = testimony.first_name
    ? `${testimony.first_name} ${testimony.last_name ?? ''}`.trim()
    : (testimony.from_name as string) || 'Unknown';
  const type = testimony.type === 'teaching' ? 'Teaching' : 'Testimony';
  const title = (testimony.title as string) || (testimony.subject as string) || '';

  const bodyHtml = testimony.body_html as string | null;
  const bodyText = testimony.body_text as string | null;

  const hasContent = !!(bodyHtml || bodyText || attachments.results.length > 0);

  // Build attachment HTML
  const attHtml = attachments.results.map(att => {
    if (att.r2_key) {
      const isPdf = att.content_type === 'application/pdf' || (att.filename ?? '').toLowerCase().endsWith('.pdf');
      if (isPdf) {
        return `<div class="att">
          <p><strong>${att.filename ?? 'Attachment'}</strong> (hosted PDF)</p>
          <embed src="/api/admin/attachments/${att.r2_key}" type="application/pdf" width="100%" height="600" />
        </div>`;
      }
      return `<div class="att"><a href="/api/admin/attachments/${att.r2_key}" target="_blank" rel="noopener">${att.filename ?? 'Attachment'}</a></div>`;
    }
    if (att.link_url) {
      return `<div class="att"><a href="${att.link_url}" target="_blank" rel="noopener">${att.filename ?? att.link_url}</a></div>`;
    }
    return `<div class="att"><span>${att.filename ?? 'Attachment'} (no link available)</span></div>`;
  }).join('\n');

  const contentHtml = bodyHtml
    ? `<div class="body-content">${bodyHtml}</div>`
    : bodyText
    ? `<pre class="body-text">${bodyText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${type}: ${personName}${title ? ' - ' + title : ''}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; color: #1a1a1a; background: #fafafa; }
    .header { border-bottom: 2px solid #e5e7eb; padding-bottom: 1rem; margin-bottom: 1.5rem; }
    .meta { font-size: 0.85rem; color: #6b7280; margin-top: 0.25rem; }
    .badge { display: inline-block; font-size: 0.75rem; padding: 0.15rem 0.5rem; border-radius: 9999px; font-weight: 600; margin-right: 0.5rem; }
    .badge-testimony { background: #e0f2fe; color: #0369a1; }
    .badge-teaching { background: #f3e8ff; color: #7c3aed; }
    .section { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1.25rem; margin-bottom: 1rem; }
    .section h3 { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; margin: 0 0 0.75rem; }
    .body-content { font-size: 0.95rem; line-height: 1.6; }
    .body-text { font-family: inherit; white-space: pre-wrap; font-size: 0.95rem; line-height: 1.6; margin: 0; }
    .att { margin-bottom: 0.5rem; font-size: 0.9rem; }
    .att a { color: #2563eb; text-decoration: none; }
    .att a:hover { text-decoration: underline; }
    .no-content { font-style: italic; color: #9ca3af; text-align: center; padding: 2rem; }
  </style>
</head>
<body>
  <div class="header">
    <span class="badge badge-${testimony.type}">${type}</span>
    <h1 style="margin: 0.25rem 0 0; font-size: 1.25rem;">${personName}${title ? ` — ${title}` : ''}</h1>
    <div class="meta">
      ${testimony.received_at ? `Received: ${new Date(testimony.received_at as string).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} &nbsp;&middot;&nbsp; ` : ''}
      Status: ${String(testimony.status).replace(/_/g, ' ')}
      ${testimony.from_email ? ` &nbsp;&middot;&nbsp; From: ${testimony.from_email}` : ''}
    </div>
  </div>

  ${!hasContent ? `<div class="no-content">No submission content yet — awaiting from ${personName}.</div>` : ''}

  ${contentHtml ? `<div class="section"><h3>Submission</h3>${contentHtml}</div>` : ''}

  ${attHtml ? `<div class="section"><h3>Attachments &amp; Links</h3>${attHtml}</div>` : ''}
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
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
// Sends a reply email to from_email; sets status='awaiting'.
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

  // After replying, move to awaiting (they need to send next draft)
  await c.env.DB.prepare(
    `UPDATE testimonies SET status = 'awaiting' WHERE id = ?`
  ).bind(id).run();

  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/testimonies/:id
// Update status, type, title, or person_id (reassign).
// Program isolation: can act on own-program + unassigned; not other program.
// ---------------------------------------------------------------------------
testimoniesRouter.patch('/:id', async (c) => {
  const program = c.get('program') as Program;
  const id = Number(c.req.param('id'));

  const testimony = await c.env.DB.prepare(
    `SELECT id, program, person_id FROM testimonies WHERE id = ? AND (program = ? OR program IS NULL)`
  ).bind(id, program).first<{ id: number; program: string | null; person_id: number | null }>();
  if (!testimony) return c.json({ ok: false, error: 'not found' }, 404);

  let body: {
    status?: string;
    type?: string;
    title?: string | null;
    person_id?: number | null;
  } = {};
  try {
    body = await c.req.json();
  } catch {
    // empty body
  }

  const updates: string[] = [];
  const bindings: (string | number | null)[] = [];

  if (body.status !== undefined) {
    if (!isValidStatus(body.status)) {
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

  if ('title' in body) {
    updates.push('title = ?');
    bindings.push(body.title?.trim() ?? null);
  }

  if ('person_id' in body) {
    if (body.person_id === null || body.person_id === undefined) {
      updates.push('person_id = NULL');
      updates.push('program = NULL');
      updates.push('assigned_at = NULL');
    } else {
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
      updates.push('assigned_at = ?');
      bindings.push(nowIso());
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
    `SELECT id, status, type, title, person_id, program FROM testimonies WHERE id = ?`
  ).bind(id).first<{ id: number; status: string; type: string; title: string | null; person_id: number | null; program: string | null }>();

  return c.json({ ok: true, testimony: updated });
});
