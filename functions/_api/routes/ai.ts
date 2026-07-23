// functions/_api/routes/ai.ts — AI assistant endpoints for NWKS Encounter admin
//
// SAFETY CONTRACT:
//   - The message endpoint runs the agent loop (read + propose tools only).
//   - Propose tools create ai_pending_actions — they NEVER send email.
//   - Only the approve endpoint may trigger an actual send (via sendCampaignById).
//   - Program isolation enforced on every query.

import { Hono } from 'hono';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth, requireProgram } from '../auth.js';
import { nowIso } from '../db.js';
import { runAgentLoop } from '../ai/agent.js';
import { sendCampaignById } from './campaigns.js';
import { resolveSegment } from '../segment.js';
import type { Env } from '../app.js';
import type { AppVariables } from '../auth.js';
import type { Program } from '../db.js';

export const aiRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

aiRouter.use('*', requireAuth());
aiRouter.use('*', requireProgram());

// ── Threads ───────────────────────────────────────────────────────────────────

// POST /api/admin/ai/threads
aiRouter.post('/threads', async (c) => {
  const user = c.get('user');
  const program = c.get('program');
  let title: string | undefined;
  try {
    const body = await c.req.json<{ title?: string }>();
    title = body.title;
  } catch {
    // body is optional — no title is fine
  }
  const now = nowIso();

  const result = await c.env.DB
    .prepare(
      `INSERT INTO ai_threads (program, created_by, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(program, user.id, title ?? null, now, now)
    .first<{ id: number }>();

  if (!result) return c.json({ ok: false, error: 'Failed to create thread' }, 500);

  const thread = await c.env.DB
    .prepare('SELECT * FROM ai_threads WHERE id = ?')
    .bind(result.id)
    .first();

  return c.json({ ok: true, thread });
});

// GET /api/admin/ai/threads
aiRouter.get('/threads', async (c) => {
  const program = c.get('program');
  const threads = await c.env.DB
    .prepare(
      'SELECT * FROM ai_threads WHERE program = ? ORDER BY updated_at DESC LIMIT 50',
    )
    .bind(program)
    .all();
  return c.json({ ok: true, threads: threads.results });
});

// GET /api/admin/ai/threads/:id
aiRouter.get('/threads/:id', async (c) => {
  const program = c.get('program');
  const threadId = Number(c.req.param('id'));

  const thread = await c.env.DB
    .prepare('SELECT * FROM ai_threads WHERE id = ? AND program = ?')
    .bind(threadId, program)
    .first();
  if (!thread) return c.json({ ok: false, error: 'Thread not found' }, 404);

  const messages = await c.env.DB
    .prepare('SELECT * FROM ai_messages WHERE thread_id = ? ORDER BY id ASC')
    .bind(threadId)
    .all();

  return c.json({ ok: true, thread, messages: messages.results });
});

// POST /api/admin/ai/threads/:id/message
aiRouter.post('/threads/:id/message', async (c) => {
  const program = c.get('program');
  const threadId = Number(c.req.param('id'));

  const thread = await c.env.DB
    .prepare('SELECT * FROM ai_threads WHERE id = ? AND program = ?')
    .bind(threadId, program)
    .first();
  if (!thread) return c.json({ ok: false, error: 'Thread not found' }, 404);

  const { content } = await c.req.json<{ content: string }>();
  if (!content?.trim()) {
    return c.json({ ok: false, error: 'content is required' }, 400);
  }

  // Load conversation history for this thread
  const historyRows = await c.env.DB
    .prepare(
      `SELECT role, content FROM ai_messages
       WHERE thread_id = ? AND role IN ('user','assistant') ORDER BY id ASC`,
    )
    .bind(threadId)
    .all();

  const history = (historyRows.results as Array<{ role: string; content: string }>).map(
    (r) => ({ role: r.role as 'user' | 'assistant' | 'tool', content: r.content }),
  );

  // Build real Anthropic client from env secret — tests inject a vi.mock instead
  const anthropic = new Anthropic({ apiKey: c.env.ANTHROPIC_API_KEY });

  const agentOutput = await runAgentLoop(
    { threadId, program, userMessage: content, history },
    { db: c.env.DB },
    anthropic,
  );

  // Fetch updated messages for response
  const updatedMessages = await c.env.DB
    .prepare('SELECT * FROM ai_messages WHERE thread_id = ? ORDER BY id ASC')
    .bind(threadId)
    .all();

  // Fetch any pending actions created this turn
  const rawPendingActions = agentOutput.pendingActionIds.length > 0
    ? await c.env.DB
        .prepare(
          `SELECT * FROM ai_pending_actions WHERE id IN (${agentOutput.pendingActionIds.map(() => '?').join(',')})`,
        )
        .bind(...agentOutput.pendingActionIds)
        .all()
    : { results: [] };

  const pendingActions = await Promise.all(
    (rawPendingActions.results as Record<string, unknown>[]).map((a) =>
      enrichPendingAction(c.env, program, a),
    ),
  );

  return c.json({
    ok: true,
    messages: updatedMessages.results,
    pending_actions: pendingActions,
  });
});

// ── Pending Actions ───────────────────────────────────────────────────────────

/**
 * Enriches a pending action row with a real subject, recipient_count, and
 * body_preview so the approval UI shows exactly what will send — not just the
 * AI-authored summary string.  Errors are swallowed; missing fields degrade
 * gracefully to undefined so callers can fall back to summary.
 */
async function enrichPendingAction(
  env: Env,
  program: Program,
  action: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    const payload = JSON.parse(action.payload as string) as {
      subject?: string;
      body_text?: string;
      segment?: Record<string, unknown>;
    };
    const subject = payload.subject;
    const bodyPreview = payload.body_text?.slice(0, 200) ?? undefined;
    const segment = payload.segment ?? {};
    // resolveSegment counts recipients — call it just for the count
    const recipients = await resolveSegment(env, program, segment as Parameters<typeof resolveSegment>[2]);
    return { ...action, subject, recipient_count: recipients.length, body_preview: bodyPreview };
  } catch {
    return action;
  }
}

// GET /api/admin/ai/pending
aiRouter.get('/pending', async (c) => {
  const program = c.get('program');
  const actions = await c.env.DB
    .prepare(
      `SELECT * FROM ai_pending_actions
       WHERE program = ? AND status = 'pending'
       ORDER BY created_at DESC`,
    )
    .bind(program)
    .all();

  const enriched = await Promise.all(
    (actions.results as Record<string, unknown>[]).map((a) =>
      enrichPendingAction(c.env, program, a),
    ),
  );
  return c.json({ ok: true, pending_actions: enriched });
});

// POST /api/admin/ai/pending/:id/approve
// THE ONLY place an AI-proposed email actually executes.
//
// TOCTOU-safe: the status CAS (compare-and-swap) UPDATE runs BEFORE we build
// or send the campaign. Only the requester that wins changes===1 may proceed.
// If changes===0 someone else already claimed it → return 409 immediately.
aiRouter.post('/pending/:id/approve', async (c) => {
  const user = c.get('user');
  const program = c.get('program');
  const actionId = Number(c.req.param('id'));
  const now = nowIso();

  // First verify the action exists and belongs to this program (for a clean 404)
  const action = await c.env.DB
    .prepare(
      `SELECT * FROM ai_pending_actions WHERE id = ? AND program = ?`,
    )
    .bind(actionId, program)
    .first<{
      id: number;
      kind: 'send_campaign' | 'schedule_campaign';
      payload: string;
      program: string;
      status: string;
    }>();

  if (!action) {
    return c.json({ ok: false, error: 'Pending action not found' }, 404);
  }

  // Atomic CAS claim: UPDATE only succeeds when status is still 'pending' AND
  // program matches. Check meta.changes===1 to detect the race winner.
  const claimResult = await c.env.DB
    .prepare(
      `UPDATE ai_pending_actions
       SET status = 'executed', resolved_at = ?, resolved_by = ?
       WHERE id = ? AND program = ? AND status = 'pending'`,
    )
    .bind(now, user.id, actionId, program)
    .run();

  if (claimResult.meta.changes !== 1) {
    // Another concurrent approve already claimed it (or status was already resolved)
    return c.json({ ok: false, error: 'already resolved' }, 409);
  }

  // We won the CAS — now build and send. If an error occurs here the action
  // remains 'executed' (claimed). We do NOT un-claim to avoid reopening the race.
  const payload = JSON.parse(action.payload) as {
    subject?: string;
    body_html?: string;
    body_text?: string;
    segment?: Record<string, unknown>;
    scheduled_for?: string;
  };

  // Default body fields to empty strings if missing (defensive)
  const subject = payload.subject ?? '';
  const bodyHtml = payload.body_html ?? '';
  const bodyText = payload.body_text ?? '';
  const segment = payload.segment ?? {};

  // Build an email_campaigns row
  const campaignStatus = action.kind === 'schedule_campaign' ? 'scheduled' : 'draft';

  const campaignResult = await c.env.DB
    .prepare(
      `INSERT INTO email_campaigns
        (program, subject, body_html, body_text, segment, status,
         scheduled_for, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(
      program,
      subject,
      bodyHtml,
      bodyText,
      JSON.stringify(segment),
      campaignStatus,
      payload.scheduled_for ?? null,
      user.id,
      now,
    )
    .first<{ id: number }>();

  if (!campaignResult) {
    return c.json({ ok: false, error: 'Failed to create campaign' }, 500);
  }

  // For send_campaign: trigger immediate send via the P4 shared helper
  if (action.kind === 'send_campaign') {
    await sendCampaignById(c.env, campaignResult.id, program);
  }

  return c.json({ ok: true, campaign_id: campaignResult.id });
});

// POST /api/admin/ai/pending/:id/reject
aiRouter.post('/pending/:id/reject', async (c) => {
  const user = c.get('user');
  const program = c.get('program');
  const actionId = Number(c.req.param('id'));
  const now = nowIso();

  const action = await c.env.DB
    .prepare(
      `SELECT id, status FROM ai_pending_actions WHERE id = ? AND program = ?`,
    )
    .bind(actionId, program)
    .first<{ id: number; status: string }>();

  if (!action) {
    return c.json({ ok: false, error: 'Pending action not found' }, 404);
  }

  if (action.status !== 'pending') {
    return c.json({ ok: false, error: 'Action already resolved' }, 409);
  }

  await c.env.DB
    .prepare(
      `UPDATE ai_pending_actions
       SET status = 'rejected', resolved_at = ?, resolved_by = ?
       WHERE id = ?`,
    )
    .bind(now, user.id, actionId)
    .run();

  return c.json({ ok: true });
});
