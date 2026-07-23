# NWKS Encounter — Scaffold & Shared Modules (Plan P0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Complete each task fully before beginning the next. Run every test command and confirm the exact expected output before committing. Never commit a failing test.

**Goal:** Create the repository scaffold, Cloudflare bindings config, full D1 schema, Vitest test harness, and four shared modules (`db.ts`, `auth.ts`, `email.ts`, `dedupe.ts`) plus the Hono app skeleton and build/seed scripts. When this plan is complete, every subsequent phase plan (P1–P6) can import from `functions/_api/*` and find fully-tested, contract-compliant implementations ready to use.

**Architecture:** A single Cloudflare Pages project (`nwks-encounter-site`) serves the gateway, public pages, the admin SPA under `/admin`, and the full API under `/api/*` via Pages Functions delegating to a Hono app. D1 holds all relational data; R2 holds photos; KV holds sessions. No cross-origin requests — everything is same-origin on `nwksencounter.com`. This plan only creates the structural foundation; no feature routes are implemented here.

**Tech Stack:** TypeScript 5, Hono 4, Vitest + `@cloudflare/vitest-pool-workers` (API tests), Node 22, wrangler 4, Resend (`sendEmail` wrapper), `node:crypto` scrypt (via `nodejs_compat`), `@anthropic-ai/sdk` (installed as dev dep; used in P5).

**Global Constraints:** See Foundation Contract (Plan 00) — all its constraints apply. Key reminders: no gateway modifications, free tier only, no `Co-Authored-By` trailer on commits, all secrets via `wrangler pages secret put`, TDD on every task, `program ∈ {'mens','women'}` on every domain row.

---

## File Structure

Files created by this plan (relative to repo root):

```
package.json                                 # root orchestration scripts + devDeps
wrangler.toml                                # Pages bindings: DB / PHOTOS / SESSIONS / vars
db/
  migrations/0001_init.sql                   # full schema from the contract, verbatim
  schema.sql                                 # mirror of the full schema (reference copy)
functions/
  api/[[path]].ts                            # Pages Function entry → delegates to Hono app
  _api/
    app.ts                                   # Hono app, Env interface, GET /api/health
    db.ts                                    # nowIso, currentYear, Program, Person, query helpers
    auth.ts                                  # hashPassword, verifyPassword, createSession,
    |                                        #   getSessionUser, requireAuth, requireProgram
    email.ts                                 # sendEmail, renderTemplate, SendResult
    dedupe.ts                                # upsertPerson, recomputeRollups, findPossibleDuplicates
    __tests__/
      setup.ts                               # applyMigrations helper + vitest config re-export
      db.test.ts                             # nowIso, currentYear, Person shape, query helpers
      auth.test.ts                           # hash roundtrip, session create/read, middleware 401
      email.test.ts                          # EMAIL_ENABLED=false path, renderTemplate tokens
      dedupe.test.ts                         # upsertPerson match/insert, recomputeRollups, findPossibleDuplicates
      health.test.ts                         # GET /api/health → 200 {ok:true}
      schema.test.ts                         # tables exist + trivial SELECT 1
vitest.config.ts                             # @cloudflare/vitest-pool-workers config
scripts/
  build.mjs                                  # assembles dist/; skips admin/ gracefully if absent
  seed-admin.mjs                             # creates admin_users row via hashPassword
```

---

## Task 1: Root `package.json` and dev dependencies

### Files
- **Create:** `package.json`

### Interfaces
- **Produces:** `npm run build`, `npm run dev`, `npm run deploy`, `npm run test:api`, `npm run test:admin`, `npm run test:e2e`, `npm run db:migrate`, `npm run db:migrate:local` scripts; devDeps `hono`, `@cloudflare/vitest-pool-workers`, `vitest`, `wrangler`, `@anthropic-ai/sdk`, `resend`, `typescript`.

### Steps

- [ ] Check if a `package.json` already exists at the repo root:
  ```bash
  ls /Users/tylerpreisser/Desktop/nwks-encounter-site/package.json 2>/dev/null && echo EXISTS || echo MISSING
  ```
  Expected output: `EXISTS` or `MISSING`. If it exists, read it first before writing.

- [ ] Write `package.json`:
  ```json
  {
    "name": "nwks-encounter-site",
    "version": "0.1.0",
    "private": true,
    "engines": { "node": ">=22" },
    "scripts": {
      "build":            "node scripts/build.mjs",
      "dev":              "npm run build && npx wrangler pages dev dist --local",
      "deploy":           "npm run build && npx wrangler pages deploy dist --project-name nwks-encounter-site --branch main",
      "test:api":         "vitest run --config vitest.config.ts",
      "test:api:watch":   "vitest --config vitest.config.ts",
      "test:admin":       "vitest run --config admin/vitest.config.ts",
      "test:e2e":         "playwright test",
      "db:migrate":       "npx wrangler d1 migrations apply nwks-encounter",
      "db:migrate:local": "npx wrangler d1 migrations apply nwks-encounter --local"
    },
    "devDependencies": {
      "@anthropic-ai/sdk":                   "^0.52.0",
      "@cloudflare/vitest-pool-workers":      "^0.8.0",
      "@cloudflare/workers-types":            "^4.20250718.0",
      "hono":                                "^4.7.0",
      "resend":                              "^4.7.0",
      "typescript":                          "^5.8.0",
      "vitest":                              "^3.2.0",
      "wrangler":                            "^4.22.0"
    }
  }
  ```

- [ ] Install dependencies:
  ```bash
  cd /Users/tylerpreisser/Desktop/nwks-encounter-site && npm install
  ```
  Expected: lock file written, no peer-dep errors.

- [ ] Run `node --version` to confirm Node 22:
  ```bash
  node --version
  ```
  Expected: `v22.x.x`

- [ ] Commit:
  ```bash
  cd /Users/tylerpreisser/Desktop/nwks-encounter-site
  git add package.json package-lock.json
  git commit -m "chore: root package.json with build/test/deploy scripts and devDeps"
  ```

---

## Task 2: `wrangler.toml`

### Files
- **Create or Modify:** `wrangler.toml`

### Interfaces
- **Produces:** bindings `DB` (D1), `PHOTOS` (R2), `SESSIONS` (KV); `[vars]` keys `EMAIL_ENABLED`, `EMAIL_FROM`, `EMAIL_REPLY_TO`; `compatibility_flags = ["nodejs_compat"]`.

### Steps

- [ ] Check if `wrangler.toml` already exists:
  ```bash
  ls /Users/tylerpreisser/Desktop/nwks-encounter-site/wrangler.toml 2>/dev/null && echo EXISTS || echo MISSING
  ```
  If it exists, read it fully before editing; preserve any existing fields not in the contract.

