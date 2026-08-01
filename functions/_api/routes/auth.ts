// functions/_api/routes/auth.ts — login / second factor / logout / me
//
// Login is two steps once a user has enrolled:
//   1. POST /login              email + password (+ Turnstile)  -> pending token
//   2. POST /2fa/<method>/...   passkey | email code | recovery -> session
//
// A user who has NOT enrolled gets a session straight from step 1, so rolling
// this out cannot lock anyone out. See the design doc, section 7.

import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Env } from '../app';
import { verifyPassword, createSession, getSessionUser } from '../auth';
import { nowIso } from '../db';
import { sendEmail } from '../email';
import {
  SESSION_TTL_HOURS, TRUSTED_DEVICE_DAYS,
  audit, clientIp, clearFailedLogins, consumeAuthCode, duoConfigured,
  isIpRateLimited, isSecondFactorRateLimited, isTrustedDevice, issueEmailOtp,
  issueTrustedDevice, lockState, randomToken, recordLoginAttempt, registerFailedLogin,
} from '../security';
import { startAuthentication, finishAuthentication } from '../webauthn';

export const authRouter = new Hono<{ Bindings: Env }>();

/** Pending logins live in KV, not a cookie, so the client can't forge one. */
const PENDING_TTL_SECONDS = 300;

const SESSION_COOKIE = 'nwks_session';
const TRUSTED_COOKIE = 'nwks_trusted';
const PENDING_COOKIE = 'nwks_pending';

/** One shape for every login failure — never reveals whether an email exists. */
const GENERIC_FAILURE = { ok: false, error: 'Invalid email or password.' } as const;

interface PendingLogin {
  userId: number;
  email: string;
  createdAt: string;
}

async function putPending(env: Env, token: string, data: PendingLogin): Promise<void> {
  await env.SESSIONS.put(`pending:${token}`, JSON.stringify(data), {
    expirationTtl: PENDING_TTL_SECONDS,
  });
}

async function getPending(env: Env, token: string | undefined): Promise<PendingLogin | null> {
  if (!token) return null;
  const raw = await env.SESSIONS.get(`pending:${token}`);
  if (!raw) return null;
  try { return JSON.parse(raw) as PendingLogin; } catch { return null; }
}

async function clearPending(env: Env, token: string): Promise<void> {
  await env.SESSIONS.delete(`pending:${token}`);
}

function setSessionCookie(c: Parameters<Parameters<typeof authRouter.post>[1]>[0], token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    // Strict (was Lax): the admin is a same-origin SPA, so nothing legitimate
    // arrives via a cross-site navigation, and Strict removes a CSRF vector.
    sameSite: 'Strict',
    path: '/',
    maxAge: SESSION_TTL_HOURS * 3600,
  });
}

/**
 * Verifies a Turnstile token when a secret is configured. Absent a secret this
 * returns true so local development and tests are unaffected — the same pattern
 * the public registration form already uses.
 */
async function turnstileOk(env: Env, token: string | undefined, ip: string): Promise<boolean> {
  const secret = (env as unknown as { TURNSTILE_SECRET?: string }).TURNSTILE_SECRET;
  if (!secret) return true;
  if (!token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token, remoteip: ip }),
    });
    const data = await res.json<{ success: boolean }>();
    return data.success === true;
  } catch {
    return false;
  }
}

interface AdminRow {
  id: number;
  email: string;
  name: string | null;
  role: string;
  password_hash: string;
  two_factor_required: number;
  webauthn_enabled: number;
  failed_login_count: number;
  locked_until: string | null;
}

/** Issues the session + audit for a fully authenticated user. */
async function completeLogin(
  c: Parameters<Parameters<typeof authRouter.post>[1]>[0],
  row: { id: number; email: string; name: string | null; role: string },
  method: string,
  trustDevice: boolean
) {
  const token = await createSession(c.env, row.id);
  setSessionCookie(c, token);

  await c.env.DB.prepare(`UPDATE admin_users SET last_login_at = ? WHERE id = ?`)
    .bind(nowIso(), row.id).run();
  await clearFailedLogins(c.env, row.id);
  await recordLoginAttempt(c.env, row.email, clientIp(c.req.raw), 'success');

  if (trustDevice) {
    const deviceToken = await issueTrustedDevice(c.env, row.id, c.req.raw);
    setCookie(c, TRUSTED_COOKIE, deviceToken, {
      httpOnly: true, secure: true, sameSite: 'Strict', path: '/',
      maxAge: TRUSTED_DEVICE_DAYS * 86400,
    });
  }

  await audit(c.env, {
    adminUserId: row.id, adminEmail: row.email,
    action: 'login.success', detail: { method, trustDevice }, req: c.req.raw,
  });

  return c.json({
    ok: true,
    user: { id: row.id, email: row.email, name: row.name ?? '', role: row.role },
  });
}

