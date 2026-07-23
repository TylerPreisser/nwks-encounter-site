import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import { applyMigrations } from './setup';
import {
  hashPassword, verifyPassword,
  createSession, getSessionUser,
  requireAuth, requireProgram,
  type AppVariables,
} from '../auth';
import { nowIso } from '../db';
import type { Env } from '../app';

const testEnv = () => env as unknown as Env;

describe('auth.ts', () => {
  beforeEach(async () => {
    await applyMigrations(env as any);
  });

  describe('hashPassword / verifyPassword', () => {
    it('round-trips correctly', async () => {
      const hash = await hashPassword('correct-horse-battery-staple');
      expect(hash).toMatch(/^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
      expect(await verifyPassword('correct-horse-battery-staple', hash)).toBe(true);
    });

    it('returns false for a wrong password', async () => {
      const hash = await hashPassword('rightpassword');
      expect(await verifyPassword('wrongpassword', hash)).toBe(false);
    });

    it('produces a different hash each call (different salts)', async () => {
      const h1 = await hashPassword('same');
      const h2 = await hashPassword('same');
      expect(h1).not.toBe(h2);
    });

    it('returns false for a malformed stored value', async () => {
      expect(await verifyPassword('anything', 'notahash')).toBe(false);
      expect(await verifyPassword('anything', '')).toBe(false);
    });
  });

  describe('createSession / getSessionUser', () => {
    async function insertAdmin(email: string): Promise<number> {
      const ts = nowIso();
      const hash = await hashPassword('testpass');
      const { meta } = await (env as any).DB
        .prepare(
          `INSERT INTO admin_users (email, password_hash, role, created_at)
           VALUES (?, ?, 'admin', ?)`
        )
        .bind(email, hash, ts)
        .run();
      return meta.last_row_id as number;
    }

    it('creates a token and resolves it back to the user', async () => {
      const userId = await insertAdmin('admin@example.com');
      const token = await createSession(testEnv(), userId);
      expect(typeof token).toBe('string');
      expect(token.length).toBe(64); // 32 bytes hex

      const user = await getSessionUser(testEnv(), token);
      expect(user).not.toBeNull();
      expect(user!.id).toBe(userId);
      expect(user!.email).toBe('admin@example.com');
      expect(user!.role).toBe('admin');
    });

    it('returns null for an unknown token', async () => {
      const user = await getSessionUser(testEnv(), 'not-a-real-token');
      expect(user).toBeNull();
    });

    it('returns null for undefined token', async () => {
      const user = await getSessionUser(testEnv(), undefined);
      expect(user).toBeNull();
    });
  });

  describe('requireAuth middleware', () => {
    it('returns 401 when no cookie is present', async () => {
      const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();
      app.use('/protected', requireAuth());
      app.get('/protected', (c) => c.json({ ok: true }));

      const res = await app.fetch(new Request('http://localhost/protected'), testEnv());
      expect(res.status).toBe(401);
      const body = await res.json() as any;
      expect(body.ok).toBe(false);
      expect(body.error).toBe('unauthorized');
    });

    it('passes through and sets user when a valid session cookie is present', async () => {
      const ts = nowIso();
      const hash = await hashPassword('pass');
      const { meta } = await (env as any).DB
        .prepare(`INSERT INTO admin_users (email, password_hash, role, created_at) VALUES (?, ?, 'admin', ?)`)
        .bind('cookie@example.com', hash, ts)
        .run();
      const userId = meta.last_row_id as number;
      const token = await createSession(testEnv(), userId);

      const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();
      app.use('/protected', requireAuth());
      app.get('/protected', (c) => {
        const user = c.get('user');
        return c.json({ ok: true, email: user.email });
      });

      const res = await app.fetch(
        new Request('http://localhost/protected', {
          headers: { Cookie: `nwks_session=${token}` },
        }),
        testEnv(),
      );
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.ok).toBe(true);
      expect(body.email).toBe('cookie@example.com');
    });
  });

  describe('requireProgram middleware', () => {
    it('returns 400 when program is missing', async () => {
      const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();
      app.use('*', requireProgram());
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.fetch(new Request('http://localhost/test'), testEnv());
      expect(res.status).toBe(400);
      const body = await res.json() as any;
      expect(body.error).toBe('program required');
    });

    it('returns 400 for an invalid program value', async () => {
      const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();
      app.use('*', requireProgram());
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.fetch(
        new Request('http://localhost/test?program=other'),
        testEnv(),
      );
      expect(res.status).toBe(400);
    });

    it('passes through for a valid program "mens"', async () => {
      const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();
      app.use('*', requireProgram());
      app.get('/test', (c) => c.json({ ok: true, program: c.get('program') }));

      const res = await app.fetch(
        new Request('http://localhost/test?program=mens'),
        testEnv(),
      );
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.program).toBe('mens');
    });

    it('passes through for a valid program "women"', async () => {
      const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();
      app.use('*', requireProgram());
      app.get('/test', (c) => c.json({ ok: true, program: c.get('program') }));

      const res = await app.fetch(
        new Request('http://localhost/test?program=women'),
        testEnv(),
      );
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.program).toBe('women');
    });

    it('sets program via X-Program header when query param is absent', async () => {
      const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();
      app.use('*', requireProgram());
      app.get('/test', (c) => c.json({ ok: true, program: c.get('program') }));

      const res = await app.fetch(
        new Request('http://localhost/test', { headers: { 'X-Program': 'womens' } }),
        testEnv(),
      );
      // 'womens' is not a valid value — expect 400
      expect(res.status).toBe(400);

      const res2 = await app.fetch(
        new Request('http://localhost/test', { headers: { 'X-Program': 'mens' } }),
        testEnv(),
      );
      expect(res2.status).toBe(200);
      const body = await res2.json() as any;
      expect(body.program).toBe('mens');
    });
  });
});
