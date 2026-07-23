// tests/e2e/global-setup.ts — Playwright globalSetup
// Ensures local D1 has a current men's event seeded and clears KV rate-limit state
// so repeated test runs don't hit the 3-per-10min limit.

import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '/Users/tylerpreisser/Desktop/nwks-encounter-site';

function wrangler(cmd: string): void {
  execSync(`npx wrangler ${cmd}`, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function d1(sql: string): void {
  wrangler(`d1 execute nwks-encounter --local --command ${JSON.stringify(sql)}`);
}

export default async function globalSetup(): Promise<void> {
  // 1. Clear local KV state (rate-limit counters live here).
  //    Wrangler recreates the directory on next startup.
  const kvDir = join(ROOT, '.wrangler', 'state', 'v3', 'kv', 'REPLACE_ME');
  if (existsSync(kvDir)) {
    rmSync(kvDir, { recursive: true, force: true });
    console.log('[e2e setup] Cleared local KV state (rate-limit reset).');
  }

  // 2. Ensure at least one current men's event exists in the local D1.
  //    Use simple single-quoted strings; no JSON escaping needed in the shell path.
  const locations = '[Hays,Norton,Plainville,Hoxie,Colby,Gove,Sterling,Wakeeney]';
  d1(`INSERT OR IGNORE INTO events (program,year,title,start_date,end_date,launch_locations,attendee_registration_open,server_registration_open,is_current,created_at,updated_at) VALUES ('mens',2026,'Mens Encounter 2026','2026-09-01','2026-09-03','${locations}',1,1,1,datetime('now'),datetime('now'))`);

  // Ensure is_current + open (idempotent)
  d1(`UPDATE events SET is_current=1, attendee_registration_open=1 WHERE program='mens' AND year=2026`);

  console.log('[e2e setup] Local D1 event seed confirmed.');
}
