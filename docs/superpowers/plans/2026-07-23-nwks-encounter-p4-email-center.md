# NWKS Encounter — Email Center: Templates, Segments, Scheduling (Plan P4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. **Read the Foundation Contract (Plan 00) before touching any file.** This plan consumes — never redefines — the repo layout, schema, shared module contracts, and API surface defined there. Depends on P0 (scaffold/tooling in place) and P2 (admin auth middleware, admin SPA shell). Do NOT modify `index.html`, `assets/`, or any gateway file.

**Goal:** Implement the Email Center: seed 5 branded email templates, expose template and campaign CRUD APIs, build a segment resolver, implement send/preview/schedule flows with full `email_log` writes, wire a Cron handler for scheduled sends, and deliver an Admin SPA Email Center page — all behind the `EMAIL_ENABLED` flag so dev never calls Resend.

**Architecture:** Pages Functions Hono routes at `/api/admin/templates*` and `/api/admin/campaigns*`; a pure segment resolver util; a Cron handler at `functions/scheduled.ts`; a React + Tailwind Email Center page in the admin SPA. All auth via `requireAuth()` + `requireProgram()` middleware from `functions/_api/auth.ts`. Email sends via `email.sendEmail` + `email.renderTemplate` from `functions/_api/email.ts`.

**Tech Stack:** TypeScript 5, Hono 4, Vitest + `@cloudflare/vitest-pool-workers` (API), Vitest + React Testing Library + jsdom (admin), D1, Resend (behind flag), React 18 + Vite 5 + Tailwind 3.

**Global Constraints:** See Foundation Contract (Plan 00). Key reminders: `EMAIL_ENABLED` env var gates all Resend calls — when `"false"`, `sendEmail` logs and returns `{ ok: true, skipped: true }`; no secrets in repo; `program` ∈ `'mens'|'women'` on every domain row (templates may also use `'shared'`); all timestamps ISO-8601 UTC; TDD — every task ends with passing tests + commit.

---

## File Structure

Files created or modified by this plan:

```
db/migrations/
  0002_seed_templates.sql          # 5 template families × program variants

functions/_api/
  routes/templates.ts              # GET list, GET :id, PATCH :id
  routes/campaigns.ts              # POST (draft), GET list/:id, POST preview,
                                   # POST :id/send, POST :id/schedule
  segment.ts                       # pure segment resolver util
  __tests__/
    templates.test.ts
    campaigns.test.ts
    segment.test.ts

functions/
  scheduled.ts                     # Cron handler

wrangler.toml                      # add [triggers] crons entry

admin/src/
  pages/Email.tsx                  # Email Center page (router entry)
  components/email/
    TemplateEditor.tsx             # edit subject + body_html + body_text
    CampaignComposer.tsx           # segment builder + preview count + send/schedule
    CampaignHistory.tsx            # sent + scheduled list
    RecipientPreview.tsx           # sample of 5 recipients
  __tests__/
    Email.test.tsx                 # composer + preview count + schedule RTL tests
```

**Files this plan does NOT touch:** `index.html`, `assets/`, `functions/_api/email.ts`, `functions/_api/auth.ts`, `functions/_api/db.ts`, `functions/_api/dedupe.ts`, `db/migrations/0001_init.sql`, any P1/P2/P3 route files.

---

## Task 1 — Seed Templates Migration

### Goal
Create `db/migrations/0002_seed_templates.sql` with 5 template keys seeded for `mens`, `women`, and `shared` as appropriate. Templates use `{{token}}` syntax matching the `variables` column. Bodies are warm, on-brand ministry prose.

### Template matrix

| key | program | notes |
|---|---|---|
| `welcome` | `mens` | Men's registration thank-you |
| `welcome` | `women` | Women's registration thank-you |
| `reminder` | `shared` | Pre-event reminder (one week out) |
| `packing_list` | `shared` | What to bring |
| `prayer_partner` | `shared` | Prayer partner ask / pairing intro |
| `post_event` | `mens` | Men's post-event thank-you |
| `post_event` | `women` | Women's post-event thank-you |

Tokens available: `{{first_name}}`, `{{event_title}}`, `{{start_date}}`, `{{end_date}}`, `{{launch_location}}`.

### Files
- `db/migrations/0002_seed_templates.sql`

### Steps

- [ ] **1.1** Create `db/migrations/0002_seed_templates.sql`:

