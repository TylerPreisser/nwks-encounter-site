// functions/_api/ai/tools.ts
// AI tool definitions (schemas) and executors for the NWKS Encounter assistant.
//
// SAFETY CONTRACT:
//   - READ tools: query D1 read-only, program-scoped, never write anything.
//   - PROPOSE tools: insert exactly one ai_pending_actions row (status='pending').
//     They NEVER send email, NEVER touch email_campaigns, NEVER call any send fn.
//     It is structurally impossible for these functions to send email — they have
//     no access to the email module and no path that reaches it.

import type Anthropic from '@anthropic-ai/sdk';
import type { Program } from '../db.js';
import { nowIso } from '../db.js';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type ToolEnv = {
  db: D1Database;
  program: Program;
};

export type ProposeEnv = ToolEnv & { threadId: number };

/** Superset env passed to executeToolCall. */
export type FullToolEnv = ProposeEnv;

export type ToolResult = string; // JSON-stringified or plain text

export interface ProposeSendPayload {
  subject: string;
  body_html: string;
  body_text: string;
  segment: Record<string, unknown>;
}

export interface ProposeSchedulePayload extends ProposeSendPayload {
  scheduled_for: string; // ISO-8601
}

export interface PendingActionRef {
  pending_action_id: number;
  summary: string;
}

// ---------------------------------------------------------------------------
// READ tool schemas
// ---------------------------------------------------------------------------

