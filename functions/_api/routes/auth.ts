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
  EMAIL_OTP_TTL_MINUTES, SESSION_TTL_HOURS, TRUSTED_DEVICE_DAYS,
  audit, clientIp, clearFailedLogins, consumeAuthCode, duoConfigured,
  emailDeliverable, isIpRateLimited, isSecondFactorRateLimited, isTrustedDevice, issueEmailOtp,
  issueTrustedDevice, lockState, randomToken, recordLoginAttempt, registerFailedLogin,
} from '../security';
import { startAuthentication, finishAuthentication, startRegistration, finishRegistration } from '../webauthn';
import { loginCodeEmail } from '../emails/loginCode';
import { duoConfig, healthCheck as duoHealthCheck, createAuthUrl, exchangeCode } from '../duo';

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

/** "ty****@gmail.com" — enough to recognise, not enough to harvest. */
function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  const head = user.slice(0, 2);
  return `${head}${'*'.repeat(Math.max(3, user.length - 2))}@${domain}`;
}

/** Issues an emailed code and sends it. Returns false if rate limited. */
async function issueAndSendOtp(
  c: Parameters<Parameters<typeof authRouter.post>[1]>[0],
  userId: number,
  email: string,
  firstName?: string
): Promise<boolean> {
  const code = await issueEmailOtp(c.env, userId);
  if (!code) return false;

  const mail = loginCodeEmail(code, EMAIL_OTP_TTL_MINUTES, firstName);
  await sendEmail(c.env, {
    to: email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    type: 'transactional',
    templateKey: 'admin_login_code',
  });

  await audit(c.env, {
    adminUserId: userId, adminEmail: email, action: '2fa.email_code_sent', req: c.req.raw,
  });
  return true;
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

  // The password is correct. Everything below decides what the SECOND step is.
  const pendingToken = randomToken(32);
  await putPending(c.env, pendingToken, {
    userId: row.id, email: row.email, createdAt: nowIso(),
  });
  setCookie(c, PENDING_COOKIE, pendingToken, {
    httpOnly: true, secure: true, sameSite: 'Strict', path: '/', maxAge: PENDING_TTL_SECONDS,
  });

  const canEmail = emailDeliverable(c.env);

  // FIRST RUN: nobody gets in on a password alone. A user with no passkey is
  // sent through setup — verify by emailed code, then they're offered a passkey.
  if (row.webauthn_enabled !== 1) {
    if (canEmail) {
      // Send the code immediately: the screen says "check your email", so making
      // them press another button first is a step for nothing.
      await issueAndSendOtp(c, row.id, row.email);
      return c.json({
        ok: true,
        setup_required: true,
        verify_with: 'email',
        email_hint: maskEmail(row.email),
      });
    }
    // Email cannot be delivered on this deployment. Rather than dead-ending
    // someone at "check your email" for a message that will never arrive, let
    // them enrol a passkey directly — the password already proved who they are,
    // and a passkey is strictly stronger than the emailed code would have been.
    return c.json({
      ok: true,
      setup_required: true,
      verify_with: 'passkey_direct',
      reason: 'email_unavailable',
    });
  }

  // A trusted browser skips the second factor — but never the password.
  if (await isTrustedDevice(c.env, row.id, getCookie(c, TRUSTED_COOKIE))) {
    await clearPending(c.env, pendingToken);
    return completeLogin(c, row, 'trusted_device', false);
  }

  return c.json({
    ok: true,
    two_factor_required: true,
    methods: {
      passkey: true,
      email: canEmail,
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

// ── Duo push (only when configured) ─────────────────────────────────────────

authRouter.post('/2fa/duo/start', async (c) => {
  const ctx = await requirePending(c);
  if ('error' in ctx) return ctx.error;

  const cfg = duoConfig(c.env);
  if (!cfg) return c.json({ ok: false, error: 'Duo is not configured.' }, 400);

  // If Duo is down, say so and let the user pick another factor rather than
  // bouncing them to a broken redirect.
  const health = await duoHealthCheck(cfg);
  if (!health.ok) {
    await audit(c.env, {
      adminUserId: ctx.row.id, adminEmail: ctx.row.email,
      action: '2fa.duo_unavailable', detail: { error: health.error }, req: c.req.raw,
    });
    return c.json({ ok: false, error: 'Duo is unavailable right now. Use another method.' }, 503);
  }

  // Opaque state, stored server-side and required to come back unchanged.
  const state = randomToken(24);
  await c.env.SESSIONS.put(
    `duostate:${state}`,
    JSON.stringify({ userId: ctx.row.id, email: ctx.row.email }),
    { expirationTtl: PENDING_TTL_SECONDS }
  );

  const redirectUri = new URL('/admin/#/duo-callback', new URL(c.req.url).origin).toString();
  const url = await createAuthUrl(cfg, ctx.row.email, state, redirectUri);
  return c.json({ ok: true, redirect_url: url, state });
});

authRouter.post('/2fa/duo/callback', async (c) => {
  const ctx = await requirePending(c);
  if ('error' in ctx) return ctx.error;

  const cfg = duoConfig(c.env);
  if (!cfg) return c.json({ ok: false, error: 'Duo is not configured.' }, 400);

  const body = await c.req.json<{ code?: string; state?: string; trust_device?: boolean }>()
    .catch(() => ({}));
  if (!body.code || !body.state) return c.json({ ok: false, error: 'Missing Duo response.' }, 400);

  // The state must be one WE issued, for THIS user, and is single use.
  const raw = await c.env.SESSIONS.get(`duostate:${body.state}`);
  if (!raw) return c.json({ ok: false, error: 'Duo session expired. Please start again.' }, 401);
  await c.env.SESSIONS.delete(`duostate:${body.state}`);

  const stored = JSON.parse(raw) as { userId: number; email: string };
  if (stored.userId !== ctx.row.id) {
    return c.json({ ok: false, error: 'Duo session mismatch.' }, 401);
  }

  const redirectUri = new URL('/admin/#/duo-callback', new URL(c.req.url).origin).toString();
  const result = await exchangeCode(cfg, body.code, ctx.row.email, redirectUri);

  if (!result.ok) {
    await recordLoginAttempt(c.env, ctx.row.email, clientIp(c.req.raw), 'bad_second_factor');
    await audit(c.env, {
      adminUserId: ctx.row.id, adminEmail: ctx.row.email,
      action: '2fa.duo_failed', detail: { error: result.error }, req: c.req.raw,
    });
    return c.json({ ok: false, error: result.error ?? 'Duo verification failed.' }, 401);
  }

  await clearPending(c.env, ctx.token);
  return completeLogin(c, ctx.row, 'duo', body.trust_device === true);
});

authRouter.post('/2fa/email/send', async (c) => {
  const ctx = await requirePending(c);
  if ('error' in ctx) return ctx.error;

  if (!emailDeliverable(c.env)) {
    return c.json({ ok: false, error: 'Email is not configured on this site.' }, 503);
  }
  if (!(await issueAndSendOtp(c, ctx.row.id, ctx.row.email))) {
    return c.json({ ok: false, error: 'Too many codes requested. Please wait a few minutes.' }, 429);
  }
  return c.json({ ok: true, email_hint: maskEmail(ctx.row.email) });
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

  // A user with no passkey is mid-SETUP: verifying the code does not finish the
  // login, it unlocks the passkey offer. The session is issued by either
  // /setup/passkey/verify or /setup/skip. Doing it here instead would drop them
  // on the dashboard and quietly skip the whole point of the flow.
  if (ctx.row.webauthn_enabled !== 1) {
    await c.env.SESSIONS.put(`setupok:${ctx.token}`, '1', { expirationTtl: PENDING_TTL_SECONDS });
    await audit(c.env, {
      adminUserId: ctx.row.id, adminEmail: ctx.row.email,
      action: '2fa.email_code_verified', detail: { during: 'setup' }, req: c.req.raw,
    });
    return c.json({ ok: true, setup_stage: 'offer_passkey' });
  }

  await clearPending(c.env, ctx.token);
  return completeLogin(c, ctx.row, kind, body.trust_device === true);
}

authRouter.post('/2fa/email/verify', (c) => verifyTypedCode(c, 'email_otp'));

// ── First-run setup: enrol a passkey before a full session exists ───────────
//
// These mirror the ones under /admin/security, but authorise on the PENDING
// login rather than a session. That is what lets the flow be
// password -> emailed code -> "want a passkey?" in one unbroken run, instead of
// making someone sign in, land on a dashboard, and go hunting through settings.

authRouter.post('/setup/passkey/options', async (c) => {
  const ctx = await requirePending(c);
  if ('error' in ctx) return ctx.error;

  const options = await startRegistration(c.env, c.req.raw, {
    id: ctx.row.id, email: ctx.row.email, name: ctx.row.name ?? ctx.row.email,
  });
  return c.json({ ok: true, options });
});

authRouter.post('/setup/passkey/verify', async (c) => {
  const ctx = await requirePending(c);
  if ('error' in ctx) return ctx.error;

  const body = await c.req.json<{ response?: unknown; label?: string; trust_device?: boolean }>()
    .catch(() => ({}));

  const result = await finishRegistration(
    c.env, c.req.raw, ctx.row.id, body.response, body.label ?? 'Passkey'
  );

  if (!result.ok) {
    await audit(c.env, {
      adminUserId: ctx.row.id, adminEmail: ctx.row.email,
      action: 'passkey.enroll_failed', detail: { error: result.error, during: 'setup' }, req: c.req.raw,
    });
    return c.json({ ok: false, error: result.error }, 400);
  }

  await audit(c.env, {
    adminUserId: ctx.row.id, adminEmail: ctx.row.email,
    action: 'passkey.enrolled', detail: { during: 'setup' }, req: c.req.raw,
  });

  // Enrolling completes the sign-in: they proved the password, then the emailed
  // code (or, where email cannot be delivered, the password alone), and have now
  // registered a stronger factor than either.
  await clearPending(c.env, ctx.token);
  return completeLogin(c, ctx.row, 'passkey_enrolled', body.trust_device === true);
});

/**
 * "Skip for now" on the passkey offer.
 *
 * Only reachable once the pending login has ALREADY cleared its second step, so
 * this is not a bypass — it is the difference between "signed in with a code"
 * and "signed in with a code and also set up a passkey".
 */
authRouter.post('/setup/skip', async (c) => {
  const ctx = await requirePending(c);
  if ('error' in ctx) return ctx.error;

  const verified = await c.env.SESSIONS.get(`setupok:${ctx.token}`);
  if (!verified) {
    return c.json({ ok: false, error: 'Finish verifying first.' }, 401);
  }

  await c.env.SESSIONS.delete(`setupok:${ctx.token}`);
  await clearPending(c.env, ctx.token);
  return completeLogin(c, ctx.row, 'email_code_setup_skipped', false);
});

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