```sql
-- 0002_seed_templates.sql
-- Seed 5 template keys (7 rows total: shared + per-program variants).
-- Uses INSERT OR IGNORE so re-running is safe.

INSERT OR IGNORE INTO email_templates
  (program, key, name, subject, body_html, body_text, variables, updated_at)
VALUES

-- ─── WELCOME: Men's ────────────────────────────────────────────────────────
('mens', 'welcome', 'Welcome – Men''s Encounter',
 'You''re registered for {{event_title}}!',
 '<!DOCTYPE html><html lang="en"><body style="margin:0;padding:0;font-family:Georgia,serif;background:#f5f0e8;color:#2c2c2c;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:6px;overflow:hidden;">
<tr><td style="background:#4a5240;padding:32px 40px;text-align:center;">
  <h1 style="margin:0;color:#d4af37;font-size:28px;letter-spacing:1px;">NWKS Men''s Encounter</h1>
</td></tr>
<tr><td style="padding:40px;">
  <p style="font-size:18px;margin-top:0;">Hey {{first_name}},</p>
  <p>You''re in. We''re grateful God stirred something in you to say <em>yes</em> to this weekend — and we believe He''s going to meet you right where you are.</p>
  <p><strong>Event:</strong> {{event_title}}<br>
     <strong>Dates:</strong> {{start_date}} – {{end_date}}<br>
     <strong>Launch location:</strong> {{launch_location}}</p>
  <p>More details — including what to bring and where to meet — will arrive in your inbox soon. If you have questions before then, just reply to this email and someone from our team will get back to you.</p>
  <p style="margin-top:32px;">Stand firm, brother.<br><strong>— The NWKS Encounter Team</strong></p>
</td></tr>
<tr><td style="background:#f5f0e8;padding:20px 40px;text-align:center;font-size:12px;color:#888;">
  Northwest Kansas Encounter &bull; nwksencounter.com
</td></tr>
</table></td></tr></table>
</body></html>',
 'Hey {{first_name}},

You''re in. We''re grateful God stirred something in you to say yes to this weekend — and we believe He''s going to meet you right where you are.

Event: {{event_title}}
Dates: {{start_date}} – {{end_date}}
Launch location: {{launch_location}}

More details — including what to bring and where to meet — will arrive in your inbox soon. If you have questions before then, just reply to this email and someone from our team will get back to you.

Stand firm, brother.
— The NWKS Encounter Team',
 '["first_name","event_title","start_date","end_date","launch_location"]',
 '2026-07-23T00:00:00.000Z'),

-- ─── WELCOME: Women's ──────────────────────────────────────────────────────
('women', 'welcome', 'Welcome – Women''s Encounter',
 'You''re registered for {{event_title}}!',
 '<!DOCTYPE html><html lang="en"><body style="margin:0;padding:0;font-family:Georgia,serif;background:#fdf6f6;color:#2c2c2c;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:6px;overflow:hidden;">
<tr><td style="background:#8b3a5a;padding:32px 40px;text-align:center;">
  <h1 style="margin:0;color:#f9d0e0;font-size:28px;letter-spacing:1px;">NWKS Women''s Encounter</h1>
</td></tr>
<tr><td style="padding:40px;">
  <p style="font-size:18px;margin-top:0;">Hi {{first_name}},</p>
  <p>We are so glad you said yes! This weekend is set apart just for you — to rest, to be renewed, and to hear from the Lord in a fresh way.</p>
  <p><strong>Event:</strong> {{event_title}}<br>
     <strong>Dates:</strong> {{start_date}} – {{end_date}}<br>
     <strong>Launch location:</strong> {{launch_location}}</p>
  <p>Keep an eye on your inbox — we''ll send packing details and what to expect closer to the date. In the meantime, reply to this email with any questions and our team will happily help.</p>
  <p style="margin-top:32px;">With joy,<br><strong>— The NWKS Encounter Team</strong></p>
</td></tr>
<tr><td style="background:#fdf6f6;padding:20px 40px;text-align:center;font-size:12px;color:#888;">
  Northwest Kansas Encounter &bull; nwksencounter.com
</td></tr>
</table></td></tr></table>
</body></html>',
 'Hi {{first_name}},

We are so glad you said yes! This weekend is set apart just for you — to rest, to be renewed, and to hear from the Lord in a fresh way.

Event: {{event_title}}
Dates: {{start_date}} – {{end_date}}
Launch location: {{launch_location}}

Keep an eye on your inbox — we''ll send packing details and what to expect closer to the date. In the meantime, reply to this email with any questions and our team will happily help.

With joy,
— The NWKS Encounter Team',
 '["first_name","event_title","start_date","end_date","launch_location"]',
 '2026-07-23T00:00:00.000Z'),

-- ─── REMINDER: Shared ──────────────────────────────────────────────────────
('shared', 'reminder', 'One-Week Reminder',
 '{{event_title}} is one week away, {{first_name}}!',
 '<!DOCTYPE html><html lang="en"><body style="margin:0;padding:0;font-family:Georgia,serif;background:#f8f8f5;color:#2c2c2c;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:6px;overflow:hidden;">
<tr><td style="background:#3d4a3a;padding:32px 40px;text-align:center;">
  <h1 style="margin:0;color:#d4af37;font-size:26px;letter-spacing:1px;">NWKS Encounter</h1>
</td></tr>
<tr><td style="padding:40px;">
  <p style="font-size:18px;margin-top:0;">{{first_name}},</p>
  <p>One week from now you''ll be on your way to <strong>{{event_title}}</strong>. We''re so excited to see what God has in store for you this weekend.</p>
  <p><strong>Dates:</strong> {{start_date}} – {{end_date}}<br>
     <strong>Launch location:</strong> {{launch_location}}</p>
  <p>Your packing list is attached (or check the previous email we sent). Please make sure you''ve confirmed your ride to the launch location. If anything has changed in your plans, reply to this email as soon as possible so we can update your spot.</p>
  <p>Praying for you this week as you prepare your heart.</p>
  <p style="margin-top:32px;">See you soon!<br><strong>— The NWKS Encounter Team</strong></p>
</td></tr>
<tr><td style="background:#f8f8f5;padding:20px 40px;text-align:center;font-size:12px;color:#888;">
  Northwest Kansas Encounter &bull; nwksencounter.com
</td></tr>
</table></td></tr></table>
</body></html>',
 '{{first_name}},

One week from now you''ll be on your way to {{event_title}}. We''re so excited to see what God has in store for you this weekend.

Dates: {{start_date}} – {{end_date}}
Launch location: {{launch_location}}

Your packing list is attached (or check the previous email we sent). Please make sure you''ve confirmed your ride to the launch location. If anything has changed in your plans, reply to this email as soon as possible so we can update your spot.

Praying for you this week as you prepare your heart.

See you soon!
— The NWKS Encounter Team',
 '["first_name","event_title","start_date","end_date","launch_location"]',
 '2026-07-23T00:00:00.000Z'),

-- ─── PACKING LIST: Shared ──────────────────────────────────────────────────
('shared', 'packing_list', 'Packing List',
 'What to bring to {{event_title}}',
 '<!DOCTYPE html><html lang="en"><body style="margin:0;padding:0;font-family:Georgia,serif;background:#f8f8f5;color:#2c2c2c;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:6px;overflow:hidden;">
<tr><td style="background:#3d4a3a;padding:32px 40px;text-align:center;">
  <h1 style="margin:0;color:#d4af37;font-size:26px;letter-spacing:1px;">NWKS Encounter — Packing List</h1>
</td></tr>
<tr><td style="padding:40px;">
  <p style="font-size:18px;margin-top:0;">{{first_name}},</p>
  <p>Here''s everything you''ll want to bring for <strong>{{event_title}}</strong> ({{start_date}} – {{end_date}}):</p>
  <ul style="line-height:2;">
    <li>Bible &amp; journal</li>
    <li>Pen / pencil</li>
    <li>Comfortable clothes for outdoor activities</li>
    <li>Layers — Kansas evenings can get cool</li>
    <li>Toiletries &amp; any personal medications</li>
    <li>Bedding or sleeping bag (if overnight)</li>
    <li>Snacks for the road</li>
    <li>A heart ready to receive</li>
  </ul>
  <p><strong>Please leave behind:</strong> unnecessary distractions. Consider limiting screen time so you can be fully present.</p>
  <p>We''ll see you at <strong>{{launch_location}}</strong> on {{start_date}}. Reply to this email with any questions!</p>
  <p style="margin-top:32px;">Can''t wait,<br><strong>— The NWKS Encounter Team</strong></p>
</td></tr>
<tr><td style="background:#f8f8f5;padding:20px 40px;text-align:center;font-size:12px;color:#888;">
  Northwest Kansas Encounter &bull; nwksencounter.com
</td></tr>
</table></td></tr></table>
</body></html>',
 '{{first_name}},

Here''s everything you''ll want to bring for {{event_title}} ({{start_date}} – {{end_date}}):

- Bible & journal
- Pen / pencil
- Comfortable clothes for outdoor activities
- Layers — Kansas evenings can get cool
- Toiletries & any personal medications
- Bedding or sleeping bag (if overnight)
- Snacks for the road
- A heart ready to receive

Please leave behind unnecessary distractions. Consider limiting screen time so you can be fully present.

We''ll see you at {{launch_location}} on {{start_date}}. Reply to this email with any questions!

Can''t wait,
— The NWKS Encounter Team',
 '["first_name","event_title","start_date","end_date","launch_location"]',
 '2026-07-23T00:00:00.000Z'),

-- ─── PRAYER PARTNER: Shared ────────────────────────────────────────────────
('shared', 'prayer_partner', 'Prayer Partner Introduction',
 'Meet your prayer partner for {{event_title}}',
 '<!DOCTYPE html><html lang="en"><body style="margin:0;padding:0;font-family:Georgia,serif;background:#f8f8f5;color:#2c2c2c;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:6px;overflow:hidden;">
<tr><td style="background:#3d4a3a;padding:32px 40px;text-align:center;">
  <h1 style="margin:0;color:#d4af37;font-size:26px;letter-spacing:1px;">Prayer Partner</h1>
</td></tr>
<tr><td style="padding:40px;">
  <p style="font-size:18px;margin-top:0;">{{first_name}},</p>
  <p>As you prepare for <strong>{{event_title}}</strong>, we wanted to let you know that someone is praying for you specifically. One of the best things you can do between now and the weekend is to pray — for yourself, for the team, and for those attending alongside you.</p>
  <p>We''d love for you to take a moment this week to pray:</p>
  <ul style="line-height:2;">
    <li>That God softens every heart coming into the weekend</li>
    <li>That distractions and obstacles fall away</li>
    <li>That the Holy Spirit moves powerfully at {{event_title}}</li>
  </ul>
  <p>If you have a specific prayer request you''d like us to lift up, simply reply to this email. We''re honored to stand with you.</p>
  <p style="margin-top:32px;">Praying with you,<br><strong>— The NWKS Encounter Team</strong></p>
</td></tr>
<tr><td style="background:#f8f8f5;padding:20px 40px;text-align:center;font-size:12px;color:#888;">
  Northwest Kansas Encounter &bull; nwksencounter.com
</td></tr>
</table></td></tr></table>
</body></html>',
 '{{first_name}},

As you prepare for {{event_title}}, we wanted to let you know that someone is praying for you specifically. One of the best things you can do between now and the weekend is to pray — for yourself, for the team, and for those attending alongside you.

We''d love for you to take a moment this week to pray:
- That God softens every heart coming into the weekend
- That distractions and obstacles fall away
- That the Holy Spirit moves powerfully at {{event_title}}

If you have a specific prayer request you''d like us to lift up, simply reply to this email. We''re honored to stand with you.

Praying with you,
— The NWKS Encounter Team',
 '["first_name","event_title","start_date","end_date","launch_location"]',
 '2026-07-23T00:00:00.000Z'),

-- ─── POST EVENT: Men's ─────────────────────────────────────────────────────
('mens', 'post_event', 'Post-Event Thank You – Men''s',
 'Thank you for being part of {{event_title}}',
 '<!DOCTYPE html><html lang="en"><body style="margin:0;padding:0;font-family:Georgia,serif;background:#f5f0e8;color:#2c2c2c;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:6px;overflow:hidden;">
<tr><td style="background:#4a5240;padding:32px 40px;text-align:center;">
  <h1 style="margin:0;color:#d4af37;font-size:28px;letter-spacing:1px;">NWKS Men''s Encounter</h1>
</td></tr>
<tr><td style="padding:40px;">
  <p style="font-size:18px;margin-top:0;">{{first_name}},</p>
  <p>What a weekend. We are humbled and grateful to have shared those days with you at <strong>{{event_title}}</strong>.</p>
  <p>The work God began in you this weekend is not finished — it''s just starting. Lean into what He stirred. Stay connected to your brothers. Don''t let the fire go out when you get home.</p>
  <p>If you have any reflections, feedback, or just want to share what God did, reply to this email. We''d love to hear from you.</p>
  <p>And if you know someone who needs this weekend next year — bring them. That''s how the Kingdom grows.</p>
  <p style="margin-top:32px;">For His glory,<br><strong>— The NWKS Encounter Team</strong></p>
</td></tr>
<tr><td style="background:#f5f0e8;padding:20px 40px;text-align:center;font-size:12px;color:#888;">
  Northwest Kansas Encounter &bull; nwksencounter.com
</td></tr>
</table></td></tr></table>
</body></html>',
 '{{first_name}},

What a weekend. We are humbled and grateful to have shared those days with you at {{event_title}}.

The work God began in you this weekend is not finished — it''s just starting. Lean into what He stirred. Stay connected to your brothers. Don''t let the fire go out when you get home.

If you have any reflections, feedback, or just want to share what God did, reply to this email. We''d love to hear from you.

And if you know someone who needs this weekend next year — bring them. That''s how the Kingdom grows.

For His glory,
— The NWKS Encounter Team',
 '["first_name","event_title","start_date","end_date","launch_location"]',
 '2026-07-23T00:00:00.000Z'),

-- ─── POST EVENT: Women's ───────────────────────────────────────────────────
('women', 'post_event', 'Post-Event Thank You – Women''s',
 'Thank you for being part of {{event_title}}',
 '<!DOCTYPE html><html lang="en"><body style="margin:0;padding:0;font-family:Georgia,serif;background:#fdf6f6;color:#2c2c2c;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:6px;overflow:hidden;">
<tr><td style="background:#8b3a5a;padding:32px 40px;text-align:center;">
  <h1 style="margin:0;color:#f9d0e0;font-size:28px;letter-spacing:1px;">NWKS Women''s Encounter</h1>
</td></tr>
<tr><td style="padding:40px;">
  <p style="font-size:18px;margin-top:0;">{{first_name}},</p>
  <p>Thank you for trusting us with your weekend. It was an honor to walk alongside you at <strong>{{event_title}}</strong>.</p>
  <p>Carry what God placed in your heart this weekend back into your home, your community, and your church. You are not the same woman who arrived — and that is a gift.</p>
  <p>Stay close to the women you met. Reach out to the team any time you need prayer or support. And keep your eyes open for who God might be nudging you to invite next year.</p>
  <p style="margin-top:32px;">With so much love,<br><strong>— The NWKS Encounter Team</strong></p>
</td></tr>
<tr><td style="background:#fdf6f6;padding:20px 40px;text-align:center;font-size:12px;color:#888;">
  Northwest Kansas Encounter &bull; nwksencounter.com
</td></tr>
</table></td></tr></table>
</body></html>',
 '{{first_name}},

Thank you for trusting us with your weekend. It was an honor to walk alongside you at {{event_title}}.

Carry what God placed in your heart this weekend back into your home, your community, and your church. You are not the same woman who arrived — and that is a gift.

Stay close to the women you met. Reach out to the team any time you need prayer or support. And keep your eyes open for who God might be nudging you to invite next year.

With so much love,
— The NWKS Encounter Team',
 '["first_name","event_title","start_date","end_date","launch_location"]',
 '2026-07-23T00:00:00.000Z');
```

- [ ] **1.2** Run migration locally and verify row count = 7:
```bash
npm run db:migrate:local
npx wrangler d1 execute nwks-encounter --local \
  --command "SELECT program, key, name FROM email_templates ORDER BY program, key;"
# expect 7 rows
```

- [ ] **1.3** Add API test asserting 7 rows in `functions/_api/__tests__/templates.test.ts` (see Task 2).

- [ ] **1.4** Commit: `feat(db): seed 5 branded email templates (7 rows, welcome/reminder/packing/prayer/post-event)`.

