// functions/_api/routes/security.ts — admin security settings.
//
// Passkey enrollment, recovery codes, trusted-device management, the audit log
// view, and admin-assisted 2FA reset (the last rung of the recovery ladder).
//
// Mounted under /api/admin/security, so requireAuth() applies. Note these
// routes deliberately do NOT use requireProgram(): security is per-person, not
// per-program, and forcing a program query param here would be nonsense.

import { Hono } from 'hono';
import type { Env } from '../app';
import { requireAuth } from '../auth';
import type { AppVariables } from '../auth';
import { nowIso } from '../db';
import {
  audit, countUnusedRecoveryCodes, issueRecoveryCodes, revokeTrustedDevices, duoConfigured,
} from '../security';
import {
  startRegistration, finishRegistration, listCredentials, deleteCredential,
} from '../webauthn';

export const securityRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

securityRouter.use('*', requireAuth());

// ── Status ──────────────────────────────────────────────────────────────────

securityRouter.get('/', async (c) => {
  const user = c.get('user');

  const row = await c.env.DB.prepare(
    `SELECT webauthn_enabled, two_factor_required, last_login_at FROM admin_users WHERE id = ?`
  ).bind(user.id).first<{
    webauthn_enabled: number; two_factor_required: number; last_login_at: string | null;
  }>();

  const creds = await listCredentials(c.env, user.id);
  const { results: devices } = await c.env.DB.prepare(
    `SELECT id, label, user_agent, ip, expires_at, created_at, last_seen_at
     FROM trusted_devices WHERE admin_user_id = ? AND expires_at > ?
     ORDER BY created_at DESC`
  ).bind(user.id, nowIso()).all();

  return c.json({
    ok: true,
    two_factor_required: row?.two_factor_required === 1,
    webauthn_enabled: row?.webauthn_enabled === 1,
    last_login_at: row?.last_login_at ?? null,
    duo_available: duoConfigured(c.env),
    passkeys: creds.map((cred) => ({
      id: cred.id, label: cred.device_label, credential_id: cred.credential_id,
    })),
    trusted_devices: devices,
    recovery_codes_remaining: await countUnusedRecoveryCodes(c.env, user.id),
  });
});

// ── Passkey enrollment ──────────────────────────────────────────────────────

securityRouter.post('/passkey/options', async (c) => {
  const user = c.get('user');
  const options = await startRegistration(c.env, c.req.raw, user);
  return c.json({ ok: true, options });
});

securityRouter.post('/passkey/verify', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ response?: unknown; label?: string }>().catch(() => ({}));

  const result = await finishRegistration(
    c.env, c.req.raw, user.id, body.response, body.label ?? 'Passkey'
  );

  if (!result.ok) {
    await audit(c.env, {
      adminUserId: user.id, adminEmail: user.email,
      action: 'passkey.enroll_failed', detail: { error: result.error }, req: c.req.raw,
    });
    return c.json({ ok: false, error: result.error }, 400);
  }

  await audit(c.env, {
    adminUserId: user.id, adminEmail: user.email,
    action: 'passkey.enrolled', detail: { label: body.label }, req: c.req.raw,
  });

  // Recovery codes are issued on FIRST enrollment, never silently regenerated
  // afterwards — regenerating would invalidate codes the user already printed.
  const existing = await countUnusedRecoveryCodes(c.env, user.id);
  const recoveryCodes = existing === 0 ? await issueRecoveryCodes(c.env, user.id) : null;

  return c.json({ ok: true, recovery_codes: recoveryCodes });
});

securityRouter.delete('/passkey/:id', async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ ok: false, error: 'invalid id' }, 400);

  const removed = await deleteCredential(c.env, user.id, id);
  if (!removed) return c.json({ ok: false, error: 'not found' }, 404);

  await audit(c.env, {
    adminUserId: user.id, adminEmail: user.email,
    action: 'passkey.removed', targetType: 'webauthn_credential', targetId: String(id),
    req: c.req.raw,
  });
  return c.json({ ok: true });
});

// ── Recovery codes ──────────────────────────────────────────────────────────

securityRouter.post('/recovery-codes', async (c) => {
  const user = c.get('user');
  const codes = await issueRecoveryCodes(c.env, user.id);
  await audit(c.env, {
    adminUserId: user.id, adminEmail: user.email, action: 'recovery_codes.regenerated', req: c.req.raw,
  });
  // Shown exactly once. There is no endpoint to read them back — only the hash
  // is stored, so even we cannot.
  return c.json({ ok: true, recovery_codes: codes });
});

// ── Trusted devices ─────────────────────────────────────────────────────────

securityRouter.post('/trusted-devices/revoke', async (c) => {
  const user = c.get('user');
  await revokeTrustedDevices(c.env, user.id);
  await audit(c.env, {
    adminUserId: user.id, adminEmail: user.email, action: 'trusted_devices.revoked', req: c.req.raw,
  });
  return c.json({ ok: true });
});

// ── Admin-assisted reset — the last rung of the recovery ladder ─────────────

securityRouter.get('/admins', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, email, name, webauthn_enabled, two_factor_required, locked_until, last_login_at
     FROM admin_users ORDER BY email`
  ).all();
  return c.json({ ok: true, admins: results });
});

/**
 * Clears another admin's 2FA enrollment and unlocks them. With a four-person
 * team this is the realistic backstop when someone loses their phone AND their
 * recovery codes. It is logged with BOTH user ids — that is what keeps it from
 * being a quiet backdoor.
 */
securityRouter.post('/reset-2fa/:userId', async (c) => {
  const actor = c.get('user');
  const targetId = Number(c.req.param('userId'));
  if (!Number.isInteger(targetId)) return c.json({ ok: false, error: 'invalid id' }, 400);

  if (targetId === actor.id) {
    // Self-service reset would let anyone with a live session strip their own
    // second factor — which is exactly what a session thief would do.
    return c.json({ ok: false, error: 'Use your own security settings to manage your passkeys.' }, 400);
  }

  const target = await c.env.DB.prepare(`SELECT id, email FROM admin_users WHERE id = ?`)
    .bind(targetId).first<{ id: number; email: string }>();
  if (!target) return c.json({ ok: false, error: 'not found' }, 404);

  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM webauthn_credentials WHERE admin_user_id = ?`).bind(targetId),
    c.env.DB.prepare(`DELETE FROM auth_codes WHERE admin_user_id = ?`).bind(targetId),
    c.env.DB.prepare(`DELETE FROM trusted_devices WHERE admin_user_id = ?`).bind(targetId),
    c.env.DB.prepare(
      `UPDATE admin_users
       SET webauthn_enabled = 0, two_factor_required = 0,
           failed_login_count = 0, locked_until = NULL
       WHERE id = ?`
    ).bind(targetId),
  ]);

  await audit(c.env, {
    adminUserId: actor.id, adminEmail: actor.email,
    action: 'admin.reset_2fa', targetType: 'admin_user', targetId: String(targetId),
    detail: { target_email: target.email }, req: c.req.raw,
  });

  return c.json({ ok: true, reset_for: target.email });
});

// ── Audit log ───────────────────────────────────────────────────────────────

securityRouter.get('/audit', async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
  const perPage = 50;

  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_log`)
    .first<{ n: number }>();
  const { results } = await c.env.DB.prepare(
    `SELECT id, admin_email, action, target_type, target_id, detail, ip, created_at
     FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?`
  ).bind(perPage, (page - 1) * perPage).all();

  return c.json({ ok: true, rows: results, total: total?.n ?? 0, page, per_page: perPage });
});
