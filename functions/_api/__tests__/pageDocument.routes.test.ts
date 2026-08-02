// functions/_api/__tests__/pageDocument.routes.test.ts
// Tests for the page-document API (whole public page as one editable JSON doc).

import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { app } from '../app';
import { applyMigrations, seedAdmin } from './setup';
import type { Env } from '../app';

const testEnv = env as unknown as Env;

async function getAuthCookie(): Promise<string> {
  let _trusted = '';
  // Seeded admins are treated as past first-run setup: a password alone no
  // longer yields a session, and these tests only need "an authenticated admin".
  {
    const { markEnrolled } = await import('./setup');
    const { issueTrustedDevice } = await import('../security');
    const _db = (env as unknown as { DB: D1Database }).DB;
    const _rows = await _db.prepare(`SELECT id FROM admin_users`).all<{ id: number }>();
    for (const _r of _rows.results) await markEnrolled(_r.id);
    const _first = _rows.results[0];
    if (_first) {
      const _t = await issueTrustedDevice(
        env as never, _first.id,
        new Request('http://localhost/', { headers: { 'CF-Connecting-IP': '127.0.0.1' } })
      );
      _trusted = `nwks_trusted=${_t}`;
    }
  }
  const loginRes = await app.fetch(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(_trusted ? { Cookie: _trusted } : {}) },
      body: JSON.stringify({ email: 'admin@nwksencounter.com', password: 'TestPass1!' }),
    }),
    testEnv
  );
  const setCookie = loginRes.headers.get('Set-Cookie') ?? '';
  const token = setCookie.match(/nwks_session=([^;]+)/)?.[1] ?? '';
  return `nwks_session=${token}`;
}

function req(method: string, path: string, cookie: string, program: string, body?: unknown): Request {
  return new Request(`http://localhost${path}?program=${program}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('Page document API', () => {
  let cookie: string;
  beforeEach(async () => {
    await applyMigrations(env as any);
    await seedAdmin();
    cookie = await getAuthCookie();
  });

  it('GET /api/admin/page-document returns the seeded men\'s doc with the full shape', async () => {
    const res = await app.fetch(req('GET', '/api/admin/page-document', cookie, 'mens'), testEnv);
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; doc: any }>();
    expect(body.ok).toBe(true);
    expect(body.doc).toBeTruthy();
    expect(body.doc.eventName).toContain('Men');
    expect(Array.isArray(body.doc.sections)).toBe(true);
    expect(Array.isArray(body.doc.bring)).toBe(true);
    expect(body.doc.bring.length).toBeGreaterThan(0);
    expect(Array.isArray(body.doc.contacts)).toBe(true);
  });

  it('requires auth', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/admin/page-document?program=mens'),
      testEnv
    );
    expect(res.status).toBe(401);
  });

  it('PUT /api/admin/page-document publishes and persists (read back)', async () => {
    const doc = {
      eventName: 'NWKS Men’s Encounter',
      dates: 'August 6 - 8, 2026',
      tagline: 'Edited tagline',
      sections: [{ id: 'what-is', title: 'What is it?', blocks: ['A new paragraph.'] }],
      cost: '$125',
      bring: ['Sleeping bag', 'A new item'],
      contacts: [{ name: 'Someone', phone: '785-000-0000' }],
      register: [{ label: 'Register as an Attendee', href: 'https://example.com' }],
      verse: 'Galatians 5:1',
    };
    const res = await app.fetch(req('PUT', '/api/admin/page-document', cookie, 'mens', { doc }), testEnv);
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; updated_at: string }>();
    expect(body.ok).toBe(true);
    expect(body.updated_at).toBeTruthy();

    // Read back through the admin GET
    const back = await app.fetch(req('GET', '/api/admin/page-document', cookie, 'mens'), testEnv);
    const backBody = await back.json<{ doc: any }>();
    expect(backBody.doc.tagline).toBe('Edited tagline');
    expect(backBody.doc.bring).toContain('A new item');
  });

  it('PUT accepts the doc object directly (not wrapped)', async () => {
    const doc = { eventName: 'X', bring: ['a'], sections: [] };
    const res = await app.fetch(req('PUT', '/api/admin/page-document', cookie, 'women', doc), testEnv);
    expect(res.status).toBe(200);
    const back = await app.fetch(req('GET', '/api/admin/page-document', cookie, 'women'), testEnv);
    const backBody = await back.json<{ doc: any }>();
    expect(backBody.doc.eventName).toBe('X');
  });

  it('PUT rejects a non-object doc', async () => {
    const res = await app.fetch(req('PUT', '/api/admin/page-document', cookie, 'mens', { doc: 'nope' }), testEnv);
    expect(res.status).toBe(400);
  });

  it('GET /api/public/page-document returns the doc for door names (men/women)', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/public/page-document?program=men'),
      testEnv
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; doc: any }>();
    expect(body.ok).toBe(true);
    expect(body.doc.eventName).toContain('Men');
  });

  it('GET /api/public/page-document rejects an unknown program', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/public/page-document?program=nope'),
      testEnv
    );
    expect(res.status).toBe(400);
  });
});
