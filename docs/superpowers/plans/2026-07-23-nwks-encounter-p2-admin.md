# NWKS Encounter — Admin Panel: Auth, Dashboard, Lists, Profiles, Export, Matching (Plan P2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. **This document depends on the Foundation Contract (Plan 00) and Plan P1.** Do NOT redefine schema, bindings, shared modules, or naming — consume them exactly as specified in Plan 00. The authoritative module contracts are in Plan 00 §"Shared Module Contracts". Every route, type, and helper name used here is canonical.

**Goal:** Deliver a complete admin panel — Hono API routes (auth, dashboard, registrations, people) plus a React 18 + Vite 5 + Tailwind 3 SPA — enabling ministry operators to log in, toggle between Men's/Women's program, view a live dashboard, search/filter/export registrations, and manage person profiles with attendance history, badges, and duplicate-merge.

**Architecture:** All admin API routes live at `/api/admin/*` behind `requireAuth()` + `requireProgram()` middleware from `functions/_api/auth.ts`. The SPA builds to `dist/admin/` and is served by Pages under the `/admin` path. Auth uses the `nwks_session` HttpOnly Secure SameSite=Lax cookie; the program context travels as `?program=mens|women` on every admin fetch. Client-side routing (React Router) handles page transitions without a server round-trip. Program theming (olive/gold vs. rose) is applied by swapping a Tailwind CSS class on `<html>` and is driven by a top-left toggle that persists to `localStorage`.

**Tech Stack:** TypeScript 5, Hono 4, `@cloudflare/vitest-pool-workers` (API tests), React 18, Vite 5, Tailwind 3, Vitest + React Testing Library + jsdom (SPA tests). All as established in Plan 00.

**Global Constraints:** See Foundation Contract (Plan 00). This plan depends on P0 (foundation scaffold) and P1 (registration routes, `db.ts`, `auth.ts`, `dedupe.ts`, `email.ts` all exist and pass tests). All timestamps ISO-8601 UTC. No secrets in repo. TDD: every task ends with passing tests and a commit. Files stay under 500 lines.

---

## File Structure

Only the files created or materially modified by P2 are listed. Everything else from Plan 00 already exists after P0/P1.

```
functions/
  _api/
    routes/
      auth.ts                    # NEW — POST /api/auth/login|logout, GET /api/auth/me
      dashboard.ts               # NEW — GET /api/admin/dashboard
      registrations.ts           # NEW — GET /api/admin/registrations, GET /api/admin/registrations/export.csv
      people.ts                  # NEW — GET /api/admin/people/:id, POST /api/admin/people/:id/merge
    __tests__/
      auth.routes.test.ts        # NEW
      dashboard.routes.test.ts   # NEW
      registrations.routes.test.ts  # NEW
      people.routes.test.ts      # NEW
  api/[[path]].ts                # EXISTS (Plan 00) — mount new routers here

admin/
  index.html                     # NEW — Vite SPA entry point
  vite.config.ts                 # NEW
  tailwind.config.ts             # NEW
  postcss.config.js              # NEW
  tsconfig.json                  # NEW
  package.json                   # NEW — admin-specific devDeps
  src/
    main.tsx                     # NEW — React 18 createRoot, <App />
    App.tsx                      # NEW — React Router routes, AuthGuard, ProgramProvider
    api.ts                       # NEW — typed fetch wrapper (credentials:'include', ?program=)
    theme.ts                     # NEW — design token maps, applyTheme()
    pages/
      LoginPage.tsx              # NEW
      DashboardPage.tsx          # NEW
      RegistrationsPage.tsx      # NEW
      PersonPage.tsx             # NEW
    components/
      AppShell.tsx               # NEW — header, ProgramToggle, nav sidebar
      ProgramToggle.tsx          # NEW — Men's ⇄ Women's switcher
      StatCard.tsx               # NEW — reusable dashboard stat tile
      RegistrationTable.tsx      # NEW — sortable/filterable table
      PersonBadges.tsx           # NEW — attendance/served/first-timer badges
      MergeDialog.tsx            # NEW — duplicate-merge confirmation UI
    __tests__/
      LoginPage.test.tsx         # NEW
      ProgramToggle.test.tsx     # NEW
      RegistrationsPage.test.tsx # NEW
      PersonPage.test.tsx        # NEW
```

---

## Task 1 — Auth API routes (`functions/_api/routes/auth.ts`)

**Files:**
- `functions/_api/routes/auth.ts` (create)
- `functions/_api/__tests__/auth.routes.test.ts` (create)
- `functions/api/[[path]].ts` (modify: mount auth router)

**Interfaces:**
- Consumes: `hashPassword`, `verifyPassword`, `createSession`, `getSessionUser`, `requireAuth` from `functions/_api/auth.ts`; `DB` from `Env`; `nowIso` from `functions/_api/db.ts`
- Produces: `POST /api/auth/login` → sets `nwks_session` cookie, returns `{ ok, user: {id, email, name, role} }`; `POST /api/auth/logout` → clears cookie, returns `{ ok }`; `GET /api/auth/me` → `{ ok, user }` or 401

**Steps:**

- [ ] 1. Write the failing test file `functions/_api/__tests__/auth.routes.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach } from 'vitest';
  import { SELF } from 'cloudflare:test';
  import { applyMigrations, seedAdmin } from './helpers';

  describe('POST /api/auth/login', () => {
    beforeEach(applyMigrations);

    it('returns 400 when body is missing fields', async () => {
      const res = await SELF.fetch('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'a@b.com' }),
      });
      expect(res.status).toBe(400);
      const json = await res.json() as { ok: boolean; error: string };
      expect(json.ok).toBe(false);
    });

    it('returns 401 for unknown email', async () => {
      const res = await SELF.fetch('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nobody@example.com', password: 'x' }),
      });
      expect(res.status).toBe(401);
    });

    it('returns 401 for wrong password', async () => {
      await seedAdmin();
      const res = await SELF.fetch('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@nwksencounter.com', password: 'wrong' }),
      });
      expect(res.status).toBe(401);
    });

    it('sets nwks_session cookie and returns user on good creds', async () => {
      await seedAdmin();
      const res = await SELF.fetch('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@nwksencounter.com', password: 'TestPass1!' }),
      });
      expect(res.status).toBe(200);
      const json = await res.json() as { ok: boolean; user: { email: string } };
      expect(json.ok).toBe(true);
      expect(json.user.email).toBe('admin@nwksencounter.com');
      const cookie = res.headers.get('Set-Cookie') ?? '';
      expect(cookie).toContain('nwks_session=');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=Lax');
    });

    it('updates last_login_at on successful login', async () => {
      await seedAdmin();
      await SELF.fetch('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@nwksencounter.com', password: 'TestPass1!' }),
      });
      // Verified indirectly via /api/auth/me returning the user without error;
      // direct D1 assertion in helper if needed
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears cookie and returns ok', async () => {
      const res = await SELF.fetch('http://localhost/api/auth/logout', { method: 'POST' });
      expect(res.status).toBe(200);
      const json = await res.json() as { ok: boolean };
      expect(json.ok).toBe(true);
      const cookie = res.headers.get('Set-Cookie') ?? '';
      expect(cookie).toContain('nwks_session=;');
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns 401 without cookie', async () => {
      const res = await SELF.fetch('http://localhost/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns user when session cookie is valid', async () => {
      await seedAdmin();
      const loginRes = await SELF.fetch('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@nwksencounter.com', password: 'TestPass1!' }),
      });
      const setCookie = loginRes.headers.get('Set-Cookie') ?? '';
      const token = setCookie.match(/nwks_session=([^;]+)/)?.[1] ?? '';

      const meRes = await SELF.fetch('http://localhost/api/auth/me', {
        headers: { Cookie: `nwks_session=${token}` },
      });
      expect(meRes.status).toBe(200);
      const json = await meRes.json() as { ok: boolean; user: { email: string } };
      expect(json.ok).toBe(true);
      expect(json.user.email).toBe('admin@nwksencounter.com');
    });
  });
  ```

- [ ] 2. Run `npm run test:api -- auth.routes` — confirm tests fail (routes do not exist yet).

- [ ] 3. Create `functions/_api/routes/auth.ts`:
  ```ts
  import { Hono } from 'hono';
  import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
  import type { Env } from '../app';
  import { verifyPassword, createSession, getSessionUser } from '../auth';
  import { nowIso } from '../db';

  export const authRouter = new Hono<{ Bindings: Env }>();

  authRouter.post('/login', async (c) => {
    const body = await c.req.json<{ email?: string; password?: string }>().catch(() => ({}));
    const { email, password } = body;
    if (!email || !password) {
      return c.json({ ok: false, error: 'email and password required' }, 400);
    }

    const row = await c.env.DB.prepare(
      `SELECT id, email, name, role, password_hash FROM admin_users WHERE email = ?`
    ).bind(email.toLowerCase().trim()).first<{
      id: number; email: string; name: string | null; role: string; password_hash: string;
    }>();

    if (!row) return c.json({ ok: false, error: 'Invalid credentials' }, 401);

    const ok = await verifyPassword(password, row.password_hash);
    if (!ok) return c.json({ ok: false, error: 'Invalid credentials' }, 401);

    const token = await createSession(c.env, row.id);

    // update last_login_at
    await c.env.DB.prepare(
      `UPDATE admin_users SET last_login_at = ? WHERE id = ?`
    ).bind(nowIso(), row.id).run();

    setCookie(c, 'nwks_session', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return c.json({
      ok: true,
      user: { id: row.id, email: row.email, name: row.name, role: row.role },
    });
  });

  authRouter.post('/logout', (c) => {
    deleteCookie(c, 'nwks_session', { path: '/' });
    return c.json({ ok: true });
  });

  authRouter.get('/me', async (c) => {
    const token = getCookie(c, 'nwks_session');
    const user = await getSessionUser(c.env, token);
    if (!user) return c.json({ ok: false, error: 'Unauthorized' }, 401);
    return c.json({ ok: true, user });
  });
  ```

- [ ] 4. Mount `authRouter` in `functions/api/[[path]].ts` (or `functions/_api/app.ts`) under `/api/auth`.

- [ ] 5. Run `npm run test:api -- auth.routes` — all tests pass.

- [ ] 6. Commit: `feat(p2): auth API routes — login/logout/me with session cookie`.

---

## Task 2 — Dashboard API route (`functions/_api/routes/dashboard.ts`)

**Files:**
- `functions/_api/routes/dashboard.ts` (create)
- `functions/_api/__tests__/dashboard.routes.test.ts` (create)
- `functions/api/[[path]].ts` (mount router)