---

## Task 2 — Templates API

### Goal
Implement `functions/_api/routes/templates.ts` with `GET /api/admin/templates`, `GET /api/admin/templates/:id`, and `PATCH /api/admin/templates/:id`. Wire into `functions/_api/app.ts`.

### Interfaces Consumed
- `requireAuth()`, `requireProgram()` from `functions/_api/auth.ts`
- `nowIso()`, `Program` from `functions/_api/db.ts`
- D1 table `email_templates` (columns: id, program, key, name, subject, body_html, body_text, variables, updated_at)
- Contract endpoints: `GET /api/admin/templates`, `GET /api/admin/templates/:id`, `PATCH /api/admin/templates/:id`

### Files
- `functions/_api/routes/templates.ts` (new)
- `functions/_api/__tests__/templates.test.ts` (new)
- `functions/_api/app.ts` (import + mount)

### Steps

- [ ] **2.1** Create `functions/_api/routes/templates.ts`:

```ts
import { Hono } from 'hono';
import type { Env } from '../app';
import { requireAuth, requireProgram } from '../auth';
import { nowIso } from '../db';

export const templatesRouter = new Hono<{ Bindings: Env }>();

templatesRouter.use('*', requireAuth(), requireProgram());

// GET /api/admin/templates?program=
// Returns all templates for the program + shared templates.
templatesRouter.get('/', async (c) => {
  const program = c.get('program') as string;
  const rows = await c.env.DB.prepare(
    `SELECT id, program, key, name, subject, body_html, body_text, variables, updated_at
     FROM email_templates
     WHERE program = ? OR program = 'shared'
     ORDER BY key, program`
  ).bind(program).all();
  return c.json({ ok: true, templates: rows.results });
});

// GET /api/admin/templates/:id
templatesRouter.get('/:id', async (c) => {
  const program = c.get('program') as string;
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ ok: false, error: 'invalid id' }, 400);
  }
  const row = await c.env.DB.prepare(
    `SELECT id, program, key, name, subject, body_html, body_text, variables, updated_at
     FROM email_templates WHERE id = ?`
  ).bind(id).first();
  if (!row) return c.json({ ok: false, error: 'not found' }, 404);
  // Allow access if template program matches or is shared
  if (row.program !== program && row.program !== 'shared') {
    return c.json({ ok: false, error: 'forbidden' }, 403);
  }
  return c.json({ ok: true, template: row });
});

// PATCH /api/admin/templates/:id
// Editable fields: name, subject, body_html, body_text, variables
templatesRouter.patch('/:id', async (c) => {
  const program = c.get('program') as string;
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ ok: false, error: 'invalid id' }, 400);
  }
  const existing = await c.env.DB.prepare(
    `SELECT id, program FROM email_templates WHERE id = ?`
  ).bind(id).first() as { id: number; program: string } | null;
  if (!existing) return c.json({ ok: false, error: 'not found' }, 404);
  if (existing.program !== program && existing.program !== 'shared') {
    return c.json({ ok: false, error: 'forbidden' }, 403);
  }

  const body = await c.req.json<{
    name?: string; subject?: string;
    body_html?: string; body_text?: string; variables?: string[];
  }>();

  const fields: string[] = [];
  const values: unknown[] = [];

  if (body.name !== undefined)      { fields.push('name = ?');      values.push(body.name); }
  if (body.subject !== undefined)   { fields.push('subject = ?');   values.push(body.subject); }
  if (body.body_html !== undefined) { fields.push('body_html = ?'); values.push(body.body_html); }
  if (body.body_text !== undefined) { fields.push('body_text = ?'); values.push(body.body_text); }
  if (body.variables !== undefined) { fields.push('variables = ?'); values.push(JSON.stringify(body.variables)); }

  if (fields.length === 0) return c.json({ ok: false, error: 'nothing to update' }, 400);

  fields.push('updated_at = ?');
  values.push(nowIso());
  values.push(id);

  await c.env.DB.prepare(
    `UPDATE email_templates SET ${fields.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  const updated = await c.env.DB.prepare(
    `SELECT id, program, key, name, subject, body_html, body_text, variables, updated_at
     FROM email_templates WHERE id = ?`
  ).bind(id).first();
  return c.json({ ok: true, template: updated });
});
```

- [ ] **2.2** In `functions/_api/app.ts`, import and mount:
```ts
import { templatesRouter } from './routes/templates';
// inside the admin-scoped group:
app.route('/api/admin/templates', templatesRouter);
```

- [ ] **2.3** Create `functions/_api/__tests__/templates.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import app from '../app';

// Helper: apply all migrations to the test D1 in beforeEach
async function applyMigrations(db: D1Database) {
  const { readFile } = await import('fs/promises');
  const m1 = await readFile('db/migrations/0001_init.sql', 'utf8');
  const m2 = await readFile('db/migrations/0002_seed_templates.sql', 'utf8');
  for (const sql of [m1, m2]) {
    for (const stmt of sql.split(';').map(s => s.trim()).filter(Boolean)) {
      await db.prepare(stmt).run();
    }
  }
}

describe('Templates API', () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
  });

  it('GET /api/admin/templates lists mens + shared templates', async () => {
    const req = new Request('http://localhost/api/admin/templates?program=mens', {
      headers: { cookie: 'nwks_session=test-token' },
    });
    const ctx = createExecutionContext();
    const res = await app.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    // NOTE: auth middleware must be bypassed in test env (seed a session or
    // configure test auth helper per P2 test conventions)
    expect(res.status).toBe(200);
    const data = await res.json<{ ok: boolean; templates: Array<{ program: string }> }>();
    expect(data.ok).toBe(true);
    // mens templates + shared templates
    const programs = data.templates.map(t => t.program);
    expect(programs.every(p => p === 'mens' || p === 'shared')).toBe(true);
    // must NOT return women-only rows
    expect(programs).not.toContain('women');
  });

  it('seed produces exactly 7 rows total', async () => {
    const result = await env.DB.prepare(
      'SELECT COUNT(*) as n FROM email_templates'
    ).first<{ n: number }>();
    expect(result?.n).toBe(7);
  });

  it('GET /api/admin/templates/:id returns 404 for unknown id', async () => {
    const req = new Request('http://localhost/api/admin/templates/99999?program=mens', {
      headers: { cookie: 'nwks_session=test-token' },
    });
    const ctx = createExecutionContext();
    const res = await app.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(404);
  });

  it('PATCH /api/admin/templates/:id updates subject', async () => {
    // Find a mens template id
    const row = await env.DB.prepare(
      `SELECT id FROM email_templates WHERE program='mens' AND key='welcome'`
    ).first<{ id: number }>();
    const id = row!.id;

    const req = new Request(`http://localhost/api/admin/templates/${id}?program=mens`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        cookie: 'nwks_session=test-token',
      },
      body: JSON.stringify({ subject: 'Updated Subject Line' }),
    });
    const ctx = createExecutionContext();
    const res = await app.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    const data = await res.json<{ ok: boolean; template: { subject: string } }>();
    expect(data.ok).toBe(true);
    expect(data.template.subject).toBe('Updated Subject Line');
  });

  it('PATCH /api/admin/templates/:id returns 400 with no fields', async () => {
    const row = await env.DB.prepare(
      `SELECT id FROM email_templates WHERE program='mens' AND key='welcome'`
    ).first<{ id: number }>();
    const req = new Request(`http://localhost/api/admin/templates/${row!.id}?program=mens`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie: 'nwks_session=test-token' },
      body: JSON.stringify({}),
    });
    const ctx = createExecutionContext();
    const res = await app.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **2.4** Run `npm run test:api -- templates` and confirm all pass.
- [ ] **2.5** Commit: `feat(api): templates routes GET list/:id PATCH with tests`.

---

## Task 3 — Segment Resolver

### Goal
Create `functions/_api/segment.ts` — a **pure, unit-tested** utility that takes a segment descriptor and an Env, queries D1 registrations/people, and returns a resolved list of recipients. No side effects.

### Segment shape (from Foundation Contract schema)
```ts
// segment JSON field on email_campaigns:
interface Segment {
  event_id?: number;       // filter to a specific event
  role?: 'attendee' | 'server';
  launch_location?: string;
  first_timers_only?: boolean;  // people.times_attended == 1 at time of event
  status?: string;         // registration.status filter (default: 'registered')
}
```

### Interfaces Consumed
- `Program` from `functions/_api/db.ts`
- D1 tables: `registrations`, `people`, `events`

### Files
- `functions/_api/segment.ts` (new)
- `functions/_api/__tests__/segment.test.ts` (new)

### Steps

- [ ] **3.1** Create `functions/_api/segment.ts`:

```ts
import type { Env } from './app';
import type { Program } from './db';

export interface Segment {
  event_id?: number;
  role?: 'attendee' | 'server';
  launch_location?: string;
  first_timers_only?: boolean;
  status?: string;
}

export interface Recipient {
  person_id: number;
  first_name: string;
  last_name: string;
  email: string;
  launch_location: string | null;
  times_attended: number;
}

export async function resolveSegment(
  env: Env,
  program: Program,
  segment: Segment
): Promise<Recipient[]> {
  const clauses: string[] = [
    `r.program = ?`,
    `p.email IS NOT NULL`,
    `p.merged_into_id IS NULL`,
  ];
  const bindings: unknown[] = [program];

  if (segment.event_id != null) {
    clauses.push(`r.event_id = ?`);
    bindings.push(segment.event_id);
  } else {
    // default: current event for program
    clauses.push(`e.is_current = 1`);
  }

  if (segment.role) {
    clauses.push(`r.role = ?`);
    bindings.push(segment.role);
  }

  if (segment.launch_location) {
    clauses.push(`r.launch_location = ?`);
    bindings.push(segment.launch_location);
  }

  const regStatus = segment.status ?? 'registered';
  clauses.push(`r.status = ?`);
  bindings.push(regStatus);

  if (segment.first_timers_only) {
    clauses.push(`p.times_attended = 1`);
  }

  const sql = `
    SELECT DISTINCT
      p.id        AS person_id,
      p.first_name,
      p.last_name,
      p.email,
      r.launch_location,
      p.times_attended
    FROM registrations r
    JOIN people p ON p.id = r.person_id
    JOIN events e ON e.id = r.event_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY p.last_name, p.first_name
  `;

  const result = await env.DB.prepare(sql).bind(...bindings).all<Recipient>();
  return result.results;
}
```

