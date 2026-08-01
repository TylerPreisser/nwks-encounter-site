// The two-step login flow end to end, and the security settings surface.

import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { app } from '../app';
import { applyMigrations, seedAdmin } from './setup';
import type { Env } from '../app';
import { issueRecoveryCodes, issueTrustedDevice, sha256Hex } from '../security';

const testEnv = env as unknown as Env;
const db = () => (env as unknown as { DB: D1Database }).DB;

const EMAIL = 'admin@nwksencounter.com';
const PASSWORD = 'TestPass1!';

let userId: number;

function post(path: string, body?: unknown, cookies?: string) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '1.2.3.4',
      ...(cookies ? { Cookie: cookies } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function get(path: string, cookies?: string) {
  return new Request(`http://localhost${path}`, {
    headers: { 'CF-Connecting-IP': '1.2.3.4', ...(cookies ? { Cookie: cookies } : {}) },
  });
}

/** All Set-Cookie values joined into a Cookie header. */
function cookiesFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

/** Marks the seeded admin as 2FA-enrolled without needing a real authenticator. */
async function enroll(id: number) {
  await db()
    .prepare(`UPDATE admin_users SET two_factor_required = 1, webauthn_enabled = 1 WHERE id = ?`)
    .bind(id)
    .run();
}

beforeEach(async () => {
  await applyMigrations(env as unknown as { DB: D1Database });
  const seeded = await seedAdmin();
  userId = seeded.id;
});

describe('rollout safety', () => {
  it('a user who has NOT enrolled still logs in with password alone', async () => {
    const res = await app.fetch(post('/api/auth/login', { email: EMAIL, password: PASSWORD }), testEnv);
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; two_factor_required?: boolean }>();
    expect(body.ok).toBe(true);
    expect(body.two_factor_required).toBeUndefined();
    // A session is issued immediately — deploying 2FA cannot lock the team out.
    expect(cookiesFrom(res)).toContain('nwks_session=');
  });

  it('the session cookie is HttpOnly, Secure and SameSite=Strict', async () => {
    const res = await app.fetch(post('/api/auth/login', { email: EMAIL, password: PASSWORD }), testEnv);
    const raw = res.headers.getSetCookie().find((c) => c.startsWith('nwks_session='))!;
    expect(raw).toContain('HttpOnly');
    expect(raw).toContain('Secure');
    expect(raw).toContain('SameSite=Strict');
  });
});

describe('step 1 — password', () => {
  beforeEach(() => enroll(userId));

  it('an enrolled user gets a challenge, NOT a session', async () => {
    const res = await app.fetch(post('/api/auth/login', { email: EMAIL, password: PASSWORD }), testEnv);
    const body = await res.json<{ two_factor_required: boolean; methods: Record<string, boolean> }>();

    expect(body.two_factor_required).toBe(true);
    expect(body.methods).toMatchObject({ passkey: true, email: true, recovery: true, duo: false });
    // The password alone must not produce a session.
    expect(cookiesFrom(res)).not.toContain('nwks_session=');
    expect(cookiesFrom(res)).toContain('nwks_pending=');
  });

  it('a wrong password is refused identically to an unknown email', async () => {
    const bad = await app.fetch(post('/api/auth/login', { email: EMAIL, password: 'wrong' }), testEnv);
    const unknown = await app.fetch(
      post('/api/auth/login', { email: 'nobody@nowhere.test', password: 'wrong' }), testEnv
    );
    expect(bad.status).toBe(unknown.status);
    expect(await bad.text()).toBe(await unknown.text());
  });

  it('locks the account after five wrong passwords', async () => {
    for (let i = 0; i < 5; i++) {
      await app.fetch(post('/api/auth/login', { email: EMAIL, password: 'wrong' }), testEnv);
    }
    const res = await app.fetch(post('/api/auth/login', { email: EMAIL, password: PASSWORD }), testEnv);
    // 423 Locked — and note the CORRECT password no longer works.
    expect(res.status).toBe(423);
  });

  it('writes an audit row for a failed password', async () => {
    await app.fetch(post('/api/auth/login', { email: EMAIL, password: 'wrong' }), testEnv);
    const row = await db()
      .prepare(`SELECT action, ip FROM audit_log ORDER BY id DESC LIMIT 1`)
      .first<{ action: string; ip: string }>();
    expect(row).toMatchObject({ action: 'login.bad_password', ip: '1.2.3.4' });
  });
});

