import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { applyMigrations, seedAdmin } from './setup';
import { nowIso } from '../db';

const db = () => (env as unknown as { DB: D1Database }).DB;

describe('admin 2FA + hardening schema', () => {
  beforeEach(async () => {
    await applyMigrations(env as unknown as { DB: D1Database });
  });

  it.each([
    'webauthn_credentials',
    'auth_codes',
    'trusted_devices',
    'login_attempts',
    'audit_log',
  ])('table "%s" exists', async (table) => {
    const row = await db()
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .bind(table)
      .first<{ name: string }>();
    expect(row?.name).toBe(table);
  });

  it('admin_users gains the 2FA and lockout columns, defaulted OFF', async () => {
    const { id } = await seedAdmin();
    const row = await db()
      .prepare(
        `SELECT webauthn_enabled, two_factor_required, failed_login_count, locked_until
         FROM admin_users WHERE id = ?`
      )
      .bind(id)
      .first<Record<string, unknown>>();

    // Enforcement must default off — a deploy cannot lock the existing admin out.
    expect(row).toMatchObject({
      webauthn_enabled: 0,
      two_factor_required: 0,
      failed_login_count: 0,
      locked_until: null,
    });
  });

  it('stores a passkey credential and enforces one row per credential_id', async () => {
    const { id } = await seedAdmin();
    const insert = () =>
      db()
        .prepare(
          `INSERT INTO webauthn_credentials
             (admin_user_id, credential_id, public_key, counter, transports, device_label, created_at)
           VALUES (?, 'cred-abc', X'0102030405', 0, '["internal"]', 'Tyler iPhone', ?)`
        )
        .bind(id, nowIso())
        .run();

    await insert();
    // A credential id is globally unique; the same passkey must never be
    // registerable twice (to the same user or a different one).
    await expect(insert()).rejects.toThrow(/UNIQUE/i);
  });

  it('rejects an auth code of an unknown kind', async () => {
    const { id } = await seedAdmin();
    await expect(
      db()
        .prepare(
          `INSERT INTO auth_codes (admin_user_id, kind, code_hash, created_at)
           VALUES (?, 'sms', 'hash', ?)`
        )
        .bind(id, nowIso())
        .run()
    ).rejects.toThrow(/CHECK/i);
  });

  it.each(['email_otp', 'recovery'])('accepts auth code kind "%s"', async (kind) => {
    const { id } = await seedAdmin();
    await expect(
      db()
        .prepare(
          `INSERT INTO auth_codes (admin_user_id, kind, code_hash, created_at)
           VALUES (?, ?, 'hash-of-code', ?)`
        )
        .bind(id, kind, nowIso())
        .run()
    ).resolves.toBeTruthy();
  });

  it('keeps an audit row after its admin user is deleted', async () => {
    const { id, email } = await seedAdmin();
    await db()
      .prepare(
        `INSERT INTO audit_log (admin_user_id, admin_email, action, created_at)
         VALUES (?, ?, 'login.success', ?)`
      )
      .bind(id, email, nowIso())
      .run();

    await db().prepare(`DELETE FROM admin_users WHERE id = ?`).bind(id).run();

    // The whole point of an audit trail is that it outlives the account. The
    // email is denormalised so the row still says WHO, not just a dangling id.
    const row = await db()
      .prepare(`SELECT admin_email, action FROM audit_log`)
      .first<{ admin_email: string; action: string }>();
    expect(row).toMatchObject({ admin_email: email, action: 'login.success' });
  });

  it('records login attempts for rate limiting', async () => {
    await db()
      .prepare(
        `INSERT INTO login_attempts (email, ip, outcome, created_at)
         VALUES ('a@b.com', '1.2.3.4', 'bad_password', ?)`
      )
      .bind(nowIso())
      .run();
    const row = await db()
      .prepare(`SELECT outcome FROM login_attempts`)
      .first<{ outcome: string }>();
    expect(row?.outcome).toBe('bad_password');
  });
});