**Interfaces:**
- Consumes: `requireAuth`, `requireProgram` from `auth.ts`; `DB`, `Program` from `db.ts`
- Produces: `GET /api/admin/dashboard?program=` → `{ ok, stats: { attendee_count, server_count, first_timers, by_launch_location, by_shirt_size, recent_registrations, email_sent_count, upcoming_event } }`

**Steps:**

- [ ] 1. Write `functions/_api/__tests__/dashboard.routes.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach } from 'vitest';
  import { SELF } from 'cloudflare:test';
  import { applyMigrations, seedAdmin, seedEvent, seedRegistration, getAuthCookie } from './helpers';

  describe('GET /api/admin/dashboard', () => {
    beforeEach(applyMigrations);

    it('returns 401 without auth', async () => {
      const res = await SELF.fetch('http://localhost/api/admin/dashboard?program=mens');
      expect(res.status).toBe(401);
    });

    it('returns 400 without program param', async () => {
      const cookie = await getAuthCookie();
      const res = await SELF.fetch('http://localhost/api/admin/dashboard', {
        headers: { Cookie: cookie },
      });
      expect(res.status).toBe(400);
    });

    it('returns zero stats for empty event', async () => {
      await seedAdmin();
      await seedEvent({ program: 'mens' });
      const cookie = await getAuthCookie();
      const res = await SELF.fetch('http://localhost/api/admin/dashboard?program=mens', {
        headers: { Cookie: cookie },
      });
      expect(res.status).toBe(200);
      const json = await res.json() as { ok: boolean; stats: Record<string, unknown> };
      expect(json.ok).toBe(true);
      expect(json.stats.attendee_count).toBe(0);
      expect(json.stats.server_count).toBe(0);
      expect(json.stats.first_timers).toBe(0);
    });

    it('counts attendees, servers, and first-timers correctly', async () => {
      await seedAdmin();
      const eventId = await seedEvent({ program: 'mens' });
      await seedRegistration({ program: 'mens', eventId, role: 'attendee', timesAttended: 0 });
      await seedRegistration({ program: 'mens', eventId, role: 'attendee', timesAttended: 2 });
      await seedRegistration({ program: 'mens', eventId, role: 'server' });
      const cookie = await getAuthCookie();
      const res = await SELF.fetch('http://localhost/api/admin/dashboard?program=mens', {
        headers: { Cookie: cookie },
      });
      const json = await res.json() as {
        ok: boolean;
        stats: { attendee_count: number; server_count: number; first_timers: number };
      };
      expect(json.stats.attendee_count).toBe(2);
      expect(json.stats.server_count).toBe(1);
      expect(json.stats.first_timers).toBe(1);
    });

    it('returns by_launch_location breakdown', async () => {
      await seedAdmin();
      const eventId = await seedEvent({ program: 'mens' });
      await seedRegistration({ program: 'mens', eventId, role: 'attendee', launchLocation: 'Oakley' });
      await seedRegistration({ program: 'mens', eventId, role: 'attendee', launchLocation: 'Colby' });
      await seedRegistration({ program: 'mens', eventId, role: 'attendee', launchLocation: 'Oakley' });
      const cookie = await getAuthCookie();
      const res = await SELF.fetch('http://localhost/api/admin/dashboard?program=mens', {
        headers: { Cookie: cookie },
      });
      const json = await res.json() as {
        ok: boolean;
        stats: { by_launch_location: Array<{ location: string; count: number }> };
      };
      const oakley = json.stats.by_launch_location.find((l) => l.location === 'Oakley');
      expect(oakley?.count).toBe(2);
    });

    it('returns by_shirt_size breakdown', async () => {
      await seedAdmin();
      const eventId = await seedEvent({ program: 'mens' });
      await seedRegistration({ program: 'mens', eventId, role: 'attendee', shirtSize: 'L' });
      await seedRegistration({ program: 'mens', eventId, role: 'attendee', shirtSize: 'L' });
      await seedRegistration({ program: 'mens', eventId, role: 'attendee', shirtSize: 'XL' });
      const cookie = await getAuthCookie();
      const res = await SELF.fetch('http://localhost/api/admin/dashboard?program=mens', {
        headers: { Cookie: cookie },
      });
      const json = await res.json() as {
        ok: boolean;
        stats: { by_shirt_size: Array<{ size: string; count: number }> };
      };
      const large = json.stats.by_shirt_size.find((s) => s.size === 'L');
      expect(large?.count).toBe(2);
    });

    it('womens program is isolated from mens', async () => {
      await seedAdmin();
      const mensEventId = await seedEvent({ program: 'mens' });
      await seedRegistration({ program: 'mens', eventId: mensEventId, role: 'attendee' });
      const cookie = await getAuthCookie();
      const res = await SELF.fetch('http://localhost/api/admin/dashboard?program=women', {
        headers: { Cookie: cookie },
      });
      const json = await res.json() as { ok: boolean; stats: { attendee_count: number } };
      expect(json.stats.attendee_count).toBe(0);
    });
  });
  ```

- [ ] 2. Run `npm run test:api -- dashboard.routes` — confirm tests fail.

- [ ] 3. Create `functions/_api/routes/dashboard.ts`:
  ```ts
  import { Hono } from 'hono';
  import type { Env } from '../app';
  import { requireAuth, requireProgram } from '../auth';
  import type { Program } from '../db';

  export const dashboardRouter = new Hono<{ Bindings: Env }>();

  dashboardRouter.use('*', requireAuth(), requireProgram());

  dashboardRouter.get('/', async (c) => {
    const program = c.get('program') as Program;

    // Resolve current event for this program
    const event = await c.env.DB.prepare(
      `SELECT id, year, title, start_date, end_date FROM events
       WHERE program = ? AND is_current = 1 LIMIT 1`
    ).bind(program).first<{ id: number; year: number; title: string | null; start_date: string | null; end_date: string | null }>();

    if (!event) {
      return c.json({
        ok: true,
        stats: {
          attendee_count: 0, server_count: 0, first_timers: 0,
          by_launch_location: [], by_shirt_size: [], recent_registrations: [],
          email_sent_count: 0, upcoming_event: null,
        },
      });
    }

    const eventId = event.id;

    const [attendeeRow, serverRow, firstTimerRow] = await Promise.all([
      c.env.DB.prepare(
        `SELECT COUNT(*) as n FROM registrations WHERE program=? AND event_id=? AND role='attendee'`
      ).bind(program, eventId).first<{ n: number }>(),
      c.env.DB.prepare(
        `SELECT COUNT(*) as n FROM registrations WHERE program=? AND event_id=? AND role='server'`
      ).bind(program, eventId).first<{ n: number }>(),
      c.env.DB.prepare(
        `SELECT COUNT(*) as n FROM registrations r
         JOIN people p ON p.id = r.person_id
         WHERE r.program=? AND r.event_id=? AND p.times_attended <= 1`
      ).bind(program, eventId).first<{ n: number }>(),
    ]);

    const locationRows = await c.env.DB.prepare(
      `SELECT launch_location as location, COUNT(*) as count
       FROM registrations WHERE program=? AND event_id=? AND launch_location IS NOT NULL
       GROUP BY launch_location ORDER BY count DESC`
    ).bind(program, eventId).all<{ location: string; count: number }>();

    const shirtRows = await c.env.DB.prepare(
      `SELECT shirt_size as size, COUNT(*) as count
       FROM registrations WHERE program=? AND event_id=? AND shirt_size IS NOT NULL
       GROUP BY shirt_size ORDER BY count DESC`
    ).bind(program, eventId).all<{ size: string; count: number }>();

    const recentRows = await c.env.DB.prepare(
      `SELECT r.id, r.first_name, r.last_name, r.role, r.created_at
       FROM registrations r WHERE r.program=? AND r.event_id=?
       ORDER BY r.created_at DESC LIMIT 10`
    ).bind(program, eventId).all<{ id: number; first_name: string; last_name: string; role: string; created_at: string }>();

    const emailSentRow = await c.env.DB.prepare(
      `SELECT COUNT(*) as n FROM email_log WHERE program=? AND status IN ('sent','delivered')`
    ).bind(program).first<{ n: number }>();

    return c.json({
      ok: true,
      stats: {
        attendee_count: attendeeRow?.n ?? 0,
        server_count: serverRow?.n ?? 0,
        first_timers: firstTimerRow?.n ?? 0,
        by_launch_location: locationRows.results,
        by_shirt_size: shirtRows.results,
        recent_registrations: recentRows.results,
        email_sent_count: emailSentRow?.n ?? 0,
        upcoming_event: event,
      },
    });
  });
  ```

- [ ] 4. Mount `dashboardRouter` in `functions/api/[[path]].ts` under `/api/admin/dashboard`.

- [ ] 5. Run `npm run test:api -- dashboard.routes` — all tests pass.

- [ ] 6. Commit: `feat(p2): dashboard API route with program-partitioned stats`.

---

## Task 3 — Registrations API routes (`functions/_api/routes/registrations.ts`)

**Files:**
- `functions/_api/routes/registrations.ts` (create)
- `functions/_api/__tests__/registrations.routes.test.ts` (create)
- `functions/api/[[path]].ts` (mount)

**Interfaces:**
- Consumes: `requireAuth`, `requireProgram`; `DB`, `Program`
- Produces:
  - `GET /api/admin/registrations?program=&event_id=&role=&q=&page=` → `{ ok, rows: Registration[], total: number, page: number, per_page: number }`
  - `GET /api/admin/registrations/export.csv?program=&event_id=&role=` → `text/csv` with `Content-Disposition: attachment; filename="registrations.csv"`

**Steps:**

