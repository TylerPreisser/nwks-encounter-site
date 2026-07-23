# NWKS Encounter — Event/Date Manager & Public Gateway Sync (Plan P3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Read the Foundation Contract (`plans/2026-07-23-nwks-encounter-00-foundation.md`) before starting — do NOT redefine the schema, naming, or conventions defined there; consume them verbatim. This plan depends on **P0** (scaffold, schema, bindings) and **P2** (admin auth, admin shell SPA, `requireAuth`/`requireProgram` middleware) being already in place.

**Goal:** Wire the `events` D1 table to both a full admin CRUD UI and the public gateway `index.html`, so the Men's and Women's event dates displayed on the gateway are always driven by D1 — never hardcoded. A single lightweight script (`public/date-sync.js`) fetches `/api/public/events/current` for both programs on gateway load and swaps the date text in-place with zero visual change. Seed data creates the two inaugural 2026 events so the gateway looks identical to today on first deploy.

**Architecture:** Pages Functions / Hono API (`functions/_api/routes/events.ts` + `publicRoutes.ts`) → D1 `events` table → `public/date-sync.js` DOM patch on the gateway. Admin SPA React page (`admin/src/pages/Events.tsx`) for CRUD. All within the single Cloudflare Pages project. No new bindings required.

**Tech Stack:** TypeScript 5, Hono 4, React 18 + Vite 5 + Tailwind 3, Vitest + `@cloudflare/vitest-pool-workers` (API tests), Vitest + React Testing Library + jsdom (admin tests), Playwright (E2E), jsdom (date-sync unit test).

**Global Constraints:** See Foundation Contract. Key reminders for P3:
- `index.html` + `assets/` must stay **byte-identical** except for the single `<script src="/date-sync.js" defer></script>` added before `</body>`. No class changes, no `id` additions to any existing element — use `data-nwks-date` attributes added alongside existing classes.
- All `events` table column names are exactly as defined in the Foundation Contract `0001_init.sql` (shown below under "events columns used").
- The only permitted write to `index.html` is the two `data-nwks-date` attributes on the existing `.dates` divs and the one `<script>` tag before `</body>`.
- Every task ends with a passing test + a commit.

---

## Events Table Columns (from Foundation Contract — do not redeclare)

```
id, program, year, title, start_date, end_date,
launch_locations (TEXT, JSON array of strings),
attendee_registration_open (INTEGER 0/1),
server_registration_open (INTEGER 0/1),
is_current (INTEGER 0/1),
created_at, updated_at
UNIQUE(program, year)
```

---

## File Structure (P3 additions only)

```
functions/
  _api/
    routes/
      events.ts              ← NEW: admin events CRUD router
      publicRoutes.ts        ← EXTEND: add GET /api/public/events/current
    __tests__/
      events.test.ts         ← NEW: API tests (admin routes + invariant)
      publicEvents.test.ts   ← NEW: API tests (public route)

admin/
  src/
    pages/
      Events.tsx             ← NEW: admin Events page
    __tests__/
      Events.test.tsx        ← NEW: RTL tests

public/
  date-sync.js               ← NEW: gateway date-swap script
  __tests__/
    date-sync.test.js        ← NEW: jsdom unit test

db/
  migrations/
    0003_seed_events.sql     ← NEW: seed two 2026 events

index.html                   ← MINIMAL EDIT (two data-nwks-date attrs + one <script> tag)

tests/
  e2e/
    gateway-dates.spec.ts    ← NEW: Playwright gateway visual check
```

---

## Contract Endpoints Consumed (verbatim from Foundation Contract)

| Method | Path | Auth |
|--------|------|------|
| `GET` | `/api/admin/events` | `requireAuth` + `requireProgram` |
| `POST` | `/api/admin/events` | `requireAuth` + `requireProgram` |
| `PATCH` | `/api/admin/events/:id` | `requireAuth` + `requireProgram` |
| `POST` | `/api/admin/events/:id/set-current` | `requireAuth` + `requireProgram` |
| `GET` | `/api/public/events/current?program=` | Public (unauthenticated) |

Response envelope: `{ ok: true, ...data }` / `{ ok: false, error: string }`.

---

## Task 1 — Admin events API router

**Files:** `functions/_api/routes/events.ts`

**Interface delivered:**
```ts
// Mounted at /api/admin/events on the Hono app (app.ts)
export const eventsRouter: Hono<{ Bindings: Env }>;
```

### Steps

- [ ] **1.1** Create `functions/_api/routes/events.ts`:

```ts
import { Hono } from 'hono';
import type { Env } from '../app';
import { requireAuth, requireProgram } from '../auth';
import { nowIso } from '../db';

export const eventsRouter = new Hono<{ Bindings: Env }>();

// All routes require auth + program
eventsRouter.use('*', requireAuth(), requireProgram());

// GET /api/admin/events?program=
eventsRouter.get('/', async (c) => {
  const program = c.get('program');
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM events WHERE program = ? ORDER BY year DESC`
  ).bind(program).all();
  return c.json({ ok: true, events: results });
});

