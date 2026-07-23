import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import { applyMigrations } from './setup';
import {
  hashPassword, verifyPassword,
  createSession, getSessionUser,
  requireAuth, requireProgram,
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
      const app = new Hono();
      app.use('/protected', requireAuth());
      app.get('/protected', (c) => c.json({ ok: true }));

      const res = await app.request('/protected');
      expect(res.status).toBe(401);
      const body = await res.json() as any;
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Unauthorized');
    });

    it('passes through and sets user when a valid session cookie is present', async () => {
      // Seed an admin and create a real session token
      const ts = nowIso();
      const hash = await hashPassword('pass');
      const { meta } = await (env as any).DB
        .prepare(`INSERT INTO admin_users (email, password_hash, role, created_at) VALUES (?, ?, 'admin', ?)`)
        .bind('cookie@example.com', hash, ts)
        .run();
      const userId = meta.last_row_id as number;
      const token = await createSession(testEnv(), userId);

      const app = new Hono<{ Variables: { user: { id: number; email: string; name: string; role: string } } }>();
      app.use('/protected', requireAuth(testEnv()));
      app.get('/protected', (c) => {
        const user = c.get('user' as never) as any;
        return c.json({ ok: true, email: user.email });
      });

      const res = await app.request('/protected', {
        headers: { Cookie: `nwks_session=${token}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.ok).toBe(true);
      expect(body.email).toBe('cookie@example.com');
    });
  });

  describe('requireProgram middleware', () => {
    it('returns 400 when program is missing', async () => {
      const app = new Hono();
      app.use('*', requireProgram());
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');
      expect(res.status).toBe(400);
      const body = await res.json() as any;
      expect(body.error).toBe('program must be mens or women');
    });

    it('returns 400 for an invalid program value', async () => {
      const app = new Hono();
      app.use('*', requireProgram());
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test?program=other');
      expect(res.status).toBe(400);
    });

    it('passes through for a valid program "mens"', async () => {
      const app = new Hono<{ Variables: { program: string } }>();
      app.use('*', requireProgram());
      app.get('/test', (c) => c.json({ ok: true, program: c.get('program' as never) }));

      const res = await app.request('/test?program=mens');
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.program).toBe('mens');
    });

    it('passes through for a valid program "women"', async () => {
      const app = new Hono<{ Variables: { program: string } }>();
      app.use('*', requireProgram());
      app.get('/test', (c) => c.json({ ok: true, program: c.get('program' as never) }));

      const res = await app.request('/test?program=women');
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.program).toBe('women');
    });
  });
});