describe('step 2 — emailed code', () => {
  beforeEach(() => enroll(userId));

  async function startLogin(): Promise<string> {
    const res = await app.fetch(post('/api/auth/login', { email: EMAIL, password: PASSWORD }), testEnv);
    return cookiesFrom(res);
  }

  it('sends a code and completes the login', async () => {
    const pending = await startLogin();

    const send = await app.fetch(post('/api/auth/2fa/email/send', {}, pending), testEnv);
    expect(send.status).toBe(200);

    // Read the code the only way anyone can: it isn't stored in plaintext, so
    // the test regenerates the hash of each candidate. Instead we assert the
    // log row exists, then use a known code injected directly.
    const logged = await db()
      .prepare(`SELECT to_email, template_key FROM email_log ORDER BY id DESC LIMIT 1`)
      .first<{ to_email: string; template_key: string }>();
    expect(logged).toMatchObject({ to_email: EMAIL, template_key: 'admin_login_code' });

    // Replace the stored hash with one for a code we know, to drive verification.
    await db()
      .prepare(`UPDATE auth_codes SET code_hash = ? WHERE admin_user_id = ? AND kind='email_otp'`)
      .bind(await sha256Hex('123456'), userId)
      .run();

    const verify = await app.fetch(
      post('/api/auth/2fa/email/verify', { code: '123456' }, pending), testEnv
    );
    expect(verify.status).toBe(200);
    expect(cookiesFrom(verify)).toContain('nwks_session=');
  });

  it('refuses a wrong code and issues no session', async () => {
    const pending = await startLogin();
    await app.fetch(post('/api/auth/2fa/email/send', {}, pending), testEnv);

    const res = await app.fetch(
      post('/api/auth/2fa/email/verify', { code: '000000' }, pending), testEnv
    );
    expect(res.status).toBe(401);
    expect(cookiesFrom(res)).not.toContain('nwks_session=');
  });

  it('refuses without a pending login — the second factor is not a bypass', async () => {
    const res = await app.fetch(post('/api/auth/2fa/email/verify', { code: '123456' }), testEnv);
    expect(res.status).toBe(401);
  });
});

describe('step 2 — recovery codes (no email, no phone)', () => {
  beforeEach(() => enroll(userId));

  it('logs in with a printed recovery code, once', async () => {
    const codes = await issueRecoveryCodes(testEnv, userId);

    const login = await app.fetch(post('/api/auth/login', { email: EMAIL, password: PASSWORD }), testEnv);
    const pending = cookiesFrom(login);

    const first = await app.fetch(
      post('/api/auth/2fa/recovery/verify', { code: codes[0] }, pending), testEnv
    );
    expect(first.status).toBe(200);
    expect(cookiesFrom(first)).toContain('nwks_session=');

    // The same code must not work a second time.
    const login2 = await app.fetch(post('/api/auth/login', { email: EMAIL, password: PASSWORD }), testEnv);
    const replay = await app.fetch(
      post('/api/auth/2fa/recovery/verify', { code: codes[0] }, cookiesFrom(login2)), testEnv
    );
    expect(replay.status).toBe(401);
  });
});

describe('trusted device', () => {
  beforeEach(() => enroll(userId));

  it('skips the second factor for 48 hours', async () => {
    const token = await issueTrustedDevice(
      testEnv, userId, new Request('http://localhost/', { headers: { 'CF-Connecting-IP': '1.2.3.4' } })
    );

    const res = await app.fetch(
      post('/api/auth/login', { email: EMAIL, password: PASSWORD }, `nwks_trusted=${token}`), testEnv
    );
    const body = await res.json<{ ok: boolean; two_factor_required?: boolean }>();
    expect(body.two_factor_required).toBeUndefined();
    expect(cookiesFrom(res)).toContain('nwks_session=');
  });

  it('does NOT skip the password', async () => {
    const token = await issueTrustedDevice(
      testEnv, userId, new Request('http://localhost/', { headers: { 'CF-Connecting-IP': '1.2.3.4' } })
    );
    const res = await app.fetch(
      post('/api/auth/login', { email: EMAIL, password: 'wrong' }, `nwks_trusted=${token}`), testEnv
    );
    expect(res.status).toBe(401);
  });

  it("is ignored for a different user's account", async () => {
    const other = await seedAdmin({ email: 'other@nwks.test', password: PASSWORD });
    await enroll(other.id);
    const token = await issueTrustedDevice(
      testEnv, userId, new Request('http://localhost/', { headers: { 'CF-Connecting-IP': '1.2.3.4' } })
    );

    const res = await app.fetch(
      post('/api/auth/login', { email: 'other@nwks.test', password: PASSWORD }, `nwks_trusted=${token}`),
      testEnv
    );
    const body = await res.json<{ two_factor_required?: boolean }>();
    expect(body.two_factor_required).toBe(true);
  });
});

