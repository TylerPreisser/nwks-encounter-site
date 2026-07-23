// functions/_api/__tests__/templates.routes.test.ts
// TDD integration tests for admin Templates API (/api/admin/templates)

import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { app } from '../app';
import { applyMigrations, seedAdmin } from './setup';
import type { Env } from '../app';

const testEnv = env as unknown as Env;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAuthCookie(opts: { email?: string; password?: string } = {}): Promise<string> {
  const email = opts.email ?? 'admin@nwksencounter.com';
  const password = opts.password ?? 'TestPass1!';
  const loginRes = await app.fetch(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
    testEnv
  );
  const setCookie = loginRes.headers.get('Set-Cookie') ?? '';
  const token = setCookie.match(/nwks_session=([^;]+)/)?.[1] ?? '';
  return `nwks_session=${token}`;
}

function makeReq(
  method: string,
  path: string,
  cookie: string,
  program: string,
  body?: unknown
): Request {
  const url = `http://localhost${path}?program=${program}`;
  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Admin Templates API', () => {
  let cookie: string;

  beforeEach(async () => {
    await applyMigrations(env as any);
    await seedAdmin();
    cookie = await getAuthCookie();
  });

  // ── Auth guard ─────────────────────────────────────────────────────────────

  it('returns 401 without a valid session', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/admin/templates?program=mens'),
      testEnv
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 without program param', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/admin/templates', {
        headers: { Cookie: cookie },
      }),
      testEnv
    );
    expect(res.status).toBe(400);
  });

  // ── GET list ───────────────────────────────────────────────────────────────

  it('GET /api/admin/templates returns mens + shared templates (not women-only)', async () => {
    const res = await app.fetch(makeReq('GET', '/api/admin/templates', cookie, 'mens'), testEnv);
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; templates: Array<{ program: string }> }>();
    expect(body.ok).toBe(true);
    const programs = body.templates.map((t) => t.program);
    // All returned rows must be 'mens' or 'shared'
    expect(programs.every((p) => p === 'mens' || p === 'shared')).toBe(true);
    // Must NOT contain women-only rows
    expect(programs).not.toContain('women');
    // Should contain at least the mens + 3 shared rows (2 mens + 3 shared = 5)
    expect(body.templates.length).toBeGreaterThanOrEqual(5);
  });

  it('GET /api/admin/templates for women returns women + shared templates (not mens-only)', async () => {
    const res = await app.fetch(makeReq('GET', '/api/admin/templates', cookie, 'women'), testEnv);
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; templates: Array<{ program: string }> }>();
    expect(body.ok).toBe(true);
    const programs = body.templates.map((t) => t.program);
    expect(programs.every((p) => p === 'women' || p === 'shared')).toBe(true);
    expect(programs).not.toContain('mens');
  });

  it('GET /api/admin/templates response includes expected fields on each template', async () => {
    const res = await app.fetch(makeReq('GET', '/api/admin/templates', cookie, 'mens'), testEnv);
    const body = await res.json<{ ok: boolean; templates: Array<Record<string, unknown>> }>();
    const first = body.templates[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('program');
    expect(first).toHaveProperty('key');
    expect(first).toHaveProperty('name');
    expect(first).toHaveProperty('subject');
    expect(first).toHaveProperty('body_html');
    expect(first).toHaveProperty('body_text');
    expect(first).toHaveProperty('variables');
    expect(first).toHaveProperty('updated_at');
  });

  // ── GET by id ──────────────────────────────────────────────────────────────

  it('GET /api/admin/templates/:id returns the template for the correct program', async () => {
    const row = await testEnv.DB.prepare(
      `SELECT id FROM email_templates WHERE program='mens' AND key='welcome'`
    ).first<{ id: number }>();
    const id = row!.id;

    const res = await app.fetch(makeReq('GET', `/api/admin/templates/${id}`, cookie, 'mens'), testEnv);
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; template: { id: number; program: string; key: string } }>();
    expect(body.ok).toBe(true);
    expect(body.template.id).toBe(id);
    expect(body.template.program).toBe('mens');
    expect(body.template.key).toBe('welcome');
  });

  it('GET /api/admin/templates/:id returns shared template when requested by any program', async () => {
    const row = await testEnv.DB.prepare(
      `SELECT id FROM email_templates WHERE program='shared' AND key='reminder'`
    ).first<{ id: number }>();
    const id = row!.id;

    const res = await app.fetch(makeReq('GET', `/api/admin/templates/${id}`, cookie, 'mens'), testEnv);
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; template: { program: string } }>();
    expect(body.ok).toBe(true);
    expect(body.template.program).toBe('shared');
  });

  it('GET /api/admin/templates/:id returns 404 for unknown id', async () => {
    const res = await app.fetch(makeReq('GET', '/api/admin/templates/99999', cookie, 'mens'), testEnv);
    expect(res.status).toBe(404);
  });

  it("GET /api/admin/templates/:id returns 403 when accessing another program's template", async () => {
    // A mens template should not be accessible when requesting with program=women
    const row = await testEnv.DB.prepare(
      `SELECT id FROM email_templates WHERE program='mens' AND key='welcome'`
    ).first<{ id: number }>();
    const id = row!.id;

    const res = await app.fetch(makeReq('GET', `/api/admin/templates/${id}`, cookie, 'women'), testEnv);
    expect(res.status).toBe(403);
  });

  // ── PATCH ──────────────────────────────────────────────────────────────────

  it('PATCH /api/admin/templates/:id updates subject and bumps updated_at', async () => {
    const row = await testEnv.DB.prepare(
      `SELECT id, updated_at FROM email_templates WHERE program='mens' AND key='welcome'`
    ).first<{ id: number; updated_at: string }>();
    const id = row!.id;
    const originalUpdatedAt = row!.updated_at;

    const res = await app.fetch(
      makeReq('PATCH', `/api/admin/templates/${id}`, cookie, 'mens', {
        subject: 'Updated Subject Line',
      }),
      testEnv
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; template: { subject: string; updated_at: string } }>();
    expect(body.ok).toBe(true);
    expect(body.template.subject).toBe('Updated Subject Line');
    // updated_at must have changed
    expect(body.template.updated_at).not.toBe(originalUpdatedAt);
  });

  it('PATCH /api/admin/templates/:id persists changes (reads back from DB)', async () => {
    const row = await testEnv.DB.prepare(
      `SELECT id FROM email_templates WHERE program='mens' AND key='welcome'`
    ).first<{ id: number }>();
    const id = row!.id;

    await app.fetch(
      makeReq('PATCH', `/api/admin/templates/${id}`, cookie, 'mens', {
        name: 'Persisted Name',
        body_text: 'Persisted body text',
      }),
      testEnv
    );

    // Read directly from DB to confirm persistence
    const after = await testEnv.DB.prepare(
      `SELECT name, body_text FROM email_templates WHERE id = ?`
    ).bind(id).first<{ name: string; body_text: string }>();
    expect(after!.name).toBe('Persisted Name');
    expect(after!.body_text).toBe('Persisted body text');
  });

  it('PATCH /api/admin/templates/:id updates variables as JSON array', async () => {
    const row = await testEnv.DB.prepare(
      `SELECT id FROM email_templates WHERE program='mens' AND key='welcome'`
    ).first<{ id: number }>();
    const id = row!.id;

    const res = await app.fetch(
      makeReq('PATCH', `/api/admin/templates/${id}`, cookie, 'mens', {
        variables: ['first_name', 'event_title', 'custom_var'],
      }),
      testEnv
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; template: { variables: string } }>();
    // variables returned as stored string; verify it round-trips
    const parsed = JSON.parse(body.template.variables as string);
    expect(parsed).toContain('custom_var');
  });

  it('PATCH /api/admin/templates/:id works on a shared template', async () => {
    const row = await testEnv.DB.prepare(
      `SELECT id FROM email_templates WHERE program='shared' AND key='reminder'`
    ).first<{ id: number }>();
    const id = row!.id;

    const res = await app.fetch(
      makeReq('PATCH', `/api/admin/templates/${id}`, cookie, 'mens', {
        subject: 'Shared Updated Subject',
      }),
      testEnv
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; template: { subject: string } }>();
    expect(body.template.subject).toBe('Shared Updated Subject');
  });

  it('PATCH /api/admin/templates/:id returns 400 with no updatable fields', async () => {
    const row = await testEnv.DB.prepare(
      `SELECT id FROM email_templates WHERE program='mens' AND key='welcome'`
    ).first<{ id: number }>();
    const id = row!.id;

    const res = await app.fetch(
      makeReq('PATCH', `/api/admin/templates/${id}`, cookie, 'mens', {}),
      testEnv
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
  });

  it('PATCH /api/admin/templates/:id returns 404 for unknown id', async () => {
    const res = await app.fetch(
      makeReq('PATCH', '/api/admin/templates/99999', cookie, 'mens', { subject: 'x' }),
      testEnv
    );
    expect(res.status).toBe(404);
  });

  it("PATCH /api/admin/templates/:id returns 403 for another program's template", async () => {
    const row = await testEnv.DB.prepare(
      `SELECT id FROM email_templates WHERE program='womens' AND key='welcome'`
    ).first<{ id: number }>();
    // If somehow women row exists with 'womens' (shouldn't), skip; else use a direct insert
    // Use a women template that exists (program='women')
    const wRow = await testEnv.DB.prepare(
      `SELECT id FROM email_templates WHERE program='women' AND key='welcome'`
    ).first<{ id: number }>();
    const id = wRow!.id;

    const res = await app.fetch(
      makeReq('PATCH', `/api/admin/templates/${id}`, cookie, 'mens', { subject: 'hack' }),
      testEnv
    );
    expect(res.status).toBe(403);
  });
});