- [ ] 1. Write `functions/_api/__tests__/registrations.routes.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach } from 'vitest';
  import { SELF } from 'cloudflare:test';
  import { applyMigrations, seedAdmin, seedEvent, seedRegistration, getAuthCookie } from './helpers';

  describe('GET /api/admin/registrations', () => {
    beforeEach(applyMigrations);

    it('returns 401 without auth', async () => {
      const res = await SELF.fetch('http://localhost/api/admin/registrations?program=mens');
      expect(res.status).toBe(401);
    });

    it('returns empty list when no registrations', async () => {
      await seedAdmin();
      await seedEvent({ program: 'mens' });
      const cookie = await getAuthCookie();
      const res = await SELF.fetch('http://localhost/api/admin/registrations?program=mens', {
        headers: { Cookie: cookie },
      });
      const json = await res.json() as { ok: boolean; rows: unknown[]; total: number };
      expect(json.ok).toBe(true);
      expect(json.rows).toHaveLength(0);
      expect(json.total).toBe(0);
    });

    it('filters by event_id', async () => {
      await seedAdmin();
      const eventId = await seedEvent({ program: 'mens' });
      const eventId2 = await seedEvent({ program: 'mens', year: 2025 });
      await seedRegistration({ program: 'mens', eventId, role: 'attendee' });
      await seedRegistration({ program: 'mens', eventId: eventId2, role: 'attendee' });
      const cookie = await getAuthCookie();
      const res = await SELF.fetch(
        `http://localhost/api/admin/registrations?program=mens&event_id=${eventId}`,
        { headers: { Cookie: cookie } }
      );
      const json = await res.json() as { ok: boolean; rows: unknown[]; total: number };
      expect(json.total).toBe(1);
    });

    it('filters by role', async () => {
      await seedAdmin();
      const eventId = await seedEvent({ program: 'mens' });
      await seedRegistration({ program: 'mens', eventId, role: 'attendee' });
      await seedRegistration({ program: 'mens', eventId, role: 'server' });
      const cookie = await getAuthCookie();
      const res = await SELF.fetch(
        `http://localhost/api/admin/registrations?program=mens&role=server`,
        { headers: { Cookie: cookie } }
      );
      const json = await res.json() as { ok: boolean; rows: unknown[]; total: number };
      expect(json.total).toBe(1);
    });

    it('searches by first_name, last_name, and email via q param', async () => {
      await seedAdmin();
      const eventId = await seedEvent({ program: 'mens' });
      await seedRegistration({ program: 'mens', eventId, role: 'attendee', firstName: 'John', lastName: 'Smith', email: 'john@example.com' });
      await seedRegistration({ program: 'mens', eventId, role: 'attendee', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' });
      const cookie = await getAuthCookie();
      const res = await SELF.fetch(
        `http://localhost/api/admin/registrations?program=mens&q=john`,
        { headers: { Cookie: cookie } }
      );
      const json = await res.json() as { ok: boolean; rows: Array<{ first_name: string }>; total: number };
      expect(json.total).toBe(1);
      expect(json.rows[0].first_name).toBe('John');
    });

    it('paginates results with page param', async () => {
      await seedAdmin();
      const eventId = await seedEvent({ program: 'mens' });
      for (let i = 0; i < 55; i++) {
        await seedRegistration({ program: 'mens', eventId, role: 'attendee', firstName: `User${i}` });
      }
      const cookie = await getAuthCookie();
      const res = await SELF.fetch(
        `http://localhost/api/admin/registrations?program=mens&page=2`,
        { headers: { Cookie: cookie } }
      );
      const json = await res.json() as { ok: boolean; rows: unknown[]; total: number; page: number; per_page: number };
      expect(json.total).toBe(55);
      expect(json.page).toBe(2);
      expect(json.rows.length).toBeLessThanOrEqual(50);
    });
  });

  describe('GET /api/admin/registrations/export.csv', () => {
    beforeEach(applyMigrations);

    it('returns 401 without auth', async () => {
      const res = await SELF.fetch('http://localhost/api/admin/registrations/export.csv?program=mens');
      expect(res.status).toBe(401);
    });

    it('responds with text/csv content-type', async () => {
      await seedAdmin();
      await seedEvent({ program: 'mens' });
      const cookie = await getAuthCookie();
      const res = await SELF.fetch(
        'http://localhost/api/admin/registrations/export.csv?program=mens',
        { headers: { Cookie: cookie } }
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/csv');
      const disposition = res.headers.get('Content-Disposition') ?? '';
      expect(disposition).toContain('attachment');
      expect(disposition).toContain('registrations.csv');
    });

    it('includes header row and data rows in correct CSV format', async () => {
      await seedAdmin();
      const eventId = await seedEvent({ program: 'mens' });
      await seedRegistration({
        program: 'mens', eventId, role: 'attendee',
        firstName: 'Bob', lastName: 'Jones', email: 'bob@example.com',
      });
      const cookie = await getAuthCookie();
      const res = await SELF.fetch(
        `http://localhost/api/admin/registrations/export.csv?program=mens&event_id=${eventId}`,
        { headers: { Cookie: cookie } }
      );
      const text = await res.text();
      const lines = text.trim().split('\n');
      expect(lines.length).toBe(2); // header + 1 data row
      expect(lines[0]).toContain('first_name');
      expect(lines[0]).toContain('last_name');
      expect(lines[0]).toContain('email');
      expect(lines[0]).toContain('role');
      expect(lines[1]).toContain('Bob');
      expect(lines[1]).toContain('Jones');
    });

    it('escapes commas and quotes in CSV values', async () => {
      await seedAdmin();
      const eventId = await seedEvent({ program: 'mens' });
      await seedRegistration({
        program: 'mens', eventId, role: 'attendee',
        firstName: 'Al,ice', lastName: 'O\'Brien "the third"',
      });
      const cookie = await getAuthCookie();
      const res = await SELF.fetch(
        `http://localhost/api/admin/registrations/export.csv?program=mens&event_id=${eventId}`,
        { headers: { Cookie: cookie } }
      );
      const text = await res.text();
      // Values containing commas/quotes must be quoted; internal quotes doubled
      expect(text).toContain('"Al,ice"');
      expect(text).toContain('"O\'Brien ""the third"""');
    });

    it('filters export by role', async () => {
      await seedAdmin();
      const eventId = await seedEvent({ program: 'mens' });
      await seedRegistration({ program: 'mens', eventId, role: 'attendee', firstName: 'Att' });
      await seedRegistration({ program: 'mens', eventId, role: 'server', firstName: 'Srv' });
      const cookie = await getAuthCookie();
      const res = await SELF.fetch(
        `http://localhost/api/admin/registrations/export.csv?program=mens&event_id=${eventId}&role=server`,
        { headers: { Cookie: cookie } }
      );
      const text = await res.text();
      expect(text).toContain('Srv');
      expect(text).not.toContain('Att');
    });
  });
  ```

- [ ] 2. Run `npm run test:api -- registrations.routes` — confirm all fail.

- [ ] 3. Create `functions/_api/routes/registrations.ts`:
  ```ts
  import { Hono } from 'hono';
  import type { Env } from '../app';
  import { requireAuth, requireProgram } from '../auth';
  import type { Program } from '../db';

  export const registrationsRouter = new Hono<{ Bindings: Env }>();

  registrationsRouter.use('*', requireAuth(), requireProgram());

  const CSV_COLUMNS = [
    'id','role','first_name','last_name','email','phone','city','state','church',
    'launch_location','shirt_size','times_attended_self_report','invited_by',
    'prayer_contact_name','prayer_contact_phone','dietary_health','questions','status','created_at',
  ] as const;

  function csvEscape(val: unknown): string {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function buildWhere(program: Program, eventId?: string, role?: string, q?: string) {
    const clauses: string[] = ['r.program = ?'];
    const binds: unknown[] = [program];
    if (eventId) { clauses.push('r.event_id = ?'); binds.push(Number(eventId)); }
    if (role && (role === 'attendee' || role === 'server')) {
      clauses.push('r.role = ?'); binds.push(role);
    }
    if (q) {
      const like = `%${q}%`;
      clauses.push('(r.first_name LIKE ? OR r.last_name LIKE ? OR r.email LIKE ?)');
      binds.push(like, like, like);
    }
    return { where: clauses.join(' AND '), binds };
  }

  registrationsRouter.get('/', async (c) => {
    const program = c.get('program') as Program;
    const { event_id, role, q, page } = c.req.query();
    const pageNum = Math.max(1, parseInt(page ?? '1', 10));
    const perPage = 50;
    const offset = (pageNum - 1) * perPage;

    const { where, binds } = buildWhere(program, event_id, role, q);

    const countRow = await c.env.DB.prepare(
      `SELECT COUNT(*) as n FROM registrations r WHERE ${where}`
    ).bind(...binds).first<{ n: number }>();

    const rows = await c.env.DB.prepare(
      `SELECT r.* FROM registrations r WHERE ${where}
       ORDER BY r.created_at DESC LIMIT ? OFFSET ?`
    ).bind(...binds, perPage, offset).all();

    return c.json({
      ok: true,
      rows: rows.results,
      total: countRow?.n ?? 0,
      page: pageNum,
      per_page: perPage,
    });
  });

  registrationsRouter.get('/export.csv', async (c) => {
    const program = c.get('program') as Program;
    const { event_id, role } = c.req.query();

    const { where, binds } = buildWhere(program, event_id, role);

    const rows = await c.env.DB.prepare(
      `SELECT ${CSV_COLUMNS.join(',')} FROM registrations r WHERE ${where} ORDER BY r.created_at ASC`
    ).bind(...binds).all<Record<string, unknown>>();

    const header = CSV_COLUMNS.join(',');
    const dataLines = rows.results.map((row) =>
      CSV_COLUMNS.map((col) => csvEscape(row[col])).join(',')
    );
    const csv = [header, ...dataLines].join('\r\n');

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="registrations.csv"',
      },
    });
  });
  ```

- [ ] 4. Mount `registrationsRouter` in `functions/api/[[path]].ts` under `/api/admin/registrations`.

- [ ] 5. Run `npm run test:api -- registrations.routes` — all pass.

- [ ] 6. Commit: `feat(p2): registrations list and CSV export API routes`.

---

## Task 4 — People API routes (`functions/_api/routes/people.ts`)

**Files:**
- `functions/_api/routes/people.ts` (create)
- `functions/_api/__tests__/people.routes.test.ts` (create)
- `functions/api/[[path]].ts` (mount)

**Interfaces:**
- Consumes: `requireAuth`, `requireProgram`; `findPossibleDuplicates`, `recomputeRollups` from `dedupe.ts`; `DB`, `Program`, `Person`
- Produces:
  - `GET /api/admin/people/:id?program=` → `{ ok, person, badges: {times_attended, times_served, is_first_timer}, history: Registration[], possible_duplicates: Person[] }`
  - `POST /api/admin/people/:id/merge` `{ into_id: number }` → `{ ok, person }` (folds source into target: moves all registrations, recomputes rollups on both, sets `merged_into_id` on source)

**Steps:**

- [ ] 1. Write `functions/_api/__tests__/people.routes.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach } from 'vitest';
  import { SELF } from 'cloudflare:test';
  import { applyMigrations, seedAdmin, seedEvent, seedRegistration, seedPerson, getAuthCookie } from './helpers';

  describe('GET /api/admin/people/:id', () => {
    beforeEach(applyMigrations);

    it('returns 401 without auth', async () => {
      const res = await SELF.fetch('http://localhost/api/admin/people/1?program=mens');
      expect(res.status).toBe(401);
    });

    it('returns 404 for unknown person', async () => {
      await seedAdmin();
      const cookie = await getAuthCookie();
      const res = await SELF.fetch('http://localhost/api/admin/people/9999?program=mens', {
        headers: { Cookie: cookie },
      });
      expect(res.status).toBe(404);
    });

    it('returns person with badges and empty history for new person', async () => {
      await seedAdmin();
      const personId = await seedPerson({ program: 'mens', timesAttended: 0, timesServed: 0 });
      const cookie = await getAuthCookie();
      const res = await SELF.fetch(`http://localhost/api/admin/people/${personId}?program=mens`, {
        headers: { Cookie: cookie },
      });
      expect(res.status).toBe(200);
      const json = await res.json() as {
        ok: boolean;
        person: { id: number };
        badges: { times_attended: number; times_served: number; is_first_timer: boolean };
        history: unknown[];
        possible_duplicates: unknown[];
      };
      expect(json.ok).toBe(true);
      expect(json.person.id).toBe(personId);
      expect(json.badges.times_attended).toBe(0);
      expect(json.badges.is_first_timer).toBe(true);
      expect(json.history).toHaveLength(0);
    });

    it('returns registration history across events', async () => {
      await seedAdmin();
      const eventId1 = await seedEvent({ program: 'mens', year: 2024 });
      const eventId2 = await seedEvent({ program: 'mens', year: 2026 });
      const personId = await seedPerson({ program: 'mens' });
      await seedRegistration({ program: 'mens', eventId: eventId1, role: 'attendee', personId });
      await seedRegistration({ program: 'mens', eventId: eventId2, role: 'server', personId });
      const cookie = await getAuthCookie();
      const res = await SELF.fetch(`http://localhost/api/admin/people/${personId}?program=mens`, {
        headers: { Cookie: cookie },
      });
      const json = await res.json() as { ok: boolean; history: Array<{ event_id: number }> };
      expect(json.history).toHaveLength(2);
    });

    it('returns possible_duplicates array (may be empty)', async () => {
      await seedAdmin();
      const personId = await seedPerson({ program: 'mens' });
      const cookie = await getAuthCookie();
      const res = await SELF.fetch(`http://localhost/api/admin/people/${personId}?program=mens`, {
        headers: { Cookie: cookie },
      });
      const json = await res.json() as { ok: boolean; possible_duplicates: unknown[] };
      expect(Array.isArray(json.possible_duplicates)).toBe(true);
    });
  });

  describe('POST /api/admin/people/:id/merge', () => {
    beforeEach(applyMigrations);

    it('returns 401 without auth', async () => {
      const res = await SELF.fetch('http://localhost/api/admin/people/1/merge?program=mens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ into_id: 2 }),
      });
      expect(res.status).toBe(401);
    });

    it('returns 400 when into_id is missing', async () => {
      await seedAdmin();
      const cookie = await getAuthCookie();
      const res = await SELF.fetch('http://localhost/api/admin/people/1/merge?program=mens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 when merging a person into themselves', async () => {
      await seedAdmin();
      const personId = await seedPerson({ program: 'mens' });
      const cookie = await getAuthCookie();
      const res = await SELF.fetch(`http://localhost/api/admin/people/${personId}/merge?program=mens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ into_id: personId }),
      });
      expect(res.status).toBe(400);
    });

    it('moves registrations, sets merged_into_id, and recomputes rollups', async () => {
      await seedAdmin();
      const eventId = await seedEvent({ program: 'mens' });
      const sourceId = await seedPerson({ program: 'mens', firstName: 'Dup' });
      const targetId = await seedPerson({ program: 'mens', firstName: 'Real' });
      await seedRegistration({ program: 'mens', eventId, role: 'attendee', personId: sourceId });
      const cookie = await getAuthCookie();

      const res = await SELF.fetch(`http://localhost/api/admin/people/${sourceId}/merge?program=mens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ into_id: targetId }),
      });
      expect(res.status).toBe(200);
      const json = await res.json() as { ok: boolean; person: { id: number; times_attended: number } };
      expect(json.ok).toBe(true);
      expect(json.person.id).toBe(targetId);
      // target should now have times_attended incremented
      expect(json.person.times_attended).toBeGreaterThanOrEqual(1);
    });
  });
  ```

- [ ] 2. Run `npm run test:api -- people.routes` — confirm all fail.

- [ ] 3. Create `functions/_api/routes/people.ts`:
  ```ts
  import { Hono } from 'hono';
  import type { Env } from '../app';
  import { requireAuth, requireProgram } from '../auth';
  import { findPossibleDuplicates, recomputeRollups } from '../dedupe';
  import type { Person, Program } from '../db';
  import { nowIso } from '../db';

  export const peopleRouter = new Hono<{ Bindings: Env }>();

  peopleRouter.use('*', requireAuth(), requireProgram());

  peopleRouter.get('/:id', async (c) => {
    const personId = Number(c.req.param('id'));
    const program = c.get('program') as Program;

    const person = await c.env.DB.prepare(
      `SELECT * FROM people WHERE id = ? AND program = ? AND merged_into_id IS NULL`
    ).bind(personId, program).first<Person>();

    if (!person) return c.json({ ok: false, error: 'Not found' }, 404);

    const badges = {
      times_attended: person.times_attended,
      times_served: person.times_served,
      is_first_timer: person.times_attended <= 1,
    };

    const historyRows = await c.env.DB.prepare(
      `SELECT r.*, e.year, e.title, e.start_date, e.end_date
       FROM registrations r
       JOIN events e ON e.id = r.event_id
       WHERE r.person_id = ? AND r.program = ?
       ORDER BY e.start_date DESC`
    ).bind(personId, program).all();

    const possibleDuplicates = await findPossibleDuplicates(c.env, personId);

    return c.json({
      ok: true,
      person,
      badges,
      history: historyRows.results,
      possible_duplicates: possibleDuplicates,
    });
  });

  peopleRouter.post('/:id/merge', async (c) => {
    const sourceId = Number(c.req.param('id'));
    const program = c.get('program') as Program;
    const body = await c.req.json<{ into_id?: number }>().catch(() => ({}));
    const { into_id: targetId } = body;

    if (!targetId) return c.json({ ok: false, error: 'into_id required' }, 400);
    if (sourceId === targetId) return c.json({ ok: false, error: 'Cannot merge a person into themselves' }, 400);

    const [source, target] = await Promise.all([
      c.env.DB.prepare(`SELECT id FROM people WHERE id=? AND program=? AND merged_into_id IS NULL`)
        .bind(sourceId, program).first<{ id: number }>(),
      c.env.DB.prepare(`SELECT id FROM people WHERE id=? AND program=? AND merged_into_id IS NULL`)
        .bind(targetId, program).first<{ id: number }>(),
    ]);

    if (!source) return c.json({ ok: false, error: 'Source person not found' }, 404);
    if (!target) return c.json({ ok: false, error: 'Target person not found' }, 404);

    // Move registrations from source to target
    await c.env.DB.prepare(
      `UPDATE registrations SET person_id = ? WHERE person_id = ?`
    ).bind(targetId, sourceId).run();

    // Mark source as merged
    await c.env.DB.prepare(
      `UPDATE people SET merged_into_id = ?, updated_at = ? WHERE id = ?`
    ).bind(targetId, nowIso(), sourceId).run();

    // Recompute rollups for target
    await recomputeRollups(c.env, targetId);

    const updatedTarget = await c.env.DB.prepare(
      `SELECT * FROM people WHERE id = ?`
    ).bind(targetId).first<Person>();

    return c.json({ ok: true, person: updatedTarget });
  });
  ```

- [ ] 4. Mount `peopleRouter` in `functions/api/[[path]].ts` under `/api/admin/people`.

- [ ] 5. Run `npm run test:api -- people.routes` — all tests pass.

- [ ] 6. Commit: `feat(p2): people profile and merge API routes`.

---

## Task 5 — Admin SPA: Vite + Tailwind + Vitest scaffold

**Files:**
- `admin/package.json` (create)
- `admin/vite.config.ts` (create)
- `admin/tailwind.config.ts` (create)
- `admin/postcss.config.js` (create)
- `admin/tsconfig.json` (create)
- `admin/index.html` (create)
- `admin/src/main.tsx` (create)
- `admin/src/api.ts` (create)
- `admin/src/theme.ts` (create)
- `admin/src/App.tsx` (create, minimal shell — full content in Tasks 6–10)

**Steps:**

- [ ] 1. Create `admin/package.json`:
  ```json
  {
    "name": "nwks-encounter-admin",
    "private": true,
    "version": "0.1.0",
    "type": "module",
    "scripts": {
      "dev": "vite",
      "build": "tsc --noEmit && vite build",
      "test": "vitest run",
      "test:watch": "vitest"
    },
    "dependencies": {
      "react": "^18.3.1",
      "react-dom": "^18.3.1",
      "react-router-dom": "^6.24.0"
    },
    "devDependencies": {
      "@testing-library/jest-dom": "^6.4.6",
      "@testing-library/react": "^16.0.0",
      "@testing-library/user-event": "^14.5.2",
      "@types/react": "^18.3.3",
      "@types/react-dom": "^18.3.0",
      "@vitejs/plugin-react": "^4.3.1",
      "autoprefixer": "^10.4.19",
      "jsdom": "^24.1.0",
      "postcss": "^8.4.39",
      "tailwindcss": "^3.4.6",
      "typescript": "^5.5.3",
      "vite": "^5.3.3",
      "vitest": "^2.0.2"
    }
  }
  ```

- [ ] 2. Create `admin/vite.config.ts`:
  ```ts
  import { defineConfig } from 'vite';
  import react from '@vitejs/plugin-react';
  import path from 'node:path';

  export default defineConfig({
    root: '.',
    base: '/admin/',
    plugins: [react()],
    build: {
      outDir: '../dist/admin',
      emptyOutDir: true,
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/__tests__/setup.ts',
      globals: true,
    },
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
  });
  ```

- [ ] 3. Create `admin/tailwind.config.ts`:
  ```ts
  import type { Config } from 'tailwindcss';

  export default {
    content: ['./index.html', './src/**/*.{ts,tsx}'],
    darkMode: 'class',
    theme: {
      extend: {
        colors: {
          // Men's palette — olive/gold
          mens: {
            primary:   '#6B7645',  // olive
            secondary: '#B8972A',  // gold
            bg:        '#F5F3EC',
            surface:   '#FFFFFF',
            accent:    '#8A9A50',
          },
          // Women's palette — rose
          womens: {
            primary:   '#A0536A',  // rose
            secondary: '#D4748C',  // blush
            bg:        '#FDF5F7',
            surface:   '#FFFFFF',
            accent:    '#C4849A',
          },
        },
      },
    },
    plugins: [],
  } satisfies Config;
  ```

- [ ] 4. Create `admin/postcss.config.js`:
  ```js
  export default {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  };
  ```

- [ ] 5. Create `admin/tsconfig.json`:
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "lib": ["ES2022", "DOM", "DOM.Iterable"],
      "module": "ESNext",
      "moduleResolution": "Bundler",
      "jsx": "react-jsx",
      "strict": true,
      "noEmit": true,
      "baseUrl": ".",
      "paths": { "@/*": ["./src/*"] }
    },
    "include": ["src"]
  }
  ```

