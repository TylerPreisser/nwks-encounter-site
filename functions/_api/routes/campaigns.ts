// functions/_api/routes/campaigns.ts — email campaigns CRUD + preview/send/schedule

import { Hono } from 'hono';
import type { Env } from '../app';
import type { AppVariables } from '../auth';
import { requireAuth, requireProgram } from '../auth';
import { nowIso } from '../db';
import type { Program } from '../db';
import { sendEmail, renderTemplate } from '../email';
import { resolveSegment } from '../segment';
import type { Segment } from '../segment';

export const campaignsRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

campaignsRouter.use('*', requireAuth(), requireProgram());

// ── GET /api/admin/campaigns ──────────────────────────────────────────────────
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

// ── POST /api/admin/campaigns/preview ─────────────────────────────────────────
// Registered BEFORE /:id routes to avoid param conflict
campaignsRouter.post('/preview', async (c) => {
  const program = c.get('program') as Program;
  const body = await c.req.json<{ segment?: Segment }>();
  const segment: Segment = body.segment ?? {};

  const recipients = await resolveSegment(c.env, program, segment);
  const sample = recipients.slice(0, 5).map((r) => ({
    first_name: r.first_name,
    last_name: r.last_name,
    email: r.email,
  }));

  return c.json({ ok: true, recipient_count: recipients.length, sample });
});

// ── GET /api/admin/campaigns/:id ──────────────────────────────────────────────
campaignsRouter.get('/:id', async (c) => {
  const program = c.get('program') as Program;
  const id = Number(c.req.param('id'));
  const row = await c.env.DB.prepare(
    `SELECT * FROM email_campaigns WHERE id = ? AND program = ?`
  ).bind(id, program).first();
  if (!row) return c.json({ ok: false, error: 'not found' }, 404);
  return c.json({ ok: true, campaign: row });
});

// ── POST /api/admin/campaigns (create draft) ──────────────────────────────────
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
  const segment: Segment = body.segment ?? {};

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

// ── POST /api/admin/campaigns/:id/send ────────────────────────────────────────
campaignsRouter.post('/:id/send', async (c) => {
  const program = c.get('program') as Program;
  const id = Number(c.req.param('id'));

  // [C2] Atomic CAS inside sendCampaignById is the single guard against double-send.
  // We check existence first for a clean 404, but correctness comes from the CAS.
  const existing = await c.env.DB.prepare(
    `SELECT id FROM email_campaigns WHERE id = ? AND program = ?`
  ).bind(id, program).first<{ id: number }>();

  if (!existing) return c.json({ ok: false, error: 'not found' }, 404);

  const result = await sendCampaignById(c.env, id, program);

  if (result.casRejected) {
    return c.json({ ok: false, error: 'already sent or send in progress' }, 409);
  }

  return c.json({ ok: true, sent: result.sent, failed: result.failed, recipient_count: result.sent + result.failed });
});

// ── POST /api/admin/campaigns/:id/schedule ────────────────────────────────────
campaignsRouter.post('/:id/schedule', async (c) => {
  const program = c.get('program') as Program;
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ scheduled_for: string }>();

  if (!body.scheduled_for) {
    return c.json({ ok: false, error: 'scheduled_for required' }, 400);
  }
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
    `UPDATE email_campaigns SET status='scheduled', scheduled_for=? WHERE id=? AND program=?`
  ).bind(body.scheduled_for, id, program).run();

  // [I2] Add AND program=? to final SELECT for consistency
  const updated = await c.env.DB.prepare(
    `SELECT * FROM email_campaigns WHERE id=? AND program=?`
  ).bind(id, program).first();

  return c.json({ ok: true, campaign: updated });
});

