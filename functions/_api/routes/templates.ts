// functions/_api/routes/templates.ts — email template list / get / patch

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