// ── Step 1: password ────────────────────────────────────────────────────────

authRouter.post('/login', async (c) => {
  let body: { email?: string; password?: string; cf_turnstile_response?: string } = {};
  try { body = await c.req.json(); } catch { /* treat as empty */ }

  const { email, password } = body;
  const ip = clientIp(c.req.raw);

  if (!email || !password) {
    return c.json({ ok: false, error: 'email and password required' }, 400);
  }

  if (await isIpRateLimited(c.env, ip)) {
    await recordLoginAttempt(c.env, email, ip, 'rate_limited');
    await audit(c.env, { adminEmail: email, action: 'login.rate_limited', req: c.req.raw });
    return c.json({ ok: false, error: 'Too many attempts. Please wait and try again.' }, 429);
  }

  if (!(await turnstileOk(c.env, body.cf_turnstile_response, ip))) {
    await recordLoginAttempt(c.env, email, ip, 'turnstile_failed');
    return c.json({ ok: false, error: 'Verification failed. Please try again.' }, 400);
  }

  const row = await c.env.DB.prepare(
    `SELECT id, email, name, role, password_hash, two_factor_required,
            webauthn_enabled, failed_login_count, locked_until
     FROM admin_users WHERE email = ?`
  ).bind(email.toLowerCase().trim()).first<AdminRow>();

  if (!row) {
    // Hash a dummy password anyway so an unknown email and a wrong password
    // take comparable time — otherwise the response time enumerates accounts.
    await verifyPassword(password, 'scrypt$00$00');
    await recordLoginAttempt(c.env, email, ip, 'unknown_user');
    return c.json(GENERIC_FAILURE, 401);
  }

  const lock = lockState(row.locked_until);
  if (lock.locked) {
    await recordLoginAttempt(c.env, email, ip, 'locked');
    await audit(c.env, {
      adminUserId: row.id, adminEmail: row.email, action: 'login.locked', req: c.req.raw,
    });
    return c.json(
      { ok: false, error: 'Account temporarily locked. Try again shortly.', locked_until: lock.until },
      423
    );
  }

  if (!(await verifyPassword(password, row.password_hash))) {
    const state = await registerFailedLogin(c.env, row.id, row.failed_login_count);
    await recordLoginAttempt(c.env, email, ip, 'bad_password');
    await audit(c.env, {
      adminUserId: row.id, adminEmail: row.email,
      action: state.locked ? 'login.locked_out' : 'login.bad_password', req: c.req.raw,
    });
    return c.json(GENERIC_FAILURE, 401);
  }

  // Password is correct. Does this user need a second factor?
  if (!row.two_factor_required) {
    return completeLogin(c, row, 'password_only', false);
  }

  // A trusted browser skips the second factor — but never the password.
  if (await isTrustedDevice(c.env, row.id, getCookie(c, TRUSTED_COOKIE))) {
    return completeLogin(c, row, 'trusted_device', false);
  }

  const pendingToken = randomToken(32);
  await putPending(c.env, pendingToken, {
    userId: row.id, email: row.email, createdAt: nowIso(),
  });
  setCookie(c, PENDING_COOKIE, pendingToken, {
    httpOnly: true, secure: true, sameSite: 'Strict', path: '/', maxAge: PENDING_TTL_SECONDS,
  });

  return c.json({
    ok: true,
    two_factor_required: true,
    methods: {
      passkey: row.webauthn_enabled === 1,
      email: true,
      recovery: true,
      duo: duoConfigured(c.env),
    },
  });
});

// ── Step 2: the second factor ───────────────────────────────────────────────

/** Resolves the pending login, or returns the error response to send. */
async function requirePending(c: Parameters<Parameters<typeof authRouter.post>[1]>[0]) {
  const token = getCookie(c, PENDING_COOKIE);
  const pending = await getPending(c.env, token);
  if (!pending) return { error: c.json({ ok: false, error: 'Login expired. Please start again.' }, 401) };

  const row = await c.env.DB.prepare(
    `SELECT id, email, name, role, password_hash, two_factor_required,
            webauthn_enabled, failed_login_count, locked_until
     FROM admin_users WHERE id = ?`
  ).bind(pending.userId).first<AdminRow>();
  if (!row) return { error: c.json({ ok: false, error: 'Login expired. Please start again.' }, 401) };

  return { pending, row, token: token! };
}

