// functions/_api/ai/agent.ts
// AI agent loop: system prompt + Opus tool-use orchestration for NWKS Encounter.
//
// SAFETY CONTRACT:
//   - The loop ONLY calls executeTool (READ or PROPOSE tools).
//   - PROPOSE tools only insert ai_pending_actions — they NEVER send email.
//   - The loop itself has no email access and no path to any send function.
//   - MAX_ITERATIONS caps runaway tool-use chains.

import type Anthropic from '@anthropic-ai/sdk';
import type { Program } from '../db.js';
import { nowIso } from '../db.js';
import { ALL_TOOLS, executeToolCall } from './tools.js';
import type { FullToolEnv } from './tools.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface AgentInput {
  threadId: number;
  program: Program;
  userMessage: string;
  /** Conversation history so far (from ai_messages), passed in by the route. */
  history: Array<{ role: 'user' | 'assistant' | 'tool'; content: string }>;
}

export interface AgentOutput {
  assistantText: string;
  pendingActionIds: number[];
  /** Full messages array after this turn (persisted by the agent itself). */
  newMessages: Array<{ role: string; content: string; tool_calls?: string }>;
}

/**
 * Injected Anthropic client — allows mocking in tests.
 * We only use `messages.create`, so pick just that surface.
 */
export type AnthropicClient = {
  messages: {
    create: (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;
  };
};

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const MINISTRY_CONTEXT = `You are the NWKS Encounter Ministry AI Operations Assistant.
NWKS Encounter is a Northwest Kansas ministry that runs Men's Encounter (August) and
Women's Encounter (July) spiritual retreats each year.

Your role: help the admin team manage registrations, understand attendance data, and
draft email communications. You have read access to registration data, people profiles,
event details, and launch location breakdowns.

CRITICAL RULE — DRAFT AND APPROVE:
You may NEVER send or schedule an email campaign directly. When you want to send or
schedule an email, you MUST use the propose_send_campaign or propose_schedule_campaign
tool. These tools create a pending action that a human admin reviews and approves before
anything is sent. If you call any other mechanism to send email, that is a policy
violation. Always acknowledge this limitation to the admin if they ask why email is not
sent immediately.

Program isolation: you can only see data for the {program} program. Do not speculate
about the other program's data.

Be concise, pastoral in tone, and practical. You are supporting ministry volunteers.`;

export function buildSystemPrompt(program: Program): string {
  return MINISTRY_CONTEXT.replace('{program}', program);
}

// ---------------------------------------------------------------------------
// Agent loop
// ---------------------------------------------------------------------------

const MAX_ITERATIONS = 10;

export async function runAgentLoop(
  input: AgentInput,
  env: { db: D1Database },
  anthropic: AnthropicClient,
): Promise<AgentOutput> {
  const { threadId, program, userMessage, history } = input;

  // Build messages array: replay history then add new user message
  const messages: Anthropic.MessageParam[] = [];
  for (const msg of history) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({ role: msg.role, content: msg.content });
    }
    // 'tool' role rows are internal; we skip them when replaying history
    // because they were already folded into assistant turns in the prior session
  }
  messages.push({ role: 'user', content: userMessage });

  // Persist user message
  await env.db
    .prepare(
      `INSERT INTO ai_messages (thread_id, role, content, created_at)
       VALUES (?, 'user', ?, ?)`,
    )
    .bind(threadId, userMessage, nowIso())
    .run();

  // Update thread updated_at
  await env.db
    .prepare('UPDATE ai_threads SET updated_at = ? WHERE id = ?')
    .bind(nowIso(), threadId)
    .run();

  const toolEnv: FullToolEnv = { db: env.db, program, threadId };
  const pendingActionIds: number[] = [];
  const newMessages: Array<{ role: string; content: string; tool_calls?: string }> = [];
  let assistantText = '';
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      system: buildSystemPrompt(program),
      tools: ALL_TOOLS,
      messages,
    });

    // Collect text from content blocks
    const textBlocks = response.content.filter(
      (b): b is Anthropic.TextBlock => b.type === 'text',
    );
    const textContent = textBlocks.map((b) => b.text).join('');

    if (textContent) {
      assistantText = textContent; // last text wins for final response
    }

    // Collect tool_use blocks
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    // Persist assistant turn
    const toolCallsJson = toolUseBlocks.length > 0 ? JSON.stringify(toolUseBlocks) : null;
    await env.db
      .prepare(
        `INSERT INTO ai_messages (thread_id, role, content, tool_calls, created_at)
         VALUES (?, 'assistant', ?, ?, ?)`,
      )
      .bind(threadId, textContent || '', toolCallsJson, nowIso())
      .run();

    newMessages.push({
      role: 'assistant',
      content: textContent || '',
      ...(toolCallsJson ? { tool_calls: toolCallsJson } : {}),
    });

    if (response.stop_reason === 'end_turn' || toolUseBlocks.length === 0) {
      break;
    }

    // Execute tool calls and collect results
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUseBlocks) {
      const resultText = await executeToolCall(
        toolUse.name,
        toolUse.input as Record<string, unknown>,
        toolEnv,
      );

      // Extract pending action ids from propose tool results
      try {
        const parsed = JSON.parse(resultText) as Record<string, unknown>;
        if (typeof parsed.pending_action_id === 'number') {
          pendingActionIds.push(parsed.pending_action_id);
        }
      } catch {
        // not JSON or no id — fine
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: resultText,
      });
    }

    // Append assistant content and tool results to messages for next iteration
    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });

    // Persist tool results row
    const toolResultsJson = JSON.stringify(toolResults);
    await env.db
      .prepare(
        `INSERT INTO ai_messages (thread_id, role, content, created_at)
         VALUES (?, 'tool', ?, ?)`,
      )
      .bind(threadId, toolResultsJson, nowIso())
      .run();

    newMessages.push({ role: 'tool', content: toolResultsJson });
  }

  return {
    assistantText,
    pendingActionIds,
    newMessages,
  };
}
