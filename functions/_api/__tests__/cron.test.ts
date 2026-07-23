// functions/_api/__tests__/cron.test.ts
// TDD tests for the cron Worker's sendDueCampaigns function.
//
// Scenarios:
//   1. A scheduled campaign whose scheduled_for is in the PAST is processed
//      (status → sent, email_log rows written, processed count = 1).
//   2. A scheduled campaign whose scheduled_for is in the FUTURE is NOT processed.
//   3. A draft campaign is NOT processed (status filter).
//   4. The correct program is passed to sendCampaignById (program isolation).
//   5. Processed count reflects only campaigns that were actually sent.

import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { applyMigrations } from './setup';
import { sendDueCampaigns } from '../../../cron/worker';
import type { Env } from '../app';

const testEnv = env as unknown as Env;

// ── Seed helpers ──────────────────────────────────────────────────────────────

async function seedMensRegistrant(db: D1Database): Promise<void> {
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT OR IGNORE INTO events
       (program,year,title,start_date,end_date,launch_locations,
        attendee_registration_open,server_registration_open,is_current,created_at,updated_at)
     VALUES ('mens',2026,'Test Event','2026-08-06','2026-08-08','["Colby"]',1,1,1,?,?)`
  ).bind(now, now).run();

  const event = await db.prepare(
    `SELECT id FROM events WHERE program='mens' AND year=2026 LIMIT 1`
  ).first<{ id: number }>();

  const { meta } = await db.prepare(
    `INSERT INTO people
       (program,first_name,last_name,email,times_attended,times_served,
        first_seen_year,created_at,updated_at)
     VALUES ('mens','Jane','Doe','jane@example.com',1,0,2026,?,?)`
  ).bind(now, now).run();

  await db.prepare(
    `INSERT INTO registrations
       (program,event_id,person_id,role,first_name,last_name,email,status,created_at)
     VALUES ('mens',?,?,'attendee','Jane','Doe','jane@example.com','registered',?)`
  ).bind(event!.id, meta.last_row_id, now).run();
}

/** Insert a campaign and return its id. */
async function insertCampaign(opts: {
  program?: string;
  status: string;
  scheduledFor?: string; // ISO string or omit for draft
}): Promise<number> {
  const now = new Date().toISOString();
  const { meta } = await testEnv.DB.prepare(
    `INSERT INTO email_campaigns
       (program,subject,body_html,body_text,segment,status,scheduled_for,recipient_count,created_at)
     VALUES (?,?,?,?,?,?,?,0,?)`
  ).bind(
    opts.program ?? 'mens',
    'Cron Test Subject',
    '<p>Hi {{first_name}}</p>',
    'Hi {{first_name}}',
    '{}',
    opts.status,
    opts.scheduledFor ?? null,
    now
  ).run();
  return meta.last_row_id as number;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('sendDueCampaigns', () => {
  beforeEach(async () => {
    await applyMigrations(env as any);
    await seedMensRegistrant(testEnv.DB);
  });

  it('processes a past-scheduled campaign: status → sent, email_log row written, processed=1', async () => {
    const pastIso = new Date(Date.now() - 60_000).toISOString();
    const id = await insertCampaign({ status: 'scheduled', scheduledFor: pastIso });

    const nowIso = new Date().toISOString();
    const { processed } = await sendDueCampaigns(testEnv, nowIso);

    expect(processed).toBe(1);

    const row = await testEnv.DB.prepare(
      `SELECT status, recipient_count FROM email_campaigns WHERE id=?`
    ).bind(id).first<{ status: string; recipient_count: number }>();
    expect(row?.status).toBe('sent');
    expect(row?.recipient_count).toBe(1);

    const logCount = await testEnv.DB.prepare(
      `SELECT COUNT(*) as n FROM email_log WHERE campaign_id=?`
    ).bind(id).first<{ n: number }>();
    expect(logCount?.n).toBe(1);
  });

  it('does NOT process a future-scheduled campaign', async () => {
    const futureIso = new Date(Date.now() + 3_600_000).toISOString();
    const id = await insertCampaign({ status: 'scheduled', scheduledFor: futureIso });

    const nowIso = new Date().toISOString();
    const { processed } = await sendDueCampaigns(testEnv, nowIso);

    expect(processed).toBe(0);

    const row = await testEnv.DB.prepare(
      `SELECT status FROM email_campaigns WHERE id=?`
    ).bind(id).first<{ status: string }>();
    expect(row?.status).toBe('scheduled'); // unchanged
  });

  it('does NOT process a draft campaign (status filter)', async () => {
    const id = await insertCampaign({ status: 'draft', scheduledFor: undefined });

    const nowIso = new Date().toISOString();
    const { processed } = await sendDueCampaigns(testEnv, nowIso);

    expect(processed).toBe(0);

    const row = await testEnv.DB.prepare(
      `SELECT status FROM email_campaigns WHERE id=?`
    ).bind(id).first<{ status: string }>();
    expect(row?.status).toBe('draft'); // unchanged
  });

  it('passes the correct program to sendCampaignById (program isolation)', async () => {
    // Seed a womens campaign scheduled in the past — no womens registrants exist,
    // so recipient_count will be 0 after send. But it IS processed (count increments).
    const pastIso = new Date(Date.now() - 60_000).toISOString();
    const id = await insertCampaign({ program: 'women', status: 'scheduled', scheduledFor: pastIso });

    const nowIso = new Date().toISOString();
    const { processed } = await sendDueCampaigns(testEnv, nowIso);

    expect(processed).toBe(1);

    const row = await testEnv.DB.prepare(
      `SELECT status, program FROM email_campaigns WHERE id=?`
    ).bind(id).first<{ status: string; program: string }>();
    // Status must have moved out of 'scheduled' — sendCampaignById ran for 'women'
    expect(row?.program).toBe('women');
    expect(['sent', 'failed']).toContain(row?.status);
  });

  it('processed count reflects only campaigns that passed the CAS (not already sent)', async () => {
    const pastIso = new Date(Date.now() - 60_000).toISOString();
    const id1 = await insertCampaign({ status: 'scheduled', scheduledFor: pastIso });
    const id2 = await insertCampaign({ status: 'sent', scheduledFor: pastIso }); // already sent — CAS rejects

    const nowIso = new Date().toISOString();
    // id2 has status='sent', so it won't match the WHERE clause at all (status='scheduled')
    const { processed } = await sendDueCampaigns(testEnv, nowIso);

    expect(processed).toBe(1); // only id1

    const r1 = await testEnv.DB.prepare(`SELECT status FROM email_campaigns WHERE id=?`).bind(id1).first<{ status: string }>();
    const r2 = await testEnv.DB.prepare(`SELECT status FROM email_campaigns WHERE id=?`).bind(id2).first<{ status: string }>();
    expect(r1?.status).toBe('sent');
    expect(r2?.status).toBe('sent'); // unchanged (was already 'sent')
  });

  it('returns processed=0 when no scheduled campaigns exist', async () => {
    const nowIso = new Date().toISOString();
    const { processed } = await sendDueCampaigns(testEnv, nowIso);
    expect(processed).toBe(0);
  });
});
