#!/usr/bin/env node
/**
 * seed-admin.mjs — creates an admin_users row in the local (or remote) D1.
 *
 * Usage:
 *   node scripts/seed-admin.mjs --email admin@example.com --password s3cret --name "Admin Name"
 *   node scripts/seed-admin.mjs --email admin@example.com --password s3cret --remote
 *
 * Flags:
 *   --local    (default) apply to local D1 via wrangler --local
 *   --remote   apply to the remote (production) D1 — use with care
 *
 * Password hash format matches functions/_api/auth.ts hashPassword:
 *   "scrypt$<saltHex>$<hashHex>"  (N=16384, r=8, p=1, keylen=64)
 */

import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { execSync } from 'node:child_process';

const scryptAsync = promisify(scrypt);

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN  = 64;

/** Replicates auth.ts hashPassword exactly. */
async function hashPassword(pw) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(pw, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/** Replicates auth.ts verifyPassword for local self-check. */
async function verifyPassword(pw, stored) {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, saltHex, hashHex] = parts;
  const salt     = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  let actual;
  try {
    actual = await scryptAsync(pw, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      args[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    }
  }
  return args;
}

const args     = parseArgs(process.argv);
const email    = args.email;
const password = args.password;
const name     = args.name ?? 'Admin';
const remote   = args.remote === 'true';

if (!email || !password) {
  console.error('Usage: node scripts/seed-admin.mjs --email <email> --password <pass> [--name <name>] [--remote]');
  process.exit(1);
}

console.log(`[seed-admin] Hashing password...`);
const hash = await hashPassword(password);

// Self-verify that the hash round-trips (catches any implementation drift).
const ok = await verifyPassword(password, hash);
if (!ok) {
  console.error('[seed-admin] FATAL: hash self-check failed — hash does not verify against plain password.');
  process.exit(1);
}
console.log('[seed-admin] Hash self-check passed.');

const now = new Date().toISOString();

// Escape single quotes inside values for SQL safety.
const safeEmail = email.replace(/'/g, "''");
const safeName  = name.replace(/'/g, "''");
const safeHash  = hash.replace(/'/g, "''");

const sql = `INSERT INTO admin_users (email, name, password_hash, role, created_at) VALUES ('${safeEmail}', '${safeName}', '${safeHash}', 'admin', '${now}');`;

const dbFlag = remote ? '--remote' : '--local';
const cmd = `npx wrangler d1 execute nwks-encounter ${dbFlag} --command "${sql.replace(/"/g, '\\"')}"`;

console.log(`[seed-admin] Creating admin user: ${email} (${name})...`);
try {
  execSync(cmd, { stdio: 'inherit' });
  console.log(`[seed-admin] Done. Admin user created: ${email}`);
} catch {
  console.error('[seed-admin] Failed to insert row. Check wrangler output above.');
  process.exit(1);
}
