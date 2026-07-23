import { applyD1Migrations } from 'cloudflare:test';
import { inject } from 'vitest';
import type { D1Migration } from '@cloudflare/vitest-pool-workers/config';

/**
 * Applies every migration SQL file (pre-read by globalSetup on the Node side)
 * against the provided D1 database.
 * Call this in beforeEach() to get an isolated, migrated D1 for each test.
 */
export async function applyMigrations(env: { DB: D1Database }): Promise<void> {
  const migrations = inject('migrations') as D1Migration[];
  await applyD1Migrations(env.DB, migrations);
}
