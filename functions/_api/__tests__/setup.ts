import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:test';
import { inject } from 'vitest';
import type { D1Migration } from '@cloudflare/vitest-pool-workers/config';
import { hashPassword } from '../auth';
import { SEED_SQL } from './seeds.generated';
import { nowIso } from '../db';

/**
 * Applies every migration SQL file (pre-read by globalSetup on the Node side)
 * against the provided D1 database.
 * Call this in beforeEach() to get an isolated, migrated D1 for each test.
 */
export async function applyMigrations(env: { DB: D1Database }): Promise<void> {
  const migrations = inject('migrations') as D1Migration[];
  await applyD1Migrations(env.DB, migrations);
}

/**
 * Applies db/seeds/*.sql on top of the migrations.
 *
 * Email bodies live in seeds rather than migrations because the accumulated
 * migration payload was breaking the Workers test pool outright; keeping the
 * same SQL running here means the split doesn't cost test coverage.
 */
export async function applySeeds(env: { DB: D1Database }): Promise<void> {
  for (const stmt of SEED_SQL) {
    await env.DB.prepare(stmt).run();
  }
}

/** Default credentials used by seedAdmin when no overrides are provided. */
const DEFAULT_ADMIN = {
  email: 'admin@nwksencounter.com',
  name: 'Test Admin',
  password: 'TestPass1!',
};

/**
 * Inserts an admin_users row with a hashed password.
 * Call after applyMigrations. Returns { id, email, password }.
 */
export async function seedAdmin(
  opts: { email?: string; name?: string; password?: string } = {}
): Promise<{ id: number; email: string; password: string }> {
  const email = opts.email ?? DEFAULT_ADMIN.email;
  const name = opts.name ?? DEFAULT_ADMIN.name;
  const password = opts.password ?? DEFAULT_ADMIN.password;
  const hash = await hashPassword(password);
  const ts = nowIso();
  const db = (env as unknown as { DB: D1Database }).DB;
  const { meta } = await db
    .prepare(
      `INSERT INTO admin_users (email, name, password_hash, role, created_at)
       VALUES (?, ?, ?, 'admin', ?)`
    )
    .bind(email, name, hash, ts)
    .run();
  return { id: meta.last_row_id as number, email, password };
}

/**
 * Marks a seeded admin as already having a passkey.
 *
 * Since the first-run setup flow landed, a password alone no longer yields a
 * session — every login without a passkey is routed into enrolment. Tests that
 * only need "an authenticated admin" (i.e. nearly all of them) call this so the
 * account is past setup, rather than re-driving the whole flow.
 */
export async function markEnrolled(adminUserId: number): Promise<void> {
  const db = (env as unknown as { DB: D1Database }).DB;
  await db
    .prepare(
      `UPDATE admin_users SET webauthn_enabled = 1, two_factor_required = 1 WHERE id = ?`
    )
    .bind(adminUserId)
    .run();
}

/**
 * Logs in and returns a Cookie header carrying a real session.
 *
 * Requires the account to be past setup (see markEnrolled). Bypasses the second
 * factor with a trusted-device token so tests do not need an authenticator.
 */
export async function authCookie(
  app: { fetch: (r: Request, e: unknown) => Promise<Response> },
  adminUserId: number,
  email = DEFAULT_ADMIN.email,
  password = DEFAULT_ADMIN.password
): Promise<string> {
  await markEnrolled(adminUserId);
  const { issueTrustedDevice } = await import('../security');
  const testEnv = env as unknown as never;
  const trusted = await issueTrustedDevice(
    testEnv,
    adminUserId,
    new Request('http://localhost/', { headers: { 'CF-Connecting-IP': '127.0.0.1' } })
  );

  const res = await app.fetch(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `nwks_trusted=${trusted}` },
      body: JSON.stringify({ email, password }),
    }),
    testEnv
  );
  const token = (res.headers.get('Set-Cookie') ?? '').match(/nwks_session=([^;]+)/)?.[1] ?? '';
  return `nwks_session=${token}`;
}
