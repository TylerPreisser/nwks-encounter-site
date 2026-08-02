// functions/_api/security.ts
// Shared primitives for admin authentication hardening: one-time codes, the
// recovery ladder, trusted devices, rate limiting, lockout, and the audit trail.
//
// Design: docs/superpowers/specs/2026-08-01-admin-2fa-and-hardening-design.md
//
// Nothing secret is ever stored in plaintext. Codes and device tokens live as
// SHA-256 hashes, so a database leak yields no usable credential.

import type { Env } from './app';
import { nowIso } from './db';

// ── Tunables ────────────────────────────────────────────────────────────────

/** Emailed codes are short-lived; long enough to switch apps, not to sit on. */
export const EMAIL_OTP_TTL_MINUTES = 10;
/** Recovery codes issued per admin at enrollment. */
export const RECOVERY_CODE_COUNT = 10;
/** How long a browser may skip the SECOND factor. Tyler: "every couple of days". */
export const TRUSTED_DEVICE_DAYS = 2;
/** Session lifetime. Short by design — trusted devices absorb the friction. */
export const SESSION_TTL_HOURS = 12;

/** Failed passwords for one email before the account locks. */
const LOCKOUT_THRESHOLD = 5;
/** Failed attempts from one IP (across accounts) in the window before refusal. */
const IP_ATTEMPT_THRESHOLD = 20;
/** Sliding window for both of the above. */
const ATTEMPT_WINDOW_MINUTES = 15;
/** Lockout backoff, in minutes, indexed by how many times past the threshold. */
const LOCKOUT_BACKOFF_MINUTES = [1, 5, 15, 60, 240];

/** Emailed codes a user may request in the window. */
const OTP_ISSUE_LIMIT = 5;
/** Wrong second-factor guesses before the attempt is refused outright. */
const OTP_VERIFY_LIMIT = 10;

// ── Hashing + random ────────────────────────────────────────────────────────

/**
 * SHA-256 hex. Used for one-time codes and device tokens — NOT for passwords,
 * which stay on scrypt (see auth.ts). These values are already high-entropy
 * random, so a slow KDF buys nothing; what matters is that the plaintext is
 * never at rest.
 */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Cryptographically random opaque token, hex encoded. */
export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * A numeric one-time code of `digits` length, drawn from the CSPRNG with
 * rejection sampling so every value is equally likely (a naive `% 10` skews
 * toward low digits).
 */
export function randomNumericCode(digits = 6): string {
  let out = '';
  const buf = new Uint8Array(1);
  while (out.length < digits) {
    crypto.getRandomValues(buf);
    if (buf[0] < 250) out += String(buf[0] % 10); // 250 = 25 * 10, unbiased
  }
  return out;
}

/**
 * Human-friendly recovery code: "A1B2-C3D4-E5F6".
 * Ambiguous characters (0/O, 1/I/L) are excluded — these get written on paper
 * and typed back in months later, and a misread character is a lockout.
 */
export function randomRecoveryCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const buf = new Uint8Array(12);
  crypto.getRandomValues(buf);
  const chars = [...buf].map((b) => alphabet[b % alphabet.length]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
}

/**
 * Constant-time string comparison. Both sides here are hex digests of equal
 * length; comparing them with `===` would leak position-of-first-difference
 * through timing.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── Request metadata ────────────────────────────────────────────────────────

/** Client IP as Cloudflare reports it. Header is set by the edge, not the client. */
export function clientIp(req: Request): string {
  return req.headers.get('CF-Connecting-IP') ?? req.headers.get('X-Forwarded-For') ?? 'unknown';
}

export function userAgent(req: Request): string {
  return (req.headers.get('User-Agent') ?? '').slice(0, 300);
}

// ── Audit trail ─────────────────────────────────────────────────────────────

export interface AuditEntry {
  adminUserId?: number | null;
  adminEmail?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  detail?: unknown;
  req?: Request;
}

/**
 * Writes one audit row. Deliberately swallows its own failure: an audit write
 * must never be the reason a legitimate login fails. The failure is surfaced on
 * the console so it is still visible, never silently dropped.
 */
export async function audit(env: Env, entry: AuditEntry): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO audit_log
         (admin_user_id, admin_email, action, target_type, target_id, detail, ip, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        entry.adminUserId ?? null,
        entry.adminEmail ?? null,
        entry.action,
        entry.targetType ?? null,
        entry.targetId ?? null,
        entry.detail === undefined ? null : JSON.stringify(entry.detail),
        entry.req ? clientIp(entry.req) : null,
        entry.req ? userAgent(entry.req) : null,
        nowIso()
      )
      .run();
  } catch (err) {
    console.error('[audit] failed to write audit row', entry.action, err);
  }
}

// ── Rate limiting + lockout ─────────────────────────────────────────────────

export type LoginOutcome =
  | 'success'
  | 'bad_password'
  | 'unknown_user'
  | 'locked'
  | 'rate_limited'
  | 'bad_second_factor'
  | 'turnstile_failed';

