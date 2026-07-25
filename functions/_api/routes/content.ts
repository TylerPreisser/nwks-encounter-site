// functions/_api/routes/content.ts
// CMS endpoints: editable form fields + page text blocks.
// Admin (requireAuth + requireProgram): /api/admin/form-fields, /api/admin/page-content
// Public (CORS, no auth):               /api/public/form-config, /api/public/page-content

import { Hono } from 'hono';
import type { Env } from '../app.js';
import { requireAuth, requireProgram } from '../auth.js';
import { nowIso } from '../db.js';

// ── Shared app — admin routes and public routes are both exported ─────────────
// We split into two Hono instances so app.ts can mount them under different
// paths with different middleware (CORS vs none).

export const contentAdminRouter = new Hono<{ Bindings: Env }>();
export const contentPublicRouter = new Hono<{ Bindings: Env }>();

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — form-fields
// ─────────────────────────────────────────────────────────────────────────────

// All admin routes require auth + program
contentAdminRouter.use('*', requireAuth(), requireProgram());

type FormFieldRow = {
  id: number;
  program: string;
  role: string;
  name: string;
  label: string;
  type: string;
  options: string | null;
  required: number;
  help: string | null;
  sort: number;
  active: number;
  created_at: string;
  updated_at: string;
};

type PageContentRow = {
  id: number;
  program: string;
  key: string;
  label: string;
  value: string;
  sort: number;
  updated_at: string;
};

const VALID_TYPES = new Set(['text','textarea','dropdown','checkbox','radio','email','phone']);

// GET /api/admin/form-fields?role=  (role optional; if omitted returns all roles grouped)
contentAdminRouter.get('/form-fields', async (c) => {
  const program = c.get('program');
  const role = c.req.query('role');

  if (role) {
    if (role !== 'attendee' && role !== 'server') {
      return c.json({ ok: false, error: 'role must be attendee or server' }, 400);
    }
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM form_fields WHERE program = ? AND role = ? ORDER BY sort ASC, id ASC`
    ).bind(program, role).all<FormFieldRow>();
    return c.json({ ok: true, fields: results });
  }

  // No role — return both roles grouped
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM form_fields WHERE program = ? ORDER BY role ASC, sort ASC, id ASC`
  ).bind(program).all<FormFieldRow>();

  const grouped: Record<string, FormFieldRow[]> = { attendee: [], server: [] };
  for (const row of results) {
    if (row.role === 'attendee' || row.role === 'server') {
      grouped[row.role].push(row);
    }
  }
  return c.json({ ok: true, fields: grouped });
});

