# NWKS Encounter — Ministry Backend & Admin Panel

**Design spec** · 2026-07-23 · owner: Tyler Preisser

## 1. Context

`nwksencounter.com` (Northwest Kansas Encounter — Men's Encounter / Women's Encounter)
currently deploys a single, beautiful **animated gateway** (`index.html`, "Gateway v4")
to Cloudflare Pages at `nwks-encounter-site.pages.dev`. The gateway has an intro
animation that reveals a split Men's/Women's world, the Galatians 5:1 verse, and two
hard-coded event dates (Men's **Aug 6–8, 2026**, Women's **Jul 17–19, 2026**). It has
**no forms, no links, and no backend of any kind.**

This project adds a complete ministry operations backend + admin panel **without
changing how the gateway looks.** Registration, email, history/matching, event
management, a photo gallery, and an AI ops assistant are all new.

### Non-negotiables (from the requester)
- The gateway's **visual design does not change.** Registration is added as new pages.
- **Cheapest possible** — target ≈ $0/month on free tiers.
- **Everything on Cloudflare**, on the ministry domain `nwksencounter.com`.
- All repos/commits/pushes under **Tyler Preisser's GitHub** (`TylerPreisser`).
- Men's and Women's are **the same system**, partitioned by data — not two codebases.
- Email sends **from `nwksencounter.com`** (DNS/SPF/DKIM verification is a pre-launch step;
  the requester does not control the domain's DNS yet).
- The AI assistant is **draft-and-approve**: it never sends anything without a human click.
- **Start fresh** — no historical import required now; a CSV import path exists for later.

## 2. Architecture

Cloudflare-native, single vendor, free-tier-first.

| Layer | Choice | Why |
|---|---|---|
| Public site | Existing `index.html` gateway **untouched**; new registration pages + gallery page | Preserve the design; add function |
| Admin panel | React + Vite + Tailwind SPA | State-of-the-art UI; Men's⇄Women's theme toggle |
| API | Cloudflare Workers (TypeScript, **Hono**) | Free tier; same platform as Pages |
| Database | Cloudflare **D1** (SQLite) | Free tier; one schema, `program`-partitioned |
| File storage | Cloudflare **R2** | Free tier; gallery photos |
| Email | **Resend** from `nwksencounter.com` | Free tier (3k/mo); transactional + broadcast |
| Auth | Email + password (scrypt/bcrypt), HttpOnly session cookies | A few named admin logins |
| AI | Anthropic **Opus** via Workers tool-use | Draft-and-approve; scheduled sends via Cron Triggers |
| Scheduling | Cloudflare **Cron Triggers** + Queues | Scheduled/queued email sends & reminders |

**Alternatives considered:** Supabase+Vercel (batteries-included Postgres/auth, but a second
vendor, doesn't match the Cloudflare deploy) and Next.js+Neon (heavier than needed).
Cloudflare-native chosen for cost, cohesion, and matching the existing deploy.

### 2.1 Two instances, one codebase
Every domain record carries `program ∈ {mens, women}`. The admin's top-left toggle
re-themes the entire panel (olive/gold for Men's, rose for Women's) and filters every
query to that program. Identical mechanisms, zero duplication, no drift.

### 2.2 Repos / deploy
- Backend + admin live in the existing repo `TylerPreisser/nwks-encounter-site` (new
  directories: `admin/`, `api/`, `db/`), or a companion repo if cleaner — decided in the plan.
- Public site continues to deploy via `wrangler pages deploy` (per repo README).
- Worker/API deploys via `wrangler deploy`. D1/R2 provisioned via `wrangler`.
- All under Tyler's Cloudflare account, bound to `nwksencounter.com`.

## 3. Data model (D1)

All tables include `program TEXT NOT NULL CHECK(program IN ('mens','women'))` unless noted.

- **people** — canonical identity + rollups. `id, program, first_name, last_name, email,
  phone, city, state, church, times_attended, times_served, first_seen_year, notes,
  created_at, updated_at`. Rollups recomputed on each new registration.
- **registrations** — one per person per event. Stores every form field (attendee or
  server), `role ∈ {attendee, server}`, `event_id`, `person_id`, launch location, shirt
  size, dietary/health, emergency/prayer contact, "how many times attended", free-text
  questions, `created_at`.
- **events** — `id, program, year, kind (attendee/server windows), start_date, end_date,
  launch_locations (json), registration_open (bool), is_current (bool)`. Drives the
  public gateway dates.
- **email_templates** — `id, program, key, name, subject, body_html, body_text, variables`.
  Seeded: welcome/thank-you, reminder, packing list, prayer-partner ask, post-event thanks.
- **email_campaigns** — `id, program, template_key?, subject, body, segment (json filter),
  status (draft/scheduled/sent), scheduled_for, created_by, created_at, sent_at`.
- **email_log** — per-recipient send record: `id, campaign_id?, person_id, to_email,
  type (transactional/broadcast), status, provider_id, error, sent_at`.
- **admin_users** — `id, email, name, password_hash, role (admin), created_at, last_login`.
- **sessions** — `id, user_id, expires_at` (or KV-backed).
- **photos** — `id, program, year, r2_key, caption, sort, created_at`.
- **ai_threads** / **ai_messages** — assistant conversation history + proposed actions.

De-duplication: on registration, match against `people` by (email) then fuzzy
(last_name + phone / last_name + city) to link to an existing person and increment
rollups; flag likely duplicates in the admin for a human to merge.

## 4. Features

1. **Native registration forms** — Attendee + Server, per program, on-brand, saving to D1.
   Same fields the ministry already collects. Client + server validation.
2. **Transactional thank-you email** — branded, sent on submit, with a clear
   "reply with questions" contact path (replies go to a ministry inbox).
3. **Auto-routing** — every sign-up is instantly attached to the current event roster and
   that year's email list; no manual step.
4. **Admin dashboard** — attendee list + server list per program/event/year; search,
   filters, person profiles, and **one-click CSV export** per list.
5. **Intelligent matching** — on a person's profile: history badges
   *"Attended N× · Served N× · First-timer"*, plus duplicate-person detection/merge.
6. **Event/date manager** — edit the year's dates/launch points in the admin; the **public
   gateway reads dates from D1**, so the site updates automatically.
7. **Email center** — compose + send blasts to a roster or filtered segment; pre-drafted
   templates; schedule sends for a future time.
8. **AI assistant (Opus)** — chat wired to the DB with read tools (counts, segments,
   history) and draft/queue tools (compose email, schedule campaign). Draft-and-approve:
   proposed actions surface as pending items a human confirms before anything sends.
9. **Public photo gallery** — per-year gallery page; admin uploads to R2; images render on
   the public site.
10. **CSV import (future)** — admin tool to backfill historical attendees/servers later.

### Value-adds included
Event-day check-in/roster view; shirt-size and launch-location totals (for ordering &
logistics); year-over-year stats (first-timers, returns); prayer-partner/emergency contact
surfaced to leaders.

## 5. Auth & security
- Named admin logins; passwords hashed (scrypt/bcrypt); HttpOnly, Secure, SameSite session
  cookies. Admin panel behind auth; public API endpoints limited to registration + public
  reads (dates, gallery).
- Rate-limiting + a spam guard (e.g. Turnstile) on public registration.
- Secrets (Resend key, Anthropic key, session secret) in Worker secrets, never in the repo.
- Input validated at every boundary.

## 6. Email deliverability
Resend sender = `nwksencounter.com`. Pre-launch: add SPF, DKIM, DMARC records once the
requester has DNS access to the domain. Until then, development sends use a Resend-verified
test identity; production cutover flips the sender.

## 7. Build phasing (each independently shippable)
- **P1** — D1 schema + native forms + thank-you email + auto-routing.
- **P2** — Admin panel: dashboard, attendee/server lists, profiles, CSV export, matching.
- **P3** — Event/date manager wired to the public gateway (dates from D1).
- **P4** — Email center: templates, segments, scheduling.
- **P5** — AI assistant (Opus), draft-and-approve, scheduled sends.
- **P6** — Public photo gallery (R2).

## 8. Out of scope (v1)
Payments/donations; SMS; native mobile apps; public-facing accounts for attendees;
automated historical scraping of the old WordPress site.

## 9. Open items to confirm before/at launch
- DNS access to `nwksencounter.com` for email verification and the production domain.
- Ministry reply-to inbox address for question/contact replies.
- Cloudflare account confirmed as Tyler's, with the domain added.
- Whether admin + API live in the existing repo or a companion repo (decided in the plan).
