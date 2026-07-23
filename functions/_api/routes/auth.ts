// functions/_api/routes/auth.ts — login / logout / me endpoints

import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Env } from '../app';
import { verifyPassword, createSession, getSessionUser } from '../auth';
import { nowIso } from '../db';

export const authRouter = new Hono<{ Bindings: Env }>();

authRouter.post('/login', async (c) => {
  let body: { email?: string; password?: string } = {};
  try {
    body = await c.req.json<{ email?: string; password?: string }>();
  } catch {
    // malformed JSON — treat as empty
  }
  const { email, password } = body;
  if (!email || !password) {
    return c.json({ ok: false, error: 'email and password required' }, 400);
  }

  const row = await c.env.DB.prepare(
    `SELECT id, email, name, role, password_hash FROM admin_users WHERE email = ?`
  )
    .bind(email.toLowerCase().trim())
    .first<{
      id: number;
      email: string;
      name: string | null;
      role: string;
      password_hash: string;
    }>();

  if (!row) {
    return c.json({ ok: false, error: 'unauthorized' }, 401);
  }

  const valid = await verifyPassword(password, row.password_hash);
  if (!valid) {
    return c.json({ ok: false, error: 'unauthorized' }, 401);
  }

  const token = await createSession(c.env, row.id);

  await c.env.DB.prepare(
    `UPDATE admin_users SET last_login_at = ? WHERE id = ?`
  )
    .bind(nowIso(), row.id)
    .run();

  setCookie(c, 'nwks_session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return c.json({
    ok: true,
    user: { id: row.id, email: row.email, name: row.name ?? '', role: row.role },
  });
});

authRouter.post('/logout', async (c) => {
  const token = getCookie(c, 'nwks_session');
  if (token) {
    // Best-effort KV delete — ignore errors
    try {
      await c.env.SESSIONS.delete(`session:${token}`);
    } catch {
      // ignore
    }
  }
  deleteCookie(c, 'nwks_session', { path: '/' });
  return c.json({ ok: true });
});

authRouter.get('/me', async (c) => {
  const token = getCookie(c, 'nwks_session');
  const user = await getSessionUser(c.env, token);
  if (!user) {
    return c.json({ ok: false, error: 'unauthorized' }, 401);
  }
  return c.json({ ok: true, user });
});
