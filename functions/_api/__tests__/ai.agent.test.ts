// functions/_api/__tests__/ai.agent.test.ts
// TDD tests for the AI agent loop (Task 2).
// The Anthropic client is NEVER called — every test injects a scripted fake.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { applyMigrations } from './setup';
import { runAgentLoop } from '../ai/agent.js';
import type { AnthropicClient, AgentInput } from '../ai/agent.js';
import type Anthropic from '@anthropic-ai/sdk';

// ---------------------------------------------------------------------------
// Helpers: fake Anthropic clients
// ---------------------------------------------------------------------------

/**
 * Returns a scripted fake that always replies with a single text block and
 * stop_reason = 'end_turn' (no tools involved).
 */
function makeTextOnlyClient(text: string): AnthropicClient {
  return {
    messages: {
      create: vi.fn<[Anthropic.MessageCreateParamsNonStreaming], Promise<Anthropic.Message>>()
        .mockResolvedValue({
          id: 'msg_fake',
          type: 'message',
          role: 'assistant',
          stop_reason: 'end_turn',
          stop_sequence: null,
          model: 'claude-opus-4-8',
          usage: { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          content: [{ type: 'text', text }],
        }),
    },
  };
}

/**
 * Returns a scripted fake that:
 *   - call 1: returns stop_reason='tool_use' with the given tool_use block
 *   - call 2+: returns stop_reason='end_turn' with finalText
 */
function makeToolUseClient(
  toolName: string,
  toolInput: Record<string, unknown>,
  finalText: string,
): AnthropicClient {
  let call = 0;
  return {
    messages: {
      create: vi.fn<[Anthropic.MessageCreateParamsNonStreaming], Promise<Anthropic.Message>>()
        .mockImplementation(() => {
          call++;
          if (call === 1) {
            return Promise.resolve({
              id: 'msg_tool',
              type: 'message',
              role: 'assistant',
              stop_reason: 'tool_use',
              stop_sequence: null,
              model: 'claude-opus-4-8',
              usage: { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
              content: [
                {
                  type: 'tool_use',
                  id: 'toolu_fake_001',
                  name: toolName,
                  input: toolInput,
                } as Anthropic.ToolUseBlock,
              ],
            });
          }
          return Promise.resolve({
            id: 'msg_final',
            type: 'message',
            role: 'assistant',
            stop_reason: 'end_turn',
            stop_sequence: null,
            model: 'claude-opus-4-8',
            usage: { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
            content: [{ type: 'text', text: finalText }],
          });
        }),
    },
  };
}

/**
 * Returns a fake that ALWAYS replies with a tool_use block (simulates infinite loop).
 */
function makeInfiniteToolClient(): AnthropicClient {
  return {
    messages: {
      create: vi.fn<[Anthropic.MessageCreateParamsNonStreaming], Promise<Anthropic.Message>>()
        .mockResolvedValue({
          id: 'msg_inf',
          type: 'message',
          role: 'assistant',
          stop_reason: 'tool_use',
          stop_sequence: null,
          model: 'claude-opus-4-8',
          usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          content: [
            {
              type: 'tool_use',
              id: 'toolu_inf',
              name: 'query_counts',
              input: {},
            } as Anthropic.ToolUseBlock,
          ],
        }),
    },
  };
}

// ---------------------------------------------------------------------------
// Seed helper
// ---------------------------------------------------------------------------

const DB = () => (env as unknown as { DB: D1Database }).DB;

async function seedThread(): Promise<number> {
  const db = DB();
  const now = '2026-01-01T00:00:00.000Z';

  // admin user (required FK for ai_threads)
  await db
    .prepare(
      `INSERT OR IGNORE INTO admin_users (email, name, password_hash, role, created_at)
       VALUES ('agent-test@nwks.com', 'Agent Admin', 'x', 'admin', ?)`,
    )
    .bind(now)
    .run();

  // event (required so READ tools like event_summary work)
  await db
    .prepare(
      `INSERT OR REPLACE INTO events
         (program, year, title, start_date, end_date, launch_locations,
          attendee_registration_open, server_registration_open, is_current,
          created_at, updated_at)
       VALUES ('mens', 2026, 'Mens Encounter 2026', '2026-08-06', '2026-08-08',
               '[]', 1, 1, 1, ?, ?)`,
    )
    .bind(now, now)
    .run();

  const admin = await db
    .prepare(`SELECT id FROM admin_users WHERE email = 'agent-test@nwks.com'`)
    .first<{ id: number }>();

  const { meta } = await db
    .prepare(
      `INSERT INTO ai_threads (program, created_by, title, created_at, updated_at)
       VALUES ('mens', ?, 'Agent Test Thread', ?, ?)`,
    )
    .bind(admin?.id ?? null, now, now)
    .run();

  return meta.last_row_id as number;
}

// ---------------------------------------------------------------------------
// Base input factory
// ---------------------------------------------------------------------------

const baseInput = (threadId: number): AgentInput => ({
  threadId,
  program: 'mens',
  userMessage: 'How many attendees do we have?',
  history: [],
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runAgentLoop', () => {
  let threadId: number;

  beforeEach(async () => {
    await applyMigrations({ DB: DB() });
    threadId = await seedThread();
  });

  // --- Simple text-only response ---

  it('returns assistant text for a text-only response (no tools)', async () => {
    const client = makeTextOnlyClient('You have 42 attendees.');
    const output = await runAgentLoop(baseInput(threadId), { db: DB() }, client);

    expect(output.assistantText).toBe('You have 42 attendees.');
    expect(output.pendingActionIds).toHaveLength(0);
  });

  // --- Message persistence ---

  it('persists the user message to ai_messages', async () => {
    const client = makeTextOnlyClient('42 attendees.');
    await runAgentLoop(baseInput(threadId), { db: DB() }, client);

    const userRow = await DB()
      .prepare(
        `SELECT role, content FROM ai_messages
         WHERE thread_id = ? AND role = 'user' LIMIT 1`,
      )
      .bind(threadId)
      .first<{ role: string; content: string }>();

    expect(userRow).not.toBeNull();
    expect(userRow!.role).toBe('user');
    expect(userRow!.content).toBe('How many attendees do we have?');
  });

  it('persists the assistant message to ai_messages', async () => {
    const client = makeTextOnlyClient('42 attendees here.');
    await runAgentLoop(baseInput(threadId), { db: DB() }, client);

    const row = await DB()
      .prepare(
        `SELECT role, content FROM ai_messages
         WHERE thread_id = ? AND role = 'assistant' LIMIT 1`,
      )
      .bind(threadId)
      .first<{ role: string; content: string }>();

    expect(row).not.toBeNull();
    expect(row!.content).toBe('42 attendees here.');
  });

  it('persists both user and assistant rows in the correct order', async () => {
    const client = makeTextOnlyClient('Answer.');
    await runAgentLoop(baseInput(threadId), { db: DB() }, client);

    const rows = await DB()
      .prepare(
        `SELECT role FROM ai_messages WHERE thread_id = ? ORDER BY id`,
      )
      .bind(threadId)
      .all<{ role: string }>();

    const roles = rows.results.map((r) => r.role);
    expect(roles[0]).toBe('user');
    expect(roles[1]).toBe('assistant');
  });

  // --- Tool-use loop with a READ tool ---

  it('executes a READ tool call and returns the final text answer', async () => {
    // query_counts is a READ tool that queries ai_pending_actions — no writes
    const client = makeToolUseClient(
      'query_counts',
      {},
      'There are 0 registrations for the current event.',
    );

    const output = await runAgentLoop(baseInput(threadId), { db: DB() }, client);

    expect(output.assistantText).toContain('registrations');
    expect(output.pendingActionIds).toHaveLength(0);
  });

  it('persists a tool-result row when tool_use fires', async () => {
    const client = makeToolUseClient('query_counts', {}, 'Counts retrieved.');
    await runAgentLoop(baseInput(threadId), { db: DB() }, client);

    const toolRow = await DB()
      .prepare(`SELECT role FROM ai_messages WHERE thread_id = ? AND role = 'tool'`)
      .bind(threadId)
      .first<{ role: string }>();

    expect(toolRow).not.toBeNull();
    expect(toolRow!.role).toBe('tool');
  });

  // --- PROPOSE tool: creates pending action, sends nothing ---

  it('creates a pending action when propose_send_campaign fires', async () => {
    const client = makeToolUseClient(
      'propose_send_campaign',
      {
        subject: 'Weekend Reminder',
        body_html: '<p>See you there!</p>',
        body_text: 'See you there!',
        summary: 'Send reminder to all attendees.',
      },
      'I have proposed the campaign for your approval.',
    );

    const output = await runAgentLoop(baseInput(threadId), { db: DB() }, client);

    expect(output.pendingActionIds).toHaveLength(1);
    expect(output.pendingActionIds[0]).toBeGreaterThan(0);
  });

  it('returns the proposal text in assistantText', async () => {
    const client = makeToolUseClient(
      'propose_send_campaign',
      {
        subject: 'Reminder',
        body_html: '<p>Hi</p>',
        body_text: 'Hi',
        summary: 'Reminder to attendees.',
      },
      'The campaign has been proposed and awaits approval.',
    );

    const output = await runAgentLoop(baseInput(threadId), { db: DB() }, client);

    expect(output.assistantText).toContain('approval');
  });

  it('does NOT insert into email_log when propose_send_campaign fires', async () => {
    const client = makeToolUseClient(
      'propose_send_campaign',
      {
        subject: 'Test Blast',
        body_html: '<p>Hello</p>',
        body_text: 'Hello',
        summary: 'Test blast.',
      },
      'Proposed.',
    );

    await runAgentLoop(baseInput(threadId), { db: DB() }, client);

    const logs = await DB().prepare('SELECT * FROM email_log').all();
    expect(logs.results).toHaveLength(0);
  });

  it('does NOT insert into email_campaigns when propose_send_campaign fires', async () => {
    const client = makeToolUseClient(
      'propose_send_campaign',
      {
        subject: 'Test',
        body_html: '<p>x</p>',
        body_text: 'x',
        summary: 'Test.',
      },
      'Proposed.',
    );

    await runAgentLoop(baseInput(threadId), { db: DB() }, client);

    const campaigns = await DB().prepare('SELECT * FROM email_campaigns').all();
    expect(campaigns.results).toHaveLength(0);
  });

  it('pending action row is scoped to the correct program', async () => {
    const client = makeToolUseClient(
      'propose_send_campaign',
      {
        subject: 'Mens Only',
        body_html: '<p>x</p>',
        body_text: 'x',
        summary: 'Mens program only.',
      },
      'Done.',
    );

    const output = await runAgentLoop(baseInput(threadId), { db: DB() }, client);

    const row = await DB()
      .prepare('SELECT program FROM ai_pending_actions WHERE id = ?')
      .bind(output.pendingActionIds[0])
      .first<{ program: string }>();

    expect(row!.program).toBe('mens');
  });

  // --- Iteration cap ---

  it('stops at MAX_ITERATIONS (10) even when model keeps requesting tools', async () => {
    const infiniteClient = makeInfiniteToolClient();

    // Should resolve without hanging (MAX_ITERATIONS = 10)
    const output = await runAgentLoop(baseInput(threadId), { db: DB() }, infiniteClient);
    expect(output).toBeDefined();

    const createFn = infiniteClient.messages.create as ReturnType<typeof vi.fn>;
    expect(createFn.mock.calls.length).toBeLessThanOrEqual(10);
  });

  // --- Program passed through to executeTool ---

  it('passes the program to tool executors (program isolation on READ tool)', async () => {
    // seed a mens registration so query_counts would return total=1 for mens
    const db = DB();
    const now = '2026-01-01T00:00:00.000Z';
    const event = await db
      .prepare(`SELECT id FROM events WHERE program = 'mens' AND is_current = 1`)
      .first<{ id: number }>();
    await db
      .prepare(
        `INSERT INTO people
           (program, first_name, last_name, email, times_attended, times_served,
            created_at, updated_at)
         VALUES ('mens', 'Jane', 'Doe', 'janedoe@example.com', 0, 0, ?, ?)`,
      )
      .bind(now, now)
      .run();
    const person = await db
      .prepare(`SELECT id FROM people WHERE email = 'janedoe@example.com'`)
      .first<{ id: number }>();
    await db
      .prepare(
        `INSERT INTO registrations
           (program, event_id, person_id, role, first_name, last_name, status, created_at)
         VALUES ('mens', ?, ?, 'attendee', 'Jane', 'Doe', 'registered', ?)`,
      )
      .bind(event!.id, person!.id, now)
      .run();

    // Now run loop with a WOMEN thread — tool should see 0, not 1
    const womenAdmin = await db
      .prepare(`SELECT id FROM admin_users WHERE email = 'agent-test@nwks.com'`)
      .first<{ id: number }>();
    const { meta: wt } = await db
      .prepare(
        `INSERT INTO ai_threads (program, created_by, title, created_at, updated_at)
         VALUES ('women', ?, 'Women Thread', ?, ?)`,
      )
      .bind(womenAdmin?.id ?? null, now, now)
      .run();
    const womenThreadId = wt.last_row_id as number;

    // We'll capture what the query_counts tool returned by inspecting ai_messages tool row
    const client = makeToolUseClient('query_counts', {}, 'Zero registrations for this program.');

    await runAgentLoop(
      { threadId: womenThreadId, program: 'women', userMessage: 'How many?', history: [] },
      { db: DB() },
      client,
    );

    const toolRow = await db
      .prepare(
        `SELECT content FROM ai_messages WHERE thread_id = ? AND role = 'tool' LIMIT 1`,
      )
      .bind(womenThreadId)
      .first<{ content: string }>();

    expect(toolRow).not.toBeNull();
    const toolResults = JSON.parse(toolRow!.content) as Array<{ content: string }>;
    const counts = JSON.parse(toolResults[0].content) as { total: number };
    // Women program has 0 registrations — confirms program was passed through
    expect(counts.total).toBe(0);
  });

  // --- newMessages returned ---

  it('returns newMessages with at least user and assistant entries represented', async () => {
    const client = makeTextOnlyClient('Simple answer.');
    const output = await runAgentLoop(baseInput(threadId), { db: DB() }, client);

    // newMessages is the list of turns the agent persisted (assistant turns only in simple case)
    expect(output.newMessages.length).toBeGreaterThanOrEqual(1);
    const assistantMsg = output.newMessages.find((m) => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg!.content).toBe('Simple answer.');
  });
});
