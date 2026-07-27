// functions/_api/routes/templates.ts — email template list / get / create / patch / delete

import { Hono } from 'hono';
import type { Env } from '../app';
import type { AppVariables } from '../auth';
import { requireAuth, requireProgram } from '../auth';
import { nowIso } from '../db';

export const templatesRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

templatesRouter.use('*', requireAuth(), requireProgram());

// GET /api/admin/templates?program=
// Returns all templates for the active program PLUS shared templates.
templatesRouter.get('/', async (c) => {
  const program = c.get('program') as string;
  const rows = await c.env.DB.prepare(
    `SELECT id, program, key, name, subject, body_html, body_text, variables, updated_at
     FROM email_templates
     WHERE program = ? OR program = 'shared'
     ORDER BY key, program`
  ).bind(program).all();
  return c.json({ ok: true, templates: rows.results });
});

// GET /api/admin/templates/:id
templatesRouter.get('/:id', async (c) => {
  const program = c.get('program') as string;
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ ok: false, error: 'invalid id' }, 400);
  }
  const row = await c.env.DB.prepare(
    `SELECT id, program, key, name, subject, body_html, body_text, variables, updated_at
     FROM email_templates WHERE id = ?`
  ).bind(id).first<{ id: number; program: string; [k: string]: unknown }>();
  if (!row) return c.json({ ok: false, error: 'not found' }, 404);
  if (row.program !== program && row.program !== 'shared') {
    return c.json({ ok: false, error: 'forbidden' }, 403);
  }
  return c.json({ ok: true, template: row });
});

// POST /api/admin/templates
// Create a new template for the active program ("Save as new template").
// Body: { name, subject?, body_html, body_text?, variables?, key? }
// The key is auto-derived from the name (slugified) and made unique per program.
templatesRouter.post('/', async (c) => {
  const program = c.get('program') as string;
  const body = await c.req.json<{
    name?: string;
    subject?: string;
    body_html?: string;
    body_text?: string;
    variables?: string[];
    key?: string;
  }>();

  const name = (body.name ?? '').trim();
  if (!name) return c.json({ ok: false, error: 'name is required' }, 400);
  if (!body.body_html) return c.json({ ok: false, error: 'body_html is required' }, 400);

  // Derive a URL-safe base key from an explicit key or the name.
  const base =
    (body.key ?? name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'template';

  // Ensure uniqueness within (program, key). 'general' is reserved for the
  // built-in starting template, so a new save-as can never overwrite it.
  const existingKeys = await c.env.DB.prepare(
    `SELECT key FROM email_templates WHERE program = ?`
  ).bind(program).all<{ key: string }>();
  const taken = new Set((existingKeys.results ?? []).map(r => r.key));
  taken.add('general');
  let key = base;
  let n = 2;
  while (taken.has(key)) { key = `${base}_${n++}`; }

  const now = nowIso();
  const res = await c.env.DB.prepare(
    `INSERT INTO email_templates
       (program, key, name, subject, body_html, body_text, variables, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    program,
    key,
    name,
    body.subject ?? name,
    body.body_html,
    body.body_text ?? '',
    JSON.stringify(body.variables ?? []),
    now,
  ).run();

  const id = res.meta?.last_row_id;
  const created = await c.env.DB.prepare(
    `SELECT id, program, key, name, subject, body_html, body_text, variables, updated_at
     FROM email_templates WHERE id = ?`
  ).bind(id).first();
  return c.json({ ok: true, template: created }, 201);
});

// DELETE /api/admin/templates/:id
// Removes a saved template. The built-in 'general' template cannot be deleted.
templatesRouter.delete('/:id', async (c) => {
  const program = c.get('program') as string;
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ ok: false, error: 'invalid id' }, 400);
  }
  const existing = await c.env.DB.prepare(
    `SELECT id, program, key FROM email_templates WHERE id = ?`
  ).bind(id).first<{ id: number; program: string; key: string } | null>();
  if (!existing) return c.json({ ok: false, error: 'not found' }, 404);
  if (existing.program !== program && existing.program !== 'shared') {
    return c.json({ ok: false, error: 'forbidden' }, 403);
  }
  if (existing.key === 'general') {
    return c.json({ ok: false, error: 'the general template cannot be deleted' }, 400);
  }
  await c.env.DB.prepare(`DELETE FROM email_templates WHERE id = ?`).bind(id).run();
  return c.json({ ok: true, deleted: id });
});

// PATCH /api/admin/templates/:id
// Editable fields: name, subject, body_html, body_text, variables
templatesRouter.patch('/:id', async (c) => {
  const program = c.get('program') as string;
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ ok: false, error: 'invalid id' }, 400);
  }

  const existing = await c.env.DB.prepare(
    `SELECT id, program FROM email_templates WHERE id = ?`
  ).bind(id).first<{ id: number; program: string } | null>();
  if (!existing) return c.json({ ok: false, error: 'not found' }, 404);
  if (existing.program !== program && existing.program !== 'shared') {
    return c.json({ ok: false, error: 'forbidden' }, 403);
  }

  const body = await c.req.json<{
    name?: string;
    subject?: string;
    body_html?: string;
    body_text?: string;
    variables?: string[];
  }>();

  const fields: string[] = [];
  const values: unknown[] = [];

  if (body.name !== undefined)      { fields.push('name = ?');      values.push(body.name); }
  if (body.subject !== undefined)   { fields.push('subject = ?');   values.push(body.subject); }
  if (body.body_html !== undefined) { fields.push('body_html = ?'); values.push(body.body_html); }
  if (body.body_text !== undefined) { fields.push('body_text = ?'); values.push(body.body_text); }
  if (body.variables !== undefined) { fields.push('variables = ?'); values.push(JSON.stringify(body.variables)); }

  if (fields.length === 0) return c.json({ ok: false, error: 'nothing to update' }, 400);

  fields.push('updated_at = ?');
  values.push(nowIso());
  values.push(id);

  await c.env.DB.prepare(
    `UPDATE email_templates SET ${fields.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  const updated = await c.env.DB.prepare(
    `SELECT id, program, key, name, subject, body_html, body_text, variables, updated_at
     FROM email_templates WHERE id = ?`
  ).bind(id).first();
  return c.json({ ok: true, template: updated });
});
