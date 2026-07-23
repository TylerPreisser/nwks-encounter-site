// functions/_api/app.ts — Hono app skeleton + Env interface for Cloudflare bindings

import { Hono } from 'hono';
import type { AppVariables } from './auth';

export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  SESSIONS: KVNamespace;
  EMAIL_ENABLED: string;
  EMAIL_FROM: string;
  EMAIL_REPLY_TO: string;
  RESEND_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  SESSION_SECRET: string;
  TURNSTILE_SECRET: string;
}

export const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

app.get('/api/health', (c) => {
  return c.json({ ok: true });
});

// P1+: mount additional routers here as each phase adds them.
// Example:
//   import { registerRouter } from './routes/register';
//   app.route('/api', registerRouter);