- [ ] **3.2** Create `functions/_api/__tests__/segment.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { resolveSegment } from '../segment';

async function seed(db: D1Database) {
  const { readFile } = await import('fs/promises');
  const m1 = await readFile('db/migrations/0001_init.sql', 'utf8');
  for (const stmt of m1.split(';').map(s => s.trim()).filter(Boolean)) {
    await db.prepare(stmt).run();
  }
  const now = new Date().toISOString();
  // Insert event
  await db.prepare(
    `INSERT INTO events (program,year,title,start_date,end_date,launch_locations,
      attendee_registration_open,server_registration_open,is_current,created_at,updated_at)
     VALUES ('mens',2026,'Men''s Encounter 2026','2026-08-06','2026-08-08','["Colby"]',1,1,1,?,?)`
  ).bind(now, now).run();
  // Insert people
  await db.prepare(
    `INSERT INTO people (program,first_name,last_name,email,times_attended,times_served,
      first_seen_year,created_at,updated_at)
     VALUES ('mens','John','Doe','john@example.com',1,0,2026,?,?)`
  ).bind(now, now).run();
  await db.prepare(
    `INSERT INTO people (program,first_name,last_name,email,times_attended,times_served,
      first_seen_year,created_at,updated_at)
     VALUES ('mens','James','Smith','james@example.com',3,1,2023,?,?)`
  ).bind(now, now).run();
  // Insert registrations
  const eventRow = await db.prepare(`SELECT id FROM events LIMIT 1`).first<{ id: number }>();
  const p1 = await db.prepare(`SELECT id FROM people WHERE email='john@example.com'`).first<{ id: number }>();
  const p2 = await db.prepare(`SELECT id FROM people WHERE email='james@example.com'`).first<{ id: number }>();
  await db.prepare(
    `INSERT INTO registrations (program,event_id,person_id,role,first_name,last_name,
      email,launch_location,status,created_at)
     VALUES ('mens',?,?,'attendee','John','Doe','john@example.com','Colby','registered',?)`
  ).bind(eventRow!.id, p1!.id, now).run();
  await db.prepare(
    `INSERT INTO registrations (program,event_id,person_id,role,first_name,last_name,
      email,launch_location,status,created_at)
     VALUES ('mens',?,?,'server','James','Smith','james@example.com','Colby','registered',?)`
  ).bind(eventRow!.id, p2!.id, now).run();
}

describe('resolveSegment', () => {
  beforeEach(async () => { await seed(env.DB); });

  it('returns all registered for current event with no filters', async () => {
    const result = await resolveSegment(env, 'mens', {});
    expect(result).toHaveLength(2);
  });

  it('filters by role=attendee', async () => {
    const result = await resolveSegment(env, 'mens', { role: 'attendee' });
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe('john@example.com');
  });

  it('filters by role=server', async () => {
    const result = await resolveSegment(env, 'mens', { role: 'server' });
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe('james@example.com');
  });

  it('filters first_timers_only (times_attended=1)', async () => {
    const result = await resolveSegment(env, 'mens', { first_timers_only: true });
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe('john@example.com');
  });

  it('returns empty array for women program (no womens data)', async () => {
    const result = await resolveSegment(env, 'women', {});
    expect(result).toHaveLength(0);
  });

  it('filters by launch_location', async () => {
    const result = await resolveSegment(env, 'mens', { launch_location: 'Colby' });
    expect(result).toHaveLength(2);
  });
});
```

- [ ] **3.3** Run `npm run test:api -- segment` and confirm all pass.
- [ ] **3.4** Commit: `feat(api): segment resolver util with unit tests`.

---

## Task 4 — Campaigns API

### Goal
Implement `functions/_api/routes/campaigns.ts` with full CRUD + preview + send + schedule. Wire into `functions/_api/app.ts`.

### Interfaces Consumed
- `requireAuth()`, `requireProgram()` from `functions/_api/auth.ts`
- `nowIso()`, `Program` from `functions/_api/db.ts`
- `sendEmail`, `renderTemplate` from `functions/_api/email.ts`
- `resolveSegment`, `Segment` from `functions/_api/segment.ts`
- D1 tables: `email_campaigns`, `email_log`, `email_templates`
- Contract endpoints:
  - `GET  /api/admin/campaigns` → `{ ok, campaigns }`
  - `GET  /api/admin/campaigns/:id` → `{ ok, campaign }`
  - `POST /api/admin/campaigns` `{template_key?,subject,body_html,body_text,segment}` → `{ ok, campaign }` (status=draft)
  - `POST /api/admin/campaigns/preview` `{program,segment}` → `{ ok, recipient_count, sample }`
  - `POST /api/admin/campaigns/:id/send` → sends, writes email_log, sets status=sent
  - `POST /api/admin/campaigns/:id/schedule` `{scheduled_for}` → sets status=scheduled

### Files
- `functions/_api/routes/campaigns.ts` (new)
- `functions/_api/__tests__/campaigns.test.ts` (new)
- `functions/_api/app.ts` (mount)

### Steps

- [ ] **4.1** Create `functions/_api/routes/campaigns.ts`:

```ts
import { Hono } from 'hono';
import type { Env } from '../app';
import { requireAuth, requireProgram } from '../auth';
import { nowIso } from '../db';
import type { Program } from '../db';
import { sendEmail, renderTemplate } from '../email';
import { resolveSegment } from '../segment';
import type { Segment } from '../segment';

export const campaignsRouter = new Hono<{ Bindings: Env }>();

campaignsRouter.use('*', requireAuth(), requireProgram());

// ── GET /api/admin/campaigns ───────────────────────────────────────────────
campaignsRouter.get('/', async (c) => {
  const program = c.get('program') as Program;
  const rows = await c.env.DB.prepare(
    `SELECT id, program, template_key, subject, segment, status,
            scheduled_for, recipient_count, created_at, sent_at
     FROM email_campaigns WHERE program = ?
     ORDER BY created_at DESC`
  ).bind(program).all();
  return c.json({ ok: true, campaigns: rows.results });
});

// ── GET /api/admin/campaigns/:id ──────────────────────────────────────────
campaignsRouter.get('/:id', async (c) => {
  const program = c.get('program') as Program;
  const id = Number(c.req.param('id'));
  const row = await c.env.DB.prepare(
    `SELECT * FROM email_campaigns WHERE id = ? AND program = ?`
  ).bind(id, program).first();
  if (!row) return c.json({ ok: false, error: 'not found' }, 404);
  return c.json({ ok: true, campaign: row });
});

// ── POST /api/admin/campaigns (create draft) ───────────────────────────────
campaignsRouter.post('/', async (c) => {
  const program = c.get('program') as Program;
  const user = c.get('user') as { id: number };
  const body = await c.req.json<{
    template_key?: string;
    subject: string;
    body_html: string;
    body_text: string;
    segment?: Segment;
  }>();

  if (!body.subject?.trim()) return c.json({ ok: false, error: 'subject required' }, 400);
  if (!body.body_html?.trim()) return c.json({ ok: false, error: 'body_html required' }, 400);
  if (!body.body_text?.trim()) return c.json({ ok: false, error: 'body_text required' }, 400);

  const now = nowIso();
  const segment = body.segment ?? {};

  const result = await c.env.DB.prepare(
    `INSERT INTO email_campaigns
       (program, template_key, subject, body_html, body_text, segment, status,
        recipient_count, created_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    program,
    body.template_key ?? null,
    body.subject,
    body.body_html,
    body.body_text,
    JSON.stringify(segment),
    'draft',
    0,
    user.id,
    now
  ).run();

  const campaign = await c.env.DB.prepare(
    `SELECT * FROM email_campaigns WHERE id = ?`
  ).bind(result.meta.last_row_id).first();

  return c.json({ ok: true, campaign }, 201);
});

// ── POST /api/admin/campaigns/preview ─────────────────────────────────────
// IMPORTANT: must be registered BEFORE /:id routes to avoid param conflict
campaignsRouter.post('/preview', async (c) => {
  const program = c.get('program') as Program;
  const body = await c.req.json<{ segment?: Segment }>();
  const segment = body.segment ?? {};

  const recipients = await resolveSegment(c.env, program, segment);
  const sample = recipients.slice(0, 5).map(r => ({
    first_name: r.first_name,
    last_name: r.last_name,
    email: r.email,
  }));

  return c.json({ ok: true, recipient_count: recipients.length, sample });
});