export const READ_TOOLS: Anthropic.Tool[] = [
  {
    name: 'query_counts',
    description:
      'Return aggregate registration counts for the current program/event. ' +
      'Call this when the admin asks "how many attendees", "how many servers", ' +
      '"how many first-timers", or similar summary questions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        event_id: {
          type: 'number',
          description: 'D1 event id to filter by. Omit to use the current event.',
        },
        role: {
          type: 'string',
          enum: ['attendee', 'server'],
          description: 'Filter by role. Omit for all roles combined.',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'list_registrations',
    description:
      'Return a list of registrations (up to 50). Use for "who signed up", ' +
      '"list all servers", or when the admin wants a roster.',
    input_schema: {
      type: 'object' as const,
      properties: {
        event_id: { type: 'number', description: 'Filter by event id.' },
        role: {
          type: 'string',
          enum: ['attendee', 'server'],
          description: 'Filter by role.',
        },
        launch_location: {
          type: 'string',
          description: 'Filter by launch location string (exact match).',
        },
        limit: {
          type: 'number',
          description: 'Max rows to return. Default 20, max 50.',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'get_person_history',
    description:
      'Return the full profile and registration history for one person by id. ' +
      'Use when the admin asks about a specific person.',
    input_schema: {
      type: 'object' as const,
      properties: {
        person_id: { type: 'number', description: 'D1 people.id value.' },
      },
      required: ['person_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_launch_locations',
    description:
      'Return the distinct launch locations and registration counts for the ' +
      'current program. Use for logistics questions like "how many from each ' +
      'location" or "which locations have the most signups".',
    input_schema: {
      type: 'object' as const,
      properties: {
        event_id: { type: 'number', description: 'Filter by event id.' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'event_summary',
    description:
      'Return event details for this program: dates, launch locations, ' +
      'registration open/closed flags, attendee + server count totals. ' +
      'Pass event_id to query a specific event; omit to use the current ' +
      '(is_current=1) event. Call first when the admin asks a general question ' +
      'about the upcoming event.',
    input_schema: {
      type: 'object' as const,
      properties: {
        event_id: {
          type: 'number',
          description: 'D1 event id to query. Omit to use the current event.',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
];

// ---------------------------------------------------------------------------
// PROPOSE tool schemas
// ---------------------------------------------------------------------------

export const PROPOSE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'propose_send_campaign',
    description:
      'Draft and propose an immediate email campaign for human approval. ' +
      'NEVER use this to actually send email — it only creates a pending action ' +
      'that an admin must approve. Call when the admin asks to send a blast, ' +
      'a reminder, or any bulk email.',
    input_schema: {
      type: 'object' as const,
      properties: {
        subject: { type: 'string', description: 'Email subject line.' },
        body_html: { type: 'string', description: 'HTML body of the email.' },
        body_text: { type: 'string', description: 'Plain-text body fallback.' },
        segment: {
          type: 'object',
          description:
            'Audience filter. May include: event_id (number), role ("attendee"|"server"), ' +
            'launch_location (string), first_timers_only (boolean), status (string).',
          additionalProperties: true,
        },
        summary: {
          type: 'string',
          description:
            'One-sentence human-readable summary of what this email will do, ' +
            'shown in the approval UI. E.g. "Send packing list to all 47 attendees."',
        },
      },
      required: ['subject', 'body_html', 'body_text', 'summary'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_schedule_campaign',
    description:
      'Draft and propose a scheduled email campaign for human approval. ' +
      'NEVER use this to actually schedule email — it creates a pending action. ' +
      'Call when the admin asks to schedule a reminder or blast for a future time.',
    input_schema: {
      type: 'object' as const,
      properties: {
        subject: { type: 'string' },
        body_html: { type: 'string' },
        body_text: { type: 'string' },
        segment: { type: 'object', additionalProperties: true },
        scheduled_for: {
          type: 'string',
          description: 'ISO-8601 UTC datetime for when to send.',
        },
        summary: {
          type: 'string',
          description:
            'One-sentence summary for the approval UI. E.g. "Schedule reminder for Aug 1 at 9am to all servers."',
        },
      },
      required: ['subject', 'body_html', 'body_text', 'scheduled_for', 'summary'],
      additionalProperties: false,
    },
  },
];

export const ALL_TOOLS: Anthropic.Tool[] = [...READ_TOOLS, ...PROPOSE_TOOLS];

// ---------------------------------------------------------------------------
// READ tool executor
// ---------------------------------------------------------------------------

/**
 * Execute a READ tool. All queries are scoped to env.program.
 * This function never writes to any table.
 */
export async function executeReadTool(
  name: string,
  input: Record<string, unknown>,
  env: ToolEnv,
): Promise<string> {
  const { db, program } = env;

  switch (name) {
    case 'query_counts': {
      const eventId = input.event_id as number | undefined;
      const role = input.role as string | undefined;

      let sql = `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN r.role = 'attendee' THEN 1 ELSE 0 END) as attendees,
        SUM(CASE WHEN r.role = 'server' THEN 1 ELSE 0 END) as servers,
        SUM(CASE WHEN p.times_attended = 0 THEN 1 ELSE 0 END) as first_timers
        FROM registrations r
        JOIN people p ON p.id = r.person_id
        WHERE r.program = ?`;
      const params: unknown[] = [program];

      if (eventId) { sql += ' AND r.event_id = ?'; params.push(eventId); }
      if (role) { sql += ' AND r.role = ?'; params.push(role); }

      const row = await db.prepare(sql).bind(...params).first();
      return JSON.stringify(row);
    }

    case 'list_registrations': {
      const eventId = input.event_id as number | undefined;
      const role = input.role as string | undefined;
      const loc = input.launch_location as string | undefined;
      const limit = Math.min((input.limit as number | undefined) ?? 20, 50);

      let sql = `SELECT r.id, r.role, r.first_name, r.last_name, r.email,
        r.launch_location, r.shirt_size, r.church, r.status, r.created_at
        FROM registrations r WHERE r.program = ?`;
      const params: unknown[] = [program];

      if (eventId) { sql += ' AND r.event_id = ?'; params.push(eventId); }
      if (role) { sql += ' AND r.role = ?'; params.push(role); }
      if (loc) { sql += ' AND r.launch_location = ?'; params.push(loc); }

      sql += ' ORDER BY r.created_at DESC LIMIT ?';
      params.push(limit);

      const rows = await db.prepare(sql).bind(...params).all();
      return JSON.stringify(rows.results);
    }

    case 'get_person_history': {
      const personId = input.person_id as number;
      const person = await db
        .prepare('SELECT * FROM people WHERE id = ? AND program = ?')
        .bind(personId, program)
        .first();
      if (!person) return JSON.stringify({ error: 'Person not found.' });

      const regs = await db
        .prepare(
          `SELECT r.id, r.role, r.event_id, r.launch_location, r.shirt_size,
           r.status, r.created_at FROM registrations r
           WHERE r.person_id = ? AND r.program = ? ORDER BY r.created_at DESC`,
        )
        .bind(personId, program)
        .all();

      return JSON.stringify({ person, registrations: regs.results });
    }

    case 'list_launch_locations': {
      const eventId = input.event_id as number | undefined;
      let sql = `SELECT launch_location, COUNT(*) as count
        FROM registrations WHERE program = ? AND launch_location IS NOT NULL`;
      const params: unknown[] = [program];

      if (eventId) { sql += ' AND event_id = ?'; params.push(eventId); }
      sql += ' GROUP BY launch_location ORDER BY count DESC';

      const rows = await db.prepare(sql).bind(...params).all();
      return JSON.stringify(rows.results);
    }

    case 'event_summary': {
      const eventId = input.event_id as number | undefined;
      // Honor a supplied event_id; fall back to the current (is_current=1) event.
      const event = eventId
        ? await db
            .prepare('SELECT * FROM events WHERE id = ? AND program = ? LIMIT 1')
            .bind(eventId, program)
            .first()
        : await db
            .prepare('SELECT * FROM events WHERE program = ? AND is_current = 1 LIMIT 1')
            .bind(program)
            .first();
      if (!event) return JSON.stringify({ error: 'No matching event found.' });

      const counts = await db
        .prepare(
          `SELECT
            COUNT(*) as total_registrations,
            SUM(CASE WHEN role='attendee' THEN 1 ELSE 0 END) as attendees,
            SUM(CASE WHEN role='server'   THEN 1 ELSE 0 END) as servers
           FROM registrations WHERE program = ? AND event_id = ?`,
        )
        .bind(program, (event as { id: number }).id)
        .first();

      return JSON.stringify({ event, counts });
    }

    default:
      return JSON.stringify({ error: `Unknown read tool: ${name}` });
  }
}

// ---------------------------------------------------------------------------
// PROPOSE tool executor
// ---------------------------------------------------------------------------

/**
 * Execute a PROPOSE tool. Inserts exactly one ai_pending_actions row with
 * status='pending'. NEVER sends email. NEVER touches email_campaigns.
 * NEVER calls any send function. The only mutation is INSERT into ai_pending_actions.
 */
export async function executeProposeToolAndPersist(
  name: string,
  input: Record<string, unknown>,
  env: ProposeEnv,
): Promise<string> {
  const { db, program, threadId } = env;

  if (name !== 'propose_send_campaign' && name !== 'propose_schedule_campaign') {
    return JSON.stringify({ error: `Unknown propose tool: ${name}` });
  }

  const kind: 'send_campaign' | 'schedule_campaign' =
    name === 'propose_send_campaign' ? 'send_campaign' : 'schedule_campaign';

  const summary = (input.summary as string) || `Proposed ${kind}`;
  const payload = JSON.stringify(input); // full tool input stored for approve endpoint

  const result = await db
    .prepare(
      `INSERT INTO ai_pending_actions
        (thread_id, program, kind, summary, payload, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)
       RETURNING id`,
    )
    .bind(threadId, program, kind, summary, payload, nowIso())
    .first<{ id: number }>();

  if (!result) throw new Error('Failed to insert pending action.');

  return JSON.stringify({
    pending_action_id: result.id,
    summary,
    message:
      'Pending action created. The admin must review and approve this before any email is sent.',
  });
}

// ---------------------------------------------------------------------------
// Unified dispatcher
// ---------------------------------------------------------------------------

/**
 * Route a tool call to the correct executor.
 * Returns an error JSON string for unrecognized tool names.
 */
export async function executeToolCall(
  name: string,
  input: Record<string, unknown>,
  env: FullToolEnv,
): Promise<string> {
  if (READ_TOOLS.some((t) => t.name === name)) {
    return executeReadTool(name, input, env);
  }
  if (PROPOSE_TOOLS.some((t) => t.name === name)) {
    return executeProposeToolAndPersist(name, input, env);
  }
  return JSON.stringify({ error: `Tool not recognized: ${name}` });
}
