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

    const result = await sendCampaignById(testEnv, id, 'mens');
    expect(typeof result.sent).toBe('number');
    expect(typeof result.failed).toBe('number');
    expect(result.sent).toBe(3);  // EMAIL_ENABLED=false → ok:true, skipped:true → counted as sent
    expect(result.failed).toBe(0);
  });

  it('sendCampaignById returns {sent:0, failed:0} for unknown campaign', async () => {
    const { sendCampaignById } = await import('../routes/campaigns');
    const result = await sendCampaignById(testEnv, 999999, 'mens');
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(0);
  });

  // ── C2: Atomic double-send guard ──────────────────────────────────────────

  it('second send of same campaign returns 409 and does NOT create more email_log rows', async () => {
    const id = await insertDraft({ subject: 'Double Send Test' });

    // First send — should succeed
    const res1 = await app.fetch(
      makeReq('POST', `/api/admin/campaigns/${id}/send`, cookie, 'mens'),
      testEnv
    );
    expect(res1.status).toBe(200);

    // Count log rows after first send
    const logAfterFirst = await testEnv.DB.prepare(
      `SELECT COUNT(*) as n FROM email_log WHERE campaign_id=?`
    ).bind(id).first<{ n: number }>();
    const countAfterFirst = logAfterFirst?.n ?? 0;
    expect(countAfterFirst).toBe(3);

    // Second send — must be rejected
    const res2 = await app.fetch(
      makeReq('POST', `/api/admin/campaigns/${id}/send`, cookie, 'mens'),
      testEnv
    );
    expect(res2.status).toBe(409);

    // Log row count must NOT increase
    const logAfterSecond = await testEnv.DB.prepare(
      `SELECT COUNT(*) as n FROM email_log WHERE campaign_id=?`
    ).bind(id).first<{ n: number }>();
    expect(logAfterSecond?.n).toBe(countAfterFirst);
  });

  // ── C3: Total-failure sets status='failed' ────────────────────────────────

  it('total-failure: all sendEmail calls failing sets campaign status to failed', async () => {
    const { sendCampaignById } = await import('../routes/campaigns');
    const id = await insertDraft({ subject: 'Failure Test' });

    // Use EMAIL_ENABLED='true' with a bad RESEND_API_KEY: sendEmail catches the Resend error
    // and returns {ok:false, error:...} for each recipient → failed++ for all 3.
    const failEnv = {
      ...testEnv,
      EMAIL_ENABLED: 'true',
      RESEND_API_KEY: 'bad-key-intentional-fail',
    };

    const result = await sendCampaignById(failEnv as any, id, 'mens');
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(3);

    const row = await testEnv.DB.prepare(
      `SELECT status FROM email_campaigns WHERE id=?`
    ).bind(id).first<{ status: string }>();
    expect(row?.status).toBe('failed');
  });

  // ── T7: EMAIL_ENABLED guard ──────────────────────────────────────────────

  it('send marks campaign sent even when EMAIL_ENABLED=false (skipped mode)', async () => {
    // env.EMAIL_ENABLED is 'false' in test environment per wrangler test config
    const draft = await testEnv.DB.prepare(
      `INSERT INTO email_campaigns
         (program,subject,body_html,body_text,segment,status,recipient_count,created_at)
       VALUES ('mens','Skip Test','<p>Hi</p>','Hi','{}','draft',0,?)`
    ).bind(new Date().toISOString()).run();
    const id = draft.meta.last_row_id;

    const req = new Request(`http://localhost/api/admin/campaigns/${id}/send?program=mens`, {
      method: 'POST',
      headers: { cookie: `nwks_session=${cookie.replace('nwks_session=', '')}` },
    });
    const res = await app.fetch(req, testEnv);
    expect(res.status).toBe(200);

    const campaign = await testEnv.DB.prepare(
      `SELECT status FROM email_campaigns WHERE id=?`
    ).bind(id).first<{ status: string }>();
    expect(campaign?.status).toBe('sent');
  });

  // ── C1: Wrong-program isolation in sendCampaignById ──────────────────────

  it('sendCampaignById with wrong program sends nothing and returns {sent:0, failed:0}', async () => {
    const { sendCampaignById } = await import('../routes/campaigns');
    // Campaign is mens; caller passes 'women' → CAS finds no matching row → changes=0
    const id = await insertDraft({ program: 'mens' });

    const result = await sendCampaignById(testEnv, id, 'women');
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(0);

    // Campaign must still be in its original draft status (CAS did not fire)
    const row = await testEnv.DB.prepare(
      `SELECT status FROM email_campaigns WHERE id=?`
    ).bind(id).first<{ status: string }>();
    expect(row?.status).toBe('draft');
  });

  // ── I1: Crash safety ──────────────────────────────────────────────────────

  it('crash safety: unhandled throw in send loop sets campaign status to failed (not stuck sending)', async () => {
    const { sendCampaignById } = await import('../routes/campaigns');
    const id = await insertDraft({ subject: 'Crash Test' });

    // Simulate an unhandled error by providing a DB proxy that throws on email_log INSERT
    // (i.e., the first prepare().bind().run() that sendEmail calls inside the loop).
    // We proxy the DB: the CAS UPDATE + campaign SELECT must succeed, then throw on INSERT.
    let prepareCount = 0;
    const realDB = testEnv.DB;
    const crashDB = new Proxy(realDB, {
      get(target, prop) {
        if (prop !== 'prepare') return (target as any)[prop];
        return (sql: string) => {
          prepareCount++;
          const stmt = (target as any).prepare(sql);
          // Throw when sendEmail tries to INSERT into email_log (after CAS + SELECT succeed)
          if (sql.includes('INSERT INTO email_log')) {
            return new Proxy(stmt, {
              get(s, p) {
                if (p !== 'bind') return (s as any)[p];
                return (...bindArgs: any[]) => ({
                  run: () => { throw new Error('simulated DB crash in email_log'); },
                  first: () => (s as any).bind(...bindArgs).first(),
                  all: () => (s as any).bind(...bindArgs).all(),
                });
              },
            });
          }
          return stmt;
        };
      },
    });

    const crashEnv = { ...testEnv, DB: crashDB };

    let threw = false;
    try {
      await sendCampaignById(crashEnv as any, id, 'mens');
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    // After rethrow, campaign status must be 'failed' (not stuck at 'sending')
    const row = await testEnv.DB.prepare(
      `SELECT status FROM email_campaigns WHERE id=?`
    ).bind(id).first<{ status: string }>();
    expect(row?.status).toBe('failed');
  });
});