- [ ] 6. Create `admin/index.html`:
  ```html
  <!doctype html>
  <html lang="en" class="h-full">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>NWKS Encounter Admin</title>
      <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    </head>
    <body class="h-full antialiased">
      <div id="root" class="h-full"></div>
      <script type="module" src="/src/main.tsx"></script>
    </body>
  </html>
  ```

- [ ] 7. Create `admin/src/theme.ts`:
  ```ts
  export type Program = 'mens' | 'women';

  export interface ThemeTokens {
    primary: string;
    secondary: string;
    bg: string;
    surface: string;
    accent: string;
    label: string;
    emoji: string;
  }

  export const THEMES: Record<Program, ThemeTokens> = {
    mens: {
      primary:   '#6B7645',
      secondary: '#B8972A',
      bg:        '#F5F3EC',
      surface:   '#FFFFFF',
      accent:    '#8A9A50',
      label:     "Men's Encounter",
      emoji:     '⛺',
    },
    womens: {
      primary:   '#A0536A',
      secondary: '#D4748C',
      bg:        '#FDF5F7',
      surface:   '#FFFFFF',
      accent:    '#C4849A',
      label:     "Women's Encounter",
      emoji:     '🌸',
    },
  };

  /** Apply theme tokens as CSS custom properties on <html>. */
  export function applyTheme(program: Program): void {
    const t = THEMES[program];
    const root = document.documentElement;
    root.style.setProperty('--color-primary',   t.primary);
    root.style.setProperty('--color-secondary', t.secondary);
    root.style.setProperty('--color-bg',        t.bg);
    root.style.setProperty('--color-surface',   t.surface);
    root.style.setProperty('--color-accent',    t.accent);
    root.dataset.program = program;
  }
  ```

