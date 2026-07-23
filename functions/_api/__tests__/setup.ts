import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:test';
import { inject } from 'vitest';
import type { D1Migration } from '@cloudflare/vitest-pool-workers/config';
import { hashPassword } from '../auth';
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