// POST /api/admin/events  — create a new event for the program+year
eventsRouter.post('/', async (c) => {
  const program = c.get('program');
  const body = await c.req.json<{
    year: number;
    title?: string;
    start_date?: string;
    end_date?: string;
    launch_locations?: string[];
    attendee_registration_open?: boolean;
    server_registration_open?: boolean;
  }>();

  // Validation
  if (!body.year || typeof body.year !== 'number' || body.year < 2020 || body.year > 2100) {
    return c.json({ ok: false, error: 'year must be a number between 2020 and 2100' }, 400);
  }
  if (body.start_date && !/^\d{4}-\d{2}-\d{2}$/.test(body.start_date)) {
    return c.json({ ok: false, error: 'start_date must be YYYY-MM-DD' }, 400);
  }
  if (body.end_date && !/^\d{4}-\d{2}-\d{2}$/.test(body.end_date)) {
    return c.json({ ok: false, error: 'end_date must be YYYY-MM-DD' }, 400);
  }
  if (body.launch_locations !== undefined && !Array.isArray(body.launch_locations)) {
    return c.json({ ok: false, error: 'launch_locations must be an array of strings' }, 400);
  }

  const now = nowIso();
  const launchJson = JSON.stringify(body.launch_locations ?? []);
  const attendeeOpen = body.attendee_registration_open !== false ? 1 : 0;
  const serverOpen = body.server_registration_open !== false ? 1 : 0;

  try {
    const result = await c.env.DB.prepare(
      `INSERT INTO events
         (program, year, title, start_date, end_date, launch_locations,
          attendee_registration_open, server_registration_open, is_current, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
    ).bind(
      program, body.year, body.title ?? null, body.start_date ?? null, body.end_date ?? null,
      launchJson, attendeeOpen, serverOpen, now, now
    ).run();
    const id = result.meta.last_row_id;
    const event = await c.env.DB.prepare(`SELECT * FROM events WHERE id = ?`).bind(id).first();
    return c.json({ ok: true, event }, 201);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE')) {
      return c.json({ ok: false, error: `An event already exists for ${program} ${body.year}` }, 409);
    }
    throw err;
  }
});

// PATCH /api/admin/events/:id  — update mutable fields
eventsRouter.patch('/:id', async (c) => {
  const program = c.get('program');
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) {
    return c.json({ ok: false, error: 'invalid id' }, 400);
  }

  // Confirm ownership
  const existing = await c.env.DB.prepare(
    `SELECT * FROM events WHERE id = ? AND program = ?`
  ).bind(id, program).first<{ id: number }>();
  if (!existing) return c.json({ ok: false, error: 'not found' }, 404);

  const body = await c.req.json<{
    title?: string;
    start_date?: string | null;
    end_date?: string | null;
    launch_locations?: string[];
    attendee_registration_open?: boolean;
    server_registration_open?: boolean;
  }>();

  if (body.start_date && !/^\d{4}-\d{2}-\d{2}$/.test(body.start_date)) {
    return c.json({ ok: false, error: 'start_date must be YYYY-MM-DD' }, 400);
  }
  if (body.end_date && !/^\d{4}-\d{2}-\d{2}$/.test(body.end_date)) {
    return c.json({ ok: false, error: 'end_date must be YYYY-MM-DD' }, 400);
  }
  if (body.launch_locations !== undefined && !Array.isArray(body.launch_locations)) {
    return c.json({ ok: false, error: 'launch_locations must be an array of strings' }, 400);
  }

  const sets: string[] = [];
  const vals: unknown[] = [];

  if ('title' in body)                      { sets.push('title = ?');                       vals.push(body.title ?? null); }
  if ('start_date' in body)                 { sets.push('start_date = ?');                  vals.push(body.start_date ?? null); }
  if ('end_date' in body)                   { sets.push('end_date = ?');                    vals.push(body.end_date ?? null); }
  if ('launch_locations' in body)           { sets.push('launch_locations = ?');            vals.push(JSON.stringify(body.launch_locations)); }
  if ('attendee_registration_open' in body) { sets.push('attendee_registration_open = ?'); vals.push(body.attendee_registration_open ? 1 : 0); }
  if ('server_registration_open' in body)   { sets.push('server_registration_open = ?');   vals.push(body.server_registration_open ? 1 : 0); }

  if (sets.length === 0) return c.json({ ok: false, error: 'no fields to update' }, 400);

  sets.push('updated_at = ?');
  vals.push(nowIso());
  vals.push(id);
  vals.push(program);

  await c.env.DB.prepare(
    `UPDATE events SET ${sets.join(', ')} WHERE id = ? AND program = ?`
  ).bind(...vals).run();

  const updated = await c.env.DB.prepare(`SELECT * FROM events WHERE id = ?`).bind(id).first();
  return c.json({ ok: true, event: updated });
});

// POST /api/admin/events/:id/set-current
// Sets is_current=1 for this event and 0 for all others in the same program.
// This is an atomic two-statement batch — enforces the one-current invariant.
eventsRouter.post('/:id/set-current', async (c) => {
  const program = c.get('program');
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) {
    return c.json({ ok: false, error: 'invalid id' }, 400);
  }

  const existing = await c.env.DB.prepare(
    `SELECT id FROM events WHERE id = ? AND program = ?`
  ).bind(id, program).first<{ id: number }>();
  if (!existing) return c.json({ ok: false, error: 'not found' }, 404);

  const now = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE events SET is_current = 0, updated_at = ? WHERE program = ? AND is_current = 1`
    ).bind(now, program),
    c.env.DB.prepare(
      `UPDATE events SET is_current = 1, updated_at = ? WHERE id = ?`
    ).bind(now, id),
  ]);

  const updated = await c.env.DB.prepare(`SELECT * FROM events WHERE id = ?`).bind(id).first();
  return c.json({ ok: true, event: updated });
});
```

- [ ] **1.2** Mount the router in `functions/_api/app.ts` (add one line with the other admin mounts):

```ts
import { eventsRouter } from './routes/events';
// …existing mounts…
app.route('/api/admin/events', eventsRouter);
```

---

## Task 2 — API tests for admin events routes

**Files:** `functions/_api/__tests__/events.test.ts`

### Steps

- [ ] **2.1** Create `functions/_api/__tests__/events.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { app } from '../app';

// Helper: create a session cookie for a seeded admin user (program = mens or women)
async function authCookie(program: 'mens' | 'women'): Promise<string> {
  const res = await app.fetch(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'testpassword' }),
    }),
    env
  );
  const setCookie = res.headers.get('set-cookie') ?? '';
  const token = setCookie.match(/nwks_session=([^;]+)/)?.[1] ?? '';
  return `nwks_session=${token}`;
}