// ── Shared send routine (Addendum A7) ─────────────────────────────────────────
// Precondition: callers (cron Worker P4/T5, AI approve endpoint P5) MUST pass
// the program they own so this routine enforces isolation before sending.
export async function sendCampaignById(
  env: Env,
  campaignId: number,
  program: string
): Promise<{ sent: number; failed: number; casRejected?: boolean }> {
  // [C2] Atomic CAS: claim 'sending' only when not already sent/sending AND program matches
  const cas = await env.DB.prepare(
    `UPDATE email_campaigns
     SET status='sending'
     WHERE id=? AND program=? AND status NOT IN ('sent','sending')`
  ).bind(campaignId, program).run();

  if (cas.meta.changes === 0) {
    // Campaign is already sent/sending, wrong program, or does not exist
    return { sent: 0, failed: 0, casRejected: true };
  }

  // CAS claimed it — fetch full campaign row
  const campaign = await env.DB.prepare(
    `SELECT * FROM email_campaigns WHERE id = ? AND program = ?`
  ).bind(campaignId, program).first<{
    id: number; program: string; subject: string; body_html: string;
    body_text: string; segment: string; status: string; template_key: string | null;
  }>();

  if (!campaign) return { sent: 0, failed: 0 };

  let segment: Segment = {};
  try { segment = JSON.parse(campaign.segment); } catch { /* empty */ }

  // Enrich event tokens if segment specifies an event
  let eventTitle = '';
  let startDate = '';
  let endDate = '';
  if (segment.event_id != null) {
    const eventRow = await env.DB.prepare(
      `SELECT title, start_date, end_date FROM events WHERE id=?`
    ).bind(segment.event_id).first<{
      title: string | null; start_date: string | null; end_date: string | null;
    }>();
    if (eventRow) {
      eventTitle = eventRow.title ?? '';
      startDate = eventRow.start_date ?? '';
      endDate = eventRow.end_date ?? '';
    }
  } else {
    // Look up current event for the program
    const currentEvent = await env.DB.prepare(
      `SELECT title, start_date, end_date FROM events WHERE program=? AND is_current=1 LIMIT 1`
    ).bind(campaign.program).first<{
      title: string | null; start_date: string | null; end_date: string | null;
    }>();
    if (currentEvent) {
      eventTitle = currentEvent.title ?? '';
      startDate = currentEvent.start_date ?? '';
      endDate = currentEvent.end_date ?? '';
    }
  }

  const recipients = await resolveSegment(env, campaign.program as Program, segment);
  const now = nowIso();
  let sent = 0;
  let failed = 0;

  // [I1] Crash safety: wrap recipient loop; on unexpected throw → set 'failed' so not stuck 'sending'
  try {
    for (const recipient of recipients) {
      const rendered = renderTemplate(
        { subject: campaign.subject, body_html: campaign.body_html, body_text: campaign.body_text },
        {
          first_name: recipient.first_name,
          last_name: recipient.last_name,
          event_title: eventTitle,
          start_date: startDate,
          end_date: endDate,
          launch_location: recipient.launch_location ?? '',
        }
      );

      const result = await sendEmail(env, {
        to: recipient.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        campaignId,
        personId: recipient.person_id,
        templateKey: campaign.template_key ?? undefined,
        type: 'broadcast',
        program: campaign.program,
      });

      // sendEmail already writes the email_log row; track success/failure
      if (result.ok) {
        sent++;
      } else {
        failed++;
      }
    }
  } catch (err: unknown) {
    // [I1] Unexpected crash: mark failed so it's not stuck at 'sending', then rethrow
    await env.DB.prepare(
      `UPDATE email_campaigns SET status='failed', sent_at=?, recipient_count=? WHERE id=?`
    ).bind(nowIso(), sent + failed, campaignId).run();
    throw err;
  }

  // [C3] Correct terminal status: all-failed → 'failed'; any sent (or zero recipients) → 'sent'
  const terminalStatus = (sent === 0 && failed > 0) ? 'failed' : 'sent';
  const sentAt = nowIso();
  await env.DB.prepare(
    `UPDATE email_campaigns
     SET status=?, sent_at=?, recipient_count=?
     WHERE id=?`
  ).bind(terminalStatus, sentAt, sent + failed, campaignId).run();

  return { sent, failed };
}