- [ ] Write `wrangler.toml` (replace placeholder IDs with `"REPLACE_ME"` — filled by provisioning):
  ```toml
  name = "nwks-encounter-site"
  pages_build_output_dir = "dist"
  compatibility_date = "2026-07-01"
  compatibility_flags = ["nodejs_compat"]

  [[d1_databases]]
  binding = "DB"
  database_name = "nwks-encounter"
  database_id = "REPLACE_ME"

  [[r2_buckets]]
  binding = "PHOTOS"
  bucket_name = "nwks-encounter-photos"

  [[kv_namespaces]]
  binding = "SESSIONS"
  id = "REPLACE_ME"

  [vars]
  EMAIL_ENABLED  = "false"
  EMAIL_FROM     = "NWKS Encounter <noreply@nwksencounter.com>"
  EMAIL_REPLY_TO = ""
  ```

  Note: `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `SESSION_SECRET`, `TURNSTILE_SECRET` are secrets — set via `wrangler pages secret put`, never in this file.

- [ ] Commit:
  ```bash
  cd /Users/tylerpreisser/Desktop/nwks-encounter-site
  git add wrangler.toml
  git commit -m "chore: wrangler.toml with D1/R2/KV bindings and EMAIL_ENABLED=false"
  ```

---

## Task 3: D1 schema migration files

### Files
- **Create:** `db/migrations/0001_init.sql`
- **Create:** `db/schema.sql`

### Interfaces
- **Produces:** tables `people`, `events`, `registrations`, `email_templates`, `email_campaigns`, `email_log`, `admin_users`, `photos`, `ai_threads`, `ai_messages`, `ai_pending_actions`; all indexes listed in the contract.

### Steps

- [ ] Create `db/migrations/` directory:
  ```bash
  mkdir -p /Users/tylerpreisser/Desktop/nwks-encounter-site/db/migrations
  ```

- [ ] Write `db/migrations/0001_init.sql` with the COMPLETE schema from the contract verbatim:
  ```sql
  -- 0001_init.sql — NWKS Encounter full schema
  -- All timestamps: ISO-8601 UTC TEXT.  All dates: YYYY-MM-DD TEXT.
  -- program CHECK enforced on every table that partitions by program.

  CREATE TABLE people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program TEXT NOT NULL CHECK(program IN ('mens','women')),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    phone_type TEXT,
    address TEXT, city TEXT, state TEXT,
    church TEXT,
    times_attended INTEGER NOT NULL DEFAULT 0,
    times_served   INTEGER NOT NULL DEFAULT 0,
    first_seen_year     INTEGER,
    last_activity_year  INTEGER,
    notes TEXT,
    merged_into_id INTEGER REFERENCES people(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_people_program_name ON people(program, last_name, first_name);
  CREATE UNIQUE INDEX idx_people_program_email
    ON people(program, email)
    WHERE email IS NOT NULL AND merged_into_id IS NULL;

  CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program TEXT NOT NULL CHECK(program IN ('mens','women')),
    year INTEGER NOT NULL,
    title TEXT,
    start_date TEXT,
    end_date TEXT,
    launch_locations TEXT NOT NULL DEFAULT '[]',
    attendee_registration_open INTEGER NOT NULL DEFAULT 1,
    server_registration_open   INTEGER NOT NULL DEFAULT 1,
    is_current INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(program, year)
  );

  CREATE TABLE registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program TEXT NOT NULL CHECK(program IN ('mens','women')),
    event_id  INTEGER NOT NULL REFERENCES events(id),
    person_id INTEGER NOT NULL REFERENCES people(id),
    role TEXT NOT NULL CHECK(role IN ('attendee','server')),
    first_name TEXT NOT NULL,
    last_name  TEXT NOT NULL,
    email TEXT, phone TEXT, phone_type TEXT,
    address TEXT, city TEXT, state TEXT,
    launch_location TEXT, shirt_size TEXT, church TEXT,
    times_attended_self_report TEXT,
    invited_by TEXT,
    prayer_contact_name TEXT, prayer_contact_phone TEXT,
    dietary_health TEXT,
    questions TEXT,
    extra TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'registered'
      CHECK(status IN ('registered','cancelled','attended','no_show')),
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_reg_program_event_role ON registrations(program, event_id, role);
  CREATE INDEX idx_reg_person ON registrations(person_id);

  CREATE TABLE email_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program TEXT CHECK(program IN ('mens','women','shared')),
    key  TEXT NOT NULL,
    name TEXT NOT NULL,
    subject   TEXT NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT NOT NULL,
    variables TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL,
    UNIQUE(program, key)
  );

  CREATE TABLE admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name  TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at    TEXT NOT NULL,
    last_login_at TEXT
  );

  CREATE TABLE email_campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program TEXT NOT NULL CHECK(program IN ('mens','women')),
    template_key TEXT,
    subject   TEXT NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT NOT NULL,
    segment TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'draft'
      CHECK(status IN ('draft','scheduled','sending','sent','failed')),
    scheduled_for    TEXT,
    recipient_count  INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES admin_users(id),
    created_at TEXT NOT NULL,
    sent_at    TEXT
  );

  CREATE TABLE email_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER REFERENCES email_campaigns(id),
    program TEXT NOT NULL CHECK(program IN ('mens','women')),
    person_id INTEGER REFERENCES people(id),
    to_email TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('transactional','broadcast')),
    template_key TEXT,
    subject TEXT,
    status TEXT NOT NULL DEFAULT 'queued'
      CHECK(status IN ('queued','sent','delivered','bounced','failed')),
    provider_id TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    sent_at    TEXT
  );

  CREATE TABLE photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program TEXT NOT NULL CHECK(program IN ('mens','women')),
    year INTEGER NOT NULL,
    r2_key TEXT NOT NULL,
    caption TEXT,
    sort INTEGER NOT NULL DEFAULT 0,
    width INTEGER, height INTEGER, content_type TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_photos_program_year ON photos(program, year, sort);

  CREATE TABLE ai_threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program TEXT NOT NULL CHECK(program IN ('mens','women')),
    created_by INTEGER REFERENCES admin_users(id),
    title TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE ai_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL REFERENCES ai_threads(id),
    role TEXT NOT NULL CHECK(role IN ('user','assistant','tool')),
    content   TEXT NOT NULL,
    tool_calls TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE ai_pending_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER REFERENCES ai_threads(id),
    program TEXT NOT NULL CHECK(program IN ('mens','women')),
    kind TEXT NOT NULL CHECK(kind IN ('send_campaign','schedule_campaign')),
    summary TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK(status IN ('pending','approved','rejected','executed')),
    created_at  TEXT NOT NULL,
    resolved_at TEXT,
    resolved_by INTEGER REFERENCES admin_users(id)
  );
  ```

- [ ] Write `db/schema.sql` as an identical copy of the migration (serves as reference; mirrors the migration exactly):
  Copy the contents of `db/migrations/0001_init.sql` to `db/schema.sql` with a header comment:
  ```sql
  -- schema.sql — canonical full schema mirror (reference only; authoritative source is db/migrations/)
  -- Generated from: db/migrations/0001_init.sql
  -- Keep in sync when new migrations are added.
  ```
  Then paste the full SQL from `0001_init.sql` beneath that header.

- [ ] Apply the migration locally to verify it parses without error:
  ```bash
  cd /Users/tylerpreisser/Desktop/nwks-encounter-site
  npx wrangler d1 migrations apply nwks-encounter --local 2>&1 | tail -5
  ```
  Expected: no "Error" lines; output ends with something like `Applied 1 migration(s)` or `Migrations applied successfully`.

- [ ] Commit:
  ```bash
  cd /Users/tylerpreisser/Desktop/nwks-encounter-site
  git add db/
  git commit -m "feat(db): full D1 schema migration 0001_init — all 11 tables + indexes"
  ```

---

## Task 4: Vitest test harness + `applyMigrations` helper + schema smoke test

### Files
- **Create:** `vitest.config.ts`
- **Create:** `functions/_api/__tests__/setup.ts`
- **Create:** `functions/_api/__tests__/schema.test.ts`

### Interfaces
- **Consumes:** `db/migrations/*.sql` (reads files at test time via `fs`)
- **Produces:** `applyMigrations(env: { DB: D1Database })` — runs every migration SQL against an isolated in-process D1 instance before each test; re-exported from `setup.ts` for use in every subsequent test file.

### Steps

- [ ] Write `vitest.config.ts`:
  ```ts
  import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

  export default defineWorkersConfig({
    test: {
      include: ['functions/_api/__tests__/**/*.test.ts'],
      poolOptions: {
        workers: {
          wrangler: { configPath: './wrangler.toml' },
          miniflare: {
            d1Databases: ['DB'],
            kvNamespaces: ['SESSIONS'],
            r2Buckets: ['PHOTOS'],
          },
        },
      },
    },
  });
  ```

- [ ] Create `functions/_api/__tests__/` directory:
  ```bash
  mkdir -p /Users/tylerpreisser/Desktop/nwks-encounter-site/functions/_api/__tests__
  ```

- [ ] Write `functions/_api/__tests__/setup.ts`:
  ```ts
  import { readdir, readFile } from 'node:fs/promises';
  import { join } from 'node:path';

  /**
   * Reads every *.sql file from db/migrations/ in filename order and
   * executes each statement against the provided D1 database.
   * Call this in beforeEach() to get an isolated, migrated D1 for each test.
   */
  export async function applyMigrations(env: { DB: D1Database }): Promise<void> {
    const migrationsDir = join(process.cwd(), 'db', 'migrations');
    let files: string[];
    try {
      files = (await readdir(migrationsDir))
        .filter(f => f.endsWith('.sql'))
        .sort();
    } catch {
      throw new Error(`Cannot read migrations directory: ${migrationsDir}`);
    }

    for (const file of files) {
      const sql = await readFile(join(migrationsDir, file), 'utf8');
      // Split on semicolons; drop empty/whitespace-only statements
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      for (const stmt of statements) {
        await env.DB.prepare(stmt).run();
      }
    }
  }
  ```

- [ ] Write `functions/_api/__tests__/schema.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach } from 'vitest';
  import { env } from 'cloudflare:test';
  import { applyMigrations } from './setup';

  describe('schema smoke tests', () => {
    beforeEach(async () => {
      await applyMigrations(env as unknown as { DB: D1Database });
    });

    it('SELECT 1 returns 1', async () => {
      const result = await (env as any).DB.prepare('SELECT 1 AS n').first<{ n: number }>();
      expect(result?.n).toBe(1);
    });

    const EXPECTED_TABLES = [
      'people', 'events', 'registrations',
      'email_templates', 'email_campaigns', 'email_log',
      'admin_users', 'photos',
      'ai_threads', 'ai_messages', 'ai_pending_actions',
    ];

    it.each(EXPECTED_TABLES)('table "%s" exists', async (table) => {
      const result = await (env as any).DB
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
        .bind(table)
        .first<{ name: string }>();
      expect(result?.name).toBe(table);
    });
  });
  ```

- [ ] Run the schema tests to verify they pass:
  ```bash
  cd /Users/tylerpreisser/Desktop/nwks-encounter-site && npm run test:api -- --reporter=verbose 2>&1 | tail -30
  ```
  Expected: `✓ SELECT 1 returns 1` and `✓ table "people" exists` (and all other table names). Zero failures.

- [ ] Commit:
  ```bash
  cd /Users/tylerpreisser/Desktop/nwks-encounter-site
  git add vitest.config.ts functions/_api/__tests__/setup.ts functions/_api/__tests__/schema.test.ts
  git commit -m "test: vitest-pool-workers harness + applyMigrations helper + schema smoke tests"
  ```

---

## Task 5: `functions/_api/db.ts` — typed D1 helpers

### Files
- **Create:** `functions/_api/db.ts`
- **Create:** `functions/_api/__tests__/db.test.ts`

### Interfaces
- **Produces (exact contract signatures):**
  ```ts
  export function nowIso(): string;
  export function currentYear(): number;
  export type Program = 'mens' | 'women';
  export interface Person {
    id: number; program: Program;
    first_name: string; last_name: string;
    email: string | null; phone: string | null; phone_type: string | null;
    address: string | null; city: string | null; state: string | null;
    church: string | null;
    times_attended: number; times_served: number;
    first_seen_year: number | null; last_activity_year: number | null;
    notes: string | null; merged_into_id: number | null;
    created_at: string; updated_at: string;
  }
  export interface PersonInput {
    first_name: string; last_name: string;
    email?: string; phone?: string; phone_type?: string;
    address?: string; city?: string; state?: string; church?: string;
  }
  // Query helpers:
  export async function getPerson(db: D1Database, id: number): Promise<Person | null>;
  export async function getActivePeople(db: D1Database, program: Program): Promise<Person[]>;
  export async function getCurrentEvent(db: D1Database, program: Program): Promise<import('./app').EventRow | null>;
  ```
- **Consumes:** D1Database (Cloudflare binding)

### Steps

- [ ] Write `functions/_api/db.ts`:
  ```ts
  export type Program = 'mens' | 'women';

  export function nowIso(): string {
    return new Date().toISOString();
  }

  export function currentYear(): number {
    return new Date().getUTCFullYear();
  }

  export interface Person {
    id: number;
    program: Program;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    phone_type: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    church: string | null;
    times_attended: number;
    times_served: number;
    first_seen_year: number | null;
    last_activity_year: number | null;
    notes: string | null;
    merged_into_id: number | null;
    created_at: string;
    updated_at: string;
  }

  export interface PersonInput {
    first_name: string;
    last_name: string;
    email?: string | null;
    phone?: string | null;
    phone_type?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    church?: string | null;
  }

  export interface EventRow {
    id: number;
    program: Program;
    year: number;
    title: string | null;
    start_date: string | null;
    end_date: string | null;
    launch_locations: string;     // JSON array string
    attendee_registration_open: number;
    server_registration_open: number;
    is_current: number;
    created_at: string;
    updated_at: string;
  }

  /** Returns a single person by id, or null if not found. */
  export async function getPerson(db: D1Database, id: number): Promise<Person | null> {
    return db.prepare('SELECT * FROM people WHERE id = ?').bind(id).first<Person>();
  }

  /**
   * Returns all non-merged people for a program, ordered by last_name, first_name.
   */
  export async function getActivePeople(db: D1Database, program: Program): Promise<Person[]> {
    const result = await db
      .prepare(
        'SELECT * FROM people WHERE program = ? AND merged_into_id IS NULL ORDER BY last_name, first_name'
      )
      .bind(program)
      .all<Person>();
    return result.results;
  }

  /**
   * Returns the current event for a program (is_current = 1), or null if none set.
   */
  export async function getCurrentEvent(db: D1Database, program: Program): Promise<EventRow | null> {
    return db
      .prepare('SELECT * FROM events WHERE program = ? AND is_current = 1 LIMIT 1')
      .bind(program)
      .first<EventRow>();
  }
  ```

- [ ] Write `functions/_api/__tests__/db.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach } from 'vitest';
  import { env } from 'cloudflare:test';
  import { applyMigrations } from './setup';
  import {
    nowIso, currentYear, getPerson, getActivePeople, getCurrentEvent,
    type Program,
  } from '../db';

  const DB = () => (env as any).DB as D1Database;

  describe('db.ts helpers', () => {
    beforeEach(async () => {
      await applyMigrations(env as any);
    });

    describe('nowIso()', () => {
      it('returns a valid ISO-8601 UTC string', () => {
        const iso = nowIso();
        expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        expect(new Date(iso).toISOString()).toBe(iso);
      });
    });

    describe('currentYear()', () => {
      it('returns a 4-digit year matching UTC year', () => {
        const year = currentYear();
        expect(year).toBeGreaterThanOrEqual(2026);
        expect(year).toBe(new Date().getUTCFullYear());
      });
    });

    describe('getPerson()', () => {
      it('returns null for a missing id', async () => {
        const result = await getPerson(DB(), 999999);
        expect(result).toBeNull();
      });

      it('returns the person row for a known id', async () => {
        const ts = nowIso();
        const { meta } = await DB()
          .prepare(
            `INSERT INTO people (program, first_name, last_name, created_at, updated_at)
             VALUES ('mens', 'John', 'Doe', ?, ?)`
          )
          .bind(ts, ts)
          .run();
        const id = meta.last_row_id as number;

        const person = await getPerson(DB(), id);
        expect(person).not.toBeNull();
        expect(person!.first_name).toBe('John');
        expect(person!.last_name).toBe('Doe');
        expect(person!.program).toBe('mens');
        expect(person!.times_attended).toBe(0);
        expect(person!.times_served).toBe(0);
      });
    });

    describe('getActivePeople()', () => {
      it('excludes merged-away rows', async () => {
        const ts = nowIso();
        // Insert two people; merge the second into the first
        const { meta: m1 } = await DB()
          .prepare(`INSERT INTO people (program, first_name, last_name, created_at, updated_at) VALUES ('mens','Alice','Smith',?,?)`)
          .bind(ts, ts).run();
        const id1 = m1.last_row_id as number;

        const { meta: m2 } = await DB()
          .prepare(`INSERT INTO people (program, first_name, last_name, merged_into_id, created_at, updated_at) VALUES ('mens','Alicia','Smith',?,?,?)`)
          .bind(id1, ts, ts).run();
        void m2;

        const people = await getActivePeople(DB(), 'mens');
        expect(people.length).toBe(1);
        expect(people[0].first_name).toBe('Alice');
      });

      it('does not return rows from the other program', async () => {
        const ts = nowIso();
        await DB()
          .prepare(`INSERT INTO people (program, first_name, last_name, created_at, updated_at) VALUES ('women','Carol','Jones',?,?)`)
          .bind(ts, ts).run();
        const people = await getActivePeople(DB(), 'mens');
        expect(people.every((p) => p.program === 'mens')).toBe(true);
      });
    });

    describe('getCurrentEvent()', () => {
      it('returns null when no event is marked current', async () => {
        const result = await getCurrentEvent(DB(), 'mens');
        expect(result).toBeNull();
      });

      it('returns the event with is_current=1', async () => {
        const ts = nowIso();
        await DB()
          .prepare(
            `INSERT INTO events (program, year, is_current, created_at, updated_at)
             VALUES ('mens', 2026, 1, ?, ?)`
          )
          .bind(ts, ts).run();

        const ev = await getCurrentEvent(DB(), 'mens');
        expect(ev).not.toBeNull();
        expect(ev!.year).toBe(2026);
        expect(ev!.is_current).toBe(1);
      });
    });
  });
  ```

- [ ] Run tests — expect all to pass:
  ```bash
  cd /Users/tylerpreisser/Desktop/nwks-encounter-site && npm run test:api -- --reporter=verbose 2>&1 | tail -40
  ```
  Expected: every `db.ts helpers` test green, zero failures.

- [ ] Commit:
  ```bash
  cd /Users/tylerpreisser/Desktop/nwks-encounter-site
  git add functions/_api/db.ts functions/_api/__tests__/db.test.ts
  git commit -m "feat(_api): db.ts — nowIso, currentYear, Program, Person, query helpers"
  ```

---

## Task 6: `functions/_api/auth.ts` — password hashing, sessions, middleware

### Files
- **Create:** `functions/_api/auth.ts`
- **Create:** `functions/_api/__tests__/auth.test.ts`

### Interfaces
- **Consumes:** `Env` (from `app.ts` — `SESSIONS: KVNamespace`, `SESSION_SECRET: string`); `node:crypto` scrypt (via `nodejs_compat`); Hono `MiddlewareHandler`, `Context`.
- **Produces (exact contract signatures):**
  ```ts
  export async function hashPassword(pw: string): Promise<string>;
  export async function verifyPassword(pw: string, stored: string): Promise<boolean>;
  export async function createSession(env: Env, userId: number): Promise<string>;
  export async function getSessionUser(env: Env, token: string | undefined): Promise<{ id: number; email: string; name: string; role: string } | null>;
  export function requireAuth(): MiddlewareHandler;
  export function requireProgram(): MiddlewareHandler;
  ```
- **Session format:** KV key `session:<token>` → JSON `{ userId, expiresAt }`. Token = 32 random bytes as hex. TTL = 7 days. Cookie name = `nwks_session`; HttpOnly, Secure, SameSite=Strict.
- **`requireAuth`** reads `nwks_session` cookie, calls `getSessionUser`, on failure returns `401 { ok:false, error:"Unauthorized" }`, on success sets `c.set('user', user)`.
- **`requireProgram`** reads `?program=` query param, validates it is `'mens'` or `'women'`, on failure returns `400 { ok:false, error:"program must be mens or women" }`, on success sets `c.set('program', program)`.

### Steps

- [ ] Write `functions/_api/auth.ts`:
  ```ts
  import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
  import { promisify } from 'node:util';
  import type { MiddlewareHandler } from 'hono';
  import type { Env } from './app';

  const scryptAsync = promisify(scrypt);

  const SCRYPT_N = 16384;
  const SCRYPT_R = 8;
  const SCRYPT_P = 1;
  const KEY_LEN = 64;
  const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

  /**
   * Hashes a password with scrypt and a fresh random salt.
   * Returns "scrypt$<saltHex>$<hashHex>".
   */
  export async function hashPassword(pw: string): Promise<string> {
    const salt = randomBytes(16);
    const hash = (await scryptAsync(pw, salt, KEY_LEN, {
      N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P,
    })) as Buffer;
    return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
  }

  /**
   * Verifies a plaintext password against a stored "scrypt$salt$hash" string.
   */
  export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
    const parts = stored.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const [, saltHex, hashHex] = parts;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    let actual: Buffer;
    try {
      actual = (await scryptAsync(pw, salt, KEY_LEN, {
        N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P,
      })) as Buffer;
    } catch {
      return false;
    }
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  }

  /**
   * Creates a new session token, stores it in KV with a 7-day TTL, and returns the token.
   */
  export async function createSession(env: Env, userId: number): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
    await env.SESSIONS.put(
      `session:${token}`,
      JSON.stringify({ userId, expiresAt }),
      { expirationTtl: SESSION_TTL_SECONDS }
    );
    return token;
  }

  /**
   * Resolves a session token to its user record by looking up the token in KV
   * and then fetching the admin_users row. Returns null if the token is missing,
   * expired, or the user no longer exists.
   */
  export async function getSessionUser(
    env: Env,
    token: string | undefined
  ): Promise<{ id: number; email: string; name: string; role: string } | null> {
    if (!token) return null;
    const raw = await env.SESSIONS.get(`session:${token}`);
    if (!raw) return null;

    let parsed: { userId: number; expiresAt: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }

    if (new Date(parsed.expiresAt) < new Date()) return null;

    const row = await env.DB.prepare(
      'SELECT id, email, name, role FROM admin_users WHERE id = ?'
    )
      .bind(parsed.userId)
      .first<{ id: number; email: string; name: string | null; role: string }>();

    if (!row) return null;
    return { id: row.id, email: row.email, name: row.name ?? '', role: row.role };
  }

  /**
   * Hono middleware: requires a valid nwks_session cookie.
   * On success sets c.var.user. On failure returns 401.
   */
  export function requireAuth(): MiddlewareHandler {
    return async (c, next) => {
      const token = getCookieValue(c.req.raw.headers.get('Cookie') ?? '', 'nwks_session');
      const user = await getSessionUser(c.env as Env, token);
      if (!user) {
        return c.json({ ok: false, error: 'Unauthorized' }, 401);
      }
      c.set('user' as never, user as never);
      await next();
    };
  }

  /**
   * Hono middleware: validates ?program= query param.
   * On success sets c.var.program. On failure returns 400.
   */
  export function requireProgram(): MiddlewareHandler {
    return async (c, next) => {
      const program = c.req.query('program');
      if (program !== 'mens' && program !== 'women') {
        return c.json({ ok: false, error: 'program must be mens or women' }, 400);
      }
      c.set('program' as never, program as never);
      await next();
    };
  }

  /** Parses a single named cookie from a raw Cookie header value. */
  function getCookieValue(cookieHeader: string, name: string): string | undefined {
    for (const pair of cookieHeader.split(';')) {
      const [k, ...rest] = pair.trim().split('=');
      if (k.trim() === name) return rest.join('=').trim();
    }
    return undefined;
  }
  ```

- [ ] Write `functions/_api/__tests__/auth.test.ts`:
  ```ts
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

      it('passes through for a valid program', async () => {
        const app = new Hono<{ Variables: { program: string } }>();
        app.use('*', requireProgram());
        app.get('/test', (c) => c.json({ ok: true, program: c.get('program' as never) }));

        const res = await app.request('/test?program=mens');
        expect(res.status).toBe(200);
        const body = await res.json() as any;
        expect(body.program).toBe('mens');
      });
    });
  });
  ```

- [ ] Run tests — all auth tests must pass:
  ```bash
  cd /Users/tylerpreisser/Desktop/nwks-encounter-site && npm run test:api -- --reporter=verbose 2>&1 | tail -50
  ```
  Expected: all `auth.ts` tests green.

- [ ] Commit:
  ```bash
  cd /Users/tylerpreisser/Desktop/nwks-encounter-site
  git add functions/_api/auth.ts functions/_api/__tests__/auth.test.ts
  git commit -m "feat(_api): auth.ts — hashPassword, verifyPassword, createSession, getSessionUser, requireAuth, requireProgram"
  ```

---

## Task 7: `functions/_api/email.ts` — Resend wrapper + template renderer

### Files
- **Create:** `functions/_api/email.ts`
- **Create:** `functions/_api/__tests__/email.test.ts`

### Interfaces
- **Consumes:** `Env` (`EMAIL_ENABLED`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `RESEND_API_KEY`, `DB`); `resend` npm package.
- **Produces (exact contract signatures):**
  ```ts
  export interface SendResult { ok: boolean; providerId?: string; error?: string; skipped?: boolean }
  export async function sendEmail(env: Env, msg: { to: string; subject: string; html: string; text: string; replyTo?: string }): Promise<SendResult>;
  export function renderTemplate(tpl: { subject: string; body_html: string; body_text: string }, vars: Record<string, string>): { subject: string; html: string; text: string };
  ```
- **Behavior:** `sendEmail` ALWAYS writes an `email_log` row regardless of outcome. When `EMAIL_ENABLED !== 'true'`, skips the actual Resend call and returns `{ ok: true, skipped: true }`. The log row's `status` is `'sent'` on success, `'failed'` on Resend error, and `'queued'` when skipped. `renderTemplate` replaces every `{{TOKEN}}` occurrence (case-sensitive) in `subject`, `body_html`, and `body_text`.

### Steps

- [ ] Write `functions/_api/email.ts`:
  ```ts
  import { Resend } from 'resend';
  import { nowIso } from './db';
  import type { Env } from './app';

  export interface SendResult {
    ok: boolean;
    providerId?: string;
    error?: string;
    skipped?: boolean;
  }

  interface EmailMsg {
    to: string;
    subject: string;
    html: string;
    text: string;
    replyTo?: string;
    /** Optional: link this send to an email_log parent campaign. */
    campaignId?: number;
    /** Optional: associate with a person record. */
    personId?: number;
    /** Optional: template key for logging. */
    templateKey?: string;
    /** 'transactional' | 'broadcast' — defaults to 'transactional'. */
    type?: 'transactional' | 'broadcast';
    /** Optional override for program column in email_log. */
    program?: string;
  }

  /**
   * Sends a single email via Resend (or skips if EMAIL_ENABLED !== 'true').
   * Always writes an email_log row.
   */
  export async function sendEmail(
    env: Env,
    msg: EmailMsg
  ): Promise<SendResult> {
    const createdAt = nowIso();
    const emailEnabled = env.EMAIL_ENABLED === 'true';
    const emailType = msg.type ?? 'transactional';
    const program = (msg.program ?? 'mens') as string;

    // We need a log row — insert with status='queued' first, update after send attempt.
    const { meta } = await env.DB.prepare(
      `INSERT INTO email_log
         (campaign_id, program, person_id, to_email, type, template_key, subject, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?)`
    )
      .bind(
        msg.campaignId ?? null,
        program,
        msg.personId ?? null,
        msg.to,
        emailType,
        msg.templateKey ?? null,
        msg.subject,
        createdAt
      )
      .run();

    const logId = meta.last_row_id as number;

    if (!emailEnabled) {
      await env.DB.prepare(
        `UPDATE email_log SET status='queued' WHERE id=?`
      ).bind(logId).run();
      return { ok: true, skipped: true };
    }

    try {
      const resend = new Resend(env.RESEND_API_KEY);
      const response = await resend.emails.send({
        from: env.EMAIL_FROM,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        replyTo: msg.replyTo ?? env.EMAIL_REPLY_TO || undefined,
      });

      if (response.error) {
        await env.DB.prepare(
          `UPDATE email_log SET status='failed', error=?, sent_at=? WHERE id=?`
        ).bind(String(response.error.message ?? response.error), nowIso(), logId).run();
        return { ok: false, error: String(response.error.message ?? response.error) };
      }

      const providerId = response.data?.id ?? undefined;
      await env.DB.prepare(
        `UPDATE email_log SET status='sent', provider_id=?, sent_at=? WHERE id=?`
      ).bind(providerId ?? null, nowIso(), logId).run();
      return { ok: true, providerId };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await env.DB.prepare(
        `UPDATE email_log SET status='failed', error=?, sent_at=? WHERE id=?`
      ).bind(errorMsg, nowIso(), logId).run();
      return { ok: false, error: errorMsg };
    }
  }

  /**
   * Substitutes {{TOKEN}} placeholders in subject, body_html, and body_text.
   * Token names are case-sensitive and must match exactly.
   */
  export function renderTemplate(
    tpl: { subject: string; body_html: string; body_text: string },
    vars: Record<string, string>
  ): { subject: string; html: string; text: string } {
    function substitute(str: string): string {
      return str.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
        return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : `{{${key}}}`;
      });
    }
    return {
      subject: substitute(tpl.subject),
      html: substitute(tpl.body_html),
      text: substitute(tpl.body_text),
    };
  }
  ```

- [ ] Write `functions/_api/__tests__/email.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach } from 'vitest';
  import { env } from 'cloudflare:test';
  import { applyMigrations } from './setup';
  import { sendEmail, renderTemplate } from '../email';
  import type { Env } from '../app';

  /** Minimal Env that reports EMAIL_ENABLED=false (no Resend calls). */
  function makeEnv(overrides: Partial<Env> = {}): Env {
    return {
      ...(env as any),
      EMAIL_ENABLED: 'false',
      EMAIL_FROM: 'NWKS Encounter <noreply@nwksencounter.com>',
      EMAIL_REPLY_TO: '',
      RESEND_API_KEY: 'test_key',
      ANTHROPIC_API_KEY: 'test_key',
      SESSION_SECRET: 'test_secret',
      TURNSTILE_SECRET: 'test_ts',
      ...overrides,
    };
  }

  describe('email.ts', () => {
    beforeEach(async () => {
      await applyMigrations(env as any);
    });

    describe('renderTemplate()', () => {
      const tpl = {
        subject: 'Hello {{first_name}}!',
        body_html: '<p>Welcome, {{first_name}} {{last_name}}.</p>',
        body_text: 'Welcome, {{first_name}} {{last_name}}.',
      };

      it('substitutes all provided tokens', () => {
        const result = renderTemplate(tpl, { first_name: 'John', last_name: 'Doe' });
        expect(result.subject).toBe('Hello John!');
        expect(result.html).toBe('<p>Welcome, John Doe.</p>');
        expect(result.text).toBe('Welcome, John Doe.');
      });

      it('leaves unknown tokens unchanged', () => {
        const result = renderTemplate(tpl, { first_name: 'Jane' });
        expect(result.subject).toBe('Hello Jane!');
        expect(result.text).toContain('{{last_name}}');
      });

      it('handles an empty vars object', () => {
        const result = renderTemplate(tpl, {});
        expect(result.subject).toBe('Hello {{first_name}}!');
      });

      it('replaces every occurrence of a repeated token', () => {
        const t = { subject: '{{x}} {{x}}', body_html: '{{x}}', body_text: '{{x}}' };
        const result = renderTemplate(t, { x: 'HI' });
        expect(result.subject).toBe('HI HI');
      });
    });

    describe('sendEmail() — EMAIL_ENABLED=false', () => {
      it('returns {ok:true, skipped:true} without calling Resend', async () => {
        const e = makeEnv({ EMAIL_ENABLED: 'false' });
        const result = await sendEmail(e, {
          to: 'test@example.com',
          subject: 'Test Subject',
          html: '<p>Hi</p>',
          text: 'Hi',
          program: 'mens',
        });
        expect(result.ok).toBe(true);
        expect(result.skipped).toBe(true);
        expect(result.providerId).toBeUndefined();
      });

      it('writes an email_log row with status=queued when skipped', async () => {
        const e = makeEnv({ EMAIL_ENABLED: 'false' });
        await sendEmail(e, {
          to: 'logged@example.com',
          subject: 'Log Test',
          html: '<p>Hi</p>',
          text: 'Hi',
          program: 'mens',
        });

        const row = await (env as any).DB
          .prepare(`SELECT * FROM email_log WHERE to_email='logged@example.com'`)
          .first<{ status: string; to_email: string }>();
        expect(row).not.toBeNull();
        expect(row!.to_email).toBe('logged@example.com');
        expect(row!.status).toBe('queued');
      });
    });
  });
  ```

- [ ] Run tests — all email tests must pass:
  ```bash
  cd /Users/tylerpreisser/Desktop/nwks-encounter-site && npm run test:api -- --reporter=verbose 2>&1 | tail -50
  ```
  Expected: all `email.ts` tests green.

- [ ] Commit:
  ```bash
  cd /Users/tylerpreisser/Desktop/nwks-encounter-site
  git add functions/_api/email.ts functions/_api/__tests__/email.test.ts
  git commit -m "feat(_api): email.ts — sendEmail (EMAIL_ENABLED guard + email_log), renderTemplate"
  ```

---

## Task 8: `functions/_api/dedupe.ts` — person matching and rollup recompute

### Files
- **Create:** `functions/_api/dedupe.ts`
- **Create:** `functions/_api/__tests__/dedupe.test.ts`

### Interfaces
- **Consumes:** `Env` (`DB`); `Program`, `Person`, `PersonInput`, `nowIso`, `currentYear` from `./db`.
- **Produces (exact contract signatures):**
  ```ts
  export async function upsertPerson(env: Env, program: Program, fields: PersonInput): Promise<{ person_id: number; matched: boolean }>;
  export async function recomputeRollups(env: Env, personId: number): Promise<void>;
  export async function findPossibleDuplicates(env: Env, personId: number): Promise<Person[]>;
  ```
- **Match logic for `upsertPerson`:**
  1. If `fields.email` is non-null/non-empty: exact match `WHERE program=? AND email=? AND merged_into_id IS NULL`.
  2. Else fuzzy: `WHERE program=? AND last_name=? AND merged_into_id IS NULL AND (phone=? OR city=?)` (only when those fields are present).
  3. If no match: INSERT a new `people` row; `matched = false`.
  4. If match found: UPDATE `email` (if now provided and was null), `last_activity_year`; `matched = true`.
- **`recomputeRollups`:** counts `registrations` rows for the person grouped by `role`; UPDATEs `times_attended` and `times_served` on `people`.
- **`findPossibleDuplicates`:** returns other non-merged people in the same program with the same `last_name` (case-insensitive), excluding the person itself and its merge chain.

### Steps

- [ ] Write `functions/_api/dedupe.ts`:
  ```ts
  import { nowIso, currentYear, type Program, type Person, type PersonInput } from './db';
  import type { Env } from './app';

  /**
   * Finds or creates a people record for the given program + fields.
   * Match priority:
   *   1. Exact email match (program + email, excluding merged rows).
   *   2. Fuzzy: same last_name AND (phone match OR city match), excluding merged rows.
   * On match: updates last_activity_year and fills in email if it was null.
   * Returns { person_id, matched: true } on match, { person_id, matched: false } on insert.
   */
  export async function upsertPerson(
    env: Env,
    program: Program,
    fields: PersonInput
  ): Promise<{ person_id: number; matched: boolean }> {
    const db = env.DB;
    const now = nowIso();
    const year = currentYear();

    // --- 1. Email match ---
    if (fields.email && fields.email.trim() !== '') {
      const existing = await db
        .prepare(
          `SELECT id FROM people
           WHERE program = ? AND email = ? AND merged_into_id IS NULL
           LIMIT 1`
        )
        .bind(program, fields.email.trim())
        .first<{ id: number }>();

      if (existing) {
        await db
          .prepare(
            `UPDATE people SET last_activity_year = ?, updated_at = ? WHERE id = ?`
          )
          .bind(year, now, existing.id)
          .run();
        return { person_id: existing.id, matched: true };
      }
    }

    // --- 2. Fuzzy match: last_name + (phone OR city) ---
    const lastName = fields.last_name?.trim();
    if (lastName) {
      const hasFuzzyField = (fields.phone && fields.phone.trim()) || (fields.city && fields.city.trim());
      if (hasFuzzyField) {
        const fuzzy = await db
          .prepare(
            `SELECT id FROM people
             WHERE program = ?
               AND LOWER(last_name) = LOWER(?)
               AND merged_into_id IS NULL
               AND (
                 (? IS NOT NULL AND ? != '' AND phone = ?)
                 OR
                 (? IS NOT NULL AND ? != '' AND LOWER(city) = LOWER(?))
               )
             LIMIT 1`
          )
          .bind(
            program,
            lastName,
            fields.phone ?? null, fields.phone ?? null, fields.phone ?? null,
            fields.city ?? null,  fields.city ?? null,  fields.city ?? null
          )
          .first<{ id: number }>();

        if (fuzzy) {
          // Fill in email if it was null and we now have one
          if (fields.email && fields.email.trim()) {
            await db
              .prepare(
                `UPDATE people
                 SET email = COALESCE(email, ?), last_activity_year = ?, updated_at = ?
                 WHERE id = ?`
              )
              .bind(fields.email.trim(), year, now, fuzzy.id)
              .run();
          } else {
            await db
              .prepare(
                `UPDATE people SET last_activity_year = ?, updated_at = ? WHERE id = ?`
              )
              .bind(year, now, fuzzy.id)
              .run();
          }
          return { person_id: fuzzy.id, matched: true };
        }
      }
    }

    // --- 3. Insert new person ---
    const { meta } = await db
      .prepare(
        `INSERT INTO people
           (program, first_name, last_name, email, phone, phone_type,
            address, city, state, church,
            times_attended, times_served,
            first_seen_year, last_activity_year,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`
      )
      .bind(
        program,
        fields.first_name.trim(),
        fields.last_name.trim(),
        fields.email?.trim() ?? null,
        fields.phone?.trim() ?? null,
        fields.phone_type?.trim() ?? null,
        fields.address?.trim() ?? null,
        fields.city?.trim() ?? null,
        fields.state?.trim() ?? null,
        fields.church?.trim() ?? null,
        year,
        year,
        now,
        now
      )
      .run();

    return { person_id: meta.last_row_id as number, matched: false };
  }

  /**
   * Recounts times_attended and times_served for a person from their registrations
   * and updates the people row. Call after any new registration is inserted.
   */
  export async function recomputeRollups(env: Env, personId: number): Promise<void> {
    const db = env.DB;

    const rows = await db
      .prepare(
        `SELECT role, COUNT(*) as cnt
         FROM registrations
         WHERE person_id = ?
           AND status NOT IN ('cancelled')
         GROUP BY role`
      )
      .bind(personId)
      .all<{ role: string; cnt: number }>();

    let timesAttended = 0;
    let timesServed = 0;
    for (const row of rows.results) {
      if (row.role === 'attendee') timesAttended = row.cnt;
      else if (row.role === 'server') timesServed = row.cnt;
    }

    await db
      .prepare(
        `UPDATE people
         SET times_attended = ?, times_served = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(timesAttended, timesServed, nowIso(), personId)
      .run();
  }

  /**
   * Returns other non-merged people in the same program with the same last_name
   * (case-insensitive), excluding personId itself.
   */
  export async function findPossibleDuplicates(
    env: Env,
    personId: number
  ): Promise<Person[]> {
    const db = env.DB;

    // Get the person's own last_name and program first
    const self = await db
      .prepare('SELECT program, last_name FROM people WHERE id = ?')
      .bind(personId)
      .first<{ program: string; last_name: string }>();

    if (!self) return [];

    const result = await db
      .prepare(
        `SELECT * FROM people
         WHERE program = ?
           AND LOWER(last_name) = LOWER(?)
           AND id != ?
           AND merged_into_id IS NULL
         ORDER BY last_name, first_name`
      )
      .bind(self.program, self.last_name, personId)
      .all<Person>();

    return result.results;
  }
  ```

- [ ] Write `functions/_api/__tests__/dedupe.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach } from 'vitest';
  import { env } from 'cloudflare:test';
  import { applyMigrations } from './setup';
  import { upsertPerson, recomputeRollups, findPossibleDuplicates } from '../dedupe';
  import { nowIso } from '../db';
  import type { Env } from '../app';

  const testEnv = () => env as unknown as Env;

  async function insertEvent(program: 'mens' | 'women'): Promise<number> {
    const ts = nowIso();
    const { meta } = await (env as any).DB
      .prepare(
        `INSERT INTO events (program, year, is_current, created_at, updated_at)
         VALUES (?, 2026, 1, ?, ?)`
      )
      .bind(program, ts, ts)
      .run();
    return meta.last_row_id as number;
  }

  async function insertRegistration(
    program: 'mens' | 'women',
    eventId: number,
    personId: number,
    role: 'attendee' | 'server'
  ): Promise<void> {
    const ts = nowIso();
    await (env as any).DB
      .prepare(
        `INSERT INTO registrations
           (program, event_id, person_id, role, first_name, last_name, created_at)
         VALUES (?, ?, ?, ?, 'Test', 'Person', ?)`
      )
      .bind(program, eventId, personId, role, ts)
      .run();
  }

  describe('dedupe.ts', () => {
    beforeEach(async () => {
      await applyMigrations(env as any);
    });

    describe('upsertPerson()', () => {
      it('inserts a new person when no match exists (matched=false)', async () => {
        const result = await upsertPerson(testEnv(), 'mens', {
          first_name: 'John',
          last_name: 'Smith',
          email: 'john@example.com',
        });
        expect(typeof result.person_id).toBe('number');
        expect(result.person_id).toBeGreaterThan(0);
        expect(result.matched).toBe(false);
      });

      it('matches an existing person by email (matched=true)', async () => {
        const first = await upsertPerson(testEnv(), 'mens', {
          first_name: 'John',
          last_name: 'Smith',
          email: 'john@example.com',
        });

        const second = await upsertPerson(testEnv(), 'mens', {
          first_name: 'Johnny',
          last_name: 'Smith',
          email: 'john@example.com',
        });

        expect(second.matched).toBe(true);
        expect(second.person_id).toBe(first.person_id);
      });

      it('does not match across programs', async () => {
        const m = await upsertPerson(testEnv(), 'mens', {
          first_name: 'Joan',
          last_name: 'Brown',
          email: 'joan@example.com',
        });

        const w = await upsertPerson(testEnv(), 'women', {
          first_name: 'Joan',
          last_name: 'Brown',
          email: 'joan@example.com',
        });

        expect(w.person_id).not.toBe(m.person_id);
        expect(w.matched).toBe(false);
      });

      it('fuzzy-matches by last_name + phone when no email', async () => {
        const first = await upsertPerson(testEnv(), 'mens', {
          first_name: 'Bob',
          last_name: 'Jones',
          phone: '5551234567',
        });

        const second = await upsertPerson(testEnv(), 'mens', {
          first_name: 'Bobby',
          last_name: 'Jones',
          phone: '5551234567',
        });

        expect(second.matched).toBe(true);
        expect(second.person_id).toBe(first.person_id);
      });

      it('fuzzy-matches by last_name + city when no email or phone', async () => {
        const first = await upsertPerson(testEnv(), 'mens', {
          first_name: 'Mike',
          last_name: 'Williams',
          city: 'Colby',
        });

        const second = await upsertPerson(testEnv(), 'mens', {
          first_name: 'Michael',
          last_name: 'Williams',
          city: 'colby', // case-insensitive
        });

        expect(second.matched).toBe(true);
        expect(second.person_id).toBe(first.person_id);
      });

      it('creates two separate records when last_name matches but no phone/city to fuzzy', async () => {
        const a = await upsertPerson(testEnv(), 'mens', {
          first_name: 'Steve', last_name: 'Taylor',
        });
        const b = await upsertPerson(testEnv(), 'mens', {
          first_name: 'Steven', last_name: 'Taylor',
        });
        // No fuzzy fields provided — cannot confirm match, so two rows
        expect(a.person_id).not.toBe(b.person_id);
      });
    });

    describe('recomputeRollups()', () => {
      it('sets times_attended and times_served from registrations', async () => {
        const eventId = await insertEvent('mens');
        const { person_id } = await upsertPerson(testEnv(), 'mens', {
          first_name: 'Cal',
          last_name: 'Reeves',
        });

        await insertRegistration('mens', eventId, person_id, 'attendee');
        await recomputeRollups(testEnv(), person_id);

        const row = await (env as any).DB
          .prepare('SELECT times_attended, times_served FROM people WHERE id = ?')
          .bind(person_id)
          .first<{ times_attended: number; times_served: number }>();

        expect(row!.times_attended).toBe(1);
        expect(row!.times_served).toBe(0);
      });

      it('counts server registrations separately', async () => {
        const eventId = await insertEvent('mens');
        const { person_id } = await upsertPerson(testEnv(), 'mens', {
          first_name: 'Dan',
          last_name: 'Moore',
        });

        await insertRegistration('mens', eventId, person_id, 'server');
        await recomputeRollups(testEnv(), person_id);

        const row = await (env as any).DB
          .prepare('SELECT times_attended, times_served FROM people WHERE id = ?')
          .bind(person_id)
          .first<{ times_attended: number; times_served: number }>();

        expect(row!.times_attended).toBe(0);
        expect(row!.times_served).toBe(1);
      });
    });

    describe('findPossibleDuplicates()', () => {
      it('returns other people with the same last_name in the same program', async () => {
        const a = await upsertPerson(testEnv(), 'mens', {
          first_name: 'Tom', last_name: 'Wilson', email: 'tom1@example.com',
        });
        const b = await upsertPerson(testEnv(), 'mens', {
          first_name: 'Thomas', last_name: 'Wilson', email: 'tom2@example.com',
        });

        const dupes = await findPossibleDuplicates(testEnv(), a.person_id);
        expect(dupes.some(p => p.id === b.person_id)).toBe(true);
        expect(dupes.every(p => p.id !== a.person_id)).toBe(true);
      });

      it('does not include the person themselves', async () => {
        const { person_id } = await upsertPerson(testEnv(), 'mens', {
          first_name: 'Solo', last_name: 'Unique',
        });

        const dupes = await findPossibleDuplicates(testEnv(), person_id);
        expect(dupes.every(p => p.id !== person_id)).toBe(true);
      });

      it('does not return people from the other program', async () => {
        const m = await upsertPerson(testEnv(), 'mens', {
          first_name: 'Sam', last_name: 'Cross', email: 'samm@example.com',
        });
        await upsertPerson(testEnv(), 'women', {
          first_name: 'Samantha', last_name: 'Cross', email: 'samw@example.com',
        });

        const dupes = await findPossibleDuplicates(testEnv(), m.person_id);
        expect(dupes.every(p => p.program === 'mens')).toBe(true);
      });
    });
  });
  ```

- [ ] Run tests — all dedupe tests must pass:
  ```bash
  cd /Users/tylerpreisser/Desktop/nwks-encounter-site && npm run test:api -- --reporter=verbose 2>&1 | tail -60
  ```
  Expected: all `dedupe.ts` tests green, zero failures.

- [ ] Commit:
  ```bash
  cd /Users/tylerpreisser/Desktop/nwks-encounter-site
  git add functions/_api/dedupe.ts functions/_api/__tests__/dedupe.test.ts
  git commit -m "feat(_api): dedupe.ts — upsertPerson (email+fuzzy match), recomputeRollups, findPossibleDuplicates"
  ```

---

## Task 9: `functions/_api/app.ts` + `functions/api/[[path]].ts` + health test

### Files
- **Create:** `functions/_api/app.ts`
- **Create:** `functions/api/[[path]].ts`
- **Create:** `functions/_api/__tests__/health.test.ts`

### Interfaces
- **Produces:**
  - `Env` interface (exact names from contract: `DB`, `PHOTOS`, `SESSIONS`, `EMAIL_ENABLED`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `SESSION_SECRET`, `TURNSTILE_SECRET`)
  - `app` — Hono instance with `GET /api/health` → `200 { ok: true }`
  - `EventRow` re-exported from here for cross-module use (or re-exported from `db.ts`)
  - `[[path]].ts` exports a Pages Function `onRequest` that delegates to `app.fetch()`

### Steps

- [ ] Create `functions/api/` directory:
  ```bash
  mkdir -p /Users/tylerpreisser/Desktop/nwks-encounter-site/functions/api
  ```

- [ ] Write `functions/_api/app.ts`:
  ```ts
  import { Hono } from 'hono';

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

  export const app = new Hono<{ Bindings: Env }>();

  app.get('/api/health', (c) => {
    return c.json({ ok: true });
  });

  // P1+: mount additional routers here as each phase plan adds them.
  // Example (add when ready):
  //   import { registerRouter } from './routes/register';
  //   app.route('/api', registerRouter);
  ```

- [ ] Write `functions/api/[[path]].ts`:
  ```ts
  import { app } from '../_api/app';
  import type { Env } from '../_api/app';

  /**
   * Cloudflare Pages Function catch-all that delegates every /api/* request to the Hono app.
   * Pages passes `context.env` as the bindings; Hono receives them as `c.env`.
   */
  export const onRequest: PagesFunction<Env> = (context) => {
    return app.fetch(context.request, context.env, context);
  };
  ```

- [ ] Write `functions/_api/__tests__/health.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { app } from '../app';

  describe('GET /api/health', () => {
    it('returns 200 with {ok:true}', async () => {
      const res = await app.request('/api/health');
      expect(res.status).toBe(200);
      const body = await res.json() as { ok: boolean };
      expect(body.ok).toBe(true);
    });
  });
  ```

- [ ] Run the health test:
  ```bash
  cd /Users/tylerpreisser/Desktop/nwks-encounter-site && npm run test:api -- --reporter=verbose 2>&1 | tail -20
  ```
  Expected: `✓ GET /api/health returns 200 with {ok:true}`.

- [ ] Commit:
  ```bash
  cd /Users/tylerpreisser/Desktop/nwks-encounter-site
  git add functions/_api/app.ts functions/api/[[path]].ts functions/_api/__tests__/health.test.ts
  git commit -m "feat(_api): Hono app skeleton + Env interface + GET /api/health + Pages Function entry"
  ```

---

## Task 10: `scripts/build.mjs` and `scripts/seed-admin.mjs`

### Files
- **Create:** `scripts/build.mjs`
- **Create:** `scripts/seed-admin.mjs`

### Interfaces
- **`build.mjs` behavior:**
  1. Remove `dist/` if it exists.
  2. Copy `index.html` → `dist/index.html`.
  3. Copy `assets/` → `dist/assets/` (if the directory exists).
  4. Copy `public/` → `dist/public/` (if the directory exists; creates subdirs).
  5. Build admin SPA: run `vite build` inside `admin/` directory → outputs to `dist/admin/`. **If `admin/` does not exist, log a notice and skip this step gracefully.**
  6. Log a final "Build complete → dist/" message.
- **`seed-admin.mjs` behavior:**
  1. Accept `--email`, `--password`, `--name` CLI args (use `process.argv`).
  2. Hash the password via `hashPassword` (import from `functions/_api/auth.ts` transpiled, or replicate the logic inline since this is a Node script).
  3. Run `wrangler d1 execute nwks-encounter --local` with an INSERT SQL to create the admin row.
  4. Print confirmation.

### Steps

- [ ] Create `scripts/` directory if not present:
  ```bash
  mkdir -p /Users/tylerpreisser/Desktop/nwks-encounter-site/scripts
  ```

- [ ] Write `scripts/build.mjs`:
  ```js
  #!/usr/bin/env node
  /**
   * build.mjs — assembles dist/ for Cloudflare Pages deploy.
   *
   * Steps:
   *   1. Clean dist/
   *   2. Copy index.html  → dist/index.html
   *   3. Copy assets/     → dist/assets/   (if present)
   *   4. Copy public/     → dist/           (if present; preserves subdir structure)
   *   5. vite build admin → dist/admin/     (skipped gracefully if admin/ absent)
   */

  import { existsSync, rmSync, mkdirSync, cpSync, copyFileSync } from 'node:fs';
  import { join, dirname } from 'node:path';
  import { fileURLToPath } from 'node:url';
  import { execSync } from 'node:child_process';

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const root = join(__dirname, '..');
  const dist = join(root, 'dist');

  // 1. Clean dist/
  if (existsSync(dist)) {
    rmSync(dist, { recursive: true, force: true });
  }
  mkdirSync(dist, { recursive: true });

  // 2. Copy index.html
  const indexSrc = join(root, 'index.html');
  if (existsSync(indexSrc)) {
    copyFileSync(indexSrc, join(dist, 'index.html'));
    console.log('[build] Copied index.html → dist/index.html');
  } else {
    console.warn('[build] WARNING: index.html not found at root — skipping.');
  }

  // 3. Copy assets/
  const assetsSrc = join(root, 'assets');
  if (existsSync(assetsSrc)) {
    cpSync(assetsSrc, join(dist, 'assets'), { recursive: true });
    console.log('[build] Copied assets/ → dist/assets/');
  }

  // 4. Copy public/  (flattened into dist/ so dist/register/... etc. are served at root)
  const publicSrc = join(root, 'public');
  if (existsSync(publicSrc)) {
    cpSync(publicSrc, dist, { recursive: true });
    console.log('[build] Copied public/ → dist/');
  }

  // 5. Build admin SPA (skip gracefully if admin/ not present)
  const adminDir = join(root, 'admin');
  if (!existsSync(adminDir)) {
    console.log('[build] admin/ not present — skipping admin SPA build (will be added in P2).');
  } else {
    console.log('[build] Building admin SPA...');
    execSync('npx vite build', {
      cwd: adminDir,
      stdio: 'inherit',
      env: { ...process.env, OUTDIR: join(dist, 'admin') },
    });
    console.log('[build] Admin SPA built → dist/admin/');
  }

  console.log('[build] Build complete → dist/');
  ```

- [ ] Write `scripts/seed-admin.mjs`:
  ```js
  #!/usr/bin/env node
  /**
   * seed-admin.mjs — creates an admin_users row in the local (or remote) D1.
   *
   * Usage:
   *   node scripts/seed-admin.mjs --email admin@example.com --password s3cret --name "Admin Name"
   *
   * Flags:
   *   --local    (default) apply to local D1 via wrangler --local
   *   --remote   apply to the remote (production) D1 — use with care
   */

  import { scrypt, randomBytes } from 'node:crypto';
  import { promisify } from 'node:util';
  import { execSync } from 'node:child_process';

  const scryptAsync = promisify(scrypt);

  async function hashPassword(pw) {
    const salt = randomBytes(16);
    const hash = await scryptAsync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
    return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
  }

  function parseArgs(argv) {
    const args = {};
    for (let i = 2; i < argv.length; i++) {
      if (argv[i].startsWith('--')) {
        const key = argv[i].slice(2);
        args[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      }
    }
    return args;
  }

  const args = parseArgs(process.argv);
  const email    = args.email;
  const password = args.password;
  const name     = args.name ?? 'Admin';
  const remote   = args.remote === 'true';

  if (!email || !password) {
    console.error('Usage: node scripts/seed-admin.mjs --email <email> --password <pass> [--name <name>] [--remote]');
    process.exit(1);
  }

  const hash    = await hashPassword(password);
  const now     = new Date().toISOString();

  const sql = `INSERT INTO admin_users (email, name, password_hash, role, created_at) VALUES ('${email.replace(/'/g, "''")}', '${name.replace(/'/g, "''")}', '${hash}', 'admin', '${now}');`;

  const localFlag = remote ? '' : '--local';
  const cmd = `npx wrangler d1 execute nwks-encounter ${localFlag} --command "${sql.replace(/"/g, '\\"')}"`;

  console.log(`[seed-admin] Creating admin user: ${email} (${name})...`);
  try {
    execSync(cmd, { stdio: 'inherit' });
    console.log(`[seed-admin] Done. Admin user created: ${email}`);
  } catch (err) {
    console.error('[seed-admin] Failed to insert row. Check wrangler output above.');
    process.exit(1);
  }
  ```

- [ ] Smoke-test `build.mjs` against the current repo (no admin/ yet — should gracefully skip):
  ```bash
  cd /Users/tylerpreisser/Desktop/nwks-encounter-site && node scripts/build.mjs 2>&1
  ```
  Expected output contains:
  - `[build] Copied index.html → dist/index.html` (or a WARNING if index.html is absent — acceptable)
  - `[build] admin/ not present — skipping admin SPA build (will be added in P2).`
  - `[build] Build complete → dist/`
  - No uncaught exceptions.

- [ ] Confirm `dist/` was created:
  ```bash
  ls /Users/tylerpreisser/Desktop/nwks-encounter-site/dist/
  ```
  Expected: `index.html` (and `assets/` if that directory existed at root).

- [ ] Commit:
  ```bash
  cd /Users/tylerpreisser/Desktop/nwks-encounter-site
  git add scripts/build.mjs scripts/seed-admin.mjs
  git commit -m "feat(scripts): build.mjs (assembles dist/, graceful admin skip) + seed-admin.mjs"
  ```

---

## Task 11: Final validation — run all API tests together

### Steps

- [ ] Run the full test suite one final time and confirm zero failures:
  ```bash
  cd /Users/tylerpreisser/Desktop/nwks-encounter-site && npm run test:api -- --reporter=verbose 2>&1
  ```
  Expected: ALL tests pass. Specifically:
  - `schema smoke tests` — SELECT 1 + all 11 table-existence tests: PASS
  - `db.ts helpers` — nowIso, currentYear, getPerson, getActivePeople, getCurrentEvent: PASS
  - `auth.ts` — hashPassword round-trip, wrong password, different salts, malformed; session create/read, unknown token; requireAuth 401; requireProgram 400/pass-through: PASS
  - `email.ts` — renderTemplate substitution, unknown tokens, empty vars, repeated token; sendEmail skipped returns ok+skipped, writes email_log row: PASS
  - `dedupe.ts` — upsertPerson insert/email-match/cross-program/fuzzy-phone/fuzzy-city/no-match; recomputeRollups attendee/server; findPossibleDuplicates same-name/self-exclusion/cross-program: PASS
  - `GET /api/health` — 200 {ok:true}: PASS

- [ ] If any test fails: fix the implementation (or test expectation if the test itself has an error), re-run, then commit the fix before proceeding.

- [ ] Commit (if any fixup was needed during final validation):
  ```bash
  cd /Users/tylerpreisser/Desktop/nwks-encounter-site
  git add -p
  git commit -m "fix(p0): final validation fixups — all tests passing"
  ```

---

## Contract Additions Needed

The following items are absent from the Foundation Contract (Plan 00) and are required by this plan. They are flagged here so Plan 00 can be updated if needed; they do NOT change Plan 00's authoritative content — they extend it.

1. **`PersonInput` interface** — The contract's `db.ts` module contract defines `Person` but not `PersonInput`. Plan P0 defines it in `db.ts` as:
   ```ts
   export interface PersonInput {
     first_name: string; last_name: string;
     email?: string | null; phone?: string | null; phone_type?: string | null;
     address?: string | null; city?: string | null; state?: string | null; church?: string | null;
   }
   ```
   This is consumed by `dedupe.ts`'s `upsertPerson` signature (which the contract does define). All downstream phase plans should import `PersonInput` from `functions/_api/db.ts`.

2. **`EventRow` interface** — The contract's `db.ts` snippet shows `getCurrentEvent` returning `EventRow` but does not define the interface explicitly. Plan P0 defines it in `db.ts` with all columns from the `events` table. Downstream plans should import from `functions/_api/db.ts`.

3. **`sendEmail` `program` and `personId` fields** — The contract's `sendEmail` signature shows `{ to, subject, html, text, replyTo? }`. Plan P0 adds optional `program`, `personId`, `campaignId`, `templateKey`, and `type` fields to the message object so that `email_log` can be populated with full context. The base signature is still satisfied; the additions are backwards-compatible.

4. **`getCookieValue` utility** — Not in the contract but required internally by `requireAuth`. Defined as a private function inside `auth.ts` (not exported); no contract change needed.

5. **`admin/` directory does not exist at P0 time** — `build.mjs` skips the `vite build` step gracefully. Plan P2 creates `admin/` and the build will start including it automatically.
