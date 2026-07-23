// functions/_api/app.ts — Hono app skeleton + Env interface for Cloudflare bindings

import { Hono } from 'hono';
import type { AppVariables } from './auth';
import { registerRouter } from './routes/register';
import { authRouter } from './routes/auth';
import { dashboardRouter } from './routes/dashboard';
import { registrationsRouter } from './routes/registrations';
import { peopleRouter } from './routes/people';
import { eventsRouter } from './routes/events';
import { publicRouter } from './routes/publicRoutes';
import { templatesRouter } from './routes/templates';
import { campaignsRouter } from './routes/campaigns';
import { aiRouter } from './routes/ai';
import { photosAdminRouter, photosPublicRouter } from './routes/photos';

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

// P3: admin events CRUD
app.route('/api/admin/events', eventsRouter);

// P3: public events endpoint (unauthenticated)
app.route('/api/public', publicRouter);

// P4: admin email templates CRUD
app.route('/api/admin/templates', templatesRouter);

// P4: admin email campaigns CRUD + preview/send/schedule
app.route('/api/admin/campaigns', campaignsRouter);

// P5: AI assistant threads + pending actions (approve is the ONLY send gate)
app.route('/api/admin/ai', aiRouter);

// P6: admin photo CRUD (upload/list/patch/delete)
app.route('/api/admin/photos', photosAdminRouter);

// P6: public gallery (years list, photo list, R2 stream)
app.route('/api/public', photosPublicRouter);