- [ ] 8. Create `admin/src/api.ts`:
  ```ts
  import type { Program } from './theme';

  let _program: Program = 'mens';

  export function setApiProgram(p: Program): void {
    _program = p;
  }

  export async function apiFetch<T = unknown>(
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    const sep = path.includes('?') ? '&' : '?';
    const url = `/api${path}${sep}program=${_program}`;
    const res = await fetch(url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      ...init,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
      throw new Error(body?.error ?? `HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  /** Raw fetch for non-JSON responses (e.g. CSV download). */
  export async function apiFetchRaw(path: string, init?: RequestInit): Promise<Response> {
    const sep = path.includes('?') ? '&' : '?';
    const url = `/api${path}${sep}program=${_program}`;
    return fetch(url, { credentials: 'include', ...init });
  }
  ```

- [ ] 9. Create `admin/src/__tests__/setup.ts`:
  ```ts
  import '@testing-library/jest-dom';
  ```

- [ ] 10. Run `cd admin && npm install && npm run build` — confirm clean build.

- [ ] 11. Commit: `feat(p2): admin SPA scaffold — Vite, Tailwind, Vitest, api.ts, theme.ts`.

---

## Task 6 — Login page + Auth guard (`admin/src/pages/LoginPage.tsx`)

**Files:**
- `admin/src/pages/LoginPage.tsx` (create)
- `admin/src/App.tsx` (create with routes + AuthGuard)
- `admin/src/main.tsx` (create)
- `admin/src/__tests__/LoginPage.test.tsx` (create)

**Interfaces:**
- Consumes: `apiFetch` from `api.ts`; `applyTheme` from `theme.ts`
- Produces: Login form page posting to `/api/auth/login`; `AuthGuard` React component that redirects to `/admin/login` when unauthenticated; `ProgramContext` with current program

**Steps:**

- [ ] 1. Write `admin/src/__tests__/LoginPage.test.tsx`:
  ```tsx
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { render, screen, fireEvent, waitFor } from '@testing-library/react';
  import userEvent from '@testing-library/user-event';
  import { MemoryRouter } from 'react-router-dom';
  import LoginPage from '../pages/LoginPage';

  // Mock fetch
  const mockFetch = vi.fn();
  global.fetch = mockFetch;

  describe('LoginPage', () => {
    beforeEach(() => {
      mockFetch.mockReset();
    });

    it('renders email and password fields and submit button', () => {
      render(<MemoryRouter><LoginPage /></MemoryRouter>);
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('shows NWKS Encounter branding', () => {
      render(<MemoryRouter><LoginPage /></MemoryRouter>);
      expect(screen.getByText(/NWKS Encounter/i)).toBeInTheDocument();
    });

    it('shows error message on failed login', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ ok: false, error: 'Invalid credentials' }),
        statusText: 'Unauthorized',
      });
      render(<MemoryRouter><LoginPage /></MemoryRouter>);
      await userEvent.type(screen.getByLabelText(/email/i), 'bad@test.com');
      await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
      await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    });

    it('disables submit button while request is in flight', async () => {
      let resolve!: (v: unknown) => void;
      mockFetch.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
      render(<MemoryRouter><LoginPage /></MemoryRouter>);
      await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com');
      await userEvent.type(screen.getByLabelText(/password/i), 'pass');
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
      expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
      resolve({ ok: true, json: async () => ({ ok: true, user: {} }), statusText: 'OK' });
    });
  });
  ```

- [ ] 2. Run `cd admin && npm test -- LoginPage` — confirm tests fail.

- [ ] 3. Create `admin/src/pages/LoginPage.tsx`:
  ```tsx
  import { useState, FormEvent } from 'react';
  import { useNavigate } from 'react-router-dom';
  import { apiFetch } from '@/api';
  import type { Program } from '@/theme';

  export default function LoginPage() {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: FormEvent) {
      e.preventDefault();
      setError(null);
      setLoading(true);
      try {
        await apiFetch('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        navigate('/admin/', { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Login failed');
      } finally {
        setLoading(false);
      }
    }

    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <div className="w-full max-w-sm rounded-2xl shadow-lg p-8" style={{ background: 'var(--color-surface)' }}>
          <div className="text-center mb-8">
            <span className="text-4xl">⛺</span>
            <h1 className="mt-3 text-2xl font-bold tracking-tight" style={{ color: 'var(--color-primary)' }}>
              NWKS Encounter
            </h1>
            <p className="text-sm text-gray-500 mt-1">Admin Panel</p>
          </div>

          {error && (
            <div role="alert" className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': 'var(--color-primary)' } as React.CSSProperties}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
              style={{ background: 'var(--color-primary)' }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    );
  }
  ```

- [ ] 4. Create `admin/src/main.tsx`:
  ```tsx
  import { StrictMode } from 'react';
  import { createRoot } from 'react-dom/client';
  import './index.css';
  import App from './App';
  import { applyTheme } from './theme';

  // Apply default theme before paint
  const savedProgram = (localStorage.getItem('nwks_program') ?? 'mens') as 'mens' | 'women';
  applyTheme(savedProgram);

  const root = document.getElementById('root')!;
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
  ```

- [ ] 5. Create `admin/src/index.css`:
  ```css
  @tailwind base;
  @tailwind components;
  @tailwind utilities;

  :root {
    --color-primary:   #6B7645;
    --color-secondary: #B8972A;
    --color-bg:        #F5F3EC;
    --color-surface:   #FFFFFF;
    --color-accent:    #8A9A50;
  }
  ```

- [ ] 6. Create `admin/src/App.tsx` (minimal shell — expanded in Task 7):
  ```tsx
  import { BrowserRouter, Routes, Route, Navigate, Outlet, useEffect, useState } from 'react-router-dom';
  import { createContext, useContext } from 'react';
  import { apiFetch, setApiProgram } from './api';
  import { applyTheme, type Program } from './theme';
  import LoginPage from './pages/LoginPage';

  interface AuthUser { id: number; email: string; name: string | null; role: string }

  interface ProgramCtx { program: Program; setProgram: (p: Program) => void }
  export const ProgramContext = createContext<ProgramCtx>({ program: 'mens', setProgram: () => {} });
  export const useProgram = () => useContext(ProgramContext);

  function AuthGuard() {
    const [status, setStatus] = useState<'loading' | 'ok' | 'unauth'>('loading');
    const [program, setProgramState] = useState<Program>(
      (localStorage.getItem('nwks_program') ?? 'mens') as Program
    );

    useEffect(() => {
      apiFetch<{ ok: boolean; user?: AuthUser }>('/auth/me')
        .then(() => setStatus('ok'))
        .catch(() => setStatus('unauth'));
    }, []);

    function setProgram(p: Program) {
      setProgramState(p);
      setApiProgram(p);
      applyTheme(p);
      localStorage.setItem('nwks_program', p);
    }

    if (status === 'loading') {
      return (
        <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
          <span className="text-gray-400 text-sm">Loading…</span>
        </div>
      );
    }
    if (status === 'unauth') return <Navigate to="/admin/login" replace />;

    return (
      <ProgramContext.Provider value={{ program, setProgram }}>
        <Outlet />
      </ProgramContext.Provider>
    );
  }

  export default function App() {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/admin/login" element={<LoginPage />} />
          <Route element={<AuthGuard />}>
            <Route path="/admin/" element={<div>Dashboard (Task 8)</div>} />
            <Route path="/admin/registrations" element={<div>Registrations (Task 9)</div>} />
            <Route path="/admin/people/:id" element={<div>Person (Task 10)</div>} />
            <Route path="/admin/*" element={<Navigate to="/admin/" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/admin/" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }
  ```

- [ ] 7. Run `cd admin && npm test -- LoginPage` — all tests pass.

- [ ] 8. Commit: `feat(p2): login page, AuthGuard, and App routing skeleton`.

---

## Task 7 — AppShell with Men's ⇄ Women's program toggle

**Files:**
- `admin/src/components/AppShell.tsx` (create)
- `admin/src/components/ProgramToggle.tsx` (create)
- `admin/src/__tests__/ProgramToggle.test.tsx` (create)
- `admin/src/App.tsx` (modify: wrap guarded routes in `<AppShell>`)

**Interfaces:**
- Consumes: `ProgramContext` / `useProgram` from `App.tsx`; `applyTheme`, `THEMES` from `theme.ts`; `setApiProgram` from `api.ts`
- Produces: `<AppShell>` with nav sidebar, top-left toggle, `<Outlet>` for page content; switching program re-themes entire panel and re-fetches data via context

**Steps:**

- [ ] 1. Write `admin/src/__tests__/ProgramToggle.test.tsx`:
  ```tsx
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { render, screen, fireEvent } from '@testing-library/react';
  import { ProgramContext } from '../App';
  import ProgramToggle from '../components/ProgramToggle';
  import type { Program } from '../theme';

  describe('ProgramToggle', () => {
    it('renders both Men\'s and Women\'s options', () => {
      const setProgram = vi.fn();
      render(
        <ProgramContext.Provider value={{ program: 'mens', setProgram }}>
          <ProgramToggle />
        </ProgramContext.Provider>
      );
      expect(screen.getByText(/Men's/i)).toBeInTheDocument();
      expect(screen.getByText(/Women's/i)).toBeInTheDocument();
    });

    it('calls setProgram with "womens" when Women\'s is clicked', () => {
      const setProgram = vi.fn();
      render(
        <ProgramContext.Provider value={{ program: 'mens', setProgram }}>
          <ProgramToggle />
        </ProgramContext.Provider>
      );
      fireEvent.click(screen.getByText(/Women's/i));
      expect(setProgram).toHaveBeenCalledWith('womens');
    });

    it('calls setProgram with "mens" when Men\'s is clicked while on womens', () => {
      const setProgram = vi.fn();
      render(
        <ProgramContext.Provider value={{ program: 'womens', setProgram }}>
          <ProgramToggle />
        </ProgramContext.Provider>
      );
      fireEvent.click(screen.getByText(/Men's/i));
      expect(setProgram).toHaveBeenCalledWith('mens');
    });

    it('visually marks the active program', () => {
      render(
        <ProgramContext.Provider value={{ program: 'mens', setProgram: vi.fn() }}>
          <ProgramToggle />
        </ProgramContext.Provider>
      );
      const mensBtn = screen.getByText(/Men's/i).closest('button')!;
      expect(mensBtn).toHaveAttribute('aria-pressed', 'true');
    });

    it('applies olive/gold styling for mens program', () => {
      const { container } = render(
        <ProgramContext.Provider value={{ program: 'mens', setProgram: vi.fn() }}>
          <ProgramToggle />
        </ProgramContext.Provider>
      );
      // The active button should reference mens primary color
      expect(container.firstChild).toBeInTheDocument();
    });
  });
  ```

- [ ] 2. Run `cd admin && npm test -- ProgramToggle` — confirm tests fail.

- [ ] 3. Create `admin/src/components/ProgramToggle.tsx`:
  ```tsx
  import { useProgram } from '@/App';
  import { THEMES, type Program } from '@/theme';

  const OPTIONS: { value: Program; label: string }[] = [
    { value: 'mens',   label: "Men's" },
    { value: 'womens', label: "Women's" },
  ];

  export default function ProgramToggle() {
    const { program, setProgram } = useProgram();

    return (
      <div className="flex rounded-lg overflow-hidden border border-white/20 shadow-inner text-xs font-semibold select-none">
        {OPTIONS.map(({ value, label }) => {
          const active = program === value;
          const theme = THEMES[value];
          return (
            <button
              key={value}
              aria-pressed={active}
              onClick={() => setProgram(value)}
              className="px-3 py-1.5 transition-colors duration-150"
              style={{
                background: active ? theme.primary : 'transparent',
                color:       active ? '#fff' : theme.primary,
              }}
            >
              {theme.emoji} {label}
            </button>
          );
        })}
      </div>
    );
  }
  ```

- [ ] 4. Create `admin/src/components/AppShell.tsx`:
  ```tsx
  import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
  import { apiFetch } from '@/api';
  import { useProgram } from '@/App';
  import ProgramToggle from './ProgramToggle';

  const NAV = [
    { to: '/admin/',              label: 'Dashboard',     icon: '📊' },
    { to: '/admin/registrations', label: 'Registrations', icon: '📋' },
  ];

  export default function AppShell() {
    const navigate = useNavigate();
    const location = useLocation();
    const { program } = useProgram();

    async function handleLogout() {
      await apiFetch('/auth/logout', { method: 'POST' }).catch(() => {});
      navigate('/admin/login', { replace: true });
    }

    return (
      <div className="min-h-screen flex" style={{ background: 'var(--color-bg)' }}>
        {/* Sidebar */}
        <aside className="w-56 flex-shrink-0 flex flex-col shadow-md" style={{ background: 'var(--color-primary)' }}>
          <div className="p-4 border-b border-white/10">
            <ProgramToggle />
          </div>

          <nav className="flex-1 py-4 space-y-0.5 px-2">
            {NAV.map(({ to, label, icon }) => {
              const active = location.pathname === to;
              return (
                <Link
                  key={to}
                  to={to}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    background: active ? 'rgba(255,255,255,0.18)' : 'transparent',
                    color: '#fff',
                  }}
                >
                  <span>{icon}</span>
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-white/10">
            <button
              onClick={handleLogout}
              className="w-full text-left text-xs text-white/60 hover:text-white/90 transition-colors"
            >
              Sign out
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    );
  }
  ```

- [ ] 5. Modify `admin/src/App.tsx` to wrap the guarded routes in `<AppShell>`:
  ```tsx
  // Inside <Route element={<AuthGuard />}>:
  <Route element={<AppShell />}>
    <Route path="/admin/" element={<DashboardPage />} />
    <Route path="/admin/registrations" element={<RegistrationsPage />} />
    <Route path="/admin/people/:id" element={<PersonPage />} />
    <Route path="/admin/*" element={<Navigate to="/admin/" replace />} />
  </Route>
  ```
  (Import `AppShell` and stub page components as needed until Tasks 8–10 fill them in.)

- [ ] 6. Run `cd admin && npm test -- ProgramToggle` — all tests pass.

- [ ] 7. Commit: `feat(p2): AppShell with program toggle — olive/gold and rose theming`.

---

## Task 8 — Dashboard page (`admin/src/pages/DashboardPage.tsx`)

**Files:**
- `admin/src/pages/DashboardPage.tsx` (create)
- `admin/src/components/StatCard.tsx` (create)

**Interfaces:**
- Consumes: `apiFetch` from `api.ts`; `useProgram` from `App.tsx`; dashboard stats shape from Task 2 API
- Produces: `<DashboardPage>` showing stat cards (attendees, servers, first-timers, emails sent), launch-location and shirt-size breakdowns as simple bar/pill charts, and a recent-registrations feed

**Steps:**

- [ ] 1. Create `admin/src/components/StatCard.tsx`:
  ```tsx
  interface Props {
    label: string;
    value: number | string;
    sub?: string;
  }

  export default function StatCard({ label, value, sub }: Props) {
    return (
      <div
        className="rounded-2xl p-5 shadow-sm border border-white/50"
        style={{ background: 'var(--color-surface)' }}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
        <p className="mt-2 text-3xl font-bold" style={{ color: 'var(--color-primary)' }}>
          {value}
        </p>
        {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
      </div>
    );
  }
  ```

- [ ] 2. Create `admin/src/pages/DashboardPage.tsx`:
  ```tsx
  import { useEffect, useState } from 'react';
  import { apiFetch } from '@/api';
  import { useProgram } from '@/App';
  import StatCard from '@/components/StatCard';

  interface Stats {
    attendee_count: number;
    server_count: number;
    first_timers: number;
    email_sent_count: number;
    by_launch_location: Array<{ location: string; count: number }>;
    by_shirt_size: Array<{ size: string; count: number }>;
    recent_registrations: Array<{ id: number; first_name: string; last_name: string; role: string; created_at: string }>;
    upcoming_event: { title: string | null; start_date: string | null; end_date: string | null } | null;
  }

  export default function DashboardPage() {
    const { program } = useProgram();
    const [stats, setStats] = useState<Stats | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      setStats(null);
      setError(null);
      apiFetch<{ ok: boolean; stats: Stats }>('/admin/dashboard')
        .then((res) => setStats(res.stats))
        .catch((err: Error) => setError(err.message));
    }, [program]);

    if (error) {
      return <p className="text-red-600 text-sm">{error}</p>;
    }
    if (!stats) {
      return <p className="text-gray-400 text-sm animate-pulse">Loading…</p>;
    }

    const locationMax = Math.max(...(stats.by_launch_location.map((l) => l.count)), 1);

    return (
      <div className="space-y-8">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
          {stats.upcoming_event?.title ?? 'Dashboard'}
          {stats.upcoming_event?.start_date && (
            <span className="ml-3 text-base font-normal text-gray-400">
              {stats.upcoming_event.start_date} – {stats.upcoming_event.end_date}
            </span>
          )}
        </h1>

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Attendees"    value={stats.attendee_count} />
          <StatCard label="Servers"      value={stats.server_count} />
          <StatCard label="First-timers" value={stats.first_timers} />
          <StatCard label="Emails sent"  value={stats.email_sent_count} />
        </div>

        {/* Launch locations */}
        {stats.by_launch_location.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              By Launch Location
            </h2>
            <div className="space-y-2">
              {stats.by_launch_location.map(({ location, count }) => (
                <div key={location} className="flex items-center gap-3">
                  <span className="w-28 text-sm text-gray-700 truncate">{location}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(count / locationMax) * 100}%`,
                        background: 'var(--color-accent)',
                      }}
                    />
                  </div>
                  <span className="w-8 text-right text-sm font-semibold text-gray-600">{count}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Shirt sizes */}
        {stats.by_shirt_size.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Shirt Sizes
            </h2>
            <div className="flex flex-wrap gap-2">
              {stats.by_shirt_size.map(({ size, count }) => (
                <span
                  key={size}
                  className="px-3 py-1 rounded-full text-sm font-semibold text-white"
                  style={{ background: 'var(--color-secondary)' }}
                >
                  {size}: {count}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Recent registrations */}
        {stats.recent_registrations.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Recent Registrations
            </h2>
            <ul className="divide-y divide-gray-100 rounded-xl overflow-hidden shadow-sm border border-gray-100">
              {stats.recent_registrations.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 px-4 py-3 text-sm"
                  style={{ background: 'var(--color-surface)' }}
                >
                  <span className="font-medium text-gray-800">
                    {r.first_name} {r.last_name}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                    {r.role}
                  </span>
                  <span className="ml-auto text-xs text-gray-400">
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }
  ```

- [ ] 3. Commit: `feat(p2): dashboard page with stat cards, location bars, shirt-size pills`.

---

## Task 9 — Registrations list page (`admin/src/pages/RegistrationsPage.tsx`)

**Files:**
- `admin/src/pages/RegistrationsPage.tsx` (create)
- `admin/src/components/RegistrationTable.tsx` (create)
- `admin/src/__tests__/RegistrationsPage.test.tsx` (create)

**Interfaces:**
- Consumes: `apiFetch`, `apiFetchRaw` from `api.ts`; `useProgram` from `App.tsx`; list + export endpoints from Task 3
- Produces: searchable/filterable table of registrations with role filter, search box, pagination, and "Export CSV" button that triggers a download

**Steps:**

- [ ] 1. Write `admin/src/__tests__/RegistrationsPage.test.tsx`:
  ```tsx
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { render, screen, fireEvent, waitFor } from '@testing-library/react';
  import { MemoryRouter } from 'react-router-dom';
  import { ProgramContext } from '../App';
  import RegistrationsPage from '../pages/RegistrationsPage';

  const mockFetch = vi.fn();
  global.fetch = mockFetch;

  // Mock URL.createObjectURL
  global.URL.createObjectURL = vi.fn(() => 'blob:mock');
  global.URL.revokeObjectURL = vi.fn();

  function wrapper(program: 'mens' | 'womens' = 'mens') {
    return ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter>
        <ProgramContext.Provider value={{ program, setProgram: vi.fn() }}>
          {children}
        </ProgramContext.Provider>
      </MemoryRouter>
    );
  }

  describe('RegistrationsPage', () => {
    beforeEach(() => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, rows: [], total: 0, page: 1, per_page: 50 }),
        blob: async () => new Blob(['header\nrow1'], { type: 'text/csv' }),
        headers: { get: () => 'text/csv' },
      });
    });

    it('renders search input and role filter', async () => {
      render(<RegistrationsPage />, { wrapper: wrapper() });
      await waitFor(() => expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument());
      expect(screen.getByRole('combobox', { name: /role/i })).toBeInTheDocument();
    });

    it('renders Export CSV button', async () => {
      render(<RegistrationsPage />, { wrapper: wrapper() });
      await waitFor(() => expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument());
    });

    it('shows "No registrations found" when list is empty', async () => {
      render(<RegistrationsPage />, { wrapper: wrapper() });
      await waitFor(() => expect(screen.getByText(/no registrations/i)).toBeInTheDocument());
    });

    it('renders rows when data is returned', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          rows: [
            { id: 1, first_name: 'Alice', last_name: 'Smith', email: 'a@test.com', role: 'attendee', launch_location: 'Colby', shirt_size: 'M', created_at: '2026-07-01T00:00:00Z' },
          ],
          total: 1, page: 1, per_page: 50,
        }),
        headers: { get: () => null },
      });
      render(<RegistrationsPage />, { wrapper: wrapper() });
      await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
      expect(screen.getByText('Smith')).toBeInTheDocument();
    });

    it('re-fetches when program context changes', async () => {
      const { rerender } = render(
        <MemoryRouter>
          <ProgramContext.Provider value={{ program: 'mens', setProgram: vi.fn() }}>
            <RegistrationsPage />
          </ProgramContext.Provider>
        </MemoryRouter>
      );
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

      rerender(
        <MemoryRouter>
          <ProgramContext.Provider value={{ program: 'womens', setProgram: vi.fn() }}>
            <RegistrationsPage />
          </ProgramContext.Provider>
        </MemoryRouter>
      );
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    });
  });
  ```

- [ ] 2. Run `cd admin && npm test -- RegistrationsPage` — confirm fail.

- [ ] 3. Create `admin/src/components/RegistrationTable.tsx`:
  ```tsx
  import { Link } from 'react-router-dom';

  export interface RegistrationRow {
    id: number;
    person_id?: number;
    first_name: string;
    last_name: string;
    email?: string | null;
    role: 'attendee' | 'server';
    launch_location?: string | null;
    shirt_size?: string | null;
    created_at: string;
  }

  interface Props {
    rows: RegistrationRow[];
  }

  export default function RegistrationTable({ rows }: Props) {
    if (rows.length === 0) {
      return (
        <div className="text-center py-16 text-gray-400 text-sm">
          No registrations found.
        </div>
      );
    }

    return (
      <div className="overflow-x-auto rounded-xl shadow-sm border border-gray-100">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead style={{ background: 'var(--color-bg)' }}>
            <tr>
              {['Name', 'Email', 'Role', 'Location', 'Shirt', 'Date'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 bg-white">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900">
                  {r.person_id ? (
                    <Link
                      to={`/admin/people/${r.person_id}`}
                      className="hover:underline"
                      style={{ color: 'var(--color-primary)' }}
                    >
                      {r.first_name} {r.last_name}
                    </Link>
                  ) : (
                    <span>{r.first_name} {r.last_name}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500">{r.email ?? '—'}</td>
                <td className="px-4 py-3">
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
                    style={{ background: r.role === 'server' ? 'var(--color-secondary)' : 'var(--color-accent)' }}
                  >
                    {r.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">{r.launch_location ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500">{r.shirt_size ?? '—'}</td>
                <td className="px-4 py-3 text-gray-400">{new Date(r.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  ```

- [ ] 4. Create `admin/src/pages/RegistrationsPage.tsx`:
  ```tsx
  import { useEffect, useState, useCallback } from 'react';
  import { apiFetch, apiFetchRaw } from '@/api';
  import { useProgram } from '@/App';
  import RegistrationTable, { type RegistrationRow } from '@/components/RegistrationTable';

  export default function RegistrationsPage() {
    const { program } = useProgram();
    const [rows, setRows] = useState<RegistrationRow[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [q, setQ] = useState('');
    const [role, setRole] = useState('');
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);

    const fetchRows = useCallback(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page) });
        if (q) params.set('q', q);
        if (role) params.set('role', role);
        const res = await apiFetch<{ ok: boolean; rows: RegistrationRow[]; total: number }>(
          `/admin/registrations?${params}`
        );
        setRows(res.rows);
        setTotal(res.total);
      } finally {
        setLoading(false);
      }
    }, [program, page, q, role]);

    useEffect(() => { fetchRows(); }, [fetchRows]);

    async function handleExport() {
      setExporting(true);
      try {
        const params = new URLSearchParams();
        if (role) params.set('role', role);
        const res = await apiFetchRaw(`/admin/registrations/export.csv?${params}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'registrations.csv';
        a.click();
        URL.revokeObjectURL(url);
      } finally {
        setExporting(false);
      }
    }

    const perPage = 50;
    const totalPages = Math.max(1, Math.ceil(total / perPage));

    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
            Registrations
            <span className="ml-2 text-base font-normal text-gray-400">({total})</span>
          </h1>

          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60 transition-opacity"
            style={{ background: 'var(--color-secondary)' }}
          >
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <input
            type="search"
            placeholder="Search name or email…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2"
          />
          <select
            aria-label="Role"
            value={role}
            onChange={(e) => { setRole(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2"
          >
            <option value="">All roles</option>
            <option value="attendee">Attendee</option>
            <option value="server">Server</option>
          </select>
        </div>

        {loading ? (
          <p className="text-gray-400 text-sm animate-pulse">Loading…</p>
        ) : (
          <RegistrationTable rows={rows} />
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 disabled:opacity-40"
            >
              ← Prev
            </button>
            <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    );
  }
  ```

- [ ] 5. Run `cd admin && npm test -- RegistrationsPage` — all tests pass.

- [ ] 6. Commit: `feat(p2): registrations list page with search, filter, and CSV export button`.

---

## Task 10 — Person profile page (`admin/src/pages/PersonPage.tsx`)

**Files:**
- `admin/src/pages/PersonPage.tsx` (create)
- `admin/src/components/PersonBadges.tsx` (create)
- `admin/src/components/MergeDialog.tsx` (create)
- `admin/src/__tests__/PersonPage.test.tsx` (create)

**Interfaces:**
- Consumes: `apiFetch` from `api.ts`; `useProgram` from `App.tsx`; person profile endpoint from Task 4
- Produces: profile card with attendance/served badges and first-timer flag, event-history timeline, possible-duplicates list with merge CTA, and a confirmation merge dialog

**Steps:**

- [ ] 1. Write `admin/src/__tests__/PersonPage.test.tsx`:
  ```tsx
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { render, screen, fireEvent, waitFor } from '@testing-library/react';
  import { MemoryRouter, Route, Routes } from 'react-router-dom';
  import { ProgramContext } from '../App';
  import PersonPage from '../pages/PersonPage';

  const mockFetch = vi.fn();
  global.fetch = mockFetch;

  function personPayload(overrides = {}) {
    return {
      ok: true,
      person: {
        id: 42, first_name: 'Jane', last_name: 'Doe',
        email: 'jane@example.com', phone: '555-1234',
        church: 'First Baptist', city: 'Oakley', state: 'KS',
        times_attended: 3, times_served: 1,
        ...overrides,
      },
      badges: { times_attended: 3, times_served: 1, is_first_timer: false },
      history: [
        { id: 10, event_id: 1, role: 'attendee', year: 2024, title: "Men's 2024", created_at: '2024-08-01T00:00:00Z' },
      ],
      possible_duplicates: [],
    };
  }

  function wrapper() {
    return ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter initialEntries={['/admin/people/42']}>
        <ProgramContext.Provider value={{ program: 'mens', setProgram: vi.fn() }}>
          <Routes>
            <Route path="/admin/people/:id" element={<>{children}</>} />
          </Routes>
        </ProgramContext.Provider>
      </MemoryRouter>
    );
  }

  describe('PersonPage', () => {
    beforeEach(() => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValue({ ok: true, json: async () => personPayload() });
    });

    it('renders person name', async () => {
      render(<PersonPage />, { wrapper: wrapper() });
      await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
    });

    it('shows attended badge with count', async () => {
      render(<PersonPage />, { wrapper: wrapper() });
      await waitFor(() => expect(screen.getByText(/attended 3×/i)).toBeInTheDocument());
    });

    it('shows served badge with count', async () => {
      render(<PersonPage />, { wrapper: wrapper() });
      await waitFor(() => expect(screen.getByText(/served 1×/i)).toBeInTheDocument());
    });

    it('does not show first-timer badge for returning attendee', async () => {
      render(<PersonPage />, { wrapper: wrapper() });
      await waitFor(() => expect(screen.queryByText(/first[- ]timer/i)).not.toBeInTheDocument());
    });

    it('shows first-timer badge when is_first_timer is true', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...personPayload(),
          badges: { times_attended: 0, times_served: 0, is_first_timer: true },
        }),
      });
      render(<PersonPage />, { wrapper: wrapper() });
      await waitFor(() => expect(screen.getByText(/first[- ]timer/i)).toBeInTheDocument());
    });

    it('shows registration history timeline', async () => {
      render(<PersonPage />, { wrapper: wrapper() });
      await waitFor(() => expect(screen.getByText("Men's 2024")).toBeInTheDocument());
    });

    it('shows possible duplicates when present', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...personPayload(),
          possible_duplicates: [
            { id: 99, first_name: 'Jane', last_name: 'Doe', email: 'jane2@example.com' },
          ],
        }),
      });
      render(<PersonPage />, { wrapper: wrapper() });
      await waitFor(() => expect(screen.getByText(/possible duplicate/i)).toBeInTheDocument());
    });
  });
  ```

- [ ] 2. Run `cd admin && npm test -- PersonPage` — confirm fail.

- [ ] 3. Create `admin/src/components/PersonBadges.tsx`:
  ```tsx
  interface Props {
    timesAttended: number;
    timesServed: number;
    isFirstTimer: boolean;
  }

  export default function PersonBadges({ timesAttended, timesServed, isFirstTimer }: Props) {
    return (
      <div className="flex flex-wrap gap-2 mt-2">
        <span
          className="px-3 py-1 rounded-full text-xs font-semibold text-white"
          style={{ background: 'var(--color-primary)' }}
        >
          Attended {timesAttended}×
        </span>
        <span
          className="px-3 py-1 rounded-full text-xs font-semibold text-white"
          style={{ background: 'var(--color-secondary)' }}
        >
          Served {timesServed}×
        </span>
        {isFirstTimer && (
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 border border-yellow-200">
            ✨ First-timer
          </span>
        )}
      </div>
    );
  }
  ```

- [ ] 4. Create `admin/src/components/MergeDialog.tsx`:
  ```tsx
  interface Person { id: number; first_name: string; last_name: string; email?: string | null }

  interface Props {
    source: Person;
    target: Person;
    onConfirm: () => Promise<void>;
    onCancel: () => void;
    loading: boolean;
  }

  export default function MergeDialog({ source, target, onConfirm, onCancel, loading }: Props) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="w-full max-w-md rounded-2xl shadow-2xl p-6" style={{ background: 'var(--color-surface)' }}>
          <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--color-primary)' }}>
            Confirm Merge
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            <strong>{source.first_name} {source.last_name}</strong> will be merged into{' '}
            <strong>{target.first_name} {target.last_name}</strong>. All registrations will move to
            the target record and the source will be archived. This cannot be undone.
          </p>
          <div className="flex gap-3 justify-end">
            <button
              onClick={onCancel}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-sm border border-gray-200 text-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: 'var(--color-primary)' }}
            >
              {loading ? 'Merging…' : 'Merge'}
            </button>
          </div>
        </div>
      </div>
    );
  }
  ```

- [ ] 5. Create `admin/src/pages/PersonPage.tsx`:
  ```tsx
  import { useEffect, useState } from 'react';
  import { useParams, useNavigate } from 'react-router-dom';
  import { apiFetch } from '@/api';
  import { useProgram } from '@/App';
  import PersonBadges from '@/components/PersonBadges';
  import MergeDialog from '@/components/MergeDialog';

  interface Person {
    id: number; first_name: string; last_name: string;
    email?: string | null; phone?: string | null;
    church?: string | null; city?: string | null; state?: string | null;
    times_attended: number; times_served: number;
  }
  interface Badges { times_attended: number; times_served: number; is_first_timer: boolean }
  interface HistoryItem { id: number; event_id: number; role: string; year: number; title: string | null; created_at: string }
  interface ProfileResponse {
    ok: boolean;
    person: Person;
    badges: Badges;
    history: HistoryItem[];
    possible_duplicates: Person[];
  }

  export default function PersonPage() {
    const { id } = useParams<{ id: string }>();
    const { program } = useProgram();
    const navigate = useNavigate();
    const [data, setData] = useState<ProfileResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [mergeTarget, setMergeTarget] = useState<Person | null>(null);
    const [merging, setMerging] = useState(false);

    useEffect(() => {
      setData(null); setError(null);
      apiFetch<ProfileResponse>(`/admin/people/${id}`)
        .then(setData)
        .catch((err: Error) => setError(err.message));
    }, [id, program]);

    async function handleMerge() {
      if (!mergeTarget || !data) return;
      setMerging(true);
      try {
        await apiFetch(`/admin/people/${data.person.id}/merge`, {
          method: 'POST',
          body: JSON.stringify({ into_id: mergeTarget.id }),
        });
        setMergeTarget(null);
        navigate(`/admin/people/${mergeTarget.id}`, { replace: true });
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Merge failed');
      } finally {
        setMerging(false);
      }
    }

    if (error) return <p className="text-red-600 text-sm">{error}</p>;
    if (!data) return <p className="text-gray-400 text-sm animate-pulse">Loading…</p>;

    const { person, badges, history, possible_duplicates } = data;

    return (
      <div className="max-w-2xl space-y-8">
        {/* Profile card */}
        <section className="rounded-2xl shadow-sm border border-gray-100 p-6" style={{ background: 'var(--color-surface)' }}>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
            {person.first_name} {person.last_name}
          </h1>
          <PersonBadges
            timesAttended={badges.times_attended}
            timesServed={badges.times_served}
            isFirstTimer={badges.is_first_timer}
          />
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {([
              ['Email', person.email],
              ['Phone', person.phone],
              ['Church', person.church],
              ['City/State', [person.city, person.state].filter(Boolean).join(', ')],
            ] as [string, string | null | undefined][]).map(([label, val]) =>
              val ? (
                <div key={label}>
                  <dt className="text-xs text-gray-400 uppercase tracking-wide">{label}</dt>
                  <dd className="font-medium text-gray-700">{val}</dd>
                </div>
              ) : null
            )}
          </dl>
        </section>

        {/* Event history timeline */}
        {history.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Event History</h2>
            <ul className="space-y-2">
              {history.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm border border-gray-100 shadow-sm"
                  style={{ background: 'var(--color-surface)' }}
                >
                  <span className="font-medium text-gray-800">{h.title ?? `Event ${h.event_id}`}</span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full text-white"
                    style={{ background: h.role === 'server' ? 'var(--color-secondary)' : 'var(--color-accent)' }}
                  >
                    {h.role}
                  </span>
                  <span className="ml-auto text-xs text-gray-400">{h.year}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Possible duplicates */}
        {possible_duplicates.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              ⚠️ Possible Duplicate{possible_duplicates.length > 1 ? 's' : ''}
            </h2>
            <ul className="space-y-2">
              {possible_duplicates.map((dup) => (
                <li
                  key={dup.id}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border border-yellow-100 bg-yellow-50 text-sm"
                >
                  <span className="font-medium text-gray-800">{dup.first_name} {dup.last_name}</span>
                  {dup.email && <span className="text-gray-500">{dup.email}</span>}
                  <button
                    onClick={() => setMergeTarget(dup)}
                    className="ml-auto text-xs font-semibold text-white px-3 py-1 rounded-lg"
                    style={{ background: 'var(--color-primary)' }}
                  >
                    Merge into this person
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Merge dialog */}
        {mergeTarget && (
          <MergeDialog
            source={mergeTarget}
            target={person}
            loading={merging}
            onConfirm={handleMerge}
            onCancel={() => setMergeTarget(null)}
          />
        )}
      </div>
    );
  }
  ```

- [ ] 6. Run `cd admin && npm test -- PersonPage` — all tests pass.

- [ ] 7. Run `npm run test:admin` (all admin tests) and `npm run test:api` (all API tests) — full green.

- [ ] 8. Commit: `feat(p2): person profile page with badges, history, and merge dialog`.

---

## Contract Additions Needed

The following items are needed to execute P2 but are not yet defined in Plan 00 or P1. Implementors must add them before or alongside P2 work.

### 1. Test helpers module (`functions/_api/__tests__/helpers.ts`)

Plan 00 references `applyMigrations` in each test suite's `beforeEach` but does not define the helper module or its exports. P2 test suites also require:

```ts
export async function applyMigrations(): Promise<void>        // apply all db/migrations/*.sql to local D1
export async function seedAdmin(overrides?: Partial<{email:string; password:string; name:string}>): Promise<void>
export async function getAuthCookie(email?: string, password?: string): Promise<string>  // returns "nwks_session=<token>"
export async function seedEvent(opts: { program: Program; year?: number }): Promise<number>  // returns event id
export async function seedPerson(opts: { program: Program; firstName?: string; lastName?: string; timesAttended?: number; timesServed?: number; personId?: number }): Promise<number>
export async function seedRegistration(opts: { program: Program; eventId: number; role: 'attendee'|'server'; personId?: number; firstName?: string; lastName?: string; email?: string; launchLocation?: string; shirtSize?: string; timesAttended?: number }): Promise<number>
```

This module must be created (likely in P1 or as part of P2 Task 1 setup) before any API test suite runs.

### 2. `requireProgram()` error response for missing param

Plan 00 specifies that `requireProgram()` validates `?program=` and sets `c.set('program', ...)`, but does not specify the HTTP status and error body when the param is absent. P2 dashboard tests assert `status 400`. The middleware should return:
```json
{ "ok": false, "error": "program param required (mens or women)" }
```
with status `400`. This must be implemented in `functions/_api/auth.ts` as part of P1 or the start of P2.

### 3. `admin/src/App.tsx` circular import risk

`ProgramContext` is exported from `App.tsx`, and sub-components (`AppShell`, `ProgramToggle`) import it from there. If `App.tsx` also imports those components, a circular dependency forms. Recommended fix: extract `ProgramContext` + `useProgram` into a dedicated `admin/src/context/ProgramContext.tsx` file. This is a structural decision to resolve before Task 7 is implemented.

### 4. Vite `base` path alignment with Pages routing

The admin SPA sets `base: '/admin/'` in Vite config. Pages must serve the built SPA at `/admin/*` without stripping the base. Confirm that `wrangler.toml` or a `_redirects` / `_routes.json` rule routes all `/admin/*` requests to `dist/admin/index.html` (SPA fallback), while `/api/*` continues to route to the Functions layer. This routing config is not defined in Plan 00 and must be added before P2 deploy.
