// Team management + invitations. The parts that matter here are the refusals.

import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { app } from '../app';
import { applyMigrations, seedAdmin, markEnrolled } from './setup';
import type { Env } from '../app';
import { issueTrustedDevice, sha256Hex } from '../security';

const testEnv = env as unknown as Env;
const db = () => (env as unknown as { DB: D1Database }).DB;

/** Signs in, bypassing the second factor with a trusted device. */
async function sessionFor(id: number, email: string, password = 'TestPass1!'): Promise<string> {
  await markEnrolled(id);
  const t = await issueTrustedDevice(
    testEnv, id, new Request('http://localhost/', { headers: { 'CF-Connecting-IP': '127.0.0.1' } })
  );
  const res = await app.fetch(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `nwks_trusted=${t}` },
      body: JSON.stringify({ email, password }),
    }),
    testEnv
  );
  const token = (res.headers.get('Set-Cookie') ?? '').match(/nwks_session=([^;]+)/)?.[1] ?? '';
  return `nwks_session=${token}`;
}

function req(method: string, path: string, cookie?: string, body?: unknown) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

let superId: number, superCookie: string;
let plainId: number, plainCookie: string;

beforeEach(async () => {
  await applyMigrations(env as unknown as { DB: D1Database });

  const sup = await seedAdmin({ email: 'boss@nwks.test' });
  superId = sup.id;
  await db().prepare(`UPDATE admin_users SET role='super_admin' WHERE id = ?`).bind(superId).run();
  superCookie = await sessionFor(superId, 'boss@nwks.test');

  const plain = await seedAdmin({ email: 'helper@nwks.test' });
  plainId = plain.id;
  plainCookie = await sessionFor(plainId, 'helper@nwks.test');
});

describe('permission gate', () => {
  it.each([
    ['GET', '/api/admin/team'],
    ['POST', '/api/admin/team/invite'],
    ['POST', '/api/admin/team/invite/1/revoke'],
    ['DELETE', '/api/admin/team/1'],
  ])('403s a plain admin on %s %s', async (method, path) => {
    // Hiding the tab is presentation. This is the actual control.
    const res = await app.fetch(req(method, path, plainCookie, method === 'GET' ? undefined : {}), testEnv);
    expect(res.status).toBe(403);
  });

  it('401s with no session at all', async () => {
    expect((await app.fetch(req('GET', '/api/admin/team'), testEnv)).status).toBe(401);
  });

  it('lets a super admin through', async () => {
    const res = await app.fetch(req('GET', '/api/admin/team', superCookie), testEnv);
    expect(res.status).toBe(200);
    const body = await res.json<{ admins: unknown[]; invites: unknown[] }>();
    expect(body.admins).toHaveLength(2);
    expect(body.invites).toHaveLength(0);
  });

  it('records the refusal, so probing is visible', async () => {
    await app.fetch(req('GET', '/api/admin/team', plainCookie), testEnv);
    const row = await db()
      .prepare(`SELECT admin_email FROM audit_log WHERE action='team.forbidden'`)
      .first<{ admin_email: string }>();
    expect(row?.admin_email).toBe('helper@nwks.test');
  });
});

describe('inviting', () => {
  it('creates a pending invite and stores only a hash of the token', async () => {
    const res = await app.fetch(
      req('POST', '/api/admin/team/invite', superCookie, { email: 'New.Person@Example.com' }), testEnv
    );
    expect(res.status).toBe(201);
    const body = await res.json<{ emailed: boolean; accept_url?: string }>();

    const row = await db()
      .prepare(`SELECT email, role, token_hash FROM admin_invites`)
      .first<{ email: string; role: string; token_hash: string }>();
    expect(row?.email).toBe('new.person@example.com'); // normalised
    expect(row?.role).toBe('admin');

    // Email is undeliverable in tests, so the link comes back to be passed on
    // by hand rather than an invite existing that nobody ever receives.
    expect(body.emailed).toBe(false);
    const token = body.accept_url!.split('/').pop()!;
    expect(row!.token_hash).toBe(await sha256Hex(token));
    expect(row!.token_hash).not.toContain(token);
  });

  it('refuses a second pending invite for the same address', async () => {
    await app.fetch(req('POST', '/api/admin/team/invite', superCookie, { email: 'dup@example.com' }), testEnv);
    const res = await app.fetch(
      req('POST', '/api/admin/team/invite', superCookie, { email: 'dup@example.com' }), testEnv
    );
    expect(res.status).toBe(409);
  });

  it('refuses inviting someone who already has an account', async () => {
    const res = await app.fetch(
      req('POST', '/api/admin/team/invite', superCookie, { email: 'helper@nwks.test' }), testEnv
    );
    expect(res.status).toBe(409);
  });

  it('rejects a malformed address', async () => {
    const res = await app.fetch(
      req('POST', '/api/admin/team/invite', superCookie, { email: 'not-an-email' }), testEnv
    );
    expect(res.status).toBe(400);
  });
});