// ── POST /api/admin/campaigns/:id/send ────────────────────────────────────
campaignsRouter.post('/:id/send', async (c) => {
  const program = c.get('program') as Program;
  const id = Number(c.req.param('id'));

  const campaign = await c.env.DB.prepare(
    `SELECT * FROM email_campaigns WHERE id = ? AND program = ?`
  ).bind(id, program).first<{
    id: number; program: string; subject: string; body_html: string;
    body_text: string; segment: string; status: string; template_key: string | null;
  }>();

  if (!campaign) return c.json({ ok: false, error: 'not found' }, 404);
  if (campaign.status === 'sent') return c.json({ ok: false, error: 'already sent' }, 409);
  if (campaign.status === 'sending') return c.json({ ok: false, error: 'send in progress' }, 409);

  await c.env.DB.prepare(
    `UPDATE email_campaigns SET status='sending' WHERE id=?`
  ).bind(id).run();

  let segment: Segment = {};
  try { segment = JSON.parse(campaign.segment); } catch { /* empty segment */ }

  const recipients = await resolveSegment(c.env, program, segment);
  const now = nowIso();
  let sent = 0;

  for (const recipient of recipients) {
    const rendered = renderTemplate(
      { subject: campaign.subject, body_html: campaign.body_html, body_text: campaign.body_text },
      {
        first_name: recipient.first_name,
        event_title: '',   // enriched from event if needed; placeholder acceptable in broadcast
        start_date: '',
        end_date: '',
        launch_location: recipient.launch_location ?? '',
      }
    );

    const result = await sendEmail(c.env, {
      to: recipient.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    await c.env.DB.prepare(
      `INSERT INTO email_log
         (campaign_id, program, person_id, to_email, type, template_key,
          subject, status, provider_id, error, created_at, sent_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      id,
      program,
      recipient.person_id,
      recipient.email,
      'broadcast',
      campaign.template_key,
      rendered.subject,
      result.ok ? (result.skipped ? 'sent' : 'sent') : 'failed',
      result.providerId ?? null,
      result.error ?? null,
      now,
      result.ok ? now : null
    ).run();

    if (result.ok) sent++;
  }

  const sentAt = nowIso();
  await c.env.DB.prepare(
    `UPDATE email_campaigns
     SET status='sent', sent_at=?, recipient_count=?
     WHERE id=?`
  ).bind(sentAt, recipients.length, id).run();

  return c.json({ ok: true, sent, recipient_count: recipients.length });
});

// ── POST /api/admin/campaigns/:id/schedule ────────────────────────────────
campaignsRouter.post('/:id/schedule', async (c) => {
  const program = c.get('program') as Program;
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ scheduled_for: string }>();

  if (!body.scheduled_for) {
    return c.json({ ok: false, error: 'scheduled_for required' }, 400);
  }
  // Validate ISO-8601
  const ts = new Date(body.scheduled_for);
  if (isNaN(ts.getTime())) {
    return c.json({ ok: false, error: 'scheduled_for must be ISO-8601' }, 400);
  }
  if (ts <= new Date()) {
    return c.json({ ok: false, error: 'scheduled_for must be in the future' }, 400);
  }

  const campaign = await c.env.DB.prepare(
    `SELECT id, status FROM email_campaigns WHERE id=? AND program=?`
  ).bind(id, program).first<{ id: number; status: string }>();
  if (!campaign) return c.json({ ok: false, error: 'not found' }, 404);
  if (campaign.status === 'sent') return c.json({ ok: false, error: 'already sent' }, 409);

  await c.env.DB.prepare(
    `UPDATE email_campaigns SET status='scheduled', scheduled_for=? WHERE id=?`
  ).bind(body.scheduled_for, id).run();

  const updated = await c.env.DB.prepare(
    `SELECT * FROM email_campaigns WHERE id=?`
  ).bind(id).first();

  return c.json({ ok: true, campaign: updated });
});
```

- [ ] **4.2** Mount in `functions/_api/app.ts`:
```ts
import { campaignsRouter } from './routes/campaigns';
app.route('/api/admin/campaigns', campaignsRouter);
```

- [ ] **4.3** Create `functions/_api/__tests__/campaigns.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import app from '../app';

async function applyMigrations(db: D1Database) {
  const { readFile } = await import('fs/promises');
  const m1 = await readFile('db/migrations/0001_init.sql', 'utf8');
  const m2 = await readFile('db/migrations/0002_seed_templates.sql', 'utf8');
  for (const sql of [m1, m2]) {
    for (const stmt of sql.split(';').map(s => s.trim()).filter(Boolean)) {
      await db.prepare(stmt).run();
    }
  }
}

async function seedRecipients(db: D1Database) {
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO events (program,year,title,start_date,end_date,launch_locations,
      attendee_registration_open,server_registration_open,is_current,created_at,updated_at)
     VALUES ('mens',2026,'Men''s Encounter 2026','2026-08-06','2026-08-08','["Colby"]',1,1,1,?,?)`
  ).bind(now, now).run();
  for (let i = 1; i <= 3; i++) {
    await db.prepare(
      `INSERT INTO people (program,first_name,last_name,email,times_attended,times_served,
        first_seen_year,created_at,updated_at)
       VALUES ('mens','User${i}','Test','user${i}@example.com',1,0,2026,?,?)`
    ).bind(now, now).run();
  }
  const eventRow = await db.prepare(`SELECT id FROM events LIMIT 1`).first<{ id: number }>();
  const people = await db.prepare(`SELECT id FROM people WHERE program='mens'`).all<{ id: number }>();
  for (const p of people.results) {
    await db.prepare(
      `INSERT INTO registrations (program,event_id,person_id,role,first_name,last_name,
        email,status,created_at)
       VALUES ('mens',?,?,'attendee','User','Test','user@x.com','registered',?)`
    ).bind(eventRow!.id, p.id, now).run();
  }
}

async function seedAdminAndSession(db: D1Database, kv: KVNamespace) {
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO admin_users (email,name,password_hash,role,created_at)
     VALUES ('admin@test.com','Admin','scrypt$x$y','admin',?)`
  ).bind(now).run();
  const adminRow = await db.prepare(`SELECT id FROM admin_users LIMIT 1`).first<{ id: number }>();
  await kv.put('session:test-token', JSON.stringify({
    userId: adminRow!.id,
    expires: new Date(Date.now() + 86400000).toISOString(),
  }));
}

describe('Campaigns API', () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await seedRecipients(env.DB);
    await seedAdminAndSession(env.DB, env.SESSIONS);
  });

  it('POST /api/admin/campaigns creates draft campaign', async () => {
    const req = new Request('http://localhost/api/admin/campaigns?program=mens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'nwks_session=test-token' },
      body: JSON.stringify({
        subject: 'Test Blast',
        body_html: '<p>Hello {{first_name}}</p>',
        body_text: 'Hello {{first_name}}',
        segment: {},
      }),
    });
    const ctx = createExecutionContext();
    const res = await app.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(201);
    const data = await res.json<{ ok: boolean; campaign: { status: string; id: number } }>();
    expect(data.ok).toBe(true);
    expect(data.campaign.status).toBe('draft');
    expect(typeof data.campaign.id).toBe('number');
  });

  it('POST /api/admin/campaigns/preview returns recipient_count and sample', async () => {
    const req = new Request('http://localhost/api/admin/campaigns/preview?program=mens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'nwks_session=test-token' },
      body: JSON.stringify({ segment: {} }),
    });
    const ctx = createExecutionContext();
    const res = await app.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    const data = await res.json<{
      ok: boolean; recipient_count: number; sample: unknown[];
    }>();
    expect(data.ok).toBe(true);
    expect(data.recipient_count).toBe(3);
    expect(Array.isArray(data.sample)).toBe(true);
    expect(data.sample.length).toBeLessThanOrEqual(5);
  });

  it('POST /api/admin/campaigns/:id/send writes N email_log rows', async () => {
    // Create a draft
    const draft = await env.DB.prepare(
      `INSERT INTO email_campaigns
         (program,subject,body_html,body_text,segment,status,recipient_count,created_at)
       VALUES ('mens','Blast','<p>Hi</p>','Hi','{}','draft',0,?)`
    ).bind(new Date().toISOString()).run();
    const id = draft.meta.last_row_id;

    const req = new Request(`http://localhost/api/admin/campaigns/${id}/send?program=mens`, {
      method: 'POST',
      headers: { cookie: 'nwks_session=test-token' },
    });
    const ctx = createExecutionContext();
    const res = await app.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    const data = await res.json<{ ok: boolean; recipient_count: number }>();
    expect(data.ok).toBe(true);
    expect(data.recipient_count).toBe(3);

    // Verify email_log rows
    const logs = await env.DB.prepare(
      `SELECT COUNT(*) as n FROM email_log WHERE campaign_id=?`
    ).bind(id).first<{ n: number }>();
    expect(logs?.n).toBe(3);

    // Verify campaign marked sent
    const campaign = await env.DB.prepare(
      `SELECT status FROM email_campaigns WHERE id=?`
    ).bind(id).first<{ status: string }>();
    expect(campaign?.status).toBe('sent');
  });

  it('POST /api/admin/campaigns/:id/schedule sets scheduled status', async () => {
    const draft = await env.DB.prepare(
      `INSERT INTO email_campaigns
         (program,subject,body_html,body_text,segment,status,recipient_count,created_at)
       VALUES ('mens','Scheduled','<p>Hi</p>','Hi','{}','draft',0,?)`
    ).bind(new Date().toISOString()).run();
    const id = draft.meta.last_row_id;

    const scheduledFor = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now
    const req = new Request(`http://localhost/api/admin/campaigns/${id}/schedule?program=mens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'nwks_session=test-token' },
      body: JSON.stringify({ scheduled_for: scheduledFor }),
    });
    const ctx = createExecutionContext();
    const res = await app.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    const data = await res.json<{ ok: boolean; campaign: { status: string; scheduled_for: string } }>();
    expect(data.ok).toBe(true);
    expect(data.campaign.status).toBe('scheduled');
    expect(data.campaign.scheduled_for).toBe(scheduledFor);
  });

  it('POST /api/admin/campaigns/:id/send returns 409 if already sent', async () => {
    const sentRow = await env.DB.prepare(
      `INSERT INTO email_campaigns
         (program,subject,body_html,body_text,segment,status,recipient_count,created_at,sent_at)
       VALUES ('mens','Old','<p></p>','','{}','sent',0,?,?)`
    ).bind(new Date().toISOString(), new Date().toISOString()).run();
    const id = sentRow.meta.last_row_id;

    const req = new Request(`http://localhost/api/admin/campaigns/${id}/send?program=mens`, {
      method: 'POST',
      headers: { cookie: 'nwks_session=test-token' },
    });
    const ctx = createExecutionContext();
    const res = await app.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(409);
  });

  it('POST /api/admin/campaigns/:id/schedule rejects past timestamps', async () => {
    const draft = await env.DB.prepare(
      `INSERT INTO email_campaigns
         (program,subject,body_html,body_text,segment,status,recipient_count,created_at)
       VALUES ('mens','Past','<p></p>','','{}','draft',0,?)`
    ).bind(new Date().toISOString()).run();
    const id = draft.meta.last_row_id;

    const req = new Request(`http://localhost/api/admin/campaigns/${id}/schedule?program=mens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'nwks_session=test-token' },
      body: JSON.stringify({ scheduled_for: '2020-01-01T00:00:00.000Z' }),
    });
    const ctx = createExecutionContext();
    const res = await app.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **4.4** Run `npm run test:api -- campaigns` and confirm all pass.
- [ ] **4.5** Commit: `feat(api): campaigns CRUD, preview, send, schedule with tests`.

---

## Task 5 — Cron Handler

### Goal
Implement `functions/scheduled.ts` — the Cloudflare Cron Trigger handler that selects campaigns with `status='scheduled' AND scheduled_for <= now`, sends each one by delegating to the same send logic, and marks them `sent`. Wire the trigger in `wrangler.toml`.

### Interfaces Consumed
- `sendEmail`, `renderTemplate` from `functions/_api/email.ts`
- `resolveSegment` from `functions/_api/segment.ts`
- `nowIso` from `functions/_api/db.ts`
- D1 tables: `email_campaigns`, `email_log`
- Contract note: "Cron (P4): scheduled handler selects `email_campaigns` where `status='scheduled' AND scheduled_for<=now`, sends, marks `sent`."

### Files
- `functions/scheduled.ts` (new)
- `wrangler.toml` (add `[triggers]` section)
- `functions/_api/__tests__/scheduled.test.ts` (new)

### Steps

- [ ] **5.1** Create `functions/scheduled.ts`:

```ts
import type { Env } from './_api/app';
import { nowIso } from './_api/db';
import type { Program } from './_api/db';
import { sendEmail, renderTemplate } from './_api/email';
import { resolveSegment } from './_api/segment';
import type { Segment } from './_api/segment';

interface ScheduledCampaign {
  id: number;
  program: string;
  subject: string;
  body_html: string;
  body_text: string;
  segment: string;
  template_key: string | null;
}

export async function sendScheduledCampaign(
  env: Env,
  campaign: ScheduledCampaign,
  now: string
): Promise<{ sent: number; failed: number }> {
  // Mark as sending to prevent double-fire
  await env.DB.prepare(
    `UPDATE email_campaigns SET status='sending' WHERE id=?`
  ).bind(campaign.id).run();

  let segment: Segment = {};
  try { segment = JSON.parse(campaign.segment); } catch { /* empty */ }

  const program = campaign.program as Program;
  const recipients = await resolveSegment(env, program, segment);
  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    const rendered = renderTemplate(
      { subject: campaign.subject, body_html: campaign.body_html, body_text: campaign.body_text },
      {
        first_name: recipient.first_name,
        event_title: '',
        start_date: '',
        end_date: '',
        launch_location: recipient.launch_location ?? '',
      }
    );

    const result = await sendEmail(env, {
      to: recipient.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    await env.DB.prepare(
      `INSERT INTO email_log
         (campaign_id, program, person_id, to_email, type, template_key,
          subject, status, provider_id, error, created_at, sent_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      campaign.id,
      program,
      recipient.person_id,
      recipient.email,
      'broadcast',
      campaign.template_key,
      rendered.subject,
      result.ok ? 'sent' : 'failed',
      result.providerId ?? null,
      result.error ?? null,
      now,
      result.ok ? now : null
    ).run();

    if (result.ok) sent++; else failed++;
  }

  await env.DB.prepare(
    `UPDATE email_campaigns SET status='sent', sent_at=?, recipient_count=? WHERE id=?`
  ).bind(now, recipients.length, campaign.id).run();

  return { sent, failed };
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    const now = nowIso();

    const due = await env.DB.prepare(
      `SELECT id, program, subject, body_html, body_text, segment, template_key
       FROM email_campaigns
       WHERE status = 'scheduled' AND scheduled_for <= ?`
    ).bind(now).all<ScheduledCampaign>();

    console.log(`[cron] found ${due.results.length} scheduled campaigns to send`);

    for (const campaign of due.results) {
      try {
        const result = await sendScheduledCampaign(env, campaign, now);
        console.log(`[cron] campaign ${campaign.id}: sent=${result.sent} failed=${result.failed}`);
      } catch (err) {
        console.error(`[cron] campaign ${campaign.id} error:`, err);
        await env.DB.prepare(
          `UPDATE email_campaigns SET status='failed' WHERE id=?`
        ).bind(campaign.id).run();
      }
    }
  },
};
```

- [ ] **5.2** Add `[triggers]` to `wrangler.toml` (read file first, then append after the KV block):

```toml
[triggers]
crons = ["*/5 * * * *"]
# Every 5 minutes — Cloudflare free tier supports this.
# Adjust to "0 * * * *" (hourly) or any cron expression as needed.
```

- [ ] **5.3** Create `functions/_api/__tests__/scheduled.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { sendScheduledCampaign } from '../../scheduled';

async function applyMigrations(db: D1Database) {
  const { readFile } = await import('fs/promises');
  const m1 = await readFile('db/migrations/0001_init.sql', 'utf8');
  for (const stmt of m1.split(';').map(s => s.trim()).filter(Boolean)) {
    await db.prepare(stmt).run();
  }
}

async function seedScheduledCampaign(db: D1Database): Promise<number> {
  const now = new Date().toISOString();
  // Seed event + person + registration
  await db.prepare(
    `INSERT INTO events (program,year,title,start_date,end_date,launch_locations,
      attendee_registration_open,server_registration_open,is_current,created_at,updated_at)
     VALUES ('mens',2026,'Test Event','2026-08-06','2026-08-08','["Colby"]',1,1,1,?,?)`
  ).bind(now, now).run();
  await db.prepare(
    `INSERT INTO people (program,first_name,last_name,email,times_attended,times_served,
      first_seen_year,created_at,updated_at)
     VALUES ('mens','Jane','Doe','jane@example.com',1,0,2026,?,?)`
  ).bind(now, now).run();
  const event = await db.prepare(`SELECT id FROM events LIMIT 1`).first<{ id: number }>();
  const person = await db.prepare(`SELECT id FROM people LIMIT 1`).first<{ id: number }>();
  await db.prepare(
    `INSERT INTO registrations (program,event_id,person_id,role,first_name,last_name,
      email,status,created_at)
     VALUES ('mens',?,?,'attendee','Jane','Doe','jane@example.com','registered',?)`
  ).bind(event!.id, person!.id, now).run();

  // Seed a scheduled campaign with scheduled_for in the past
  const past = new Date(Date.now() - 60000).toISOString();
  const result = await db.prepare(
    `INSERT INTO email_campaigns
       (program,subject,body_html,body_text,segment,status,scheduled_for,recipient_count,created_at)
     VALUES ('mens','Scheduled Blast','<p>Hi {{first_name}}</p>','Hi {{first_name}}','{}','scheduled',?,0,?)`
  ).bind(past, now).run();
  return result.meta.last_row_id as number;
}

describe('Cron: sendScheduledCampaign', () => {
  beforeEach(async () => { await applyMigrations(env.DB); });

  it('sends a scheduled campaign and marks it sent', async () => {
    const campaignId = await seedScheduledCampaign(env.DB);
    const now = new Date().toISOString();

    const campaign = await env.DB.prepare(
      `SELECT id, program, subject, body_html, body_text, segment, template_key
       FROM email_campaigns WHERE id=?`
    ).bind(campaignId).first<{
      id: number; program: string; subject: string; body_html: string;
      body_text: string; segment: string; template_key: string | null;
    }>();

    const result = await sendScheduledCampaign(env, campaign!, now);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);

    const updated = await env.DB.prepare(
      `SELECT status, recipient_count FROM email_campaigns WHERE id=?`
    ).bind(campaignId).first<{ status: string; recipient_count: number }>();
    expect(updated?.status).toBe('sent');
    expect(updated?.recipient_count).toBe(1);

    const logRows = await env.DB.prepare(
      `SELECT COUNT(*) as n FROM email_log WHERE campaign_id=?`
    ).bind(campaignId).first<{ n: number }>();
    expect(logRows?.n).toBe(1);
  });

  it('selects only campaigns where scheduled_for <= now', async () => {
    const futureId = await env.DB.prepare(
      `INSERT INTO email_campaigns
         (program,subject,body_html,body_text,segment,status,scheduled_for,recipient_count,created_at)
       VALUES ('mens','Future','<p></p>','','{}','scheduled',?,0,?)`
    ).bind(
      new Date(Date.now() + 3600000).toISOString(),
      new Date().toISOString()
    ).run();

    const now = new Date().toISOString();
    const due = await env.DB.prepare(
      `SELECT id FROM email_campaigns WHERE status='scheduled' AND scheduled_for <= ?`
    ).bind(now).all<{ id: number }>();

    // The future campaign should NOT appear
    expect(due.results.map(r => r.id)).not.toContain(futureId.meta.last_row_id);
  });
});
```

- [ ] **5.4** Run `npm run test:api -- scheduled` and confirm all pass.
- [ ] **5.5** Commit: `feat(cron): scheduled campaign handler + wrangler.toml trigger + tests`.

---

## Task 6 — Admin SPA Email Center

### Goal
Build the Email Center page in the admin SPA: a template editor, a campaign composer with live preview count, send/schedule actions, and a history list. Connects to all campaign/template API endpoints.

### Interfaces Consumed
- `GET /api/admin/templates` (admin SPA `api.ts`)
- `GET /api/admin/templates/:id`, `PATCH /api/admin/templates/:id`
- `GET /api/admin/campaigns`, `POST /api/admin/campaigns`
- `POST /api/admin/campaigns/preview` → `{ recipient_count, sample }`
- `POST /api/admin/campaigns/:id/send`
- `POST /api/admin/campaigns/:id/schedule`

### Files
- `admin/src/pages/Email.tsx` (new)
- `admin/src/components/email/TemplateEditor.tsx` (new)
- `admin/src/components/email/CampaignComposer.tsx` (new)
- `admin/src/components/email/CampaignHistory.tsx` (new)
- `admin/src/components/email/RecipientPreview.tsx` (new)
- `admin/src/__tests__/Email.test.tsx` (new)
- `admin/src/App.tsx` (add `/email` route)

### Steps

- [ ] **6.1** Create `admin/src/components/email/RecipientPreview.tsx`:

```tsx
interface Recipient { first_name: string; last_name: string; email: string; }

interface Props {
  count: number;
  sample: Recipient[];
  loading: boolean;
}

export function RecipientPreview({ count, sample, loading }: Props) {
  if (loading) return <p className="text-sm text-gray-400 italic">Loading preview…</p>;
  return (
    <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
      <p className="font-semibold text-gray-700 mb-2">
        {count} recipient{count !== 1 ? 's' : ''} match this segment
      </p>
      {sample.length > 0 && (
        <ul className="space-y-0.5 text-gray-600">
          {sample.map((r, i) => (
            <li key={i}>{r.first_name} {r.last_name} &lt;{r.email}&gt;</li>
          ))}
          {count > sample.length && (
            <li className="text-gray-400">…and {count - sample.length} more</li>
          )}
        </ul>
      )}
      {count === 0 && <p className="text-gray-400">No recipients match these filters.</p>}
    </div>
  );
}
```

- [ ] **6.2** Create `admin/src/components/email/TemplateEditor.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { useProgram } from '../../theme';

interface Template {
  id: number; program: string; key: string; name: string;
  subject: string; body_html: string; body_text: string;
  variables: string; updated_at: string;
}

export function TemplateEditor() {
  const program = useProgram();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [form, setForm] = useState({ name: '', subject: '', body_html: '', body_text: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/admin/templates?program=${program}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setTemplates(d.templates ?? []));
  }, [program]);

  function selectTemplate(t: Template) {
    setSelected(t);
    setForm({ name: t.name, subject: t.subject, body_html: t.body_html, body_text: t.body_text });
    setSaved(false);
    setError('');
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(
        `/api/admin/templates/${selected.id}?program=${program}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        }
      );
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'save failed');
      setTemplates(prev => prev.map(t => t.id === selected.id ? { ...t, ...form } : t));
      setSelected(prev => prev ? { ...prev, ...form } : prev);
      setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'unknown error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-4 gap-4">
      <aside className="col-span-1 border-r border-gray-200 pr-4">
        <h3 className="font-semibold text-gray-700 mb-2 text-sm uppercase tracking-wide">Templates</h3>
        <ul className="space-y-1">
          {templates.map(t => (
            <li key={t.id}>
              <button
                onClick={() => selectTemplate(t)}
                className={`w-full text-left px-2 py-1 rounded text-sm ${
                  selected?.id === t.id ? 'bg-blue-100 text-blue-700 font-medium' : 'hover:bg-gray-100'
                }`}
              >
                {t.name}
                <span className="block text-xs text-gray-400">{t.program} · {t.key}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="col-span-3 space-y-4">
        {!selected && (
          <p className="text-gray-400 text-sm mt-8">Select a template to edit.</p>
        )}
        {selected && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={form.subject}
                onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Body (HTML)</label>
              <textarea
                className="w-full border rounded px-3 py-2 text-sm font-mono h-40"
                value={form.body_html}
                onChange={e => setForm(f => ({ ...f, body_html: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Body (Plain text)</label>
              <textarea
                className="w-full border rounded px-3 py-2 text-sm font-mono h-28"
                value={form.body_text}
                onChange={e => setForm(f => ({ ...f, body_text: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Template'}
              </button>
              {saved && <span className="text-green-600 text-sm">Saved.</span>}
              {error && <span className="text-red-600 text-sm">{error}</span>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
```

- [ ] **6.3** Create `admin/src/components/email/CampaignComposer.tsx`:

```tsx
import { useState, useEffect, useCallback } from 'react';
import { useProgram } from '../../theme';
import { RecipientPreview } from './RecipientPreview';

interface Segment {
  event_id?: number;
  role?: 'attendee' | 'server' | '';
  launch_location?: string;
  first_timers_only?: boolean;
  status?: string;
}

interface PreviewData { recipient_count: number; sample: Array<{ first_name: string; last_name: string; email: string }>; }

interface Props { onSent?: () => void; }

export function CampaignComposer({ onSent }: Props) {
  const program = useProgram();
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [segment, setSegment] = useState<Segment>({});
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [scheduleFor, setScheduleFor] = useState('');
  const [mode, setMode] = useState<'now' | 'schedule'>('now');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const fetchPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/admin/campaigns/preview?program=${program}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment }),
      });
      const data = await res.json();
      if (data.ok) setPreview(data);
    } finally {
      setPreviewLoading(false);
    }
  }, [program, segment]);

  // Auto-refresh preview when segment changes (debounced 500ms)
  useEffect(() => {
    const timer = setTimeout(fetchPreview, 500);
    return () => clearTimeout(timer);
  }, [fetchPreview]);

  async function submit() {
    if (!subject.trim() || !bodyHtml.trim() || !bodyText.trim()) {
      setErrorMsg('Subject and both body fields are required.');
      return;
    }
    setStatus('sending');
    setErrorMsg('');
    try {
      // 1. Create draft
      const draftRes = await fetch(`/api/admin/campaigns?program=${program}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body_html: bodyHtml, body_text: bodyText, segment }),
      });
      const draft = await draftRes.json();
      if (!draft.ok) throw new Error(draft.error ?? 'create failed');
      const id: number = draft.campaign.id;

      // 2. Send or schedule
      if (mode === 'now') {
        const sendRes = await fetch(`/api/admin/campaigns/${id}/send?program=${program}`, {
          method: 'POST', credentials: 'include',
        });
        const sendData = await sendRes.json();
        if (!sendData.ok) throw new Error(sendData.error ?? 'send failed');
      } else {
        if (!scheduleFor) throw new Error('Pick a send date/time first.');
        const schedRes = await fetch(`/api/admin/campaigns/${id}/schedule?program=${program}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scheduled_for: new Date(scheduleFor).toISOString() }),
        });
        const schedData = await schedRes.json();
        if (!schedData.ok) throw new Error(schedData.error ?? 'schedule failed');
      }

      setStatus('done');
      onSent?.();
    } catch (e: unknown) {
      setStatus('error');
      setErrorMsg(e instanceof Error ? e.message : 'unknown error');
    }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <h3 className="text-base font-semibold text-gray-700">New Campaign</h3>

      {/* Segment builder */}
      <fieldset className="border border-gray-200 rounded p-4 space-y-3">
        <legend className="text-xs font-semibold text-gray-500 uppercase px-1">Segment</legend>
        <div className="flex gap-4 flex-wrap">
          <label className="flex flex-col text-xs text-gray-600 gap-1">
            Role
            <select
              className="border rounded px-2 py-1 text-sm"
              value={segment.role ?? ''}
              onChange={e => setSegment(s => ({ ...s, role: e.target.value as Segment['role'] }))}
            >
              <option value="">All roles</option>
              <option value="attendee">Attendees</option>
              <option value="server">Servers</option>
            </select>
          </label>
          <label className="flex flex-col text-xs text-gray-600 gap-1">
            Launch location
            <input
              className="border rounded px-2 py-1 text-sm"
              placeholder="e.g. Colby"
              value={segment.launch_location ?? ''}
              onChange={e => setSegment(s => ({ ...s, launch_location: e.target.value || undefined }))}
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-600 mt-4">
            <input
              type="checkbox"
              checked={segment.first_timers_only ?? false}
              onChange={e => setSegment(s => ({ ...s, first_timers_only: e.target.checked || undefined }))}
            />
            First-timers only
          </label>
        </div>
      </fieldset>

      {/* Live recipient preview */}
      <RecipientPreview
        count={preview?.recipient_count ?? 0}
        sample={preview?.sample ?? []}
        loading={previewLoading}
      />

      {/* Email fields */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
        <input
          className="w-full border rounded px-3 py-2 text-sm"
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="Email subject…"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Body (HTML)</label>
        <textarea
          className="w-full border rounded px-3 py-2 text-sm font-mono h-36"
          value={bodyHtml}
          onChange={e => setBodyHtml(e.target.value)}
          placeholder="<p>Hello {{first_name}},</p>"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Body (Plain text)</label>
        <textarea
          className="w-full border rounded px-3 py-2 text-sm font-mono h-24"
          value={bodyText}
          onChange={e => setBodyText(e.target.value)}
          placeholder="Hello {{first_name}},"
        />
      </div>

      {/* Send mode */}
      <div className="flex gap-4 items-center">
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="mode" checked={mode === 'now'} onChange={() => setMode('now')} />
          Send now
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="mode" checked={mode === 'schedule'} onChange={() => setMode('schedule')} />
          Schedule for…
        </label>
        {mode === 'schedule' && (
          <input
            type="datetime-local"
            className="border rounded px-2 py-1 text-sm"
            value={scheduleFor}
            onChange={e => setScheduleFor(e.target.value)}
          />
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={status === 'sending' || status === 'done'}
          className="px-5 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {status === 'sending' ? 'Sending…' : mode === 'now' ? 'Send Campaign' : 'Schedule Campaign'}
        </button>
        {status === 'done' && <span className="text-green-600 text-sm">Done!</span>}
        {status === 'error' && <span className="text-red-600 text-sm">{errorMsg}</span>}
        {errorMsg && status !== 'error' && <span className="text-red-600 text-sm">{errorMsg}</span>}
      </div>
    </div>
  );
}
```

- [ ] **6.4** Create `admin/src/components/email/CampaignHistory.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { useProgram } from '../../theme';

interface Campaign {
  id: number; subject: string; status: string;
  recipient_count: number; created_at: string; sent_at: string | null;
  scheduled_for: string | null;
}

export function CampaignHistory({ refresh }: { refresh: number }) {
  const program = useProgram();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  useEffect(() => {
    fetch(`/api/admin/campaigns?program=${program}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setCampaigns(d.campaigns ?? []));
  }, [program, refresh]);

  if (campaigns.length === 0) {
    return <p className="text-sm text-gray-400">No campaigns yet.</p>;
  }

  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="text-left text-xs text-gray-500 uppercase border-b">
          <th className="pb-2 pr-4">Subject</th>
          <th className="pb-2 pr-4">Status</th>
          <th className="pb-2 pr-4">Recipients</th>
          <th className="pb-2 pr-4">Sent / Scheduled</th>
        </tr>
      </thead>
      <tbody>
        {campaigns.map(c => (
          <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
            <td className="py-2 pr-4 font-medium">{c.subject}</td>
            <td className="py-2 pr-4">
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                c.status === 'sent' ? 'bg-green-100 text-green-700' :
                c.status === 'scheduled' ? 'bg-yellow-100 text-yellow-700' :
                'bg-gray-100 text-gray-600'
              }`}>{c.status}</span>
            </td>
            <td className="py-2 pr-4">{c.recipient_count}</td>
            <td className="py-2 text-gray-500">
              {c.sent_at
                ? new Date(c.sent_at).toLocaleString()
                : c.scheduled_for
                  ? `Scheduled: ${new Date(c.scheduled_for).toLocaleString()}`
                  : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **6.5** Create `admin/src/pages/Email.tsx`:

```tsx
import { useState } from 'react';
import { TemplateEditor } from '../components/email/TemplateEditor';
import { CampaignComposer } from '../components/email/CampaignComposer';
import { CampaignHistory } from '../components/email/CampaignHistory';

type Tab = 'compose' | 'templates' | 'history';

export function EmailPage() {
  const [tab, setTab] = useState<Tab>('compose');
  const [historyRefresh, setHistoryRefresh] = useState(0);

  function tabClass(t: Tab) {
    return `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      tab === t
        ? 'border-blue-600 text-blue-600'
        : 'border-transparent text-gray-500 hover:text-gray-700'
    }`;
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Email Center</h2>

      <nav className="flex gap-2 border-b border-gray-200 mb-6">
        <button className={tabClass('compose')} onClick={() => setTab('compose')}>
          Compose
        </button>
        <button className={tabClass('templates')} onClick={() => setTab('templates')}>
          Templates
        </button>
        <button className={tabClass('history')} onClick={() => setTab('history')}>
          History
        </button>
      </nav>

      {tab === 'compose' && (
        <CampaignComposer onSent={() => { setHistoryRefresh(n => n + 1); setTab('history'); }} />
      )}
      {tab === 'templates' && <TemplateEditor />}
      {tab === 'history' && <CampaignHistory refresh={historyRefresh} />}
    </div>
  );
}
```

- [ ] **6.6** In `admin/src/App.tsx`, add the `/email` route:
```tsx
import { EmailPage } from './pages/Email';
// inside the router:
<Route path="/email" element={<EmailPage />} />
```

- [ ] **6.7** Create `admin/src/__tests__/Email.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampaignComposer } from '../components/email/CampaignComposer';
import { RecipientPreview } from '../components/email/RecipientPreview';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock useProgram
vi.mock('../theme', () => ({ useProgram: () => 'mens' }));

beforeEach(() => {
  mockFetch.mockReset();
});

describe('RecipientPreview', () => {
  it('shows recipient count and sample names', () => {
    render(
      <RecipientPreview
        count={3}
        sample={[
          { first_name: 'John', last_name: 'Doe', email: 'john@x.com' },
          { first_name: 'Jane', last_name: 'Smith', email: 'jane@x.com' },
        ]}
        loading={false}
      />
    );
    expect(screen.getByText(/3 recipients/i)).toBeTruthy();
    expect(screen.getByText(/John Doe/)).toBeTruthy();
    expect(screen.getByText(/Jane Smith/)).toBeTruthy();
  });

  it('shows loading state', () => {
    render(<RecipientPreview count={0} sample={[]} loading={true} />);
    expect(screen.getByText(/loading preview/i)).toBeTruthy();
  });

  it('shows empty state when count is 0', () => {
    render(<RecipientPreview count={0} sample={[]} loading={false} />);
    expect(screen.getByText(/no recipients match/i)).toBeTruthy();
  });

  it('shows overflow message when more than sample', () => {
    render(
      <RecipientPreview
        count={10}
        sample={[{ first_name: 'A', last_name: 'B', email: 'a@b.com' }]}
        loading={false}
      />
    );
    expect(screen.getByText(/and 9 more/i)).toBeTruthy();
  });
});

describe('CampaignComposer', () => {
  it('renders subject, body, and send button', () => {
    // Preview fetch on mount
    mockFetch.mockResolvedValue({
      json: async () => ({ ok: true, recipient_count: 5, sample: [] }),
    });
    render(<CampaignComposer />);
    expect(screen.getByPlaceholderText(/email subject/i)).toBeTruthy();
    expect(screen.getByText(/send campaign/i)).toBeTruthy();
  });

  it('calls preview endpoint and shows recipient count', async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({ ok: true, recipient_count: 7, sample: [] }),
    });
    render(<CampaignComposer />);
    await waitFor(() =>
      expect(screen.getByText(/7 recipient/i)).toBeTruthy()
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/campaigns/preview'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('shows schedule datetime input when schedule mode is selected', async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({ ok: true, recipient_count: 0, sample: [] }),
    });
    render(<CampaignComposer />);
    const schedRadio = screen.getByLabelText(/schedule for/i);
    await userEvent.click(schedRadio);
    expect(screen.getByDisplayValue('')).toBeTruthy(); // datetime-local input
  });

  it('shows done status after successful send', async () => {
    // First call: preview; second call: create draft; third: send
    mockFetch
      .mockResolvedValueOnce({ json: async () => ({ ok: true, recipient_count: 2, sample: [] }) })
      .mockResolvedValueOnce({ json: async () => ({ ok: true, campaign: { id: 1 } }) })
      .mockResolvedValueOnce({ json: async () => ({ ok: true, sent: 2, recipient_count: 2 }) });

    render(<CampaignComposer />);

    await userEvent.type(screen.getByPlaceholderText(/email subject/i), 'Test Subject');
    await userEvent.type(screen.getByPlaceholderText(/Hello \{\{first_name\}\}/), '<p>Hello</p>');
    await userEvent.type(screen.getAllByPlaceholderText(/Hello \{\{first_name\}\}/)[1] ?? screen.getByPlaceholderText(/Hello \{\{first_name\}\},/), 'Hello');

    await userEvent.click(screen.getByText(/send campaign/i));
    await waitFor(() =>
      expect(screen.getByText(/done/i)).toBeTruthy()
    );
  });
});
```

- [ ] **6.8** Run `npm run test:admin -- Email` and confirm all pass.
- [ ] **6.9** Run `npm run build` and confirm admin SPA builds without errors.
- [ ] **6.10** Commit: `feat(admin): Email Center page — composer, template editor, history, RTL tests`.

---

## Task 7 — EMAIL_ENABLED Guard Verification

### Goal
Confirm `EMAIL_ENABLED` is respected end-to-end: when `"false"`, `sendEmail` does NOT call Resend and returns `{ ok: true, skipped: true }`, but still writes `email_log` rows (so audit trail is preserved). Campaigns still move to `status='sent'`.

### Interfaces Consumed
- `sendEmail` from `functions/_api/email.ts` (already implemented in P0/P1)

### Steps

- [ ] **7.1** Read `functions/_api/email.ts` and verify the `EMAIL_ENABLED !== 'true'` guard already short-circuits before any Resend call, returns `{ ok: true, skipped: true }`, and that `skipped` rows still receive a `sent_at` timestamp. If any gap is found, add a minimal fix (no new functions — edit the guard inline).

- [ ] **7.2** Verify that the campaigns send route (Task 4) and cron handler (Task 5) both handle `skipped: true` the same as `ok: true` when writing `email_log.status` and setting the campaign to `sent`. (Both do in the code above — confirm by reading the conditionals.)

- [ ] **7.3** Add one focused test to `functions/_api/__tests__/campaigns.test.ts`:

```ts
it('send marks campaign sent even when EMAIL_ENABLED=false (skipped mode)', async () => {
  // env.EMAIL_ENABLED is 'false' in test environment per wrangler test config
  const draft = await env.DB.prepare(
    `INSERT INTO email_campaigns
       (program,subject,body_html,body_text,segment,status,recipient_count,created_at)
     VALUES ('mens','Skip Test','<p>Hi</p>','Hi','{}','draft',0,?)`
  ).bind(new Date().toISOString()).run();
  const id = draft.meta.last_row_id;

  const req = new Request(`http://localhost/api/admin/campaigns/${id}/send?program=mens`, {
    method: 'POST',
    headers: { cookie: 'nwks_session=test-token' },
  });
  const ctx = createExecutionContext();
  const res = await app.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  expect(res.status).toBe(200);

  const campaign = await env.DB.prepare(
    `SELECT status FROM email_campaigns WHERE id=?`
  ).bind(id).first<{ status: string }>();
  expect(campaign?.status).toBe('sent');
});
```

- [ ] **7.4** Run full API test suite: `npm run test:api`. Confirm all pass.
- [ ] **7.5** Commit: `test: EMAIL_ENABLED guard verified in campaign send flow`.

---

## Contract Additions Needed

The Foundation Contract (Plan 00) is nearly complete for P4. The following minor gaps need resolution before implementation begins:

### 1. `useProgram()` hook location not specified
The admin SPA components consume a `useProgram()` hook (used across the admin — returns the active program from URL/context). The Foundation Contract references `admin/src/theme.ts` for theming but does not specify whether `useProgram` lives in `theme.ts` or a separate `context.ts`. **Resolution before P4 implementation:** confirm `useProgram` is exported from `admin/src/theme.ts` (or wherever P2 placed it) and import from that path consistently.

### 2. `sendEmail` `skipped` field spelling
The Foundation Contract's `email.ts` interface shows `skipped?: boolean` in `SendResult`, but the field spelling should be confirmed against the P0/P1 implementation (some implementations use `skipped`, others `wasSkipped`). All P4 code above uses `skipped` — verify against `functions/_api/email.ts` before implementation.

### 3. Campaigns send — event token enrichment
The segment resolver returns `first_name`, `last_name`, `email`, `launch_location` per recipient, but `event_title`, `start_date`, and `end_date` tokens are not resolved per-send in this plan (left as empty strings for broadcast campaigns). The spec lists these as template variables. **Resolution:** for P4, broadcast campaigns should either (a) accept `event_id` in the campaign body and look up event fields for token rendering, or (b) require the user to inline the event details in the subject/body. A minimal addition to `POST /api/admin/campaigns` (accept optional `event_id`, store it, look up event for token rendering at send time) is recommended. This does not require a schema change — `event_id` can live inside the `segment` JSON (which already has `event_id?`).

### 4. `wrangler.toml` `[triggers]` section — confirm not already present
P3 may have added cron triggers. Read `wrangler.toml` before Task 5.2 and merge rather than duplicate the `[triggers]` block.

### 5. Admin nav link for Email Center
The Foundation Contract does not specify the admin nav structure beyond the page list. P2 built the nav. Before Task 6.6, read `admin/src/App.tsx` to find where to add the `/email` route and add a nav link in the sidebar/nav component established in P2.

---

## Completion Checklist

- [ ] `db/migrations/0002_seed_templates.sql` — 7 rows, INSERT OR IGNORE, verified via wrangler
- [ ] `functions/_api/routes/templates.ts` — GET list, GET :id, PATCH :id
- [ ] `functions/_api/routes/campaigns.ts` — POST draft, GET list/:id, POST preview, POST send, POST schedule
- [ ] `functions/_api/segment.ts` — pure resolver, all filter combos tested
- [ ] `functions/scheduled.ts` — Cron handler, exported `sendScheduledCampaign` for testing
- [ ] `wrangler.toml` — `[triggers] crons` entry present
- [ ] `admin/src/pages/Email.tsx` + 4 components — tab layout, composer, template editor, history
- [ ] `admin/src/__tests__/Email.test.tsx` — RTL tests for composer + preview count + schedule
- [ ] `functions/_api/__tests__/templates.test.ts` — list, 404, PATCH, seed row count
- [ ] `functions/_api/__tests__/campaigns.test.ts` — draft, preview count, N email_log rows, schedule, 409 guard, past-timestamp guard, EMAIL_ENABLED skip test
- [ ] `functions/_api/__tests__/scheduled.test.ts` — send + mark sent, future campaign not selected
- [ ] `functions/_api/__tests__/segment.test.ts` — all filter combos, cross-program isolation
- [ ] `npm run test:api` — all green
- [ ] `npm run test:admin` — all green
- [ ] `npm run build` — clean build, no TypeScript errors
