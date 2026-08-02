// functions/_api/routes/team.ts
// Who has access to the admin — and how new people get it.
//
// Two roles only: 'super_admin' manages people, 'admin' does everything else.
// Every endpoint here is super-admin-only, enforced SERVER-side: hiding the tab
// in the UI is presentation, not security.
//
// Invitation flow:
//   super admin invites  ->  emailed a single-use link  ->  invitee sets a
//   password  ->  handed into the existing first-run 2FA setup
//
// The invitee is never created until they accept, so a mistyped address leaves
// no half-account behind.

import { Hono } from 'hono';
import type { Env } from '../app';
import { requireAuth, hashPassword } from '../auth';
import type { AppVariables } from '../auth';
import { nowIso } from '../db';
import { sendEmail } from '../email';
import { audit, randomToken, sha256Hex, emailDeliverable } from '../security';
import { inviteEmail } from '../emails/inviteEmail';

export const teamRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();
export const invitePublicRouter = new Hono<{ Bindings: Env }>();

const INVITE_TTL_DAYS = 7;
const MIN_PASSWORD = 10;

/** Where the accept link points. Same origin as the request, so dev and prod both work. */
function acceptUrl(req: Request, token: string): string {
  return `${new URL(req.url).origin}/admin/#/invite/${token}`;
}

function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// ── Guard ───────────────────────────────────────────────────────────────────

teamRouter.use('*', requireAuth());

/**
 * Super-admin gate. Returns 403 (not 404) because the caller IS authenticated —
 * they simply lack the role, and pretending the route does not exist would make
 * a genuine permission problem look like a bug.
 */
teamRouter.use('*', async (c, next) => {
  const user = c.get('user');
  if (user.role !== 'super_admin') {
    await audit(c.env, {
      adminUserId: user.id, adminEmail: user.email,
      action: 'team.forbidden', detail: { path: new URL(c.req.url).pathname }, req: c.req.raw,
    });
    return c.json({ ok: false, error: 'Only a super admin can manage the team.' }, 403);
  }
  await next();
});

// ── List ────────────────────────────────────────────────────────────────────

teamRouter.get('/', async (c) => {
  const { results: admins } = await c.env.DB.prepare(
    `SELECT id, email, name, role, webauthn_enabled, two_factor_required,
            locked_until, last_login_at, created_at
     FROM admin_users ORDER BY role DESC, email`
  ).all();

  const { results: invites } = await c.env.DB.prepare(
    `SELECT id, email, role, invited_by_email, expires_at, created_at
     FROM admin_invites
     WHERE accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?
     ORDER BY created_at DESC`
  ).bind(nowIso()).all();

  return c.json({ ok: true, admins, invites });
});

// ── Invite ──────────────────────────────────────────────────────────────────

teamRouter.post('/invite', async (c) => {
  const actor = c.get('user');
  const body = await c.req.json<{ email?: string; role?: string }>().catch(() => ({}));

  const email = (body.email ?? '').trim().toLowerCase();
  const role = body.role === 'super_admin' ? 'super_admin' : 'admin';

  if (!isEmail(email)) return c.json({ ok: false, error: 'Enter a valid email address.' }, 400);

  const existing = await c.env.DB.prepare(`SELECT id FROM admin_users WHERE email = ?`)
    .bind(email).first<{ id: number }>();
  if (existing) return c.json({ ok: false, error: 'That person already has an account.' }, 409);

  const token = randomToken(32);
  const expires = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000).toISOString();

  try {
    await c.env.DB.prepare(
      `INSERT INTO admin_invites
         (email, role, token_hash, invited_by, invited_by_email, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(email, role, await sha256Hex(token), actor.id, actor.email, expires, nowIso()).run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE')) {
      return c.json({ ok: false, error: 'There is already a pending invite for that address.' }, 409);
    }
    throw err;
  }

  const url = acceptUrl(c.req.raw, token);
  const canEmail = emailDeliverable(c.env);

  if (canEmail) {
    const mail = inviteEmail({
      inviterName: actor.name || actor.email,
      acceptUrl: url,
      expiresInDays: INVITE_TTL_DAYS,
    });
    await sendEmail(c.env, {
      to: email, subject: mail.subject, html: mail.html, text: mail.text,
      type: 'transactional', templateKey: 'admin_invite',
    });
  }

  await audit(c.env, {
    adminUserId: actor.id, adminEmail: actor.email,
    action: 'team.invited', targetType: 'invite', targetId: email,
    detail: { role, emailed: canEmail }, req: c.req.raw,
  });

  // When email cannot be delivered, hand the link back so it can be passed on
  // by hand. Silently creating an invite nobody receives is the worst outcome.
  return c.json({ ok: true, emailed: canEmail, accept_url: canEmail ? undefined : url }, 201);
});

teamRouter.post('/invite/:id/revoke', async (c) => {
  const actor = c.get('user');
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ ok: false, error: 'invalid id' }, 400);

  const row = await c.env.DB.prepare(
    `SELECT email FROM admin_invites WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL`
  ).bind(id).first<{ email: string }>();
  if (!row) return c.json({ ok: false, error: 'not found' }, 404);

  await c.env.DB.prepare(`UPDATE admin_invites SET revoked_at = ? WHERE id = ?`)
    .bind(nowIso(), id).run();
  await audit(c.env, {
    adminUserId: actor.id, adminEmail: actor.email,
    action: 'team.invite_revoked', targetType: 'invite', targetId: row.email, req: c.req.raw,
  });
  return c.json({ ok: true });
});

// ── Remove an admin ─────────────────────────────────────────────────────────

teamRouter.delete('/:userId', async (c) => {
  const actor = c.get('user');
  const targetId = Number(c.req.param('userId'));
  if (!Number.isInteger(targetId)) return c.json({ ok: false, error: 'invalid id' }, 400);

  if (targetId === actor.id) {
    // Removing yourself is how a one-super-admin site loses its last key.
    return c.json({ ok: false, error: 'You cannot remove your own account.' }, 400);
  }

  const target = await c.env.DB.prepare(`SELECT id, email, role FROM admin_users WHERE id = ?`)
    .bind(targetId).first<{ id: number; email: string; role: string }>();
  if (!target) return c.json({ ok: false, error: 'not found' }, 404);

  if (target.role === 'super_admin') {
    const { results } = await c.env.DB.prepare(
      `SELECT id FROM admin_users WHERE role = 'super_admin'`
    ).all<{ id: number }>();
    if (results.length <= 1) {
      // No super admins left means nobody can ever grant access again.
      return c.json({ ok: false, error: 'That is the last super admin. Promote someone else first.' }, 400);
    }
  }

  // Their credentials go with them; the audit trail does not (admin_email is
  // denormalised on audit_log precisely so it outlives the account).
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM webauthn_credentials WHERE admin_user_id = ?`).bind(targetId),
    c.env.DB.prepare(`DELETE FROM auth_codes WHERE admin_user_id = ?`).bind(targetId),
    c.env.DB.prepare(`DELETE FROM trusted_devices WHERE admin_user_id = ?`).bind(targetId),
    c.env.DB.prepare(`DELETE FROM admin_users WHERE id = ?`).bind(targetId),
  ]);

  await audit(c.env, {
    adminUserId: actor.id, adminEmail: actor.email,
    action: 'team.removed', targetType: 'admin_user', targetId: String(targetId),
    detail: { email: target.email, role: target.role }, req: c.req.raw,
  });
  return c.json({ ok: true, removed: target.email });
});

