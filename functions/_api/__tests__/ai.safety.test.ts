// functions/_api/__tests__/ai.safety.test.ts
// End-to-end safety validation (Task 6 — P5).
//
// INVARIANT: a user asking the AI assistant to "send an email" results in a
// PENDING action and ZERO emails sent. Only an explicit human approve call
// triggers any email work (via sendCampaignById → email_campaigns row).
//
// The Anthropic SDK is MOCKED — no real API calls are made.
// The mock simulates the model calling propose_send_campaign (the correct
// behaviour when a user asks to send email).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { app } from '../app';
import { applyMigrations, seedAdmin } from './setup';
import type { Env } from '../app';

// ---------------------------------------------------------------------------
// Mock Anthropic so the assistant calls propose_send_campaign (not real API)
// ---------------------------------------------------------------------------

/**
 * On the first call the mock returns a tool_use block that calls
 * propose_send_campaign (exactly what the real model does when asked to send
 * an email). On subsequent calls it returns end_turn with a confirmation text.
 */
let callCount = 0;

vi.mock('@anthropic-ai/sdk', () => {
  const create = vi.fn().mockImplementation(() => {
    callCount++;
    if (callCount === 1) {
      // First call: model decides to propose an email campaign
      return Promise.resolve({
        id: 'msg_propose',
        type: 'message',
        role: 'assistant',
        stop_reason: 'tool_use',
        stop_sequence: null,
        model: 'claude-opus-4-8',
        usage: { input_tokens: 50, output_tokens: 80, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        content: [
          {
            type: 'tool_use',
            id: 'toolu_propose_001',
            name: 'propose_send_campaign',
            input: {
              subject: 'Packing List for Encounter Weekend',
              body_html: '<p>Please bring your Bible and comfortable clothes.</p>',
              body_text: 'Please bring your Bible and comfortable clothes.',
              summary: 'Send packing list to all attendees.',
              segment: { role: 'attendee' },
            },
          },
        ],
      });
    }
    // Subsequent calls: model acknowledges the pending action
    return Promise.resolve({
      id: 'msg_ack',
      type: 'message',
      role: 'assistant',
      stop_reason: 'end_turn',
      stop_sequence: null,
      model: 'claude-opus-4-8',
      usage: { input_tokens: 20, output_tokens: 30, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      content: [
        {
          type: 'text',
          text: 'I have drafted a packing-list email and submitted it for your approval. No email has been sent yet.',
        },
      ],
    });
  });
  return {
    default: vi.fn().mockImplementation(() => ({ messages: { create } })),
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
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ---------------------------------------------------------------------------
// End-to-end safety test
// ---------------------------------------------------------------------------

describe('AI assistant — draft-and-approve safety invariant', () => {
  let cookie: string;
  let adminId: number;
  const DB = () => testEnv.DB;

  beforeEach(async () => {
    callCount = 0;
    await applyMigrations({ DB: DB() });
    const admin = await seedAdmin();
    adminId = admin.id;

    // Seed a current event so READ tools work correctly
    const now = '2026-01-01T00:00:00.000Z';
    await DB()
      .prepare(
        `INSERT OR IGNORE INTO events
           (program, year, title, start_date, end_date, launch_locations,
            attendee_registration_open, server_registration_open, is_current, created_at, updated_at)
         VALUES ('mens', 2026, 'Mens Encounter 2026', '2026-08-06', '2026-08-08',
                 '[]', 1, 1, 1, ?, ?)`,
      )
      .bind(now, now)
      .run();

    cookie = await getAuthCookie();
    void adminId; // used implicitly via seedAdmin FK
  });

  it('asking the AI to send email creates a PENDING action — not a sent email', async () => {
    // 1. Create a thread
    const threadRes = await app.fetch(
      makeReq('POST', '/api/admin/ai/threads', cookie, 'mens', { title: 'Safety test' }),
      testEnv,
    );
    expect(threadRes.status).toBe(200);
    const { thread } = await threadRes.json<{ ok: boolean; thread: { id: number } }>();

    // 2. Ask the AI to send an email (mock will call propose_send_campaign)
    const msgRes = await app.fetch(
      makeReq('POST', `/api/admin/ai/threads/${thread.id}/message`, cookie, 'mens', {
        content: 'Please send an email to all attendees with packing list info.',
      }),
      testEnv,
    );
    expect(msgRes.status).toBe(200);

    const msgData = await msgRes.json<{
      ok: boolean;
      messages: Array<{ role: string }>;
      pending_actions: Array<{ id: number; status: string; kind: string }>;
    }>();
    expect(msgData.ok).toBe(true);

    // SAFETY ASSERTION 1: at least one pending action was created
    expect(msgData.pending_actions.length).toBeGreaterThanOrEqual(1);
    const pendingAction = msgData.pending_actions[0];
    expect(pendingAction.status).toBe('pending');
    expect(pendingAction.kind).toBe('send_campaign');

    // SAFETY ASSERTION 2: ZERO emails sent — email_log must be empty
    const emailLogs = await DB().prepare('SELECT * FROM email_log').all();
    expect(emailLogs.results).toHaveLength(0);

    // SAFETY ASSERTION 3: ZERO email_campaigns rows — no campaign materialised yet
    const campaigns = await DB().prepare('SELECT * FROM email_campaigns').all();
    expect(campaigns.results).toHaveLength(0);
  });

  it('only an explicit approve call creates the email_campaigns row', async () => {
    // 1. Create thread + send message (triggers propose_send_campaign via mock)
    const threadRes = await app.fetch(
      makeReq('POST', '/api/admin/ai/threads', cookie, 'mens', { title: 'Approve test' }),
      testEnv,
    );
    const { thread } = await threadRes.json<{ ok: boolean; thread: { id: number } }>();

    const msgRes = await app.fetch(
      makeReq('POST', `/api/admin/ai/threads/${thread.id}/message`, cookie, 'mens', {
        content: 'Draft and send packing list email to attendees.',
      }),
      testEnv,
    );
    const msgData = await msgRes.json<{
      pending_actions: Array<{ id: number }>;
    }>();

    const actionId = msgData.pending_actions[0]?.id;
    expect(actionId).toBeDefined();

    // Verify still zero campaigns before approve
    const beforeCampaigns = await DB().prepare('SELECT * FROM email_campaigns').all();
    expect(beforeCampaigns.results).toHaveLength(0);

    // 2. Human approves the pending action
    const approveRes = await app.fetch(
      makeReq('POST', `/api/admin/ai/pending/${actionId}/approve`, cookie, 'mens'),
      testEnv,
    );
    expect(approveRes.status).toBe(200);
    const approveData = await approveRes.json<{ ok: boolean; campaign_id: number }>();
    expect(approveData.ok).toBe(true);
    expect(approveData.campaign_id).toBeGreaterThan(0);

    // SAFETY ASSERTION: email_campaigns row now exists (approve created it)
    const afterCampaigns = await DB().prepare('SELECT * FROM email_campaigns').all();
    expect(afterCampaigns.results).toHaveLength(1);
    expect((afterCampaigns.results[0] as { program: string }).program).toBe('mens');

    // Pending action is now marked executed (not pending)
    const action = await DB()
      .prepare('SELECT status FROM ai_pending_actions WHERE id = ?')
      .bind(actionId)
      .first<{ status: string }>();
    expect(action!.status).toBe('executed');
  });

  it('a rejected pending action results in zero email_campaigns rows forever', async () => {
    const threadRes = await app.fetch(
      makeReq('POST', '/api/admin/ai/threads', cookie, 'mens', { title: 'Reject test' }),
      testEnv,
    );
    const { thread } = await threadRes.json<{ ok: boolean; thread: { id: number } }>();

    const msgRes = await app.fetch(
      makeReq('POST', `/api/admin/ai/threads/${thread.id}/message`, cookie, 'mens', {
        content: 'Send a welcome email to all servers.',
      }),
      testEnv,
    );
    const msgData = await msgRes.json<{
      pending_actions: Array<{ id: number }>;
    }>();

    const actionId = msgData.pending_actions[0]?.id;
    expect(actionId).toBeDefined();

    // Human rejects instead of approving
    const rejectRes = await app.fetch(
      makeReq('POST', `/api/admin/ai/pending/${actionId}/reject`, cookie, 'mens'),
      testEnv,
    );
    expect(rejectRes.status).toBe(200);

    // No campaign created, no emails
    const campaigns = await DB().prepare('SELECT * FROM email_campaigns').all();
    expect(campaigns.results).toHaveLength(0);

    const emailLogs = await DB().prepare('SELECT * FROM email_log').all();
    expect(emailLogs.results).toHaveLength(0);

    // Action is rejected, not executable
    const action = await DB()
      .prepare('SELECT status FROM ai_pending_actions WHERE id = ?')
      .bind(actionId)
      .first<{ status: string }>();
    expect(action!.status).toBe('rejected');

    // And cannot be approved now (idempotency)
    const approveAfterReject = await app.fetch(
      makeReq('POST', `/api/admin/ai/pending/${actionId}/approve`, cookie, 'mens'),
      testEnv,
    );
    expect(approveAfterReject.status).toBe(409);
  });
});
