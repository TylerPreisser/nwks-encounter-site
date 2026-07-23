# NWKS Encounter — Open Items & Launch Runbook (Plan 07)

> **For agentic workers:** This plan is executed **last**, mostly by a human-in-the-loop with Tyler, once P0–P6 are built and green. It provisions Cloudflare resources, wires secrets/DNS, and cuts over to `nwksencounter.com`. Nothing here blocks local build/test of P0–P6.

**Goal:** Take the fully-built, locally-tested backend to production on `nwksencounter.com` at ~$0/mo, with working email.

**Global Constraints:** see Foundation Contract (Plan 00). All commits/pushes to `github.com/TylerPreisser/nwks-encounter-site` under the `TylerPreisser` gh account.

## Inputs needed from Tyler / the ministry (collect before go-live)

- [ ] **Cloudflare account access** with `nwksencounter.com` added as a zone (or authority to add it). Confirm `wrangler whoami` is the correct account (memory: wrangler often defaults to the WORK R2 account — `wrangler login` to the right one first).
- [ ] **Ministry reply-to inbox** (e.g. `hello@nwksencounter.com` or a Gmail) → becomes `EMAIL_REPLY_TO` and the "questions?" contact on forms/thank-you.
- [ ] **Resend account** + API key (free tier). Sender domain `nwksencounter.com`.
- [ ] **DNS access** to `nwksencounter.com` to add SPF/DKIM/DMARC + the Pages custom-domain records.
- [ ] **Anthropic API key** (for the P5 assistant; Opus `claude-opus-4-8`).
- [ ] **Turnstile** site + secret keys (free) for the public registration anti-spam.
- [ ] Confirm the **Men's Server** registration field set with leadership (P1 used a reasonable default).

## Runbook

### Step 1 — Provision Cloudflare resources (once)
- [ ] `wrangler login` (correct account) → `wrangler whoami` to verify.
- [ ] `wrangler d1 create nwks-encounter` → paste `database_id` into `wrangler.toml`.
- [ ] `wrangler r2 bucket create nwks-encounter-photos`.
- [ ] `wrangler kv namespace create SESSIONS` → paste `id` into `wrangler.toml`.
- [ ] `npm run db:migrate` (applies `db/migrations/*` to remote D1). Verify tables with `wrangler d1 execute nwks-encounter --command "SELECT name FROM sqlite_master WHERE type='table'"`.

### Step 2 — Secrets
- [ ] `wrangler pages secret put RESEND_API_KEY`
- [ ] `wrangler pages secret put ANTHROPIC_API_KEY`
- [ ] `wrangler pages secret put TURNSTILE_SECRET`
- [ ] For the cron Worker (A8): `cd cron && wrangler secret put RESEND_API_KEY` (+ bind same D1/vars in `cron/wrangler.toml`).
- [ ] Set `[vars] EMAIL_REPLY_TO` in `wrangler.toml`; leave `EMAIL_ENABLED="false"` until Step 4 verifies deliverability.

### Step 3 — Seed the first admin(s) + initial events
- [ ] `node scripts/seed-admin.mjs --email <tyler> --name "Tyler Preisser"` (prompts for password; writes `admin_users` row). Repeat for each ministry leader who needs a login.
- [ ] Create the two current events (P3): Men's **2026, Aug 6–8**, Women's **2026, Jul 17–19**, each `is_current=1`, with their launch locations, so the gateway shows today's dates after cutover.

### Step 4 — Email deliverability (Resend + DNS)
- [ ] Add `nwksencounter.com` as a domain in Resend; add the DKIM CNAME(s), SPF TXT (`include:...`), and a DMARC TXT record to the zone's DNS.
- [ ] Wait for Resend to show the domain **Verified**.
- [ ] Send a test transactional email to yourself; confirm inbox delivery + correct From/Reply-To.
- [ ] Flip `EMAIL_ENABLED="true"` and redeploy.

### Step 5 — Deploy
- [ ] `npm run build` (assembles `dist/` incl. admin SPA).
- [ ] `npx wrangler pages deploy dist --project-name nwks-encounter-site --branch main`.
- [ ] `cd cron && wrangler deploy` (scheduled sender).
- [ ] In the Pages dashboard, add the custom domain `nwksencounter.com` (and `www`), following the DNS prompts. Confirm HTTPS + that the gateway loads with live dates.

### Step 6 — Turnstile
- [ ] Create a Turnstile widget for `nwksencounter.com`; put the **site key** into the `public/register/*.html` pages (replace the placeholder), the **secret** into `TURNSTILE_SECRET`. Submit a real registration end-to-end.

### Step 7 — Production smoke test
- [ ] Register a test attendee (men's) + a test attendee (women's) via the live forms → confirm: DB rows, rollups, thank-you email received, person appears in the admin under the right program.
- [ ] Log into `/admin`, toggle Men's⇄Women's, export a CSV, open a profile (badges correct).
- [ ] Edit an event date in admin → confirm the public gateway date text updates.
- [ ] Compose a tiny campaign to a 1-person segment → send → confirm receipt + `email_log`.
- [ ] Schedule a campaign 20 min out → confirm the cron Worker sends it.
- [ ] Ask the AI assistant a read question + a "draft a reminder" → confirm a pending action appears and **nothing sends** until Approve.
- [ ] Upload a gallery photo for a year → confirm it renders on the public gallery.
- [ ] Delete all test data (`registrations`, `people`, `email_log`, test `photos`) so the ministry starts clean.

### Step 8 — Handoff
- [ ] Short one-page "how to use the admin" note for the ministry leader (login, adding an event, viewing sign-ups, exporting, sending an email, the AI box, uploading photos).
- [ ] Confirm free-tier usage dashboards; set a note to watch Resend volume vs the free cap.

## Rollback
The gateway is unchanged except one `defer` script with a hard-coded-date fallback (P3) — if anything backend-side fails, the public site still shows correct dates and simply lacks live registration. Reverting the Pages deploy to the prior build restores the pure gateway instantly.