// POST /api/admin/form-fields — create a field
contentAdminRouter.post('/form-fields', async (c) => {
  const program = c.get('program');
  let body: {
    role?: string;
    name?: string;
    label?: string;
    type?: string;
    options?: unknown;
    required?: unknown;
    help?: string | null;
    sort?: unknown;
  };
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: 'invalid JSON' }, 400); }

  if (body.role !== 'attendee' && body.role !== 'server') {
    return c.json({ ok: false, error: 'role must be attendee or server' }, 400);
  }
  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    return c.json({ ok: false, error: 'name is required' }, 400);
  }
  if (!body.label || typeof body.label !== 'string' || !body.label.trim()) {
    return c.json({ ok: false, error: 'label is required' }, 400);
  }
  if (!body.type || !VALID_TYPES.has(body.type as string)) {
    return c.json({ ok: false, error: 'type must be one of text|textarea|dropdown|checkbox|radio|email|phone' }, 400);
  }

  const optionsStr = body.options != null ? JSON.stringify(body.options) : null;
  const required = body.required === false || body.required === 0 ? 0 : 1;
  const help = typeof body.help === 'string' ? body.help : null;
  const sort = typeof body.sort === 'number' ? body.sort : 0;
  const now = nowIso();

  const { meta } = await c.env.DB.prepare(
    `INSERT INTO form_fields (program, role, name, label, type, options, required, help, sort, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).bind(program, body.role, body.name.trim(), body.label.trim(), body.type, optionsStr, required, help, sort, now, now).run();

  const row = await c.env.DB.prepare(`SELECT * FROM form_fields WHERE id = ?`)
    .bind(meta.last_row_id).first<FormFieldRow>();
  return c.json({ ok: true, field: row }, 201);
});

// PATCH /api/admin/form-fields/:id
contentAdminRouter.patch('/form-fields/:id', async (c) => {
  const program = c.get('program');
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return c.json({ ok: false, error: 'invalid id' }, 400);

  const existing = await c.env.DB.prepare(
    `SELECT id FROM form_fields WHERE id = ? AND program = ?`
  ).bind(id, program).first<{ id: number }>();
  if (!existing) return c.json({ ok: false, error: 'not found' }, 404);

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: 'invalid JSON' }, 400); }

  const sets: string[] = [];
  const vals: unknown[] = [];

  if ('name' in body) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return c.json({ ok: false, error: 'name must be a non-empty string' }, 400);
    }
    sets.push('name = ?'); vals.push(body.name.trim());
  }
  if ('label' in body) {
    if (typeof body.label !== 'string' || !body.label.trim()) {
      return c.json({ ok: false, error: 'label must be a non-empty string' }, 400);
    }
    sets.push('label = ?'); vals.push(body.label.trim());
  }
  if ('type' in body) {
    if (!VALID_TYPES.has(body.type as string)) {
      return c.json({ ok: false, error: 'invalid type' }, 400);
    }
    sets.push('type = ?'); vals.push(body.type);
  }
  if ('options' in body) {
    sets.push('options = ?'); vals.push(body.options != null ? JSON.stringify(body.options) : null);
  }
  if ('required' in body) {
    sets.push('required = ?'); vals.push(body.required === false || body.required === 0 ? 0 : 1);
  }
  if ('help' in body) {
    sets.push('help = ?'); vals.push(typeof body.help === 'string' ? body.help : null);
  }
  if ('sort' in body) {
    sets.push('sort = ?'); vals.push(Number(body.sort) || 0);
  }
  if ('active' in body) {
    sets.push('active = ?'); vals.push(body.active ? 1 : 0);
  }

  if (sets.length === 0) return c.json({ ok: false, error: 'no fields to update' }, 400);

  sets.push('updated_at = ?'); vals.push(nowIso());
  vals.push(id); vals.push(program);

  await c.env.DB.prepare(
    `UPDATE form_fields SET ${sets.join(', ')} WHERE id = ? AND program = ?`
  ).bind(...vals).run();

  const updated = await c.env.DB.prepare(`SELECT * FROM form_fields WHERE id = ?`)
    .bind(id).first<FormFieldRow>();
  return c.json({ ok: true, field: updated });
});

// DELETE /api/admin/form-fields/:id
contentAdminRouter.delete('/form-fields/:id', async (c) => {
  const program = c.get('program');
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return c.json({ ok: false, error: 'invalid id' }, 400);

  const existing = await c.env.DB.prepare(
    `SELECT id FROM form_fields WHERE id = ? AND program = ?`
  ).bind(id, program).first<{ id: number }>();
  if (!existing) return c.json({ ok: false, error: 'not found' }, 404);

  await c.env.DB.prepare(`DELETE FROM form_fields WHERE id = ? AND program = ?`)
    .bind(id, program).run();
  return c.json({ ok: true });
});

// POST /api/admin/form-fields/reorder  {role, ordered_ids:[]}
contentAdminRouter.post('/form-fields/reorder', async (c) => {
  const program = c.get('program');
  let body: { role?: string; ordered_ids?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: 'invalid JSON' }, 400); }

  if (body.role !== 'attendee' && body.role !== 'server') {
    return c.json({ ok: false, error: 'role must be attendee or server' }, 400);
  }
  if (!Array.isArray(body.ordered_ids) || body.ordered_ids.length === 0) {
    return c.json({ ok: false, error: 'ordered_ids must be a non-empty array' }, 400);
  }

  const stmts = (body.ordered_ids as unknown[]).map((rawId, idx) => {
    const id = Number(rawId);
    return c.env.DB.prepare(
      `UPDATE form_fields SET sort = ?, updated_at = ? WHERE id = ? AND program = ? AND role = ?`
    ).bind(idx + 1, nowIso(), id, program, body.role);
  });

  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — page-content
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/admin/page-content
contentAdminRouter.get('/page-content', async (c) => {
  const program = c.get('program');
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM page_content WHERE program = ? ORDER BY sort ASC, id ASC`
  ).bind(program).all<PageContentRow>();
  return c.json({ ok: true, blocks: results });
});

