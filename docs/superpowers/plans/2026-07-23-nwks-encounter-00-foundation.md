# NWKS Encounter Backend — Foundation Contract (Plan 00)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. **This document is the shared contract for Plans P1–P6.** Every phase plan assumes the repo layout, D1 schema, API surface, naming, and conventions defined here. Do not redefine them — consume them.

**Goal:** Establish the repository scaffold, Cloudflare bindings, database schema, API surface, and test/deploy tooling that all six feature phases build on.

**Architecture:** One Cloudflare Pages project (`nwks-encounter-site`) serves everything on `nwksencounter.com`: the untouched gateway, new public registration + gallery pages, the admin SPA under `/admin`, and the API via **Pages Functions** at `/api/*` (a Hono app). Same-origin (no CORS). Data in D1, photos in R2, sessions in KV. All free-tier.

**Tech Stack:** TypeScript 5, Hono 4 (API), React 18 + Vite 5 + Tailwind 3 (admin SPA), Cloudflare Pages Functions / D1 / R2 / KV / Cron, Resend (email), `@anthropic-ai/sdk` (Opus), Vitest + `@cloudflare/vitest-pool-workers` (API tests), Vitest + React Testing Library + jsdom (admin tests), Playwright (E2E, already a devDep). Node 22, wrangler 4.

## Global Constraints

- **Do NOT modify the gateway's visual design.** `index.html` + `assets/` stay byte-identical except a single non-visual `<script>` (added in P3) that fetches live dates and swaps the date **text** only.
- **Cost:** free tier only. No paid services without explicit approval. Realistic target ≈ $0/mo.
- **Single codebase, two instances by data.** Every domain row carries `program` ∈ `{'mens','women'}` (templates/campaigns may also use `'shared'` where noted). No per-program code duplication. The admin toggles program via a `?program=` query param / `X-Program` header; the API filters every query by it.
- **GitHub:** all commits/pushes to `github.com/TylerPreisser/nwks-encounter-site`. The `TylerPreisser` gh account owns the repo (`tpreisser` is the currently-active account — activate `TylerPreisser` before pushing). No `Co-Authored-By` trailer (repo has no attribution setting).
- **Email sends from `nwksencounter.com`** via Resend. DNS/SPF/DKIM/DMARC verification is a pre-launch step (see Plan 07); until verified, dev uses a Resend test identity behind `EMAIL_ENABLED` flag.
- **AI is draft-and-approve:** the assistant may create `ai_pending_actions` rows but MUST NOT send/schedule email without a human approving via the approve endpoint.
- **Secrets never in the repo.** Use Pages/Worker secrets: `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `SESSION_SECRET`, `TURNSTILE_SECRET`.
- **TDD, DRY, YAGNI, frequent commits.** Every task ends with a passing test and a commit.
- **All timestamps** are ISO-8601 UTC strings (`new Date().toISOString()`). All dates (event start/end) are `YYYY-MM-DD` strings.

## Repository Layout

```
nwks-encounter-site/
  index.html                       # gateway — UNTOUCHED (P3 adds one <script src="/date-sync.js">)
  assets/                          # gateway assets — UNTOUCHED
  public/                          # NEW static public pages (no build step; gateway-styled)
    register/                      #   mens-attendee.html, mens-server.html, womens-attendee.html, womens-server.html
    gallery/                       #   index.html (year picker + grid), gallery.js
    thanks.html                    #   post-submit landing
    date-sync.js                   #   P3: fetches /api/public/events/current, swaps gateway date text
    shared/                        #   form.css, form.js (fetch->/api/register), brand tokens
  functions/
    api/[[path]].ts                # Pages Function entry -> delegates to Hono app
    _api/                          # (underscore = not routed) the API implementation
      app.ts                       #   Hono app: mounts all routers
      db.ts                        #   D1 helpers, typed row accessors
      auth.ts                      #   session cookie + KV, password hashing (scrypt)
      email.ts                     #   Resend client wrapper (respects EMAIL_ENABLED)
      dedupe.ts                    #   person matching / rollup recompute
      routes/                      #   register.ts, auth.ts, dashboard.ts, registrations.ts,
                                   #     people.ts, events.ts, templates.ts, campaigns.ts,
                                   #     photos.ts, imports.ts, ai.ts, publicRoutes.ts
    _api/__tests__/                # Vitest (vitest-pool-workers) API tests
    scheduled.ts                   # P4: Cron handler for scheduled campaign sends
  admin/                           # NEW React+Vite+Tailwind SPA (builds to dist/admin)
    src/{main.tsx, App.tsx, api.ts, theme.ts, pages/, components/}
    index.html, vite.config.ts, tailwind.config.ts, package.json
    src/__tests__/
  db/
    migrations/                    # 0001_init.sql, 0002_seed_templates.sql, ...
    schema.sql                     # canonical full schema (mirror of migrations, for reference)
  scripts/                         # build.mjs (assembles dist/), seed-admin.mjs, existing QA scripts
  wrangler.toml                    # Pages project config: D1/R2/KV bindings, vars
  package.json                     # root: build + deploy + test orchestration
  docs/superpowers/{specs,plans}/
