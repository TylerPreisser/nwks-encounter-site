// functions/_api/app.ts — Hono app skeleton + Env interface for Cloudflare bindings

import { Hono } from 'hono';
import type { AppVariables } from './auth';
import { corsMiddleware } from './cors';
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
import { testimoniesRouter } from './routes/testimonies';
import { contentAdminRouter, contentPublicRouter } from './routes/content';
import { interestPublicRouter, interestAdminRouter } from './routes/interest';
import { securityRouter } from './routes/security';

export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  SESSIONS: KVNamespace;
  EMAIL_ENABLED: string;
  EMAIL_FROM: string;
  EMAIL_REPLY_TO: string;
  RESEND_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  TURNSTILE_SECRET: string;
  /** Comma-separated list of allowed cross-origin request origins for public endpoints. */
  CORS_ORIGINS: string;
}

export const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// ── Public routes — CORS allowed (worlds site calls these cross-origin) ──────

// Health: allow CORS so the worlds site can ping liveness
app.use('/api/health', corsMiddleware);
app.get('/api/health', (c) => {
  return c.json({ ok: true });
});

// P1: registration routes — CORS applied before route handler
app.use('/api/register/*', corsMiddleware);
app.route('/api/register', registerRouter);

// Express Interest (waitlist) — same CORS treatment as registration.
app.route('/api/register', interestPublicRouter);

// P3: public events endpoint (unauthenticated) — CORS applied before route handler
app.use('/api/public/*', corsMiddleware);
app.route('/api/public', publicRouter);

// P6: public gallery (years list, photo list, R2 stream) — shares /api/public/* middleware
app.route('/api/public', photosPublicRouter);

// ── Auth + admin routes — same-origin only, NO permissive CORS ───────────────

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

// Express Interest queue (admin view)
app.route('/api/admin/interest', interestAdminRouter);

// Admin security: passkeys, recovery codes, trusted devices, audit log
app.route('/api/admin/security', securityRouter);

// P4: admin email templates CRUD
app.route('/api/admin/templates', templatesRouter);

// P4: admin email campaigns CRUD + preview/send/schedule
app.route('/api/admin/campaigns', campaignsRouter);

// P5: AI assistant threads + pending actions (approve is the ONLY send gate)
app.route('/api/admin/ai', aiRouter);

// P6: admin photo CRUD (upload/list/patch/delete)
app.route('/api/admin/photos', photosAdminRouter);

// Testimonies & Teachings (email-in, person-matched, admin review)
app.route('/api/admin/testimonies', testimoniesRouter);

// P7: CMS — editable form fields + page text blocks
app.route('/api/admin', contentAdminRouter);
app.route('/api/public', contentPublicRouter);
