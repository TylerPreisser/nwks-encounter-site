// functions/_api/auth.ts — password hashing, KV sessions, and Hono auth/program middleware

import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { MiddlewareHandler } from 'hono';
import type { Env } from './app';
import type { Program } from './db';

/** Shape of variables set by auth middleware — consumed by all route handlers. */
export type AppVariables = {
  user: { id: number; email: string; name: string; role: string };
  program: Program;
};

type AppMiddleware = MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }>;

const scryptAsync = promisify(scrypt);

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * Hashes a password with scrypt and a fresh random salt.
 * Returns "scrypt$<saltHex>$<hashHex>".
 */
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = (await scryptAsync(pw, salt, KEY_LEN, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P,
  })) as Buffer;
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/**
 * Verifies a plaintext password against a stored "scrypt$salt$hash" string.
 * Uses timingSafeEqual to prevent timing attacks.
 */
export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  let actual: Buffer;
  try {
    actual = (await scryptAsync(pw, salt, KEY_LEN, {
      N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P,
    })) as Buffer;
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/**
 * Creates a new session token, stores it in KV with a 7-day TTL, and returns the token.
 * KV key: "session:<token>", value: JSON { userId, expiresAt }
 */
export async function createSession(env: Env, userId: number): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await env.SESSIONS.put(
    `session:${token}`,
    JSON.stringify({ userId, expiresAt }),
    { expirationTtl: SESSION_TTL_SECONDS }
  );
  return token;
}

/**
 * Resolves a session token to its user record by looking up the token in KV
 * and then fetching the admin_users row. Returns null if the token is missing,
 * expired, or the user no longer exists.
 */
export async function getSessionUser(
  env: Env,
  token: string | undefined
): Promise<{ id: number; email: string; name: string; role: string } | null> {
  if (!token) return null;
  const raw = await env.SESSIONS.get(`session:${token}`);
  if (!raw) return null;

  let parsed: { userId: number; expiresAt: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (new Date(parsed.expiresAt) < new Date()) return null;

  const row = await env.DB.prepare(
    'SELECT id, email, name, role FROM admin_users WHERE id = ?'
  )
    .bind(parsed.userId)
    .first<{ id: number; email: string; name: string | null; role: string }>();

  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name ?? '', role: row.role };
}

/**
 * Hono middleware: requires a valid nwks_session cookie.
 * On success sets c.var.user. On failure returns 401 {ok:false,error:'unauthorized'}.
 */
export function requireAuth(): AppMiddleware {
  return async (c, next) => {
    const token = getCookieValue(c.req.raw.headers.get('Cookie') ?? '', 'nwks_session');
    const user = await getSessionUser(c.env, token);
    if (!user) {
      return c.json({ ok: false, error: 'unauthorized' }, 401);
    }
    c.set('user', user);
    await next();
  };
}

/**
 * Hono middleware: validates ?program= query param (or X-Program header).
 * Accepts 'mens' or 'women'. On success sets c.var.program. On failure returns 400.
 */
export function requireProgram(): AppMiddleware {
  return async (c, next) => {
    const program = c.req.query('program') ?? c.req.header('X-Program');
    if (program !== 'mens' && program !== 'women') {
      return c.json({ ok: false, error: 'program required' }, 400);
    }
    c.set('program', program);
    await next();
  };
}

/** Parses a single named cookie from a raw Cookie header value. */
function getCookieValue(cookieHeader: string, name: string): string | undefined {
  for (const pair of cookieHeader.split(';')) {
    const [k, ...rest] = pair.trim().split('=');
    if (k.trim() === name) return rest.join('=').trim();
  }
  return undefined;
}