export async function recordLoginAttempt(
  env: Env,
  email: string | null,
  ip: string,
  outcome: LoginOutcome
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO login_attempts (email, ip, outcome, created_at) VALUES (?, ?, ?, ?)`
  )
    .bind(email ? email.toLowerCase() : null, ip, outcome, nowIso())
    .run();
}

function windowStart(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

/**
 * Is this IP hammering the login across accounts? Keyed separately from the
 * per-email lockout so one attacker cannot lock the whole team out by
 * deliberately failing everyone's password.
 */
export async function isIpRateLimited(env: Env, ip: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM login_attempts
     WHERE ip = ? AND outcome != 'success' AND created_at > ?`
  )
    .bind(ip, windowStart(ATTEMPT_WINDOW_MINUTES))
    .first<{ n: number }>();
  return (row?.n ?? 0) >= IP_ATTEMPT_THRESHOLD;
}

export interface LockState {
  locked: boolean;
  until: string | null;
}

/** Current lock state for a user, treating an elapsed lock as unlocked. */
export function lockState(lockedUntil: string | null): LockState {
  if (!lockedUntil) return { locked: false, until: null };
  const locked = new Date(lockedUntil) > new Date();
  return { locked, until: locked ? lockedUntil : null };
}

/**
 * Registers a failed password for a user and locks the account once the
 * threshold is crossed, backing off further on each subsequent failure.
 * Returns the resulting lock state.
 */
export async function registerFailedLogin(
  env: Env,
  userId: number,
  currentFailures: number
): Promise<LockState> {
  const failures = currentFailures + 1;

  if (failures < LOCKOUT_THRESHOLD) {
    await env.DB.prepare(`UPDATE admin_users SET failed_login_count = ? WHERE id = ?`)
      .bind(failures, userId)
      .run();
    return { locked: false, until: null };
  }

  const overBy = failures - LOCKOUT_THRESHOLD;
  const minutes =
    LOCKOUT_BACKOFF_MINUTES[Math.min(overBy, LOCKOUT_BACKOFF_MINUTES.length - 1)];
  const until = new Date(Date.now() + minutes * 60_000).toISOString();

  await env.DB.prepare(
    `UPDATE admin_users SET failed_login_count = ?, locked_until = ? WHERE id = ?`
  )
    .bind(failures, until, userId)
    .run();

  return { locked: true, until };
}

/** Clears the failure counter and any lock. Called on a fully successful login. */
export async function clearFailedLogins(env: Env, userId: number): Promise<void> {
  await env.DB.prepare(
    `UPDATE admin_users SET failed_login_count = 0, locked_until = NULL WHERE id = ?`
  )
    .bind(userId)
    .run();
}

// ── One-time codes: emailed OTP + recovery codes ────────────────────────────

/**
 * Issues an emailed one-time code and returns the PLAINTEXT for sending.
 * Only the hash is persisted. Returns null when the user has already requested
 * too many codes in the window — otherwise the backup factor doubles as a way
 * to flood someone's inbox.
 */
