// functions/_api/app.ts — Hono app skeleton + Env interface for Cloudflare bindings

import { Hono } from 'hono';
import type { AppVariables } from './auth';
import { registerRouter } from './routes/register';
import { authRouter } from './routes/auth';
import { dashboardRouter } from './routes/dashboard';
import { registrationsRouter } from './routes/registrations';
import { peopleRouter } from './routes/people';

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

// P1: registration routes
app.route('/api/register', registerRouter);

// P2: auth routes
app.route('/api/auth', authRouter);

// P2: admin dashboard route
app.route('/api/admin/dashboard', dashboardRouter);

// P2: admin registrations list + CSV export
app.route('/api/admin/registrations', registrationsRouter);

// P2: admin people profile and merge
app.route('/api/admin/people', peopleRouter);
