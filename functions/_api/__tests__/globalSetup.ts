import { readD1Migrations } from '@cloudflare/vitest-pool-workers/config';
import { join } from 'node:path';

export async function setup(project: { provide: (key: string, value: unknown) => void }) {
  const migrationsDir = join(process.cwd(), 'db', 'migrations');
  const migrations = await readD1Migrations(migrationsDir);
  project.provide('migrations', migrations);
}
