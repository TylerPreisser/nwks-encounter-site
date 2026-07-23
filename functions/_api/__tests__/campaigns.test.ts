// functions/_api/__tests__/campaigns.test.ts
// TDD integration tests for admin Campaigns API (/api/admin/campaigns)

import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { app } from '../app';
import { applyMigrations, seedAdmin } from './setup';
import type { Env } from '../app';

const testEnv = env as unknown as Env;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAuthCookie(opts: { email?: string; password?: string } = {}): Promise<string> {
  const email = opts.email ?? 'admin@nwksencounter.com';
  const password = opts.password ?? 'TestPass1!';
  const loginRes = await app.fetch(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
    testEnv
  );
  const setCookie = loginRes.headers.get('Set-Cookie') ?? '';
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
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** Seed 3 men's people + event + registrations so resolveSegment returns 3. */
async function seedMensRecipients(): Promise<{ eventId: number }> {
  const now = new Date().toISOString();
  await testEnv.DB.prepare(
    `INSERT OR IGNORE INTO events
       (program, year, title, start_date, end_date, launch_locations,
        attendee_registration_open, server_registration_open, is_current, created_at, updated_at)
     VALUES ('mens', 2026, 'Men''s Encounter 2026', '2026-08-06', '2026-08-08', '["Colby"]',
             1, 1, 1, ?, ?)`
  ).bind(now, now).run();

  const eventRow = await testEnv.DB.prepare(
    `SELECT id FROM events WHERE program='mens' AND year=2026`
  ).first<{ id: number }>();

  for (let i = 1; i <= 3; i++) {
    const { meta } = await testEnv.DB.prepare(
      `INSERT INTO people
         (program, first_name, last_name, email, times_attended, times_served,
          first_seen_year, created_at, updated_at)
       VALUES ('mens', 'User${i}', 'Test', 'user${i}@example.com', 1, 0, 2026, ?, ?)`
    ).bind(now, now).run();

    await testEnv.DB.prepare(
      `INSERT INTO registrations
         (program, event_id, person_id, role, first_name, last_name,
          email, status, created_at)
       VALUES ('mens', ?, ?, 'attendee', 'User${i}', 'Test', 'user${i}@example.com',
               'registered', ?)`
    ).bind(eventRow!.id, meta.last_row_id, now).run();
  }

  return { eventId: eventRow!.id };
}

/** Insert a campaign draft directly into DB and return its id. */
async function insertDraft(opts: {
  program?: string;
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  segment?: string;
  status?: string;
}): Promise<number> {
  const now = new Date().toISOString();
  const { meta } = await testEnv.DB.prepare(
    `INSERT INTO email_campaigns
       (program, subject, body_html, body_text, segment, status, recipient_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
  ).bind(
    opts.program ?? 'mens',
    opts.subject ?? 'Test Subject',
    opts.bodyHtml ?? '<p>Hello {{first_name}}</p>',
    opts.bodyText ?? 'Hello {{first_name}}',
    opts.segment ?? '{}',
    opts.status ?? 'draft',
    now
  ).run();
  return meta.last_row_id as number;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Admin Campaigns API', () => {
  let cookie: string;

  beforeEach(async () => {
    await applyMigrations(env as any);
    await seedAdmin();
    cookie = await getAuthCookie();
    await seedMensRecipients();
  });

  // ── Auth / guard ──────────────────────────────────────────────────────────

  it('returns 401 without a valid session', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/admin/campaigns?program=mens'),
      testEnv
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 without program param', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/admin/campaigns', {
        headers: { Cookie: cookie },
      }),
      testEnv
    );
    expect(res.status).toBe(400);
  });

  // ── POST /api/admin/campaigns — create draft ──────────────────────────────

  it('POST /api/admin/campaigns creates a draft campaign', async () => {
    const res = await app.fetch(
      makeReq('POST', '/api/admin/campaigns', cookie, 'mens', {
        subject: 'Test Blast',
        body_html: '<p>Hello {{first_name}}</p>',
        body_text: 'Hello {{first_name}}',
        segment: {},
      }),
      testEnv
    );
    expect(res.status).toBe(201);
    const data = await res.json<{ ok: boolean; campaign: { status: string; id: number } }>();
    expect(data.ok).toBe(true);
    expect(data.campaign.status).toBe('draft');
    expect(typeof data.campaign.id).toBe('number');
  });

  it('POST /api/admin/campaigns persists to DB', async () => {
    const res = await app.fetch(
      makeReq('POST', '/api/admin/campaigns', cookie, 'mens', {
        subject: 'Persisted Subject',
        body_html: '<p>Body</p>',
        body_text: 'Body',
      }),
      testEnv
    );
    const data = await res.json<{ ok: boolean; campaign: { id: number } }>();
    const row = await testEnv.DB.prepare(
      `SELECT subject FROM email_campaigns WHERE id=?`
    ).bind(data.campaign.id).first<{ subject: string }>();
    expect(row?.subject).toBe('Persisted Subject');
  });

  it('POST /api/admin/campaigns returns 400 when subject is missing', async () => {
    const res = await app.fetch(
      makeReq('POST', '/api/admin/campaigns', cookie, 'mens', {
        body_html: '<p>Hi</p>',
        body_text: 'Hi',
      }),
      testEnv
    );
    expect(res.status).toBe(400);
  });

  // ── GET /api/admin/campaigns — list ──────────────────────────────────────

  it('GET /api/admin/campaigns returns list of campaigns for program', async () => {
    await insertDraft({ program: 'mens', subject: 'Camp A' });
    await insertDraft({ program: 'mens', subject: 'Camp B' });
    await insertDraft({ program: 'women', subject: 'Women Camp' }); // isolation

    const res = await app.fetch(makeReq('GET', '/api/admin/campaigns', cookie, 'mens'), testEnv);
    expect(res.status).toBe(200);
    const data = await res.json<{ ok: boolean; campaigns: Array<{ subject: string; program: string }> }>();
    expect(data.ok).toBe(true);
    expect(data.campaigns.every((c) => c.program === 'mens')).toBe(true);
    const subjects = data.campaigns.map((c) => c.subject);
    expect(subjects).toContain('Camp A');
    expect(subjects).toContain('Camp B');
    expect(subjects).not.toContain('Women Camp');
  });

  // ── GET /api/admin/campaigns/:id ──────────────────────────────────────────

  it('GET /api/admin/campaigns/:id returns a campaign', async () => {
    const id = await insertDraft({ subject: 'Get Me' });
    const res = await app.fetch(makeReq('GET', `/api/admin/campaigns/${id}`, cookie, 'mens'), testEnv);
    expect(res.status).toBe(200);
    const data = await res.json<{ ok: boolean; campaign: { subject: string } }>();
    expect(data.ok).toBe(true);
    expect(data.campaign.subject).toBe('Get Me');
  });

  it('GET /api/admin/campaigns/:id returns 404 for unknown id', async () => {
    const res = await app.fetch(makeReq('GET', '/api/admin/campaigns/99999', cookie, 'mens'), testEnv);
    expect(res.status).toBe(404);
  });

  it('GET /api/admin/campaigns/:id enforces program isolation', async () => {
    // Create a women campaign; mens user cannot view it
    const id = await insertDraft({ program: 'women', subject: 'Women Only' });
    const res = await app.fetch(makeReq('GET', `/api/admin/campaigns/${id}`, cookie, 'mens'), testEnv);
    expect(res.status).toBe(404);
  });

  // ── POST /api/admin/campaigns/preview ─────────────────────────────────────

  it('POST /api/admin/campaigns/preview returns recipient_count and sample ≤5', async () => {
    const res = await app.fetch(
      makeReq('POST', '/api/admin/campaigns/preview', cookie, 'mens', { segment: {} }),
      testEnv
    );
    expect(res.status).toBe(200);
    const data = await res.json<{
      ok: boolean; recipient_count: number; sample: unknown[];
    }>();
    expect(data.ok).toBe(true);
    expect(data.recipient_count).toBe(3);
    expect(Array.isArray(data.sample)).toBe(true);
    expect(data.sample.length).toBeLessThanOrEqual(5);
    expect(data.sample.length).toBe(3); // only 3 seeded
  });

  it('POST /api/admin/campaigns/preview sample contains first_name, last_name, email', async () => {
    const res = await app.fetch(
      makeReq('POST', '/api/admin/campaigns/preview', cookie, 'mens', { segment: {} }),
      testEnv
    );
    const data = await res.json<{
      ok: boolean; sample: Array<{ first_name: string; last_name: string; email: string }>;
    }>();
    const first = data.sample[0];
    expect(first).toHaveProperty('first_name');
    expect(first).toHaveProperty('last_name');
    expect(first).toHaveProperty('email');
  });

  it('POST /api/admin/campaigns/preview with role filter narrows count', async () => {
    const res = await app.fetch(
      makeReq('POST', '/api/admin/campaigns/preview', cookie, 'mens', {
        segment: { role: 'server' }, // no servers seeded → count=0
      }),
      testEnv
    );
    const data = await res.json<{ ok: boolean; recipient_count: number }>();
    expect(data.ok).toBe(true);
    expect(data.recipient_count).toBe(0);
  });

  // ── POST /api/admin/campaigns/:id/send ────────────────────────────────────

  it('POST /:id/send writes N email_log rows (one per resolved recipient)', async () => {
    const id = await insertDraft({ subject: 'Blast' });

    const res = await app.fetch(
      makeReq('POST', `/api/admin/campaigns/${id}/send`, cookie, 'mens'),
      testEnv
    );
    expect(res.status).toBe(200);
    const data = await res.json<{ ok: boolean; recipient_count: number }>();
    expect(data.ok).toBe(true);
    expect(data.recipient_count).toBe(3);

    const logs = await testEnv.DB.prepare(
      `SELECT COUNT(*) as n FROM email_log WHERE campaign_id=?`
    ).bind(id).first<{ n: number }>();
    expect(logs?.n).toBe(3);
  });

  it('POST /:id/send sets campaign status to sent and populates recipient_count', async () => {
    const id = await insertDraft({});
    await app.fetch(makeReq('POST', `/api/admin/campaigns/${id}/send`, cookie, 'mens'), testEnv);

    const campaign = await testEnv.DB.prepare(
      `SELECT status, recipient_count, sent_at FROM email_campaigns WHERE id=?`
    ).bind(id).first<{ status: string; recipient_count: number; sent_at: string | null }>();
    expect(campaign?.status).toBe('sent');
    expect(campaign?.recipient_count).toBe(3);
    expect(campaign?.sent_at).toBeTruthy();
  });

  it('POST /:id/send renders {{first_name}} token — appears in email_log subject or to_email', async () => {
    const id = await insertDraft({
      subject: 'Hi {{first_name}}',
      bodyHtml: '<p>Hello {{first_name}}</p>',
      bodyText: 'Hello {{first_name}}',
    });

    await app.fetch(makeReq('POST', `/api/admin/campaigns/${id}/send`, cookie, 'mens'), testEnv);

    // email_log subjects should have the rendered name, not the token
    const logRows = await testEnv.DB.prepare(
      `SELECT subject FROM email_log WHERE campaign_id=?`
    ).bind(id).all<{ subject: string }>();
    expect(logRows.results.length).toBe(3);
    // Every subject should contain a real name (User1, User2, User3), not the {{token}}
    for (const row of logRows.results) {
      expect(row.subject).not.toContain('{{first_name}}');
      expect(row.subject).toMatch(/Hi User\d/);
    }
  });

  it('POST /:id/send returns 404 for unknown campaign', async () => {
    const res = await app.fetch(
      makeReq('POST', '/api/admin/campaigns/99999/send', cookie, 'mens'),
      testEnv
    );
    expect(res.status).toBe(404);
  });

  it('POST /:id/send returns 409 when campaign is already sent', async () => {
    const id = await insertDraft({ status: 'sent' });
    const res = await app.fetch(
      makeReq('POST', `/api/admin/campaigns/${id}/send`, cookie, 'mens'),
      testEnv
    );
    expect(res.status).toBe(409);
  });

  it('POST /:id/send enforces program isolation (cannot send another program campaign)', async () => {
    const id = await insertDraft({ program: 'women' });
    const res = await app.fetch(
      makeReq('POST', `/api/admin/campaigns/${id}/send`, cookie, 'mens'),
      testEnv
    );
    expect(res.status).toBe(404); // mens user sees women campaign as not found
  });

  // ── POST /api/admin/campaigns/:id/schedule ────────────────────────────────

  it('POST /:id/schedule sets status=scheduled and scheduled_for', async () => {
    const id = await insertDraft({});
    const scheduledFor = new Date(Date.now() + 3600000).toISOString();

    const res = await app.fetch(
      makeReq('POST', `/api/admin/campaigns/${id}/schedule`, cookie, 'mens', { scheduled_for: scheduledFor }),
      testEnv
    );
    expect(res.status).toBe(200);
    const data = await res.json<{ ok: boolean; campaign: { status: string; scheduled_for: string } }>();
    expect(data.ok).toBe(true);
    expect(data.campaign.status).toBe('scheduled');
    expect(data.campaign.scheduled_for).toBe(scheduledFor);
  });

  it('POST /:id/schedule returns 400 when scheduled_for is missing', async () => {
    const id = await insertDraft({});
    const res = await app.fetch(
      makeReq('POST', `/api/admin/campaigns/${id}/schedule`, cookie, 'mens', {}),
      testEnv
    );
    expect(res.status).toBe(400);
  });

  it('POST /:id/schedule returns 400 when scheduled_for is in the past', async () => {
    const id = await insertDraft({});
    const res = await app.fetch(
      makeReq('POST', `/api/admin/campaigns/${id}/schedule`, cookie, 'mens', {
        scheduled_for: '2020-01-01T00:00:00.000Z',
      }),
      testEnv
    );
    expect(res.status).toBe(400);
  });

  it('POST /:id/schedule returns 404 for unknown id', async () => {
    const res = await app.fetch(
      makeReq('POST', '/api/admin/campaigns/99999/schedule', cookie, 'mens', {
        scheduled_for: new Date(Date.now() + 3600000).toISOString(),
      }),
      testEnv
    );
    expect(res.status).toBe(404);
  });

  it('POST /:id/schedule returns 409 when campaign already sent', async () => {
    const id = await insertDraft({ status: 'sent' });
    const res = await app.fetch(
      makeReq('POST', `/api/admin/campaigns/${id}/schedule`, cookie, 'mens', {
        scheduled_for: new Date(Date.now() + 3600000).toISOString(),
      }),
      testEnv
    );
    expect(res.status).toBe(409);
  });

  // ── sendCampaignById export ───────────────────────────────────────────────

  it('sendCampaignById returns {sent, failed} tallies', async () => {
    const { sendCampaignById } = await import('../routes/campaigns');
    const id = await insertDraft({});

    const result = await sendCampaignById(testEnv, id);
    expect(typeof result.sent).toBe('number');
    expect(typeof result.failed).toBe('number');
    expect(result.sent).toBe(3);  // EMAIL_ENABLED=false → ok:true, skipped:true → counted as sent
    expect(result.failed).toBe(0);
  });

  it('sendCampaignById returns {sent:0, failed:0} for unknown campaign', async () => {
    const { sendCampaignById } = await import('../routes/campaigns');
    const result = await sendCampaignById(testEnv, 999999);
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(0);
  });
});