// POST /api/admin/page-content  {key, label, value, sort?}
contentAdminRouter.post('/page-content', async (c) => {
  const program = c.get('program');
  let body: { key?: string; label?: string; value?: string; sort?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: 'invalid JSON' }, 400); }

  if (!body.key || typeof body.key !== 'string' || !body.key.trim()) {
    return c.json({ ok: false, error: 'key is required' }, 400);
  }
  if (!body.label || typeof body.label !== 'string' || !body.label.trim()) {
    return c.json({ ok: false, error: 'label is required' }, 400);
  }

  const value = typeof body.value === 'string' ? body.value : '';
  const sort = typeof body.sort === 'number' ? body.sort : 0;
  const now = nowIso();

  try {
    const { meta } = await c.env.DB.prepare(
      `INSERT INTO page_content (program, key, label, value, sort, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(program, body.key.trim(), body.label.trim(), value, sort, now).run();

    const row = await c.env.DB.prepare(`SELECT * FROM page_content WHERE id = ?`)
      .bind(meta.last_row_id).first<PageContentRow>();
    return c.json({ ok: true, block: row }, 201);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE')) {
      return c.json({ ok: false, error: `A block with key "${body.key}" already exists for this program` }, 409);
    }
    throw err;
  }
});

// PATCH /api/admin/page-content/:id  {value?, label?}
contentAdminRouter.patch('/page-content/:id', async (c) => {
  const program = c.get('program');
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return c.json({ ok: false, error: 'invalid id' }, 400);

  const existing = await c.env.DB.prepare(
    `SELECT id FROM page_content WHERE id = ? AND program = ?`
  ).bind(id, program).first<{ id: number }>();
  if (!existing) return c.json({ ok: false, error: 'not found' }, 404);

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: 'invalid JSON' }, 400); }

  const sets: string[] = [];
  const vals: unknown[] = [];

  if ('value' in body) { sets.push('value = ?'); vals.push(typeof body.value === 'string' ? body.value : ''); }
  if ('label' in body) {
    if (typeof body.label !== 'string' || !body.label.trim()) {
      return c.json({ ok: false, error: 'label must be a non-empty string' }, 400);
    }
    sets.push('label = ?'); vals.push(body.label.trim());
  }
  if ('sort' in body) { sets.push('sort = ?'); vals.push(Number(body.sort) || 0); }

  if (sets.length === 0) return c.json({ ok: false, error: 'no fields to update' }, 400);

  sets.push('updated_at = ?'); vals.push(nowIso());
  vals.push(id); vals.push(program);

  await c.env.DB.prepare(
    `UPDATE page_content SET ${sets.join(', ')} WHERE id = ? AND program = ?`
  ).bind(...vals).run();

  const updated = await c.env.DB.prepare(`SELECT * FROM page_content WHERE id = ?`)
    .bind(id).first<PageContentRow>();
  return c.json({ ok: true, block: updated });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC — unauthenticated, CORS-served
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/public/form-config?program=&role=
contentPublicRouter.get('/form-config', async (c) => {
  const rawProgram = c.req.query('program');
  const program = rawProgram === 'womens' ? 'women' : rawProgram;
  if (program !== 'mens' && program !== 'women') {
    return c.json({ ok: false, error: 'program must be mens or women' }, 400);
  }

  const role = c.req.query('role');
  if (role !== 'attendee' && role !== 'server') {
    return c.json({ ok: false, error: 'role must be attendee or server' }, 400);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT id, name, label, type, options, required, help, sort
     FROM form_fields
     WHERE program = ? AND role = ? AND active = 1
     ORDER BY sort ASC, id ASC`
  ).bind(program, role).all<{
    id: number; name: string; label: string; type: string;
    options: string | null; required: number; help: string | null; sort: number;
  }>();

  return c.json({ ok: true, fields: results });
});

// GET /api/public/page-content?program=
contentPublicRouter.get('/page-content', async (c) => {
  const rawProgram = c.req.query('program');
  const program = rawProgram === 'womens' ? 'women' : rawProgram;
  if (program !== 'mens' && program !== 'women') {
    return c.json({ ok: false, error: 'program must be mens or women' }, 400);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT key, value FROM page_content WHERE program = ? ORDER BY sort ASC, id ASC`
  ).bind(program).all<{ key: string; value: string }>();

  // Return as {key: value} map for easy injection
  const content: Record<string, string> = {};
  for (const row of results) {
    content[row.key] = row.value;
  }

  return c.json({ ok: true, content });
});