```

**Build (`npm run build` at root, `scripts/build.mjs`):** (1) copy `index.html`,`assets/`,`public/**` → `dist/`; (2) `vite build` the admin → `dist/admin/`; Pages auto-includes `functions/`. **Deploy:** `npx wrangler pages deploy dist --project-name nwks-encounter-site --branch main`.

## Cloudflare Bindings (`wrangler.toml`)

```toml
name = "nwks-encounter-site"
pages_build_output_dir = "dist"
compatibility_date = "2026-07-01"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "nwks-encounter"
database_id = "<filled by `wrangler d1 create nwks-encounter`>"

[[r2_buckets]]
binding = "PHOTOS"
bucket_name = "nwks-encounter-photos"

[[kv_namespaces]]
binding = "SESSIONS"
id = "<filled by `wrangler kv namespace create SESSIONS`>"

[vars]
EMAIL_ENABLED = "false"      # flip to "true" once Resend domain verified
EMAIL_FROM = "NWKS Encounter <noreply@nwksencounter.com>"
EMAIL_REPLY_TO = "<ministry inbox — open item>"
```

Secrets (via `wrangler pages secret put`): `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `SESSION_SECRET`, `TURNSTILE_SECRET`.

`Env` TypeScript interface (in `functions/_api/app.ts`):
```ts
export interface Env {
  DB: D1Database; PHOTOS: R2Bucket; SESSIONS: KVNamespace;
  EMAIL_ENABLED: string; EMAIL_FROM: string; EMAIL_REPLY_TO: string;
  RESEND_API_KEY: string; ANTHROPIC_API_KEY: string; SESSION_SECRET: string; TURNSTILE_SECRET: string;
}
```

## D1 Schema (`db/migrations/0001_init.sql`)

`program` is always `TEXT NOT NULL CHECK(program IN ('mens','women'))` unless the column comment says otherwise.

```sql
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
  times_served INTEGER NOT NULL DEFAULT 0,
  first_seen_year INTEGER,
  last_activity_year INTEGER,
  notes TEXT,
  merged_into_id INTEGER REFERENCES people(id),   -- non-null => this row was merged away
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_people_program_name ON people(program, last_name, first_name);
CREATE UNIQUE INDEX idx_people_program_email ON people(program, email) WHERE email IS NOT NULL AND merged_into_id IS NULL;

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program TEXT NOT NULL CHECK(program IN ('mens','women')),
  year INTEGER NOT NULL,
  title TEXT,
  start_date TEXT,          -- YYYY-MM-DD
  end_date TEXT,
  launch_locations TEXT NOT NULL DEFAULT '[]',   -- JSON array of strings
  attendee_registration_open INTEGER NOT NULL DEFAULT 1,
  server_registration_open INTEGER NOT NULL DEFAULT 1,
  is_current INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(program, year)
);

CREATE TABLE registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program TEXT NOT NULL CHECK(program IN ('mens','women')),
  event_id INTEGER NOT NULL REFERENCES events(id),
  person_id INTEGER NOT NULL REFERENCES people(id),
  role TEXT NOT NULL CHECK(role IN ('attendee','server')),
  first_name TEXT NOT NULL, last_name TEXT NOT NULL,
  email TEXT, phone TEXT, phone_type TEXT,
  address TEXT, city TEXT, state TEXT,
  launch_location TEXT, shirt_size TEXT, church TEXT,
  times_attended_self_report TEXT,
  invited_by TEXT,
  prayer_contact_name TEXT, prayer_contact_phone TEXT,
  dietary_health TEXT,
  questions TEXT,
  extra TEXT NOT NULL DEFAULT '{}',   -- JSON for role-specific / future fields
  status TEXT NOT NULL DEFAULT 'registered' CHECK(status IN ('registered','cancelled','attended','no_show')),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_reg_program_event_role ON registrations(program, event_id, role);
CREATE INDEX idx_reg_person ON registrations(person_id);

CREATE TABLE email_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program TEXT CHECK(program IN ('mens','women','shared')),   -- NULL/'shared' => both
  key TEXT NOT NULL,          -- welcome | reminder | packing_list | prayer_partner | post_event
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT NOT NULL,
  variables TEXT NOT NULL DEFAULT '[]',   -- JSON array of {{token}} names
  updated_at TEXT NOT NULL,
  UNIQUE(program, key)
);

CREATE TABLE email_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program TEXT NOT NULL CHECK(program IN ('mens','women')),
  template_key TEXT,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT NOT NULL,
  segment TEXT NOT NULL DEFAULT '{}',    -- JSON: {event_id?, role?, launch_location?, first_timers_only?, status?}
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','sending','sent','failed')),
  scheduled_for TEXT,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES admin_users(id),
  created_at TEXT NOT NULL,
  sent_at TEXT
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
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sent','delivered','bounced','failed')),
  provider_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE TABLE admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  password_hash TEXT NOT NULL,   -- scrypt: "scrypt$<saltHex>$<hashHex>"
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL,
  last_login_at TEXT
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
  content TEXT NOT NULL,
  tool_calls TEXT,     -- JSON
  created_at TEXT NOT NULL
);

CREATE TABLE ai_pending_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER REFERENCES ai_threads(id),
  program TEXT NOT NULL CHECK(program IN ('mens','women')),
  kind TEXT NOT NULL CHECK(kind IN ('send_campaign','schedule_campaign')),
  summary TEXT NOT NULL,
  payload TEXT NOT NULL,     -- JSON: proposed campaign fields
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','executed')),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by INTEGER REFERENCES admin_users(id)
);
```

## API Surface (all under `/api`, JSON unless noted)

**Conventions:** success → `{ ok: true, ...data }`; error → HTTP 4xx/5xx + `{ ok: false, error: string }`. Admin routes require a valid session cookie (`nwks_session`) and a `program` param (`?program=mens|women`), validated by middleware. Public routes are unauthenticated but rate-limited + Turnstile-guarded where noted.

**Public**
- `POST /api/register/:program/:role` — body = form fields; validates, upserts person (dedupe), inserts registration, attaches to current event, sends `welcome` transactional email; → `{ ok, registration_id, person_id }`. (`:role` ∈ attendee|server)
- `GET  /api/public/events/current?program=` → `{ ok, event }` (id, year, title, start_date, end_date, launch_locations, *_registration_open)
- `GET  /api/public/gallery/years?program=` → `{ ok, years: number[] }`
- `GET  /api/public/gallery?program=&year=` → `{ ok, photos: [{ id, url, caption, width, height }] }`

**Auth**
- `POST /api/auth/login` `{email,password}` → sets `nwks_session` cookie; `{ ok, user }`
- `POST /api/auth/logout` → clears cookie; `{ ok }`
- `GET  /api/auth/me` → `{ ok, user }` or 401

**Admin** (auth + program required)
- `GET  /api/admin/dashboard` → `{ ok, stats }` (counts: attendees, servers, first_timers, by_launch_location, by_shirt_size, recent_registrations, email_sent, upcoming_event)
- `GET  /api/admin/registrations?event_id=&role=&q=&page=` → `{ ok, rows, total }`
- `GET  /api/admin/registrations/export.csv?event_id=&role=` → `text/csv` download
- `GET  /api/admin/people/:id` → `{ ok, person, badges:{times_attended,times_served,is_first_timer}, history:[...], possible_duplicates:[...] }`
- `POST /api/admin/people/:id/merge` `{into_id}` → `{ ok, person }`
- `GET  /api/admin/events` ; `POST /api/admin/events` ; `PATCH /api/admin/events/:id` ; `POST /api/admin/events/:id/set-current`
- `GET  /api/admin/templates` ; `GET /api/admin/templates/:id` ; `PATCH /api/admin/templates/:id`
- `GET  /api/admin/campaigns` ; `GET /api/admin/campaigns/:id` ; `POST /api/admin/campaigns` (draft) ; `POST /api/admin/campaigns/preview` `{segment}`→`{recipient_count,sample}` ; `POST /api/admin/campaigns/:id/send` ; `POST /api/admin/campaigns/:id/schedule` `{scheduled_for}`
- `GET  /api/admin/photos?year=` ; `POST /api/admin/photos` (multipart: file, year, caption) ; `PATCH /api/admin/photos/:id` `{caption,sort}` ; `DELETE /api/admin/photos/:id`
- `POST /api/admin/import` (multipart CSV: role) → `{ ok, imported, duplicates }`
- `POST /api/admin/ai/threads` ; `GET /api/admin/ai/threads` ; `GET /api/admin/ai/threads/:id` ; `POST /api/admin/ai/threads/:id/message` `{content}` → `{ ok, messages, pending_actions }`
- `GET  /api/admin/ai/pending` ; `POST /api/admin/ai/pending/:id/approve` ; `POST /api/admin/ai/pending/:id/reject`

**Cron** (P4): scheduled handler selects `email_campaigns` where `status='scheduled' AND scheduled_for<=now`, sends, marks `sent`.

## Shared Module Contracts (names phases MUST use verbatim)

`functions/_api/db.ts`
```ts
export function nowIso(): string;                       // new Date().toISOString()
export function currentYear(): number;
export type Program = 'mens' | 'women';
export interface Person { id:number; program:Program; first_name:string; last_name:string; email:string|null; phone:string|null; times_attended:number; times_served:number; /* ...all columns */ }
```
`functions/_api/auth.ts`
```ts
export async function hashPassword(pw: string): Promise<string>;          // "scrypt$salt$hash"
export async function verifyPassword(pw: string, stored: string): Promise<boolean>;
export async function createSession(env: Env, userId: number): Promise<string>;   // returns token, stores in KV
export async function getSessionUser(env: Env, token: string|undefined): Promise<{id:number;email:string;name:string;role:string}|null>;
export function requireAuth(): MiddlewareHandler;        // Hono middleware; 401 if no user; sets c.set('user',...)
export function requireProgram(): MiddlewareHandler;     // validates ?program=; sets c.set('program', ...)
```
`functions/_api/dedupe.ts`
```ts
export async function upsertPerson(env: Env, program: Program, fields: PersonInput): Promise<{person_id:number; matched:boolean}>;
export async function recomputeRollups(env: Env, personId: number): Promise<void>;   // recount times_attended/served from registrations
export async function findPossibleDuplicates(env: Env, personId: number): Promise<Person[]>;
```
`functions/_api/email.ts`
```ts
export interface SendResult { ok:boolean; providerId?:string; error?:string; skipped?:boolean }
export async function sendEmail(env: Env, msg: {to:string; subject:string; html:string; text:string; replyTo?:string}): Promise<SendResult>;  // respects EMAIL_ENABLED; always writes email_log
export function renderTemplate(tpl: {subject:string;body_html:string;body_text:string}, vars: Record<string,string>): {subject:string; html:string; text:string};
```

## Testing & Local Dev

- **API tests:** `functions/_api/__tests__/*.test.ts` via Vitest + `@cloudflare/vitest-pool-workers`; each suite applies `db/migrations/*` to an isolated local D1 in `beforeEach`. Run: `npm run test:api`.
- **Admin tests:** `admin/src/__tests__/*.test.tsx` via Vitest + React Testing Library + jsdom. Run: `npm run test:admin`.
- **E2E:** Playwright against `npx wrangler pages dev dist` (existing `playwright` devDep). Run: `npm run test:e2e`.
- **Local run:** `npm run build && npx wrangler pages dev dist --local` (D1/R2/KV emulated). Seed admin: `node scripts/seed-admin.mjs`.
- Root `package.json` scripts: `build`, `dev`, `deploy`, `test:api`, `test:admin`, `test:e2e`, `db:migrate` (`wrangler d1 migrations apply nwks-encounter`), `db:migrate:local`.

## Deploy / Ops

- Provision once: `wrangler d1 create nwks-encounter`, `wrangler r2 bucket create nwks-encounter-photos`, `wrangler kv namespace create SESSIONS`; paste IDs into `wrangler.toml`; `wrangler pages secret put <NAME>` for each secret; `npm run db:migrate`.
- Deploy: `npm run build && npx wrangler pages deploy dist --project-name nwks-encounter-site --branch main`.
- Custom domain `nwksencounter.com` added to the Pages project in the Cloudflare dashboard (open item — needs account/domain access).

## Plan Index (build order)

| Plan | Subsystem | Depends on |
|---|---|---|
| 00 | Foundation (this doc) — scaffold, bindings, schema, tooling | — |
| P1 | Public registration + thank-you email + auto-routing | 00 |
| P2 | Admin panel: auth, dashboard, lists, profiles, CSV export, matching | 00, P1 |
| P3 | Event/date manager wired to the public gateway | 00, P1, P2 |
| P4 | Email center: templates, segments, scheduling (Cron) | 00, P2 |
| P5 | AI assistant (Opus), draft-and-approve | 00, P2, P4 |
| P6 | Public photo gallery (R2) | 00, P2 |
| 07 | Open-items & launch runbook (DNS/SPF/DKIM, domain, seed admin, go-live) | all |
```

---

## Addenda & Reconciliation (v2 — authoritative)

Resolves gaps the phase plans (P0–P6) flagged under "Contract Additions Needed." **These override anything in a phase plan that conflicts.**

### A1. Sessions live in **KV**, not D1
There is no `sessions` table. Auth uses `createSession`/`getSessionUser` against the `SESSIONS` KV namespace. Any test that needs a logged-in user calls the `seedAdmin`/`getAuthCookie` helpers (A4) — never inserts a session row.

### A2. Additional `functions/_api/db.ts` exports (built in P0)
```ts
export interface PersonInput { first_name:string; last_name:string; email?:string|null; phone?:string|null;
  phone_type?:string|null; address?:string|null; city?:string|null; state?:string|null; church?:string|null; year?:number|null }
export interface EventRow { id:number; program:Program; year:number; title:string|null; start_date:string|null;
  end_date:string|null; launch_locations:string[]; attendee_registration_open:boolean; server_registration_open:boolean; is_current:boolean }
export async function getCurrentEvent(env: Env, program: Program): Promise<EventRow | null>;
```

### A3. Middleware error contracts
- `requireAuth()`: no/invalid `nwks_session` → `401 {ok:false,error:'unauthorized'}`; else `c.set('user', user)`.
- `requireProgram()`: missing/invalid `?program=` (or `X-Program`) → `400 {ok:false,error:'program required'}`; else `c.set('program', program)`.

### A4. Test helpers `functions/_api/__tests__/helpers.ts` (built in P0, used by all)
```ts
export async function applyMigrations(env: Env): Promise<void>;                          // runs db/migrations/*.sql in order
export async function seedAdmin(env: Env, o?: {email?:string; password?:string; name?:string}): Promise<{id:number; email:string; password:string}>;
export async function getAuthCookie(app: Hono, env: Env, creds?: {email:string; password:string}): Promise<string>;  // logs in, returns Cookie header value
export async function seedEvent(env: Env, program: Program, o?: Partial<EventRow> & {is_current?:boolean}): Promise<number>;
export async function seedPerson(env: Env, program: Program, o?: Partial<PersonInput>): Promise<number>;
export async function seedRegistration(env: Env, o: {program:Program; event_id:number; person_id:number; role:'attendee'|'server'} & Record<string,unknown>): Promise<number>;
```

### A5. Admin SPA conventions (established in P2; consumed by P3–P6)
- `admin/src/context/ProgramContext.tsx` — exports `ProgramProvider` and `useProgram(): { program: Program; setProgram(p:Program):void }`. (Extracted to its own module to avoid the App.tsx circular import.)
- `admin/src/api.ts` — exports `apiFetch(path: string, init?: RequestInit): Promise<any>`; adds `credentials:'include'`, injects the active `program` as `?program=`, parses JSON, throws `Error(body.error)` when `res.ok` is false or `body.ok===false`.
- `admin/src/theme.ts` — exports the color tokens (mens `#6B7645`/`#B8972A`, women `#A0536A`/`#D4748C`) and `themeFor(program)`. (Tokens only — the hook lives in ProgramContext.)
- `admin/src/components/Nav.tsx` — the sidebar; each phase adds its link here (Dashboard, Registrations, Events, Email, Assistant, Gallery).

### A6. Pages routing for the SPA + API (set up in P0)
Add `public/_routes.json` (copied to `dist/`) so Functions handle the API and the admin SPA shell is served for client routes:
```json
{ "version": 1, "include": ["/api/*", "/admin/*"], "exclude": [] }
```
Admin build uses Vite `base: '/admin/'`; a Function or `_redirects` rule serves `/admin/index.html` for unknown `/admin/*` paths (SPA fallback). Public static pages (`/`, `/register/*`, `/gallery/*`) are served directly by Pages.

### A7. Email helper additions & `sendCampaignById` (built in P4, consumed by P5)
- `functions/_api/routes/campaigns.ts` exports `export async function sendCampaignById(env: Env, campaignId: number): Promise<{sent:number; failed:number}>;` — used by the campaign send route, the cron Worker (A8), and the AI approve endpoint.
- The segment resolver reads `segment.event_id` and looks up the `EventRow` so `{{event_title}}/{{start_date}}/{{end_date}}` tokens resolve on broadcast sends.
- `sendEmail`'s message object accepts optional context (`program`, `personId`, `campaignId`, `templateKey`, `type`) to populate `email_log`; base signature from the contract still holds.

### A8. **Scheduling uses a standalone Cron Worker — NOT Pages Functions**
Cloudflare **Pages does not support Cron Triggers.** P4 therefore adds a small separate Worker:
```
cron/
  src/index.ts        # export default { async scheduled(_, env, ctx){ await sendDueCampaigns(env, nowIso()) } }
  wrangler.toml       # name="nwks-encounter-cron"; [triggers] crons=["*/15 * * * *"];
                      #   binds the SAME D1 (DB), KV, and secrets (RESEND_API_KEY, EMAIL_* vars)