function makeReq(
  method: string,
  path: string,
  cookie: string,
  program: string,
  body?: unknown
): Request {
  const url = `http://localhost${path}?program=${program}`;
  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('Admin Events API', () => {
  let cookie: string;

  beforeEach(async () => {
    // Apply migrations and seed one admin user before each test
    await env.DB.exec(`DELETE FROM events; DELETE FROM admin_users;`);
    await env.DB.prepare(
      `INSERT INTO admin_users (email, name, password_hash, role, created_at)
       VALUES ('admin@test.com', 'Test Admin', 'scrypt$fakesalt$fakehash', 'admin', '2026-01-01T00:00:00.000Z')`
    ).run();
    cookie = await authCookie('mens');
  });

  // ── GET list ──────────────────────────────────────────────────────────────

  it('GET /api/admin/events returns empty list when no events exist', async () => {
    const res = await app.fetch(makeReq('GET', '/api/admin/events', cookie, 'mens'), env);
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; events: unknown[] }>();
    expect(body.ok).toBe(true);
    expect(body.events).toEqual([]);
  });

  it('GET /api/admin/events scopes results to the requested program', async () => {
    await env.DB.prepare(
      `INSERT INTO events (program, year, launch_locations, attendee_registration_open, server_registration_open, is_current, created_at, updated_at)
       VALUES ('mens', 2026, '[]', 1, 1, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO events (program, year, launch_locations, attendee_registration_open, server_registration_open, is_current, created_at, updated_at)
       VALUES ('women', 2026, '[]', 1, 1, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
    ).run();

    const res = await app.fetch(makeReq('GET', '/api/admin/events', cookie, 'mens'), env);
    const body = await res.json<{ ok: boolean; events: Array<{ program: string }> }>();
    expect(body.events).toHaveLength(1);
    expect(body.events[0].program).toBe('mens');
  });

  // ── POST create ───────────────────────────────────────────────────────────

  it('POST /api/admin/events creates an event', async () => {
    const res = await app.fetch(
      makeReq('POST', '/api/admin/events', cookie, 'mens', {
        year: 2026,
        title: "Men's Encounter 2026",
        start_date: '2026-08-06',
        end_date: '2026-08-08',
        launch_locations: ['Colby', 'Hays', 'Dodge City'],
      }),
      env
    );
    expect(res.status).toBe(201);
    const body = await res.json<{ ok: boolean; event: Record<string, unknown> }>();
    expect(body.ok).toBe(true);
    expect(body.event.year).toBe(2026);
    expect(body.event.program).toBe('mens');
    expect(body.event.start_date).toBe('2026-08-06');
    expect(JSON.parse(body.event.launch_locations as string)).toEqual(['Colby', 'Hays', 'Dodge City']);
    expect(body.event.is_current).toBe(0);
  });

  it('POST /api/admin/events returns 409 on duplicate program+year', async () => {
    const payload = { year: 2026 };
    await app.fetch(makeReq('POST', '/api/admin/events', cookie, 'mens', payload), env);
    const res2 = await app.fetch(makeReq('POST', '/api/admin/events', cookie, 'mens', payload), env);
    expect(res2.status).toBe(409);
  });

  it('POST /api/admin/events returns 400 for invalid start_date format', async () => {
    const res = await app.fetch(
      makeReq('POST', '/api/admin/events', cookie, 'mens', { year: 2026, start_date: '08-06-2026' }),
      env
    );
    expect(res.status).toBe(400);
  });

  it('POST /api/admin/events returns 400 for invalid launch_locations type', async () => {
    const res = await app.fetch(
      makeReq('POST', '/api/admin/events', cookie, 'mens', { year: 2026, launch_locations: 'Colby' }),
      env
    );
    expect(res.status).toBe(400);
  });

  // ── PATCH update ──────────────────────────────────────────────────────────

  it('PATCH /api/admin/events/:id updates title and dates', async () => {
    const createRes = await app.fetch(
      makeReq('POST', '/api/admin/events', cookie, 'mens', { year: 2026 }),
      env
    );
    const { event } = await createRes.json<{ event: { id: number } }>();

    const res = await app.fetch(
      makeReq('PATCH', `/api/admin/events/${event.id}`, cookie, 'mens', {
        title: 'Updated Title',
        start_date: '2026-08-06',
        end_date: '2026-08-08',
      }),
      env
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; event: Record<string, unknown> }>();
    expect(body.event.title).toBe('Updated Title');
  });

  it('PATCH /api/admin/events/:id returns 404 for wrong program', async () => {
    const createRes = await app.fetch(
      makeReq('POST', '/api/admin/events', cookie, 'mens', { year: 2026 }),
      env
    );
    const { event } = await createRes.json<{ event: { id: number } }>();
    const womenCookie = await authCookie('women');
    const res = await app.fetch(
      makeReq('PATCH', `/api/admin/events/${event.id}`, womenCookie, 'women', { title: 'X' }),
      env
    );
    expect(res.status).toBe(404);
  });

  // ── set-current invariant ─────────────────────────────────────────────────

  it('POST /api/admin/events/:id/set-current enforces one-current invariant within program', async () => {
    // Create two mens events
    const r1 = await app.fetch(
      makeReq('POST', '/api/admin/events', cookie, 'mens', { year: 2025 }),
      env
    );
    const r2 = await app.fetch(
      makeReq('POST', '/api/admin/events', cookie, 'mens', { year: 2026 }),
      env
    );
    const { event: ev1 } = await r1.json<{ event: { id: number } }>();
    const { event: ev2 } = await r2.json<{ event: { id: number } }>();

    // Set ev1 current
    await app.fetch(makeReq('POST', `/api/admin/events/${ev1.id}/set-current`, cookie, 'mens'), env);

    // Now set ev2 current — ev1 must become 0
    await app.fetch(makeReq('POST', `/api/admin/events/${ev2.id}/set-current`, cookie, 'mens'), env);

    const listRes = await app.fetch(makeReq('GET', '/api/admin/events', cookie, 'mens'), env);
    const { events } = await listRes.json<{ events: Array<{ id: number; is_current: number }> }>();
    const currentEvents = events.filter((e) => e.is_current === 1);
    expect(currentEvents).toHaveLength(1);
    expect(currentEvents[0].id).toBe(ev2.id);
  });

  it('set-current for mens does NOT affect womens is_current', async () => {
    // Create one event per program, both current
    const mr = await app.fetch(
      makeReq('POST', '/api/admin/events', cookie, 'mens', { year: 2026 }),
      env
    );
    const { event: mensEv } = await mr.json<{ event: { id: number } }>();

    const wCookie = await authCookie('women');
    const wr = await app.fetch(
      makeReq('POST', '/api/admin/events', wCookie, 'women', { year: 2026 }),
      env
    );
    const { event: womenEv } = await wr.json<{ event: { id: number } }>();

    await app.fetch(makeReq('POST', `/api/admin/events/${mensEv.id}/set-current`, cookie, 'mens'), env);
    await app.fetch(makeReq('POST', `/api/admin/events/${womenEv.id}/set-current`, wCookie, 'women'), env);

    // Trigger men's set-current again — should NOT change women's event
    await app.fetch(makeReq('POST', `/api/admin/events/${mensEv.id}/set-current`, cookie, 'mens'), env);

    const wRow = await env.DB.prepare(
      `SELECT is_current FROM events WHERE id = ?`
    ).bind(womenEv.id).first<{ is_current: number }>();
    expect(wRow?.is_current).toBe(1);
  });

  // ── Auth guard ────────────────────────────────────────────────────────────

  it('returns 401 without a valid session', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/admin/events?program=mens'),
      env
    );
    expect(res.status).toBe(401);
  });
});
```

---

## Task 3 — Public events endpoint

**Files:** `functions/_api/routes/publicRoutes.ts` (extend existing file)

### Steps

- [ ] **3.1** Add the following route inside the existing `publicRouter` in `publicRoutes.ts`. Place it after the existing public routes:

```ts
// GET /api/public/events/current?program=mens|women
// Returns the is_current event for the given program.
// Cache-Control: public, max-age=300 (5 min) — safe because admin set-current is rare.
publicRouter.get('/events/current', async (c) => {
  const program = c.req.query('program');
  if (program !== 'mens' && program !== 'women') {
    return c.json({ ok: false, error: 'program must be "mens" or "women"' }, 400);
  }

  const event = await c.env.DB.prepare(
    `SELECT id, program, year, title, start_date, end_date, launch_locations,
            attendee_registration_open, server_registration_open
     FROM events
     WHERE program = ? AND is_current = 1
     LIMIT 1`
  ).bind(program).first<{
    id: number;
    program: string;
    year: number;
    title: string | null;
    start_date: string | null;
    end_date: string | null;
    launch_locations: string;
    attendee_registration_open: number;
    server_registration_open: number;
  }>();

  if (!event) {
    return c.json({ ok: false, error: 'no current event' }, 404);
  }

  // Parse launch_locations JSON before returning
  const parsed = {
    ...event,
    launch_locations: JSON.parse(event.launch_locations) as string[],
    attendee_registration_open: event.attendee_registration_open === 1,
    server_registration_open: event.server_registration_open === 1,
  };

  return c.json(
    { ok: true, event: parsed },
    200,
    { 'Cache-Control': 'public, max-age=300' }
  );
});
```

---

## Task 4 — Public events API tests

**Files:** `functions/_api/__tests__/publicEvents.test.ts`

### Steps

- [ ] **4.1** Create `functions/_api/__tests__/publicEvents.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { app } from '../app';

async function seedEvent(
  program: 'mens' | 'women',
  year: number,
  isCurrent: 0 | 1,
  startDate = '2026-08-06',
  endDate = '2026-08-08'
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO events
       (program, year, title, start_date, end_date, launch_locations,
        attendee_registration_open, server_registration_open, is_current, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '["Colby"]', 1, 1, ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
  ).bind(program, year, `${program} ${year}`, startDate, endDate, isCurrent).run();
}

describe('Public events/current endpoint', () => {
  beforeEach(async () => {
    await env.DB.exec(`DELETE FROM events;`);
  });

  it('returns 400 for missing program param', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/public/events/current'),
      env
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid program value', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/public/events/current?program=other'),
      env
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when no current event exists', async () => {
    await seedEvent('mens', 2026, 0);
    const res = await app.fetch(
      new Request('http://localhost/api/public/events/current?program=mens'),
      env
    );
    expect(res.status).toBe(404);
  });

  it('returns the current mens event with parsed launch_locations', async () => {
    await seedEvent('mens', 2026, 1, '2026-08-06', '2026-08-08');
    const res = await app.fetch(
      new Request('http://localhost/api/public/events/current?program=mens'),
      env
    );
    expect(res.status).toBe(200);
    const body = await res.json<{
      ok: boolean;
      event: {
        program: string;
        year: number;
        start_date: string;
        end_date: string;
        launch_locations: string[];
        attendee_registration_open: boolean;
        server_registration_open: boolean;
      };
    }>();
    expect(body.ok).toBe(true);
    expect(body.event.program).toBe('mens');
    expect(body.event.start_date).toBe('2026-08-06');
    expect(body.event.end_date).toBe('2026-08-08');
    expect(Array.isArray(body.event.launch_locations)).toBe(true);
    expect(typeof body.event.attendee_registration_open).toBe('boolean');
  });

  it('returns the correct program — mens current does not bleed into womens', async () => {
    await seedEvent('mens', 2026, 1, '2026-08-06', '2026-08-08');
    await seedEvent('women', 2026, 0, '2026-07-17', '2026-07-19');

    const wRes = await app.fetch(
      new Request('http://localhost/api/public/events/current?program=women'),
      env
    );
    expect(wRes.status).toBe(404);
  });

  it('sets Cache-Control: public, max-age=300', async () => {
    await seedEvent('mens', 2026, 1);
    const res = await app.fetch(
      new Request('http://localhost/api/public/events/current?program=mens'),
      env
    );
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
  });
});
```

---

## Task 5 — Admin SPA Events page

**Files:** `admin/src/pages/Events.tsx`

### Steps

- [ ] **5.1** Create `admin/src/pages/Events.tsx`:

```tsx
import React, { useEffect, useState } from 'react';

interface NwksEvent {
  id: number;
  program: string;
  year: number;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  launch_locations: string;  // raw JSON from API (parsed on display)
  attendee_registration_open: number;
  server_registration_open: number;
  is_current: number;
}

interface EventFormState {
  year: string;
  title: string;
  start_date: string;
  end_date: string;
  launch_locations: string; // comma-separated for UI simplicity
  attendee_registration_open: boolean;
  server_registration_open: boolean;
}

const EMPTY_FORM: EventFormState = {
  year: String(new Date().getFullYear()),
  title: '',
  start_date: '',
  end_date: '',
  launch_locations: '',
  attendee_registration_open: true,
  server_registration_open: true,
};

function parseLaunchLocations(raw: string): string[] {
  try { return JSON.parse(raw); } catch { return []; }
}

export default function Events() {
  const [events, setEvents] = useState<NwksEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<EventFormState>(EMPTY_FORM);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const program = new URLSearchParams(window.location.search).get('program') ?? 'mens';

  async function loadEvents() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/events?program=${program}`, { credentials: 'include' });
      const data = await res.json<{ ok: boolean; events: NwksEvent[]; error?: string }>();
      if (!data.ok) throw new Error(data.error ?? 'Failed to load events');
      setEvents(data.events);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadEvents(); }, [program]);

  function openCreate() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function openEdit(ev: NwksEvent) {
    setEditId(ev.id);
    setForm({
      year: String(ev.year),
      title: ev.title ?? '',
      start_date: ev.start_date ?? '',
      end_date: ev.end_date ?? '',
      launch_locations: parseLaunchLocations(ev.launch_locations).join(', '),
      attendee_registration_open: ev.attendee_registration_open === 1,
      server_registration_open: ev.server_registration_open === 1,
    });
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);

    const payload = {
      year: Number(form.year),
      title: form.title || undefined,
      start_date: form.start_date || undefined,
      end_date: form.end_date || undefined,
      launch_locations: form.launch_locations
        ? form.launch_locations.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      attendee_registration_open: form.attendee_registration_open,
      server_registration_open: form.server_registration_open,
    };

    try {
      const url = editId
        ? `/api/admin/events/${editId}?program=${program}`
        : `/api/admin/events?program=${program}`;
      const method = editId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json<{ ok: boolean; error?: string }>();
      if (!data.ok) throw new Error(data.error ?? 'Save failed');
      setEditId(null);
      setForm(EMPTY_FORM);
      await loadEvents();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleSetCurrent(id: number) {
    try {
      const res = await fetch(`/api/admin/events/${id}/set-current?program=${program}`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json<{ ok: boolean; error?: string }>();
      if (!data.ok) throw new Error(data.error ?? 'Failed to set current');
      await loadEvents();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Events</h1>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
        >
          + New Event
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded">
          {error}
        </div>
      )}

      {/* Form (shown when creating or editing) */}
      {(editId !== null || form !== EMPTY_FORM) && (
        <form
          onSubmit={handleSubmit}
          aria-label={editId ? 'Edit event' : 'New event'}
          className="mb-8 p-4 border rounded bg-gray-50 space-y-3"
        >
          <h2 className="text-lg font-semibold">{editId ? 'Edit Event' : 'New Event'}</h2>
          {formError && (
            <p role="alert" className="text-red-600 text-sm">{formError}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col text-sm font-medium gap-1">
              Year *
              <input
                type="number"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
                required
                min={2020}
                max={2100}
                disabled={editId !== null}
                className="border rounded px-2 py-1"
              />
            </label>

            <label className="flex flex-col text-sm font-medium gap-1">
              Title
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={`${program === 'mens' ? "Men's" : "Women's"} Encounter ${form.year}`}
                className="border rounded px-2 py-1"
              />
            </label>

            <label className="flex flex-col text-sm font-medium gap-1">
              Start Date (YYYY-MM-DD)
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="border rounded px-2 py-1"
              />
            </label>

            <label className="flex flex-col text-sm font-medium gap-1">
              End Date (YYYY-MM-DD)
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="border rounded px-2 py-1"
              />
            </label>
          </div>

          <label className="flex flex-col text-sm font-medium gap-1">
            Launch Locations (comma-separated)
            <input
              type="text"
              value={form.launch_locations}
              onChange={(e) => setForm({ ...form, launch_locations: e.target.value })}
              placeholder="Colby, Hays, Dodge City"
              className="border rounded px-2 py-1"
            />
          </label>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.attendee_registration_open}
                onChange={(e) => setForm({ ...form, attendee_registration_open: e.target.checked })}
              />
              Attendee registration open
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.server_registration_open}
                onChange={(e) => setForm({ ...form, server_registration_open: e.target.checked })}
              />
              Server registration open
            </label>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Saving…' : editId ? 'Save Changes' : 'Create Event'}
            </button>
            <button
              type="button"
              onClick={() => { setEditId(null); setForm(EMPTY_FORM); }}
              className="px-4 py-2 border rounded text-sm hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Events table */}
      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-gray-500">No events yet. Create one above.</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="p-2 border">Year</th>
              <th className="p-2 border">Title</th>
              <th className="p-2 border">Dates</th>
              <th className="p-2 border">Launch Locations</th>
              <th className="p-2 border">Reg Open</th>
              <th className="p-2 border">Current</th>
              <th className="p-2 border">Actions</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <tr key={ev.id} className={ev.is_current ? 'bg-green-50' : ''}>
                <td className="p-2 border">{ev.year}</td>
                <td className="p-2 border">{ev.title ?? '—'}</td>
                <td className="p-2 border">
                  {ev.start_date ?? '?'} – {ev.end_date ?? '?'}
                </td>
                <td className="p-2 border">
                  {parseLaunchLocations(ev.launch_locations).join(', ') || '—'}
                </td>
                <td className="p-2 border">
                  {ev.attendee_registration_open ? 'Att ' : ''}
                  {ev.server_registration_open ? 'Srv' : ''}
                  {!ev.attendee_registration_open && !ev.server_registration_open ? 'Closed' : ''}
                </td>
                <td className="p-2 border text-center">
                  {ev.is_current ? (
                    <span className="text-green-700 font-bold">✓ Current</span>
                  ) : (
                    <button
                      onClick={() => handleSetCurrent(ev.id)}
                      className="text-xs px-2 py-1 border rounded hover:bg-gray-100"
                      aria-label={`Make ${ev.year} current`}
                    >
                      Make Current
                    </button>
                  )}
                </td>
                <td className="p-2 border">
                  <button
                    onClick={() => openEdit(ev)}
                    className="text-xs px-2 py-1 border rounded hover:bg-gray-100"
                    aria-label={`Edit ${ev.year} event`}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **5.2** Add the Events page to the admin router in `admin/src/App.tsx`. Add the import and route alongside the existing admin page routes:

```tsx
import Events from './pages/Events';
// …inside your Routes element:
<Route path="/events" element={<Events />} />
```

- [ ] **5.3** Add a navigation link to the Events page in the admin sidebar/nav component (exact component name depends on P2 implementation — look for `Sidebar.tsx` or `Nav.tsx`):

```tsx
<NavLink to="/events">Events</NavLink>
```

---

## Task 6 — Admin SPA Events page tests

**Files:** `admin/src/__tests__/Events.test.tsx`

### Steps

- [ ] **6.1** Create `admin/src/__tests__/Events.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Events from '../pages/Events';

// Utility: mock fetch with a given response
function mockFetch(responses: Record<string, { status: number; body: unknown }>) {
  vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    const stripped = url.split('?')[0];
    const match = responses[stripped] ?? responses['*'];
    if (!match) throw new Error(`Unmocked fetch: ${url}`);
    return new Response(JSON.stringify(match.body), {
      status: match.status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

// Make window.location.search return program=mens
Object.defineProperty(window, 'location', {
  value: { search: '?program=mens' },
  writable: true,
});

describe('Events page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state then renders empty state', async () => {
    mockFetch({
      'http://localhost/api/admin/events': { status: 200, body: { ok: true, events: [] } },
    });
    render(<Events />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/no events yet/i)).toBeInTheDocument());
  });

  it('renders event rows from the API', async () => {
    mockFetch({
      'http://localhost/api/admin/events': {
        status: 200,
        body: {
          ok: true,
          events: [
            {
              id: 1, program: 'mens', year: 2026, title: "Men's Encounter 2026",
              start_date: '2026-08-06', end_date: '2026-08-08',
              launch_locations: '["Colby","Hays"]',
              attendee_registration_open: 1, server_registration_open: 1, is_current: 1,
            },
          ],
        },
      },
    });
    render(<Events />);
    await waitFor(() => expect(screen.getByText('2026')).toBeInTheDocument());
    expect(screen.getByText("Men's Encounter 2026")).toBeInTheDocument();
    expect(screen.getByText(/Colby/)).toBeInTheDocument();
    expect(screen.getByText(/✓ Current/)).toBeInTheDocument();
  });

  it('opens the create form when + New Event is clicked', async () => {
    mockFetch({
      'http://localhost/api/admin/events': { status: 200, body: { ok: true, events: [] } },
    });
    render(<Events />);
    await waitFor(() => screen.getByText(/no events yet/i));
    fireEvent.click(screen.getByRole('button', { name: /new event/i }));
    expect(screen.getByRole('form', { name: /new event/i })).toBeInTheDocument();
  });

  it('submits a new event and refreshes the list', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, events: [] }), { status: 200 })
    ).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, event: { id: 2, year: 2027, program: 'mens', title: null, start_date: null, end_date: null, launch_locations: '[]', attendee_registration_open: 1, server_registration_open: 1, is_current: 0 } }), { status: 201 })
    ).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, events: [{ id: 2, program: 'mens', year: 2027, title: null, start_date: null, end_date: null, launch_locations: '[]', attendee_registration_open: 1, server_registration_open: 1, is_current: 0 }] }), { status: 200 })
    );

    render(<Events />);
    await waitFor(() => screen.getByText(/no events yet/i));

    fireEvent.click(screen.getByRole('button', { name: /new event/i }));
    await userEvent.clear(screen.getByLabelText(/year/i));
    await userEvent.type(screen.getByLabelText(/year/i), '2027');
    fireEvent.click(screen.getByRole('button', { name: /create event/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(screen.getByText('2027')).toBeInTheDocument();
  });

  it('shows a form-level error when the API returns an error', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, events: [] }), { status: 200 })
    ).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: 'An event already exists for mens 2026' }), { status: 409 })
    );

    render(<Events />);
    await waitFor(() => screen.getByText(/no events yet/i));
    fireEvent.click(screen.getByRole('button', { name: /new event/i }));
    fireEvent.click(screen.getByRole('button', { name: /create event/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/already exists/i)
    );
  });

  it('Make Current button calls set-current and refreshes', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          ok: true,
          events: [
            { id: 1, program: 'mens', year: 2025, title: null, start_date: null, end_date: null, launch_locations: '[]', attendee_registration_open: 1, server_registration_open: 1, is_current: 0 },
          ],
        }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, event: { id: 1, is_current: 1 } }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          ok: true,
          events: [
            { id: 1, program: 'mens', year: 2025, title: null, start_date: null, end_date: null, launch_locations: '[]', attendee_registration_open: 1, server_registration_open: 1, is_current: 1 },
          ],
        }), { status: 200 })
      );

    render(<Events />);
    await waitFor(() => screen.getByRole('button', { name: /make 2025 current/i }));
    fireEvent.click(screen.getByRole('button', { name: /make 2025 current/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(screen.getByText(/✓ Current/)).toBeInTheDocument();
  });
});
```

---

## Task 7 — `public/date-sync.js` gateway date-swap script

**Files:** `public/date-sync.js`

### Steps

- [ ] **7.1** Create `public/date-sync.js`:

```js
/**
 * date-sync.js  —  NWKS Encounter gateway date synchroniser
 *
 * On DOMContentLoaded, fetches /api/public/events/current for both programs
 * and replaces the text content of the two `.dates` divs in the gateway DOM.
 *
 * Targeting strategy (zero changes to existing classes or structure required):
 *   Men's date  → document.querySelector('[data-nwks-date="mens"]')
 *   Women's date → document.querySelector('[data-nwks-date="women"]')
 *
 * If either fetch fails or the element is absent, the existing hard-coded text
 * is left untouched — the site NEVER shows a blank date.
 *
 * Date display format matches the gateway's existing text exactly:
 *   "August 6 – 8, 2026"  (en dash, long month name, no leading zeros)
 */
(function () {
  'use strict';

  var MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];

  /**
   * Convert a YYYY-MM-DD string to a display date fragment.
   * Returns null if the input is falsy or malformed.
   * @param {string|null} iso
   * @returns {string|null}  e.g. "August 6"
   */
  function isoToDisplay(iso) {
    if (!iso) return null;
    var parts = iso.split('-');
    if (parts.length !== 3) return null;
    var month = parseInt(parts[1], 10);
    var day   = parseInt(parts[2], 10);
    if (isNaN(month) || isNaN(day) || month < 1 || month > 12) return null;
    return MONTH_NAMES[month - 1] + ' ' + day;
  }

  /**
   * Build the full date range string matching gateway style.
   * If only start is present: "August 6, 2026"
   * If start+end same month:  "August 6 – 8, 2026"
   * If different months:      "July 17 – August 8, 2026"
   * @param {string|null} startIso
   * @param {string|null} endIso
   * @param {number|null} year
   * @returns {string|null}
   */
  function formatDateRange(startIso, endIso, year) {
    var startDisplay = isoToDisplay(startIso);
    if (!startDisplay) return null;
    var yearSuffix = year ? ', ' + year : '';
    if (!endIso) return startDisplay + yearSuffix;

    var endDisplay = isoToDisplay(endIso);
    if (!endDisplay) return startDisplay + yearSuffix;

    var startParts = startIso.split('-');
    var endParts   = endIso.split('-');
    var sameMonth  = startParts[1] === endParts[1];

    if (sameMonth) {
      // "August 6 – 8, 2026"  (just the end day, not the full end display)
      var endDay = parseInt(endParts[2], 10);
      return startDisplay + ' – ' + endDay + yearSuffix;
    }
    // Different months: "July 17 – August 8, 2026"
    return startDisplay + ' – ' + endDisplay + yearSuffix;
  }

  /**
   * Fetch the current event for one program and, if successful, update the DOM.
   * @param {'mens'|'women'} program
   */
  function syncProgram(program) {
    var el = document.querySelector('[data-nwks-date="' + program + '"]');
    if (!el) return; // element absent — no-op (safe)

    fetch('/api/public/events/current?program=' + program, { cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data.ok || !data.event) return; // fallback: leave existing text
        var ev = data.event;
        var range = formatDateRange(ev.start_date, ev.end_date, ev.year);
        if (range) {
          el.textContent = range;
        }
        // If range is null (no dates set yet), leave the existing hard-coded text.
      })
      .catch(function () {
        // Network error / CF error — leave hard-coded text; never blank the date.
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    syncProgram('mens');
    syncProgram('women');
  });
})();
```

---

## Task 8 — `date-sync.js` unit test (jsdom)

**Files:** `public/__tests__/date-sync.test.js`

### Steps

- [ ] **8.1** Create `public/__tests__/date-sync.test.js`:

```js
/**
 * jsdom unit test for date-sync.js
 *
 * Strategy: load the script source via fs.readFileSync and eval it inside a
 * jsdom environment. This avoids ESM/CJS module boundary issues since the
 * script is a plain IIFE. Vitest's jsdom environment is used.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SCRIPT_SRC = readFileSync(
  resolve(process.cwd(), 'public/date-sync.js'),
  'utf8'
);

function buildFixtureDom() {
  document.body.innerHTML = `
    <section class="half half--men">
      <div class="half__inner">
        <div class="dates" data-nwks-date="mens">August 6 – 8, 2026</div>
      </div>
    </section>
    <section class="half half--women">
      <div class="half__inner">
        <div class="dates" data-nwks-date="women">July 17 – 19, 2026</div>
      </div>
    </section>
  `;
}

function evalScript() {
  // eslint-disable-next-line no-eval
  eval(SCRIPT_SRC);
  // Fire DOMContentLoaded manually (jsdom doesn't auto-fire after eval)
  document.dispatchEvent(new Event('DOMContentLoaded'));
}

describe('date-sync.js', () => {
  beforeEach(() => {
    buildFixtureDom();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('replaces mens date text when API returns valid event', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('program=mens')) {
        return new Response(
          JSON.stringify({
            ok: true,
            event: { start_date: '2026-08-06', end_date: '2026-08-08', year: 2026 },
          }),
          { status: 200 }
        );
      }
      if (u.includes('program=women')) {
        return new Response(
          JSON.stringify({
            ok: true,
            event: { start_date: '2026-07-17', end_date: '2026-07-19', year: 2026 },
          }),
          { status: 200 }
        );
      }
      throw new Error('Unexpected fetch: ' + url);
    });

    evalScript();

    await vi.waitFor(() => {
      expect(document.querySelector('[data-nwks-date="mens"]').textContent).toBe('August 6 – 8, 2026');
    });
  });

  it('replaces women date text when API returns valid event', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('program=mens')) {
        return new Response(JSON.stringify({ ok: true, event: { start_date: '2026-08-06', end_date: '2026-08-08', year: 2026 } }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, event: { start_date: '2026-07-17', end_date: '2026-07-19', year: 2026 } }), { status: 200 });
    });

    evalScript();

    await vi.waitFor(() => {
      expect(document.querySelector('[data-nwks-date="women"]').textContent).toBe('July 17 – 19, 2026');
    });
  });

  it('leaves existing hard-coded text unchanged when fetch throws', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));
    evalScript();

    // Give fetch time to settle
    await new Promise((r) => setTimeout(r, 50));

    expect(document.querySelector('[data-nwks-date="mens"]').textContent).toBe('August 6 – 8, 2026');
    expect(document.querySelector('[data-nwks-date="women"]').textContent).toBe('July 17 – 19, 2026');
  });

  it('leaves text unchanged when API returns ok: false', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: 'no current event' }), { status: 404 })
    );
    evalScript();

    await new Promise((r) => setTimeout(r, 50));

    expect(document.querySelector('[data-nwks-date="mens"]').textContent).toBe('August 6 – 8, 2026');
  });

  it('leaves text unchanged when event has no start_date', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, event: { start_date: null, end_date: null, year: 2026 } }),
        { status: 200 }
      )
    );
    evalScript();

    await new Promise((r) => setTimeout(r, 50));

    expect(document.querySelector('[data-nwks-date="mens"]').textContent).toBe('August 6 – 8, 2026');
  });

  it('handles different-month ranges', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('program=mens')) {
        return new Response(
          JSON.stringify({ ok: true, event: { start_date: '2026-07-31', end_date: '2026-08-02', year: 2026 } }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ ok: false, error: 'no current event' }), { status: 404 });
    });

    evalScript();

    await vi.waitFor(() => {
      expect(document.querySelector('[data-nwks-date="mens"]').textContent).toBe('July 31 – August 2, 2026');
    });
  });
});
```

---

## Task 9 — Minimal edit to `index.html`

**Files:** `index.html`

This is the **only** permitted edit to `index.html` across all of P3. It adds:
1. A `data-nwks-date` attribute to each of the two existing `.dates` divs so `date-sync.js` can target them without touching any other attribute, class, or text node.
2. A `<script src="/date-sync.js" defer></script>` tag immediately before `</body>`.

### Steps

- [ ] **9.1** In `index.html`, locate **line 166** (the Men's `.dates` div) and add `data-nwks-date="mens"`:

**Before (line 166 — exact current text):**
```html
      <div class="dates">August 6 – 8, 2026</div>
```

**After:**
```html
      <div class="dates" data-nwks-date="mens">August 6 – 8, 2026</div>
```

- [ ] **9.2** In `index.html`, locate **line 177** (the Women's `.dates` div) and add `data-nwks-date="women"`:

**Before (line 177 — exact current text):**
```html
      <div class="dates">July 17 – 19, 2026</div>
```

**After:**
```html
      <div class="dates" data-nwks-date="women">July 17 – 19, 2026</div>
```

- [ ] **9.3** In `index.html`, locate the line immediately before `</body>` (currently line 219) and insert the script tag:

**Before (exact current text, lines 217–219):**
```html
</script>

</body>
```

**After:**
```html
</script>
<script src="/date-sync.js" defer></script>

</body>
```

> **Visual change:** None. The `data-nwks-date` attributes are data attributes with no CSS or layout effect. The `defer` script tag adds no visible element. The hard-coded text ("August 6 – 8, 2026" / "July 17 – 19, 2026") remains in the DOM as the initial value and as the fallback if the fetch fails.

---

## Task 10 — Seed migration for initial 2026 events

**Files:** `db/migrations/0003_seed_events.sql`

### Steps

- [ ] **10.1** Create `db/migrations/0003_seed_events.sql`:

```sql
-- Seed: two inaugural 2026 events (Men's and Women's), both marked is_current.
-- Run once after 0001_init.sql and 0002_seed_templates.sql.
-- Safe to re-run: INSERT OR IGNORE uses the UNIQUE(program, year) constraint.

INSERT OR IGNORE INTO events (
  program, year, title,
  start_date, end_date,
  launch_locations,
  attendee_registration_open,
  server_registration_open,
  is_current,
  created_at, updated_at
) VALUES
(
  'mens', 2026, 'Men''s Encounter 2026',
  '2026-08-06', '2026-08-08',
  '[]',
  1, 1, 1,
  '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'
),
(
  'women', 2026, 'Women''s Encounter 2026',
  '2026-07-17', '2026-07-19',
  '[]',
  1, 1, 1,
  '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'
);
```

> After running `npm run db:migrate` (which applies all pending migrations via `wrangler d1 migrations apply nwks-encounter`), the public endpoint `/api/public/events/current?program=mens` will return Aug 6–8, 2026 and `?program=women` will return Jul 17–19, 2026 — matching the current hard-coded gateway text exactly.

---

## Task 11 — Playwright E2E gateway visual check

**Files:** `tests/e2e/gateway-dates.spec.ts`

### Steps

- [ ] **11.1** Create `tests/e2e/gateway-dates.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

/**
 * Gateway date E2E checks.
 * Assumes `npm run build && npx wrangler pages dev dist --local` is running,
 * which is managed by the `webServer` block in `playwright.config.ts`.
 *
 * Seed data (0003_seed_events.sql) must be applied before these tests run.
 */

test.describe('Gateway date display', () => {
  test('Men\'s date is visible and matches expected text', async ({ page }) => {
    await page.goto('/');
    // Wait for the animation to finish revealing content (up to 4 seconds)
    const mensDates = page.locator('[data-nwks-date="mens"]');
    await expect(mensDates).toBeVisible({ timeout: 4000 });
    // The text should be a non-empty date string — either the hard-coded fallback
    // or the API value (both are "August 6 – 8, 2026" after seed).
    await expect(mensDates).not.toBeEmpty();
    const text = await mensDates.textContent();
    expect(text?.trim()).toMatch(/\w+ \d+/); // at minimum "MonthName Day"
  });

  test('Women\'s date is visible and matches expected text', async ({ page }) => {
    await page.goto('/');
    const womenDates = page.locator('[data-nwks-date="women"]');
    await expect(womenDates).toBeVisible({ timeout: 4000 });
    await expect(womenDates).not.toBeEmpty();
    const text = await womenDates.textContent();
    expect(text?.trim()).toMatch(/\w+ \d+/);
  });

  test('Gateway appearance is unchanged — both halves render', async ({ page }) => {
    await page.goto('/');
    // Both program halves must be present
    await expect(page.locator('.half--men')).toBeVisible();
    await expect(page.locator('.half--women')).toBeVisible();
  });

  test('date-sync.js updates date when API returns different dates', async ({ page, context }) => {
    // Intercept the public events API to return a different date
    await context.route('**/api/public/events/current?program=mens', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          event: {
            id: 99,
            program: 'mens',
            year: 2027,
            title: 'Future Event',
            start_date: '2027-09-10',
            end_date: '2027-09-12',
            launch_locations: [],
            attendee_registration_open: true,
            server_registration_open: true,
          },
        }),
      });
    });
    await context.route('**/api/public/events/current?program=women', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          event: {
            id: 100,
            program: 'women',
            year: 2027,
            title: 'Future Women',
            start_date: '2027-08-14',
            end_date: '2027-08-16',
            launch_locations: [],
            attendee_registration_open: true,
            server_registration_open: true,
          },
        }),
      });
    });

    await page.goto('/');

    // After fetch resolves, the DOM should show the API-returned dates
    await expect(page.locator('[data-nwks-date="mens"]')).toHaveText('September 10 – 12, 2027', {
      timeout: 5000,
    });
    await expect(page.locator('[data-nwks-date="women"]')).toHaveText('August 14 – 16, 2027', {
      timeout: 5000,
    });
  });

  test('date-sync.js falls back to hard-coded text when API is unavailable', async ({
    page,
    context,
  }) => {
    // Make the API return an error
    await context.route('**/api/public/events/current**', (route) => {
      route.fulfill({ status: 500, body: 'Internal Server Error' });
    });

    await page.goto('/');

    // Hard-coded text must still be present after a short wait
    await page.waitForTimeout(200);
    const mensText = await page.locator('[data-nwks-date="mens"]').textContent();
    const womenText = await page.locator('[data-nwks-date="women"]').textContent();

    // Hard-coded fallback values
    expect(mensText?.trim()).toBe('August 6 – 8, 2026');
    expect(womenText?.trim()).toBe('July 17 – 19, 2026');
  });
});
```

---

## Contract Additions Needed

The following items are implied by P3 but not explicitly stated in the Foundation Contract. They should be confirmed with the plan owner before or during implementation:

| # | Item | Recommended resolution |
|---|------|------------------------|
| 1 | **`publicRouter` mount path** — the Foundation Contract defines `publicRoutes.ts` as a file name but does not specify how the router is exported or where in `app.ts` it is mounted. The new `/api/public/events/current` route must be added to whatever Hono router handles the `/api/public/*` prefix. | Confirm the export name and mount line in `app.ts`; the recommended pattern is `app.route('/api/public', publicRouter)`. |
| 2 | **Vitest config for `public/__tests__/*.test.js`** — the Foundation Contract defines `test:api` (pool-workers) and `test:admin` (jsdom) but does not enumerate a third Vitest project for plain JS files in `public/`. The `date-sync` unit test uses `@vitest-environment jsdom` inline, but it must be included in at least one Vitest config's `include` glob. | Add `'public/__tests__/**/*.test.{js,ts}'` to the admin Vitest project (it already uses jsdom) or add a third `test:public` script. |
| 3 | **`scripts/build.mjs` copies `public/date-sync.js` → `dist/`** — the Foundation Contract says `copy public/** → dist/` but the script file does not exist yet in P0. Verify that `build.mjs` uses a glob (`**`) that includes all new files without a code change to the build script itself. | No change needed if the glob is `public/**`; confirm during P0/P1 build review. |
| 4 | **Admin SPA router (React Router)** — Task 5 adds `<Route path="/events" element={<Events />} />`. The exact Router component hierarchy depends on P2's App.tsx implementation. Worker implementing this task must read `admin/src/App.tsx` before editing. | No contract addition needed; handled as a read-before-edit requirement. |
| 5 | **`playwright.config.ts` `webServer` block** — the E2E tests in Task 11 assume a local dev server is configured via `webServer`. If not set up in P0, the worker must add it. Recommended: `command: 'npm run build && npx wrangler pages dev dist --local', url: 'http://localhost:8788', reuseExistingServer: !process.env.CI`. | Verify in P0 `playwright.config.ts`. |

---

## Selector Summary (for date-sync.js targeting)

| Program | DOM selector | Current hard-coded text | Line in `index.html` |
|---------|-------------|------------------------|----------------------|
| Men's | `[data-nwks-date="mens"]` | `August 6 – 8, 2026` | 166 |
| Women's | `[data-nwks-date="women"]` | `July 17 – 19, 2026` | 177 |

Both elements already carry the class `.dates` and sit inside `.half__inner` inside `.half--men` / `.half--women` respectively. The `data-nwks-date` attribute is added as the stable hook; the existing class is deliberately NOT used as the selector because it is also applied for CSS and could collide if the design ever added more `.dates` nodes. The `data-*` attribute is the stable, semantic, intent-explicit hook.

---

## Commit Order (one commit per task)

1. `feat(api): add admin events router with GET/POST/PATCH/set-current`
2. `test(api): add events API tests including one-current invariant`
3. `feat(api): add GET /api/public/events/current endpoint`
4. `test(api): add public events current endpoint tests`
5. `feat(admin): add Events page with CRUD form and set-current`
6. `test(admin): add RTL tests for Events page`
7. `feat(public): add date-sync.js gateway date fetcher`
8. `test(public): add jsdom unit tests for date-sync.js`
9. `feat(gateway): add data-nwks-date attrs and date-sync script tag to index.html`
10. `db: add seed migration for 2026 Men's and Women's events`
11. `test(e2e): add Playwright gateway date display checks`