authRouter.post('/2fa/passkey/options', async (c) => {
  const ctx = await requirePending(c);
  if ('error' in ctx) return ctx.error;
  const options = await startAuthentication(c.env, c.req.raw, ctx.row.id);
  return c.json({ ok: true, options });
});

authRouter.post('/2fa/passkey/verify', async (c) => {
  const ctx = await requirePending(c);
  if ('error' in ctx) return ctx.error;

  const body = await c.req.json<{ response?: unknown; trust_device?: boolean }>().catch(() => ({}));
  const result = await finishAuthentication(c.env, c.req.raw, ctx.row.id, body.response);

  if (!result.ok) {
    await recordLoginAttempt(c.env, ctx.row.email, clientIp(c.req.raw), 'bad_second_factor');
    await audit(c.env, {
      adminUserId: ctx.row.id, adminEmail: ctx.row.email,
      action: result.cloneSuspected ? 'login.passkey_clone_suspected' : 'login.passkey_failed',
      req: c.req.raw,
    });
    return c.json({ ok: false, error: result.error ?? 'Passkey failed.' }, 401);
  }

  await clearPending(c.env, ctx.token);
  return completeLogin(c, ctx.row, 'passkey', body.trust_device === true);
});

authRouter.post('/2fa/email/send', async (c) => {
  const ctx = await requirePending(c);
  if ('error' in ctx) return ctx.error;

  const code = await issueEmailOtp(c.env, ctx.row.id);
  if (!code) {
    return c.json({ ok: false, error: 'Too many codes requested. Please wait a few minutes.' }, 429);
  }

  await sendEmail(c.env, {
    to: ctx.row.email,
    subject: 'Your NWKS admin sign-in code',
    html:
      `<p>Your sign-in code is <strong style="font-size:22px;letter-spacing:3px;">${code}</strong></p>` +
      `<p>It expires in 10 minutes. If you did not try to sign in, someone has your password — change it.</p>`,
    text: `Your NWKS admin sign-in code is ${code}. It expires in 10 minutes.\n\nIf you did not try to sign in, someone has your password — change it.`,
    type: 'transactional',
    templateKey: 'admin_login_code',
  });

  await audit(c.env, {
    adminUserId: ctx.row.id, adminEmail: ctx.row.email, action: '2fa.email_code_sent', req: c.req.raw,
  });
  return c.json({ ok: true });
});

/** Shared handler for the two typed-code factors. */
async function verifyTypedCode(
  c: Parameters<Parameters<typeof authRouter.post>[1]>[0],
  kind: 'email_otp' | 'recovery'
) {
  const ctx = await requirePending(c);
  if ('error' in ctx) return ctx.error;

  const ip = clientIp(c.req.raw);
  if (await isSecondFactorRateLimited(c.env, ip)) {
    return c.json({ ok: false, error: 'Too many attempts. Please wait and try again.' }, 429);
  }

  const body = await c.req.json<{ code?: string; trust_device?: boolean }>().catch(() => ({}));
  if (!body.code) return c.json({ ok: false, error: 'Code required.' }, 400);

  if (!(await consumeAuthCode(c.env, ctx.row.id, kind, body.code))) {
    await recordLoginAttempt(c.env, ctx.row.email, ip, 'bad_second_factor');
    await audit(c.env, {
      adminUserId: ctx.row.id, adminEmail: ctx.row.email,
      action: kind === 'recovery' ? '2fa.recovery_failed' : '2fa.email_code_failed', req: c.req.raw,
    });
    return c.json({ ok: false, error: 'That code is not valid.' }, 401);
  }

  await clearPending(c.env, ctx.token);
  return completeLogin(c, ctx.row, kind, body.trust_device === true);
}

authRouter.post('/2fa/email/verify', (c) => verifyTypedCode(c, 'email_otp'));
authRouter.post('/2fa/recovery/verify', (c) => verifyTypedCode(c, 'recovery'));

// ── Session lifecycle ───────────────────────────────────────────────────────

authRouter.post('/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const user = await getSessionUser(c.env, token);
    try { await c.env.SESSIONS.delete(`session:${token}`); } catch { /* best effort */ }
    if (user) {
      await audit(c.env, {
        adminUserId: user.id, adminEmail: user.email, action: 'logout', req: c.req.raw,
      });
    }
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

authRouter.get('/me', async (c) => {
  const user = await getSessionUser(c.env, getCookie(c, SESSION_COOKIE));
  if (!user) return c.json({ ok: false, error: 'unauthorized' }, 401);
  return c.json({ ok: true, user });
});
