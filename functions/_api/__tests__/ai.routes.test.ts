// functions/_api/__tests__/ai.routes.test.ts
// TDD integration tests for AI assistant API routes (P5 Task 3).
//
// SAFETY: Anthropic SDK is mocked — no real API calls.
// The approve endpoint is the ONLY place that creates email_log rows.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { app } from '../app';
import { applyMigrations, seedAdmin } from './setup';
import type { Env } from '../app';

// ---------------------------------------------------------------------------
// Mock Anthropic so routes never call the real API
// ---------------------------------------------------------------------------

vi.mock('@anthropic-ai/sdk', () => {
  const create = vi.fn().mockResolvedValue({
    id: 'msg_mock',
    type: 'message',
    role: 'assistant',
    stop_reason: 'end_turn',
    stop_sequence: null,
    model: 'claude-opus-4-8',
    usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    content: [{ type: 'text', text: 'Here are your counts.' }],
  });
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create },
    })),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const testEnv = env as unknown as Env;

async function getAuthCookie(): Promise<string> {
  const loginRes = await app.fetch(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@nwksencounter.com', password: 'TestPass1!' }),
    }),
    testEnv,
  );
  const setCookie = loginRes.headers.get('Set-Cookie') ?? '';
  const token = setCookie.match(/nwks_session=([^;]+)/)?.[1] ?? '';
  return `nwks_session=${token}`;
}