```
- The core logic is a pure, unit-tested function `sendDueCampaigns(env, nowIso): Promise<{processed:number}>` (selects `email_campaigns` where `status='scheduled' AND scheduled_for<=now`, calls `sendCampaignById`, marks `sent`). Deployed via `wrangler deploy` from `cron/`. (`functions/scheduled.ts` in the layout is superseded by `cron/src/index.ts` — ignore the former.)

### A9. Public R2 photo stream route (built in P6)
Add to the public API surface: `GET /api/public/photo/:id` — streams the R2 object for photo `:id` with correct `Content-Type` and long cache headers. The gallery endpoints return `url = /api/public/photo/<id>` (no public R2 bucket access required).

### A10. Extra registration fields
Women's Attendee `sandwich_preference` and `zip`, and any role-specific extras, are stored in `registrations.extra` (JSON) — no schema change. If aggregation on one later becomes important, add a real column via migration.

### A11. Launch-gated open items (tracked in Plan 07, do not block local build/test)
`EMAIL_REPLY_TO` ministry inbox address · Resend API key + DNS SPF/DKIM/DMARC on `nwksencounter.com` · Turnstile site+secret keys · Anthropic API key · Cloudflare account/domain access for provisioning + `pages deploy` + custom domain. Local build & the full test suite run without any of these (miniflare D1/R2/KV; `EMAIL_ENABLED=false`; Turnstile test bypass token; Anthropic client mocked in tests).