describe('accepting', () => {
  async function invite(email = 'new@example.com', role?: string): Promise<string> {
    const res = await app.fetch(
      req('POST', '/api/admin/team/invite', superCookie, { email, role }), testEnv
    );
    const body = await res.json<{ accept_url: string }>();
    return body.accept_url.split('/').pop()!;
  }

  it('shows who invited them before they accept', async () => {
    const token = await invite();
    const res = await app.fetch(req('GET', `/api/invite/${token}`), testEnv);
    const body = await res.json<{ email: string; invited_by: string }>();
    expect(body).toMatchObject({ email: 'new@example.com', invited_by: 'boss@nwks.test' });
  });

  it('creates the account and lets them sign in', async () => {
    const token = await invite();
    const res = await app.fetch(
      req('POST', `/api/invite/${token}/accept`, undefined, { password: 'a-long-enough-password' }), testEnv
    );
    expect(res.status).toBe(200);

    const row = await db()
      .prepare(`SELECT role, two_factor_required FROM admin_users WHERE email = 'new@example.com'`)
      .first<{ role: string; two_factor_required: number }>();
    expect(row?.role).toBe('admin');

    // Signing in routes them into first-run 2FA setup, like everyone else —
    // accepting an invite must not be a second, softer way in.
    const login = await app.fetch(
      req('POST', '/api/auth/login', undefined, { email: 'new@example.com', password: 'a-long-enough-password' }),
      testEnv
    );
    const body = await login.json<{ setup_required?: boolean }>();
    expect(body.setup_required).toBe(true);
    expect(login.headers.get('Set-Cookie') ?? '').not.toContain('nwks_session=');
  });

  it('is single use', async () => {
    const token = await invite();
    const first = await app.fetch(
      req('POST', `/api/invite/${token}/accept`, undefined, { password: 'a-long-enough-password' }), testEnv
    );
    expect(first.status).toBe(200);
    const second = await app.fetch(
      req('POST', `/api/invite/${token}/accept`, undefined, { password: 'another-long-password' }), testEnv
    );
    expect(second.status).toBe(409);

    const { results } = await db()
      .prepare(`SELECT id FROM admin_users WHERE email = 'new@example.com'`).all();
    expect(results).toHaveLength(1);
  });

  it('rejects an expired invite', async () => {
    const token = await invite();
    await db().prepare(`UPDATE admin_invites SET expires_at = ?`)
      .bind(new Date(Date.now() - 1000).toISOString()).run();
    const res = await app.fetch(
      req('POST', `/api/invite/${token}/accept`, undefined, { password: 'a-long-enough-password' }), testEnv
    );
    expect(res.status).toBe(404);
  });

  it('rejects a revoked invite', async () => {
    const token = await invite();
    const row = await db().prepare(`SELECT id FROM admin_invites`).first<{ id: number }>();
    await app.fetch(req('POST', `/api/admin/team/invite/${row!.id}/revoke`, superCookie, {}), testEnv);

    const res = await app.fetch(
      req('POST', `/api/invite/${token}/accept`, undefined, { password: 'a-long-enough-password' }), testEnv
    );
    expect(res.status).toBe(404);
  });

  it('rejects an unknown token and a short password', async () => {
    expect((await app.fetch(
      req('POST', '/api/invite/not-a-real-token/accept', undefined, { password: 'a-long-enough-password' }), testEnv
    )).status).toBe(404);

    const token = await invite('short@example.com');
    expect((await app.fetch(
      req('POST', `/api/invite/${token}/accept`, undefined, { password: 'short' }), testEnv
    )).status).toBe(400);
  });
});

describe('removing people', () => {
  it('removes a plain admin and their credentials', async () => {
    const res = await app.fetch(req('DELETE', `/api/admin/team/${plainId}`, superCookie), testEnv);
    expect(res.status).toBe(200);

    const gone = await db().prepare(`SELECT id FROM admin_users WHERE id = ?`).bind(plainId).first();
    expect(gone).toBeNull();
    const devices = await db()
      .prepare(`SELECT id FROM trusted_devices WHERE admin_user_id = ?`).bind(plainId).first();
    expect(devices).toBeNull();
  });

  it('keeps the audit trail after the account is gone', async () => {
    await app.fetch(req('DELETE', `/api/admin/team/${plainId}`, superCookie), testEnv);
    const row = await db()
      .prepare(`SELECT admin_email, detail FROM audit_log WHERE action='team.removed'`)
      .first<{ admin_email: string; detail: string }>();
    expect(row?.admin_email).toBe('boss@nwks.test');
    expect(JSON.parse(row!.detail)).toMatchObject({ email: 'helper@nwks.test' });
  });

  it('refuses to remove yourself', async () => {
    const res = await app.fetch(req('DELETE', `/api/admin/team/${superId}`, superCookie), testEnv);
    expect(res.status).toBe(400);
  });

  it('refuses to remove the LAST super admin', async () => {
    // Otherwise nobody can ever grant access again.
    const other = await seedAdmin({ email: 'second@nwks.test' });
    await db().prepare(`UPDATE admin_users SET role='super_admin' WHERE id = ?`).bind(other.id).run();

    // Two supers: removing one is fine.
    const ok = await app.fetch(req('DELETE', `/api/admin/team/${other.id}`, superCookie), testEnv);
    expect(ok.status).toBe(200);

    // Now only `superId` remains, and it cannot be removed by anyone.
    const promoted = await seedAdmin({ email: 'third@nwks.test' });
    await db().prepare(`UPDATE admin_users SET role='super_admin' WHERE id = ?`).bind(promoted.id).run();
    const cookie = await sessionFor(promoted.id, 'third@nwks.test');
    await app.fetch(req('DELETE', `/api/admin/team/${superId}`, cookie), testEnv);

    await db().prepare(`UPDATE admin_users SET role='admin' WHERE id = ?`).bind(superId).run();
    const last = await app.fetch(req('DELETE', `/api/admin/team/${promoted.id}`, cookie), testEnv);
    expect(last.status).toBe(400);
  });
});