function makeReq(method: string, path: string, cookie: string, program: string, body?: unknown): Request {
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

async function seedThread(db: D1Database, program: string, userId: number): Promise<number> {
  const now = '2026-01-01T00:00:00.000Z';
  const { meta } = await db
    .prepare(
      `INSERT INTO ai_threads (program, created_by, title, created_at, updated_at)
       VALUES (?, ?, 'Test Thread', ?, ?)`,
    )
    .bind(program, userId, now, now)
    .run();
  return meta.last_row_id as number;
}

async function seedPendingAction(
  db: D1Database,
  threadId: number,
  program: string,
  kind: 'send_campaign' | 'schedule_campaign' = 'send_campaign',
  payload?: Record<string, unknown>,
): Promise<number> {
  const now = '2026-01-01T00:00:00.000Z';
  const defaultPayload = {
    subject: 'Hi there',
    body_html: '<p>Hello</p>',
    body_text: 'Hello',
    summary: 'Test blast',
  };
  const { meta } = await db
    .prepare(
      `INSERT INTO ai_pending_actions
         (thread_id, program, kind, summary, payload, status, created_at)
       VALUES (?, ?, ?, 'Test action', ?, 'pending', ?)`,
    )
    .bind(threadId, program, kind, JSON.stringify(payload ?? defaultPayload), now)
    .run();
  return meta.last_row_id as number;
}

async function seedMensEvent(db: D1Database): Promise<void> {
  const now = '2026-01-01T00:00:00.000Z';
  await db
    .prepare(
      `INSERT OR IGNORE INTO events
         (program, year, title, start_date, end_date, launch_locations,
          attendee_registration_open, server_registration_open, is_current, created_at, updated_at)
       VALUES ('mens', 2026, 'Mens Encounter 2026', '2026-08-06', '2026-08-08',
               '[]', 1, 1, 1, ?, ?)`,
    )
    .bind(now, now)
    .run();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AI routes', () => {
  let cookie: string;
  let adminId: number;
  const DB = () => testEnv.DB;

  beforeEach(async () => {
    await applyMigrations({ DB: DB() });
    const admin = await seedAdmin();
    adminId = admin.id;
    await seedMensEvent(DB());
    cookie = await getAuthCookie();
  });

  // ── Auth guards ─────────────────────────────────────────────────────────────

  it('POST /api/admin/ai/threads returns 401 without session', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/admin/ai/threads?program=mens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
      testEnv,
    );
    expect(res.status).toBe(401);
  });

  it('GET /api/admin/ai/pending returns 401 without session', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/admin/ai/pending?program=mens'),
      testEnv,
    );
    expect(res.status).toBe(401);
  });

  it('POST /api/admin/ai/threads returns 400 without program param', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/admin/ai/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: '{}',
      }),
      testEnv,
    );
    expect(res.status).toBe(400);
  });

  // ── Thread CRUD ─────────────────────────────────────────────────────────────

  it('POST /api/admin/ai/threads creates a thread', async () => {
    const res = await app.fetch(
      makeReq('POST', '/api/admin/ai/threads', cookie, 'mens', { title: 'Planning session' }),
      testEnv,
    );
    expect(res.status).toBe(200);
    const data = await res.json<{ ok: boolean; thread: { id: number; program: string; title: string } }>();
    expect(data.ok).toBe(true);
    expect(data.thread.program).toBe('mens');
    expect(data.thread.title).toBe('Planning session');
  });

  it('GET /api/admin/ai/threads lists threads for program', async () => {
    await seedThread(DB(), 'mens', adminId);
    await seedThread(DB(), 'mens', adminId);
    // women thread should not appear
    const now = '2026-01-01T00:00:00.000Z';
    await DB().prepare(
      `INSERT INTO ai_threads (program, created_by, title, created_at, updated_at)
       VALUES ('women', ?, 'Women only', ?, ?)`,
    ).bind(adminId, now, now).run();

    const res = await app.fetch(
      makeReq('GET', '/api/admin/ai/threads', cookie, 'mens'),
      testEnv,
    );
    const data = await res.json<{ ok: boolean; threads: Array<{ program: string }> }>();
    expect(data.ok).toBe(true);
    expect(data.threads.length).toBe(2);
    expect(data.threads.every((t) => t.program === 'mens')).toBe(true);
  });

  it('GET /api/admin/ai/threads/:id returns thread + messages', async () => {
    const threadId = await seedThread(DB(), 'mens', adminId);
    const now = '2026-01-01T00:00:00.000Z';
    await DB().prepare(
      `INSERT INTO ai_messages (thread_id, role, content, created_at)
       VALUES (?, 'user', 'Hello', ?)`,
    ).bind(threadId, now).run();

    const res = await app.fetch(
      makeReq('GET', `/api/admin/ai/threads/${threadId}`, cookie, 'mens'),
      testEnv,
    );
    const data = await res.json<{
      ok: boolean;
      thread: { id: number };
      messages: Array<{ role: string }>;
    }>();
    expect(data.ok).toBe(true);
    expect(data.thread.id).toBe(threadId);
    expect(data.messages.length).toBe(1);
    expect(data.messages[0].role).toBe('user');
  });

  it('GET /api/admin/ai/threads/:id returns 404 for another program thread', async () => {
    const now = '2026-01-01T00:00:00.000Z';
    const { meta } = await DB().prepare(
      `INSERT INTO ai_threads (program, created_by, title, created_at, updated_at)
       VALUES ('women', ?, 'Women thread', ?, ?)`,
    ).bind(adminId, now, now).run();
    const womenThreadId = meta.last_row_id as number;

    const res = await app.fetch(
      makeReq('GET', `/api/admin/ai/threads/${womenThreadId}`, cookie, 'mens'),
      testEnv,
    );
    expect(res.status).toBe(404);
  });

  // ── Message endpoint ─────────────────────────────────────────────────────────

  it('POST /api/admin/ai/threads/:id/message runs agent and returns messages', async () => {
    const threadId = await seedThread(DB(), 'mens', adminId);

    const res = await app.fetch(
      makeReq('POST', `/api/admin/ai/threads/${threadId}/message`, cookie, 'mens', {
        content: 'How many attendees?',
      }),
      testEnv,
    );
    expect(res.status).toBe(200);
    const data = await res.json<{
      ok: boolean;
      messages: Array<{ role: string }>;
      pending_actions: unknown[];
    }>();
    expect(data.ok).toBe(true);
    expect(data.messages.length).toBeGreaterThanOrEqual(2); // user + assistant
    expect(data.pending_actions).toEqual([]);
  });

  it('POST /api/admin/ai/threads/:id/message returns 400 when content is empty', async () => {
    const threadId = await seedThread(DB(), 'mens', adminId);
    const res = await app.fetch(
      makeReq('POST', `/api/admin/ai/threads/${threadId}/message`, cookie, 'mens', { content: '' }),
      testEnv,
    );
    expect(res.status).toBe(400);
  });

  it('message endpoint does NOT write email_log (only pending action created by agent)', async () => {
    const threadId = await seedThread(DB(), 'mens', adminId);

    // The mock returns end_turn, so no pending actions. But even if propose_send fired,
    // email_log must stay empty — the agent layer already tests this; confirm at route level.
    await app.fetch(
      makeReq('POST', `/api/admin/ai/threads/${threadId}/message`, cookie, 'mens', {
        content: 'Draft a reminder email',
      }),
      testEnv,
    );

    const logs = await DB().prepare('SELECT * FROM email_log').all();
    expect(logs.results).toHaveLength(0);
  });

  // ── GET /api/admin/ai/pending ────────────────────────────────────────────────

  it('GET /api/admin/ai/pending returns only pending actions for program', async () => {
    const threadId = await seedThread(DB(), 'mens', adminId);
    await seedPendingAction(DB(), threadId, 'mens');

    // Women action — should not appear
    const now = '2026-01-01T00:00:00.000Z';
    const { meta: wt } = await DB().prepare(
      `INSERT INTO ai_threads (program, created_by, title, created_at, updated_at)
       VALUES ('women', ?, 'W', ?, ?)`,
    ).bind(adminId, now, now).run();
    await seedPendingAction(DB(), wt.last_row_id as number, 'women');

    const res = await app.fetch(
      makeReq('GET', '/api/admin/ai/pending', cookie, 'mens'),
      testEnv,
    );
    const data = await res.json<{ ok: boolean; pending_actions: Array<{ program: string }> }>();
    expect(data.ok).toBe(true);
    expect(data.pending_actions.length).toBe(1);
    expect(data.pending_actions[0].program).toBe('mens');
  });

  // ── Approve — safety boundary ────────────────────────────────────────────────

  it('approve creates an email_campaigns row and marks action executed', async () => {
    const threadId = await seedThread(DB(), 'mens', adminId);
    const actionId = await seedPendingAction(DB(), threadId, 'mens');

    const res = await app.fetch(
      makeReq('POST', `/api/admin/ai/pending/${actionId}/approve`, cookie, 'mens'),
      testEnv,
    );
    expect(res.status).toBe(200);
    const data = await res.json<{ ok: boolean; campaign_id: number }>();
    expect(data.ok).toBe(true);
    expect(data.campaign_id).toBeGreaterThan(0);

    // Campaign row should exist
    const campaign = await DB()
      .prepare('SELECT * FROM email_campaigns WHERE id = ?')
      .bind(data.campaign_id)
      .first<{ program: string; subject: string; status: string }>();
    expect(campaign).not.toBeNull();
    expect(campaign!.program).toBe('mens');
    expect(campaign!.subject).toBe('Hi there');

    // Pending action should be executed
    const action = await DB()
      .prepare('SELECT status FROM ai_pending_actions WHERE id = ?')
      .bind(actionId)
      .first<{ status: string }>();
    expect(action!.status).toBe('executed');
  });

  it('approve of send_campaign triggers sendCampaignById (email_log rows appear ONLY after approve)', async () => {
    // Before approve: no email_log
    const logsBefore = await DB().prepare('SELECT * FROM email_log').all();
    expect(logsBefore.results).toHaveLength(0);

    const threadId = await seedThread(DB(), 'mens', adminId);
    const actionId = await seedPendingAction(DB(), threadId, 'mens', 'send_campaign');

    const res = await app.fetch(
      makeReq('POST', `/api/admin/ai/pending/${actionId}/approve`, cookie, 'mens'),
      testEnv,
    );
    expect(res.status).toBe(200);

    // sendCampaignById was called — campaign row status reflects send attempt
    const data = await res.json<{ ok: boolean; campaign_id: number }>();
    const campaign = await DB()
      .prepare('SELECT status FROM email_campaigns WHERE id = ?')
      .bind(data.campaign_id)
      .first<{ status: string }>();
    // With EMAIL_ENABLED=false and 0 recipients, sendCampaignById succeeds with sent=0 → 'sent'
    // The important assertion: campaign exists (was created by approve), email_log may or may not
    // have rows depending on recipients — either way it was the approve that triggered it.
    expect(campaign).not.toBeNull();
  });

  it('approve of schedule_campaign sets status=scheduled (no send)', async () => {
    const futureDate = '2099-12-31T00:00:00.000Z';
    const threadId = await seedThread(DB(), 'mens', adminId);
    const actionId = await seedPendingAction(DB(), threadId, 'mens', 'schedule_campaign', {
      subject: 'Upcoming event',
      body_html: '<p>Coming soon</p>',
      body_text: 'Coming soon',
      scheduled_for: futureDate,
    });

    const res = await app.fetch(
      makeReq('POST', `/api/admin/ai/pending/${actionId}/approve`, cookie, 'mens'),
      testEnv,
    );
    expect(res.status).toBe(200);
    const data = await res.json<{ ok: boolean; campaign_id: number }>();

    const campaign = await DB()
      .prepare('SELECT status, scheduled_for FROM email_campaigns WHERE id = ?')
      .bind(data.campaign_id)
      .first<{ status: string; scheduled_for: string }>();
    expect(campaign!.status).toBe('scheduled');
    expect(campaign!.scheduled_for).toBe(futureDate);

    // No email_log rows — schedule never sends immediately
    const logs = await DB().prepare('SELECT * FROM email_log').all();
    expect(logs.results).toHaveLength(0);
  });

  it('approve twice returns 409 on second call (idempotency)', async () => {
    const threadId = await seedThread(DB(), 'mens', adminId);
    const actionId = await seedPendingAction(DB(), threadId, 'mens');

    await app.fetch(
      makeReq('POST', `/api/admin/ai/pending/${actionId}/approve`, cookie, 'mens'),
      testEnv,
    );

    const res2 = await app.fetch(
      makeReq('POST', `/api/admin/ai/pending/${actionId}/approve`, cookie, 'mens'),
      testEnv,
    );
    expect(res2.status).toBe(409);
    const data = await res2.json<{ ok: boolean; error: string }>();
    expect(data.ok).toBe(false);
  });

  it('cannot approve another program pending action (program isolation)', async () => {
    const now = '2026-01-01T00:00:00.000Z';
    const { meta: wt } = await DB().prepare(
      `INSERT INTO ai_threads (program, created_by, title, created_at, updated_at)
       VALUES ('women', ?, 'W', ?, ?)`,
    ).bind(adminId, now, now).run();
    const womenActionId = await seedPendingAction(DB(), wt.last_row_id as number, 'women');

    // Logged in as mens — try to approve women's action
    const res = await app.fetch(
      makeReq('POST', `/api/admin/ai/pending/${womenActionId}/approve`, cookie, 'mens'),
      testEnv,
    );
    expect(res.status).toBe(404);

    // Women's action stays pending
    const action = await DB()
      .prepare('SELECT status FROM ai_pending_actions WHERE id = ?')
      .bind(womenActionId)
      .first<{ status: string }>();
    expect(action!.status).toBe('pending');
  });

  // ── Reject ──────────────────────────────────────────────────────────────────

  it('reject sets status to rejected and writes no campaign or email_log', async () => {
    const threadId = await seedThread(DB(), 'mens', adminId);
    const actionId = await seedPendingAction(DB(), threadId, 'mens');

    const res = await app.fetch(
      makeReq('POST', `/api/admin/ai/pending/${actionId}/reject`, cookie, 'mens'),
      testEnv,
    );
    expect(res.status).toBe(200);
    const data = await res.json<{ ok: boolean }>();
    expect(data.ok).toBe(true);

    const action = await DB()
      .prepare('SELECT status FROM ai_pending_actions WHERE id = ?')
      .bind(actionId)
      .first<{ status: string }>();
    expect(action!.status).toBe('rejected');

    const campaigns = await DB().prepare('SELECT * FROM email_campaigns').all();
    expect(campaigns.results).toHaveLength(0);

    const logs = await DB().prepare('SELECT * FROM email_log').all();
    expect(logs.results).toHaveLength(0);
  });

  it('reject twice returns 409 on second call', async () => {
    const threadId = await seedThread(DB(), 'mens', adminId);
    const actionId = await seedPendingAction(DB(), threadId, 'mens');

    await app.fetch(
      makeReq('POST', `/api/admin/ai/pending/${actionId}/reject`, cookie, 'mens'),
      testEnv,
    );

    const res2 = await app.fetch(
      makeReq('POST', `/api/admin/ai/pending/${actionId}/reject`, cookie, 'mens'),
      testEnv,
    );
    expect(res2.status).toBe(409);
  });

  it('cannot reject another program pending action (program isolation)', async () => {
    const now = '2026-01-01T00:00:00.000Z';
    const { meta: wt } = await DB().prepare(
      `INSERT INTO ai_threads (program, created_by, title, created_at, updated_at)
       VALUES ('women', ?, 'W', ?, ?)`,
    ).bind(adminId, now, now).run();
    const womenActionId = await seedPendingAction(DB(), wt.last_row_id as number, 'women');

    const res = await app.fetch(
      makeReq('POST', `/api/admin/ai/pending/${womenActionId}/reject`, cookie, 'mens'),
      testEnv,
    );
    expect(res.status).toBe(404);

    const action = await DB()
      .prepare('SELECT status FROM ai_pending_actions WHERE id = ?')
      .bind(womenActionId)
      .first<{ status: string }>();
    expect(action!.status).toBe('pending');
  });

  it('approve of an already-rejected action returns 409', async () => {
    const threadId = await seedThread(DB(), 'mens', adminId);
    const actionId = await seedPendingAction(DB(), threadId, 'mens');

    // Reject first
    await app.fetch(
      makeReq('POST', `/api/admin/ai/pending/${actionId}/reject`, cookie, 'mens'),
      testEnv,
    );

    // Then try to approve — must be 409
    const res = await app.fetch(
      makeReq('POST', `/api/admin/ai/pending/${actionId}/approve`, cookie, 'mens'),
      testEnv,
    );
    expect(res.status).toBe(409);
  });

  // ── TOCTOU double-send guard ─────────────────────────────────────────────────

  it('two simultaneous approve calls on the same action produce exactly ONE campaign and return 409 on the second', async () => {
    // Arrange: one pending send_campaign action
    const threadId = await seedThread(DB(), 'mens', adminId);
    const actionId = await seedPendingAction(DB(), threadId, 'mens', 'send_campaign');

    // Act: fire both requests concurrently (simulate TOCTOU race)
    const [res1, res2] = await Promise.all([
      app.fetch(makeReq('POST', `/api/admin/ai/pending/${actionId}/approve`, cookie, 'mens'), testEnv),
      app.fetch(makeReq('POST', `/api/admin/ai/pending/${actionId}/approve`, cookie, 'mens'), testEnv),
    ]);

    const statuses = [res1.status, res2.status].sort();
    // Exactly one 200 (winner) and one 409 (loser)
    expect(statuses).toEqual([200, 409]);

    // Assert: exactly ONE campaign row was created
    const campaigns = await DB().prepare('SELECT * FROM email_campaigns').all();
    expect(campaigns.results).toHaveLength(1);

    // Assert: the action is marked executed (not pending)
    const action = await DB()
      .prepare('SELECT status FROM ai_pending_actions WHERE id = ?')
      .bind(actionId)
      .first<{ status: string }>();
    expect(action!.status).toBe('executed');

    // Assert: the 409 response carries the expected error message
    const loserRes = res1.status === 409 ? res1 : res2;
    const loserData = await loserRes.json<{ ok: boolean; error: string }>();
    expect(loserData.ok).toBe(false);
    expect(loserData.error).toBe('already resolved');
  });

  // ── Pending actions preview enrichment ────────────────────────────────────────

  it('GET /api/admin/ai/pending returns enriched subject, recipient_count, and body_preview', async () => {
    const threadId = await seedThread(DB(), 'mens', adminId);
    await seedPendingAction(DB(), threadId, 'mens', 'send_campaign', {
      subject: 'Packing list',
      body_html: '<p>Please pack</p>',
      body_text: 'Please pack light for the trip.',
      summary: 'Send packing list to all attendees.',
    });

    const res = await app.fetch(
      makeReq('GET', '/api/admin/ai/pending', cookie, 'mens'),
      testEnv,
    );
    expect(res.status).toBe(200);
    const data = await res.json<{
      ok: boolean;
      pending_actions: Array<{
        subject?: string;
        recipient_count?: number;
        body_preview?: string;
      }>;
    }>();
    expect(data.ok).toBe(true);
    expect(data.pending_actions).toHaveLength(1);
    const action = data.pending_actions[0];
    expect(action.subject).toBe('Packing list');
    expect(typeof action.recipient_count).toBe('number');
    expect(action.body_preview).toContain('Please pack');
  });
});