export async function issueEmailOtp(env: Env, userId: number): Promise<string | null> {
  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM auth_codes
     WHERE admin_user_id = ? AND kind = 'email_otp' AND created_at > ?`
  )
    .bind(userId, windowStart(ATTEMPT_WINDOW_MINUTES))
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= OTP_ISSUE_LIMIT) return null;

  const code = randomNumericCode(6);
  const expires = new Date(Date.now() + EMAIL_OTP_TTL_MINUTES * 60_000).toISOString();

  // Any earlier unused code is invalidated: exactly one live code at a time.
  await env.DB.prepare(
    `UPDATE auth_codes SET used_at = ?
     WHERE admin_user_id = ? AND kind = 'email_otp' AND used_at IS NULL`
  )
    .bind(nowIso(), userId)
    .run();

  await env.DB.prepare(
    `INSERT INTO auth_codes (admin_user_id, kind, code_hash, expires_at, created_at)
     VALUES (?, 'email_otp', ?, ?, ?)`
  )
    .bind(userId, await sha256Hex(code), expires, nowIso())
    .run();

  return code;
}

/**
 * Generates a fresh set of recovery codes, replacing any existing ones, and
 * returns the PLAINTEXT set — the only time they are ever visible.
 *
 * These are the answer to "what if they can't get to their email": they work
 * with no phone, no email and no second device. They deliberately do not expire.
 */
export async function issueRecoveryCodes(env: Env, userId: number): Promise<string[]> {
  await env.DB.prepare(
    `DELETE FROM auth_codes WHERE admin_user_id = ? AND kind = 'recovery'`
  )
    .bind(userId)
    .run();

  const codes: string[] = [];
  const stmts = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const code = randomRecoveryCode();
    codes.push(code);
    stmts.push(
      env.DB.prepare(
        `INSERT INTO auth_codes (admin_user_id, kind, code_hash, expires_at, created_at)
         VALUES (?, 'recovery', ?, NULL, ?)`
      ).bind(userId, await sha256Hex(code), nowIso())
    );
  }
  await env.DB.batch(stmts);
  return codes;
}

/** How many recovery codes remain unused — surfaced in Security settings. */
export async function countUnusedRecoveryCodes(env: Env, userId: number): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM auth_codes
     WHERE admin_user_id = ? AND kind = 'recovery' AND used_at IS NULL`
  )
    .bind(userId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Too many wrong second-factor guesses in the window? */
export async function isSecondFactorRateLimited(env: Env, ip: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM login_attempts
     WHERE ip = ? AND outcome = 'bad_second_factor' AND created_at > ?`
  )
    .bind(ip, windowStart(ATTEMPT_WINDOW_MINUTES))
    .first<{ n: number }>();
  return (row?.n ?? 0) >= OTP_VERIFY_LIMIT;
}

/**
 * Consumes a one-time code of either kind. Returns true only if a matching,
 * unused, unexpired code existed — and marks it used in the same breath, so a
 * captured code cannot be replayed.
 *
 * Recovery codes are normalised (case, spacing, dashes) because they are typed
 * off paper.
 */
export async function consumeAuthCode(
  env: Env,
  userId: number,
  kind: 'email_otp' | 'recovery',
  submitted: string
): Promise<boolean> {
  const normalised =
    kind === 'recovery'
      ? submitted.trim().toUpperCase().replace(/[\s-]/g, '')
      : submitted.trim();

  const { results } = await env.DB.prepare(
    `SELECT id, code_hash, expires_at FROM auth_codes
     WHERE admin_user_id = ? AND kind = ? AND used_at IS NULL`
  )
    .bind(userId, kind)
    .all<{ id: number; code_hash: string; expires_at: string | null }>();

  const candidateHash = await sha256Hex(
    kind === 'recovery' ? formatRecovery(normalised) : normalised
  );

  for (const row of results) {
    if (!timingSafeEqualHex(row.code_hash, candidateHash)) continue;
    if (row.expires_at && new Date(row.expires_at) < new Date()) return false;

    await env.DB.prepare(`UPDATE auth_codes SET used_at = ? WHERE id = ?`)
      .bind(nowIso(), row.id)
      .run();
    return true;
  }
  return false;
}

/** Re-inserts the dashes so a code typed as "a1b2c3d4e5f6" hashes identically. */
function formatRecovery(stripped: string): string {
  return `${stripped.slice(0, 4)}-${stripped.slice(4, 8)}-${stripped.slice(8, 12)}`;
}

// ── Trusted devices ─────────────────────────────────────────────────────────

/** Issues a trusted-device token, returning the PLAINTEXT for the cookie. */
export async function issueTrustedDevice(
  env: Env,
  userId: number,
  req: Request
): Promise<string> {
  const token = randomToken(32);
  const expires = new Date(Date.now() + TRUSTED_DEVICE_DAYS * 86_400_000).toISOString();

  await env.DB.prepare(
    `INSERT INTO trusted_devices
       (admin_user_id, token_hash, user_agent, ip, expires_at, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(userId, await sha256Hex(token), userAgent(req), clientIp(req), expires, nowIso(), nowIso())
    .run();

  return token;
}

/**
 * Is this browser trusted for this user? Bumps last_seen_at on a hit.
 * A device belonging to a DIFFERENT user never counts — the token is checked
 * against the user being logged in, not merely for existence.
 */
export async function isTrustedDevice(
  env: Env,
  userId: number,
  token: string | undefined
): Promise<boolean> {
  if (!token) return false;

  const row = await env.DB.prepare(
    `SELECT id, expires_at FROM trusted_devices
     WHERE admin_user_id = ? AND token_hash = ?`
  )
    .bind(userId, await sha256Hex(token))
    .first<{ id: number; expires_at: string }>();

  if (!row) return false;
  if (new Date(row.expires_at) < new Date()) return false;

  await env.DB.prepare(`UPDATE trusted_devices SET last_seen_at = ? WHERE id = ?`)
    .bind(nowIso(), row.id)
    .run();
  return true;
}

/** Revokes every trusted device for a user (used on 2FA reset / password change). */
export async function revokeTrustedDevices(env: Env, userId: number): Promise<void> {
  await env.DB.prepare(`DELETE FROM trusted_devices WHERE admin_user_id = ?`)
    .bind(userId)
    .run();
}

// ── Duo (optional) ──────────────────────────────────────────────────────────

/**
 * Can this deployment actually deliver an email right now?
 *
 * Both halves matter: EMAIL_ENABLED gates sending, and Resend needs a key. With
 * either missing, sendEmail() writes a 'queued' log row and returns ok — which
 * looks like success but delivers nothing. Any flow that makes someone WAIT for
 * an email has to check this first, or it dead-ends them.
 */
export function emailDeliverable(env: Env): boolean {
  const e = env as unknown as Record<string, string | undefined>;
  return e.EMAIL_ENABLED === 'true' && Boolean(e.RESEND_API_KEY);
}

/**
 * Duo is offered ONLY when all three secrets are present. With them absent the
 * option is neither rendered nor accepted — no half-wired code path that might
 * look like a second factor without being one.
 */
export function duoConfigured(env: Env): boolean {
  const e = env as unknown as Record<string, string | undefined>;
  return Boolean(e.DUO_IKEY && e.DUO_SKEY && e.DUO_API_HOST);
}