describe('security settings', () => {
  async function session(): Promise<string> {
    const res = await app.fetch(post('/api/auth/login', { email: EMAIL, password: PASSWORD }), testEnv);
    return cookiesFrom(res);
  }

  it('requires a session', async () => {
    expect((await app.fetch(get('/api/admin/security'), testEnv)).status).toBe(401);
    expect((await app.fetch(get('/api/admin/security/audit'), testEnv)).status).toBe(401);
    expect((await app.fetch(post('/api/admin/security/recovery-codes'), testEnv)).status).toBe(401);
  });

  it('reports enrollment status', async () => {
    const res = await app.fetch(get('/api/admin/security', await session()), testEnv);
    const body = await res.json<Record<string, unknown>>();
    expect(body).toMatchObject({
      ok: true, two_factor_required: false, webauthn_enabled: false,
      duo_available: false, recovery_codes_remaining: 0,
    });
  });

  it('issues ten recovery codes and shows them exactly once', async () => {
    const cookie = await session();
    const res = await app.fetch(post('/api/admin/security/recovery-codes', {}, cookie), testEnv);
    const body = await res.json<{ recovery_codes: string[] }>();
    expect(body.recovery_codes).toHaveLength(10);

    // There is no endpoint that returns them again — only hashes are stored.
    const status = await app.fetch(get('/api/admin/security', cookie), testEnv);
    const statusBody = await status.json<Record<string, unknown>>();
    expect(statusBody.recovery_codes_remaining).toBe(10);
    expect(JSON.stringify(statusBody)).not.toContain(body.recovery_codes[0]);
  });

  it('exposes the audit log', async () => {
    const cookie = await session();
    const res = await app.fetch(get('/api/admin/security/audit', cookie), testEnv);
    const body = await res.json<{ rows: { action: string }[] }>();
    expect(body.rows.some((r) => r.action === 'login.success')).toBe(true);
  });
});

describe('admin-assisted 2FA reset — the last rung', () => {
  async function session(): Promise<string> {
    const res = await app.fetch(post('/api/auth/login', { email: EMAIL, password: PASSWORD }), testEnv);
    return cookiesFrom(res);
  }

  it('clears another admin 2FA and logs BOTH parties', async () => {
    const locked = await seedAdmin({ email: 'locked@nwks.test' });
    await enroll(locked.id);
    await issueRecoveryCodes(testEnv, locked.id);

    const res = await app.fetch(
      post(`/api/admin/security/reset-2fa/${locked.id}`, {}, await session()), testEnv
    );
    expect(res.status).toBe(200);

    const row = await db()
      .prepare(`SELECT two_factor_required, webauthn_enabled FROM admin_users WHERE id = ?`)
      .bind(locked.id)
      .first<{ two_factor_required: number; webauthn_enabled: number }>();
    expect(row).toMatchObject({ two_factor_required: 0, webauthn_enabled: 0 });

    const entry = await db()
      .prepare(`SELECT admin_email, action, target_id, detail FROM audit_log WHERE action='admin.reset_2fa'`)
      .first<Record<string, string>>();
    expect(entry).toMatchObject({ admin_email: EMAIL, target_id: String(locked.id) });
    expect(JSON.parse(entry!.detail)).toMatchObject({ target_email: 'locked@nwks.test' });
  });

  it('refuses to reset your OWN 2FA', async () => {
    // Otherwise anyone holding a stolen session could simply strip the factor.
    const res = await app.fetch(
      post(`/api/admin/security/reset-2fa/${userId}`, {}, await session()), testEnv
    );
    expect(res.status).toBe(400);
  });

  it('requires a session', async () => {
    const res = await app.fetch(post('/api/admin/security/reset-2fa/999'), testEnv);
    expect(res.status).toBe(401);
  });
});