// ── Public: accepting an invite ─────────────────────────────────────────────

/**
 * Looks up an invite by raw token, WITHOUT filtering on state.
 *
 * The caller decides what a used/revoked/expired invite means, so someone
 * clicking their link a second time can be told "already used" instead of a
 * bare "not found". The token is 32 random bytes, so acknowledging that a
 * particular one existed leaks nothing an attacker could act on.
 */
async function findInvite(env: Env, token: string) {
  return env.DB.prepare(
    `SELECT id, email, role, invited_by_email, expires_at, accepted_at, revoked_at
     FROM admin_invites WHERE token_hash = ?`
  ).bind(await sha256Hex(token)).first<{
    id: number; email: string; role: string; invited_by_email: string | null;
    expires_at: string; accepted_at: string | null; revoked_at: string | null;
  }>();
}

/** null when the invite is missing, used, revoked or expired. */
type InviteState = 'ok' | 'missing' | 'used' | 'revoked' | 'expired';
function inviteState(inv: Awaited<ReturnType<typeof findInvite>>): InviteState {
  if (!inv) return 'missing';
  if (inv.accepted_at) return 'used';
  if (inv.revoked_at) return 'revoked';
  if (new Date(inv.expires_at) < new Date()) return 'expired';
  return 'ok';
}

const INVITE_MESSAGE: Record<Exclude<InviteState, 'ok'>, string> = {
  missing: 'This invitation link is not valid.',
  used: 'This invitation has already been used. Sign in instead, or ask for a new one.',
  revoked: 'This invitation was cancelled. Ask for a new one.',
  expired: 'This invitation has expired. Ask for a new one.',
};

invitePublicRouter.get('/:token', async (c) => {
  const invite = await findInvite(c.env, c.req.param('token'));
  const state = inviteState(invite);
  if (state !== 'ok') {
    return c.json({ ok: false, error: INVITE_MESSAGE[state], state }, state === 'used' ? 409 : 404);
  }
  return c.json({
    ok: true, email: invite.email, role: invite.role, invited_by: invite.invited_by_email,
  });
});

invitePublicRouter.post('/:token/accept', async (c) => {
  const token = c.req.param('token');
  const body = await c.req.json<{ password?: string; name?: string }>().catch(() => ({}));
  const password = body.password ?? '';

  if (password.length < MIN_PASSWORD) {
    return c.json({ ok: false, error: `Use at least ${MIN_PASSWORD} characters.` }, 400);
  }

  const invite = await findInvite(c.env, token);
  const state = inviteState(invite);
  if (state !== 'ok') {
    return c.json({ ok: false, error: INVITE_MESSAGE[state], state }, state === 'used' ? 409 : 404);
  }

  // Consume the invite FIRST, conditioned on it still being unaccepted. If two
  // requests race on the same link, only one changes a row — so only one
  // account is ever created.
  const claim = await c.env.DB.prepare(
    `UPDATE admin_invites SET accepted_at = ?
     WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL`
  ).bind(nowIso(), invite!.id).run();

  if (!claim.meta.changes) {
    // Lost a race with a concurrent accept on the same link.
    return c.json({ ok: false, error: INVITE_MESSAGE.used, state: 'used' }, 409);
  }

  const hash = await hashPassword(password);
  await c.env.DB.prepare(
    `INSERT INTO admin_users (email, name, password_hash, role, created_at, password_changed_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    invite!.email, (body.name ?? '').trim() || null, hash, invite!.role, nowIso(), nowIso()
  ).run();

  await audit(c.env, {
    adminEmail: invite!.email, action: 'team.invite_accepted',
    detail: { role: invite!.role, invited_by: invite!.invited_by_email }, req: c.req.raw,
  });

  // No session is issued. They sign in normally, which routes them straight
  // into first-run 2FA setup — the same path every other account takes, rather
  // than a second half-trusted way in.
  return c.json({ ok: true, email: invite!.email });
});
