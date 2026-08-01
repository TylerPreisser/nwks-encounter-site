#!/usr/bin/env node
/**
 * seed-templates.mjs — applies db/seeds/*.sql to D1.
 *
 * Email bodies are content, not schema, so they live in seeds rather than
 * migrations (see the header of db/seeds/automated_email_templates.sql for why
 * that separation is load-bearing, not cosmetic).
 *
 * Every seed is written INSERT OR REPLACE, so re-running is safe.
 *
 * Usage:
 *   node scripts/seed-templates.mjs            # local D1
 *   node scripts/seed-templates.mjs --remote   # production D1
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const remote = process.argv.includes('--remote');
const dir = join(process.cwd(), 'db', 'seeds');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

if (!files.length) {
  console.error('No seed files found in db/seeds/');
  process.exit(1);
}

for (const file of files) {
  process.stdout.write(`[seed] ${file} -> ${remote ? 'REMOTE' : 'local'} ... `);
  execFileSync('npx', [
    'wrangler', 'd1', 'execute', 'nwks-encounter',
    remote ? '--remote' : '--local',
    `--file=${join(dir, file)}`,
  ], { stdio: 'ignore' });
  console.log('ok');
}
console.log(`[seed] ${files.length} seed file(s) applied.`);