// ---------------------------------------------------------------------------
// Background send routing + resumable chunked drain (large audiences)
// ---------------------------------------------------------------------------

describe('Campaign background send routing + chunked drain', () => {
  let cookie: string;

  beforeEach(async () => {
    await applyMigrations(env as any);
    await seedAdmin();
    cookie = await getAuthCookie();
  });

  async function seedMensEvent(): Promise<number> {
    const now = new Date().toISOString();
    await testEnv.DB.prepare(
      `INSERT OR IGNORE INTO events
         (program, year, title, start_date, end_date, launch_locations,
          attendee_registration_open, server_registration_open, is_current, created_at, updated_at)
       VALUES ('mens', 2026, 'Men''s Encounter 2026', '2026-08-06', '2026-08-08', '["Colby"]', 1,1,1, ?, ?)`
    ).bind(now, now).run();
    const ev = await testEnv.DB.prepare(
      `SELECT id FROM events WHERE program='mens' AND year=2026`
    ).first<{ id: number }>();
    return ev!.id;
  }

  /** Batch-seed N men's registered attendees (people + registrations) for the event. */
  async function seedMensAttendees(eventId: number, n: number): Promise<void> {
    const now = new Date().toISOString();
    const BATCH = 16; // D1 caps bound variables at 100/statement (16 rows * ≤6 vars)
    for (let start = 0; start < n; start += BATCH) {
      const rows = Math.min(BATCH, n - start);
      const vals: string[] = [];
      const binds: unknown[] = [];
      for (let i = 0; i < rows; i++) {
        const idx = start + i + 1;
        vals.push(`('mens', ?, ?, ?, 1, 0, 2026, ?, ?)`);
        binds.push(`First${idx}`, `Last${String(idx).padStart(5, '0')}`, `bulk${idx}@example.com`, now, now);
      }
      await testEnv.DB.prepare(
        `INSERT INTO people (program, first_name, last_name, email, times_attended, times_served, first_seen_year, created_at, updated_at) VALUES ${vals.join(',')}`
      ).bind(...binds).run();
    }
    const ids = (await testEnv.DB.prepare(
      `SELECT id FROM people WHERE program='mens' ORDER BY id`
    ).all<{ id: number }>()).results;
    for (let start = 0; start < ids.length; start += BATCH) {
      const slice = ids.slice(start, start + BATCH);
      const vals: string[] = [];
      const binds: unknown[] = [];
      for (const row of slice) {
        vals.push(`('mens', ?, ?, 'attendee', 'First', 'Last', ?, 'registered', ?)`);
        binds.push(eventId, row.id, `p${row.id}@example.com`, now);
      }
      await testEnv.DB.prepare(
        `INSERT INTO registrations (program, event_id, person_id, role, first_name, last_name, email, status, created_at) VALUES ${vals.join(',')}`
      ).bind(...binds).run();
    }
  }

  async function insertBigDraft(): Promise<number> {
    const now = new Date().toISOString();
    const { meta } = await testEnv.DB.prepare(
      `INSERT INTO email_campaigns (program, subject, body_html, body_text, segment, status, recipient_count, created_at)
       VALUES ('mens','Big Blast','<p>Hi {{first_name}}</p>','Hi {{first_name}}','{}','draft',0,?)`
    ).bind(now).run();
    return meta.last_row_id as number;
  }

  const countLogs = async (id: number): Promise<number> =>
    (await testEnv.DB.prepare(`SELECT COUNT(*) as n FROM email_log WHERE campaign_id=?`).bind(id).first<{ n: number }>())?.n ?? 0;
  const statusOf = async (id: number): Promise<string | undefined> =>
    (await testEnv.DB.prepare(`SELECT status FROM email_campaigns WHERE id=?`).bind(id).first<{ status: string }>())?.status;

  it('POST /:id/send hands a >800 audience to the background (queued, status=scheduled, no emails yet)', async () => {
    const evId = await seedMensEvent();
    await seedMensAttendees(evId, 810);
    const id = await insertBigDraft();

    const res = await app.fetch(makeReq('POST', `/api/admin/campaigns/${id}/send`, cookie, 'mens'), testEnv);
    expect(res.status).toBe(200);
    const data = await res.json<{ ok: boolean; queued: boolean; recipient_count: number }>();
    expect(data.ok).toBe(true);
    expect(data.queued).toBe(true);
    expect(data.recipient_count).toBe(810);

    const row = await testEnv.DB.prepare(
      `SELECT status, scheduled_for, recipient_count FROM email_campaigns WHERE id=?`
    ).bind(id).first<{ status: string; scheduled_for: string | null; recipient_count: number }>();
    expect(row?.status).toBe('scheduled');
    expect(row?.scheduled_for).toBeTruthy();
    expect(row?.recipient_count).toBe(810);

    // Nothing sent synchronously.
    expect(await countLogs(id)).toBe(0);
  });

  it('cron drains a queued large campaign across bounded ticks until sent', async () => {
    const evId = await seedMensEvent();
    await seedMensAttendees(evId, 810);
    const id = await insertBigDraft();
    await app.fetch(makeReq('POST', `/api/admin/campaigns/${id}/send`, cookie, 'mens'), testEnv);

    const { sendDueCampaigns } = await import('../../../cron/worker');
    let ticks = 0;
    for (let i = 0; i < 20; i++) {
      const before = await countLogs(id);
      const { processed } = await sendDueCampaigns(testEnv, new Date().toISOString());
      if (processed === 0) break;
      ticks++;
      const after = await countLogs(id);
      expect(after - before).toBeLessThanOrEqual(200); // each tick is bounded by SEND_CHUNK_SIZE
      if ((await statusOf(id)) === 'sent') break;
    }

    expect(ticks).toBeGreaterThan(1);           // 810 / 200 → needs ≥5 ticks
    expect(await countLogs(id)).toBe(810);       // every recipient attempted exactly once
    const fin = await testEnv.DB.prepare(
      `SELECT status, recipient_count FROM email_campaigns WHERE id=?`
    ).bind(id).first<{ status: string; recipient_count: number }>();
    expect(fin?.status).toBe('sent');
    expect(fin?.recipient_count).toBe(810);
  });

  it('sendCampaignChunk is resumable + idempotent (re-queues, finalizes, never double-sends)', async () => {
    const evId = await seedMensEvent();
    await seedMensAttendees(evId, 5);
    const id = await insertBigDraft();
    await testEnv.DB.prepare(
      `UPDATE email_campaigns SET status='scheduled', scheduled_for=? WHERE id=?`
    ).bind(new Date().toISOString(), id).run();

    const { sendCampaignChunk } = await import('../routes/campaigns');

    const c1 = await sendCampaignChunk(testEnv, id, 'mens', 2);
    expect(c1.sent + c1.failed).toBe(2);
    expect(c1.remaining).toBe(3);
    expect(await statusOf(id)).toBe('scheduled'); // re-queued for next tick

    const c2 = await sendCampaignChunk(testEnv, id, 'mens', 2);
    expect(c2.remaining).toBe(1);

    const c3 = await sendCampaignChunk(testEnv, id, 'mens', 2);
    expect(c3.remaining).toBe(0);
    expect(await statusOf(id)).toBe('sent');
    expect(await countLogs(id)).toBe(5); // exactly once each, no duplicates across 3 chunks

    // Finalized campaign — a further chunk is a CAS-rejected no-op.
    const c4 = await sendCampaignChunk(testEnv, id, 'mens', 2);
    expect(c4.casRejected).toBe(true);
    expect(await countLogs(id)).toBe(5);
  });

  it('POST /:id/send still sends synchronously for a small audience (<= threshold)', async () => {
    const evId = await seedMensEvent();
    await seedMensAttendees(evId, 5);
    const id = await insertBigDraft();

    const res = await app.fetch(makeReq('POST', `/api/admin/campaigns/${id}/send`, cookie, 'mens'), testEnv);
    const data = await res.json<{ ok: boolean; queued?: boolean; sent: number; recipient_count: number }>();
    expect(data.ok).toBe(true);
    expect(data.queued).toBeFalsy();
    expect(data.recipient_count).toBe(5);
    expect(await statusOf(id)).toBe('sent');
    expect(await countLogs(id)).toBe(5);
  });
});
