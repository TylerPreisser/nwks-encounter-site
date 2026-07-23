// functions/_api/__tests__/ai.tools.test.ts
// TDD integration tests for AI tool definitions + executors (Task 1).

import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { applyMigrations } from './setup';
import {
  READ_TOOLS,
  PROPOSE_TOOLS,
  ALL_TOOLS,
  executeReadTool,
  executeProposeToolAndPersist,
  executeToolCall,
} from '../ai/tools.js';
import type { FullToolEnv } from '../ai/tools.js';

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

const DB = () => (env as unknown as { DB: D1Database }).DB;

async function seedEventAndPerson(): Promise<{ eventId: number; personId: number }> {
  const db = DB();
  const now = '2026-01-01T00:00:00.000Z';

  // Use INSERT OR IGNORE so repeated beforeEach calls don't duplicate
  await db
    .prepare(
      `INSERT OR IGNORE INTO admin_users (email, name, password_hash, role, created_at)
       VALUES ('aitoolsadmin@test.com', 'Admin', 'x', 'admin', ?)`,
    )
    .bind(now)
    .run();

  // Use INSERT OR REPLACE to handle the seed migration that already inserted mens/2026
  await db
    .prepare(
      `INSERT OR REPLACE INTO events
         (program, year, title, start_date, end_date, launch_locations,
          attendee_registration_open, server_registration_open, is_current,
          created_at, updated_at)
       VALUES ('mens', 2026, 'Mens Encounter', '2026-08-06', '2026-08-08',
               '["Hays","Colby"]', 1, 1, 1, ?, ?)`,
    )
    .bind(now, now)
    .run();

  const eventRow = await db
    .prepare(`SELECT id FROM events WHERE program = 'mens' AND year = 2026`)
    .first<{ id: number }>();
  const eventId = eventRow!.id;

  // Use a unique-per-run email to avoid UNIQUE constraint on repeated seeds
  const email = `john_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
  const { meta: pMeta } = await db
    .prepare(
      `INSERT INTO people
         (program, first_name, last_name, email, times_attended, times_served,
          created_at, updated_at)
       VALUES ('mens', 'John', 'Doe', ?, 0, 0, ?, ?)`,
    )
    .bind(email, now, now)
    .run();

  const personId = pMeta.last_row_id as number;

  await db
    .prepare(
      `INSERT INTO registrations
         (program, event_id, person_id, role, first_name, last_name,
          launch_location, status, created_at)
       VALUES ('mens', ?, ?, 'attendee', 'John', 'Doe', 'Hays', 'registered', ?)`,
    )
    .bind(eventId, personId, now)
    .run();

  return { eventId, personId };
}

async function seedThread(): Promise<number> {
  const db = DB();
  const now = '2026-01-01T00:00:00.000Z';
  // Look up the admin user inserted by seedEventAndPerson
  const admin = await db
    .prepare(`SELECT id FROM admin_users WHERE email = 'aitoolsadmin@test.com'`)
    .first<{ id: number }>();
  const adminId = admin?.id ?? null;
  const { meta } = await db
    .prepare(
      `INSERT INTO ai_threads (program, created_by, title, created_at, updated_at)
       VALUES ('mens', ?, 'Test thread', ?, ?)`,
    )
    .bind(adminId, now, now)
    .run();
  return meta.last_row_id as number;
}

// ---------------------------------------------------------------------------
// Schema shape tests
// ---------------------------------------------------------------------------

describe('tool schemas', () => {
  it('READ_TOOLS contains 5 tools with correct names', () => {
    const names = READ_TOOLS.map((t) => t.name);
    expect(names).toEqual([
      'query_counts',
      'list_registrations',
      'get_person_history',
      'list_launch_locations',
      'event_summary',
    ]);
  });

  it('PROPOSE_TOOLS contains 2 tools with correct names', () => {
    const names = PROPOSE_TOOLS.map((t) => t.name);
    expect(names).toEqual(['propose_send_campaign', 'propose_schedule_campaign']);
  });

  it('ALL_TOOLS is READ + PROPOSE concatenated (7 total)', () => {
    expect(ALL_TOOLS).toHaveLength(7);
    expect(ALL_TOOLS.map((t) => t.name)).toContain('query_counts');
    expect(ALL_TOOLS.map((t) => t.name)).toContain('propose_send_campaign');
  });

  it('every tool has name, description, and input_schema', () => {
    for (const tool of ALL_TOOLS) {
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(tool.input_schema).toBeDefined();
      expect((tool.input_schema as { type: string }).type).toBe('object');
    }
  });
});

// ---------------------------------------------------------------------------
// executeReadTool tests
// ---------------------------------------------------------------------------

describe('executeReadTool', () => {
  let toolEnv: Pick<FullToolEnv, 'db' | 'program'>;
  let eventId: number;
  let personId: number;

  beforeEach(async () => {
    await applyMigrations({ DB: DB() });
    ({ eventId, personId } = await seedEventAndPerson());
    toolEnv = { db: DB(), program: 'mens' };
  });

  // query_counts
  it('query_counts returns aggregate totals for seeded data', async () => {
    const result = await executeReadTool('query_counts', {}, toolEnv);
    const parsed = JSON.parse(result);
    expect(parsed.total).toBe(1);
    expect(parsed.attendees).toBe(1);
    expect(parsed.servers).toBe(0);
    expect(parsed.first_timers).toBe(1); // john has times_attended=0
  });

  it('query_counts filters by role=server (expects 0)', async () => {
    const result = await executeReadTool('query_counts', { role: 'server' }, toolEnv);
    const parsed = JSON.parse(result);
    expect(parsed.total).toBe(0);
  });

  it('query_counts filters by event_id', async () => {
    const result = await executeReadTool('query_counts', { event_id: eventId }, toolEnv);
    const parsed = JSON.parse(result);
    expect(parsed.total).toBe(1);
  });

  it('query_counts program-scoped: womens sees 0 rows', async () => {
    const result = await executeReadTool('query_counts', {}, { ...toolEnv, program: 'women' });
    const parsed = JSON.parse(result);
    expect(parsed.total).toBe(0);
  });

  it('query_counts does NOT write anything (no email_log rows)', async () => {
    await executeReadTool('query_counts', {}, toolEnv);
    const logs = await DB().prepare('SELECT * FROM email_log').all();
    expect(logs.results).toHaveLength(0);
  });

  // list_registrations
  it('list_registrations returns rows for program', async () => {
    const result = await executeReadTool('list_registrations', {}, toolEnv);
    const rows = JSON.parse(result);
    expect(rows).toHaveLength(1);
    expect(rows[0].first_name).toBe('John');
  });

  it('list_registrations respects program isolation (womens sees nothing)', async () => {
    const result = await executeReadTool(
      'list_registrations',
      {},
      { ...toolEnv, program: 'women' },
    );
    expect(JSON.parse(result)).toHaveLength(0);
  });

  it('list_registrations filters by role', async () => {
    const result = await executeReadTool('list_registrations', { role: 'server' }, toolEnv);
    expect(JSON.parse(result)).toHaveLength(0);
  });

  it('list_registrations filters by launch_location', async () => {
    const result = await executeReadTool(
      'list_registrations',
      { launch_location: 'Hays' },
      toolEnv,
    );
    expect(JSON.parse(result)).toHaveLength(1);
  });

  it('list_registrations filters by launch_location (no match)', async () => {
    const result = await executeReadTool(
      'list_registrations',
      { launch_location: 'NoWhere' },
      toolEnv,
    );
    expect(JSON.parse(result)).toHaveLength(0);
  });

  it('list_registrations caps limit at 50', async () => {
    // seed 55 more registrations
    const db = DB();
    const now = '2026-01-01T00:00:00.000Z';
    for (let i = 0; i < 55; i++) {
      await db
        .prepare(
          `INSERT INTO people
             (program, first_name, last_name, email, times_attended, times_served,
              created_at, updated_at)
           VALUES ('mens', 'Extra', ?, ?, 0, 0, ?, ?)`,
        )
        .bind(`Person${i}`, `extra${i}@example.com`, now, now)
        .run();
      const pRow = await db
        .prepare(`SELECT id FROM people WHERE email = ?`)
        .bind(`extra${i}@example.com`)
        .first<{ id: number }>();
      await db
        .prepare(
          `INSERT INTO registrations
             (program, event_id, person_id, role, first_name, last_name, status, created_at)
           VALUES ('mens', ?, ?, 'attendee', 'Extra', ?, 'registered', ?)`,
        )
        .bind(eventId, pRow!.id, `Person${i}`, now)
        .run();
    }
    const result = await executeReadTool('list_registrations', { limit: 999 }, toolEnv);
    const rows = JSON.parse(result);
    expect(rows.length).toBeLessThanOrEqual(50);
  });

  it('list_registrations does NOT write anything', async () => {
    await executeReadTool('list_registrations', {}, toolEnv);
    const campaigns = await DB().prepare('SELECT * FROM email_campaigns').all();
    expect(campaigns.results).toHaveLength(0);
  });

  // get_person_history
  it('get_person_history returns person + registrations', async () => {
    const result = await executeReadTool(
      'get_person_history',
      { person_id: personId },
      toolEnv,
    );
    const parsed = JSON.parse(result);
    expect(parsed.person.first_name).toBe('John');
    expect(parsed.registrations).toHaveLength(1);
  });

  it('get_person_history returns error for wrong program (isolation)', async () => {
    const result = await executeReadTool(
      'get_person_history',
      { person_id: personId },
      { ...toolEnv, program: 'women' },
    );
    expect(JSON.parse(result).error).toBeTruthy();
  });

  it('get_person_history returns error for unknown person_id', async () => {
    const result = await executeReadTool(
      'get_person_history',
      { person_id: 9999 },
      toolEnv,
    );
    expect(JSON.parse(result).error).toBeTruthy();
  });

  // list_launch_locations
  it('list_launch_locations returns grouped counts', async () => {
    const result = await executeReadTool('list_launch_locations', {}, toolEnv);
    const rows = JSON.parse(result);
    expect(rows).toHaveLength(1);
    expect(rows[0].launch_location).toBe('Hays');
    expect(rows[0].count).toBe(1);
  });

  it('list_launch_locations is program-scoped (womens sees nothing)', async () => {
    const result = await executeReadTool(
      'list_launch_locations',
      {},
      { ...toolEnv, program: 'women' },
    );
    expect(JSON.parse(result)).toHaveLength(0);
  });

  it('list_launch_locations filters by event_id', async () => {
    const result = await executeReadTool(
      'list_launch_locations',
      { event_id: eventId },
      toolEnv,
    );
    const rows = JSON.parse(result);
    expect(rows[0].launch_location).toBe('Hays');
  });

  // event_summary
  it('event_summary returns event + counts', async () => {
    const result = await executeReadTool('event_summary', {}, toolEnv);
    const parsed = JSON.parse(result);
    expect(parsed.event.title).toBe('Mens Encounter');
    expect(parsed.counts.total_registrations).toBe(1);
    expect(parsed.counts.attendees).toBe(1);
    expect(parsed.counts.servers).toBe(0);
  });

  it('event_summary returns error when no current event for program', async () => {
    // Clear is_current on the womens event so there is no current event for that program
    await DB()
      .prepare(`UPDATE events SET is_current = 0 WHERE program = 'women'`)
      .run();
    const result = await executeReadTool(
      'event_summary',
      {},
      { ...toolEnv, program: 'women' },
    );
    expect(JSON.parse(result).error).toBeTruthy();
  });

  // unknown tool
  it('unknown read tool name returns error JSON', async () => {
    const result = await executeReadTool('nonexistent_tool', {}, toolEnv);
    expect(JSON.parse(result).error).toMatch(/Unknown read tool/);
  });
});

// ---------------------------------------------------------------------------
// executeProposeToolAndPersist tests
// ---------------------------------------------------------------------------

describe('executeProposeToolAndPersist', () => {
  let proposeEnv: FullToolEnv;
  let threadId: number;

  beforeEach(async () => {
    await applyMigrations({ DB: DB() });
    await seedEventAndPerson();
    threadId = await seedThread();
    proposeEnv = { db: DB(), program: 'mens', threadId };
  });

  it('propose_send_campaign inserts exactly one pending action and returns id', async () => {
    const result = await executeProposeToolAndPersist(
      'propose_send_campaign',
      {
        subject: 'Test blast',
        body_html: '<p>Hi</p>',
        body_text: 'Hi',
        summary: 'Send test blast to all attendees.',
      },
      proposeEnv,
    );
    const parsed = JSON.parse(result);
    expect(parsed.pending_action_id).toBeGreaterThan(0);
    expect(parsed.summary).toBe('Send test blast to all attendees.');

    const rows = await DB().prepare('SELECT * FROM ai_pending_actions').all();
    expect(rows.results).toHaveLength(1);

    const row = rows.results[0] as Record<string, unknown>;
    expect(row.kind).toBe('send_campaign');
    expect(row.status).toBe('pending');
    expect(row.program).toBe('mens');
    expect(row.thread_id).toBe(threadId);
  });

  it('propose_send_campaign stores full payload as JSON', async () => {
    await executeProposeToolAndPersist(
      'propose_send_campaign',
      {
        subject: 'Payload test',
        body_html: '<p>x</p>',
        body_text: 'x',
        segment: { role: 'attendee', event_id: 1 },
        summary: 'Payload test.',
      },
      proposeEnv,
    );
    const row = await DB()
      .prepare(`SELECT payload FROM ai_pending_actions LIMIT 1`)
      .first<{ payload: string }>();
    const payload = JSON.parse(row!.payload);
    expect(payload.subject).toBe('Payload test');
    expect(payload.segment.role).toBe('attendee');
  });

  it('propose_send_campaign DOES NOT write to email_campaigns', async () => {
    await executeProposeToolAndPersist(
      'propose_send_campaign',
      {
        subject: 'Should not send',
        body_html: '<p>x</p>',
        body_text: 'x',
        summary: 'Test.',
      },
      proposeEnv,
    );
    const campaigns = await DB().prepare('SELECT * FROM email_campaigns').all();
    expect(campaigns.results).toHaveLength(0);
  });

  it('propose_send_campaign DOES NOT write to email_log', async () => {
    await executeProposeToolAndPersist(
      'propose_send_campaign',
      {
        subject: 'Should not log',
        body_html: '<p>x</p>',
        body_text: 'x',
        summary: 'Test.',
      },
      proposeEnv,
    );
    const logs = await DB().prepare('SELECT * FROM email_log').all();
    expect(logs.results).toHaveLength(0);
  });

  it('propose_schedule_campaign inserts kind=schedule_campaign', async () => {
    const result = await executeProposeToolAndPersist(
      'propose_schedule_campaign',
      {
        subject: 'Reminder',
        body_html: '<p>Reminder</p>',
        body_text: 'Reminder',
        scheduled_for: '2026-08-01T09:00:00.000Z',
        summary: 'Schedule reminder for Aug 1.',
      },
      proposeEnv,
    );
    const parsed = JSON.parse(result);
    expect(parsed.pending_action_id).toBeGreaterThan(0);

    const row = await DB()
      .prepare('SELECT * FROM ai_pending_actions WHERE id = ?')
      .bind(parsed.pending_action_id)
      .first<Record<string, unknown>>();
    expect(row!.kind).toBe('schedule_campaign');
    expect(row!.status).toBe('pending');
  });

  it('propose_schedule_campaign stores scheduled_for in payload', async () => {
    const result = await executeProposeToolAndPersist(
      'propose_schedule_campaign',
      {
        subject: 'Sched',
        body_html: '<p>S</p>',
        body_text: 'S',
        scheduled_for: '2026-08-01T09:00:00.000Z',
        summary: 'Scheduled test.',
      },
      proposeEnv,
    );
    const parsed = JSON.parse(result);
    const row = await DB()
      .prepare('SELECT payload FROM ai_pending_actions WHERE id = ?')
      .bind(parsed.pending_action_id)
      .first<{ payload: string }>();
    const payload = JSON.parse(row!.payload);
    expect(payload.scheduled_for).toBe('2026-08-01T09:00:00.000Z');
  });

  it('propose_schedule_campaign DOES NOT write to email_campaigns', async () => {
    await executeProposeToolAndPersist(
      'propose_schedule_campaign',
      {
        subject: 'No campaign',
        body_html: '<p>x</p>',
        body_text: 'x',
        scheduled_for: '2026-08-01T09:00:00.000Z',
        summary: 'Test schedule.',
      },
      proposeEnv,
    );
    const campaigns = await DB().prepare('SELECT * FROM email_campaigns').all();
    expect(campaigns.results).toHaveLength(0);
  });

  it('propose_schedule_campaign DOES NOT write to email_log', async () => {
    await executeProposeToolAndPersist(
      'propose_schedule_campaign',
      {
        subject: 'No log',
        body_html: '<p>x</p>',
        body_text: 'x',
        scheduled_for: '2026-08-01T09:00:00.000Z',
        summary: 'Test schedule.',
      },
      proposeEnv,
    );
    const logs = await DB().prepare('SELECT * FROM email_log').all();
    expect(logs.results).toHaveLength(0);
  });

  it('propose tools are program-scoped (program stored on pending action row)', async () => {
    const result = await executeProposeToolAndPersist(
      'propose_send_campaign',
      {
        subject: 'Scoped',
        body_html: '<p>x</p>',
        body_text: 'x',
        summary: 'Mens only.',
      },
      { ...proposeEnv, program: 'mens' },
    );
    const parsed = JSON.parse(result);
    const row = await DB()
      .prepare('SELECT program FROM ai_pending_actions WHERE id = ?')
      .bind(parsed.pending_action_id)
      .first<{ program: string }>();
    expect(row!.program).toBe('mens');
  });

  it('unknown propose tool name returns error JSON', async () => {
    const result = await executeProposeToolAndPersist(
      'propose_unknown_action',
      { summary: 'x' },
      proposeEnv,
    );
    expect(JSON.parse(result).error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// executeToolCall dispatcher tests
// ---------------------------------------------------------------------------

describe('executeToolCall dispatcher', () => {
  let fullEnv: FullToolEnv;
  let eventId: number;

  beforeEach(async () => {
    await applyMigrations({ DB: DB() });
    ({ eventId } = await seedEventAndPerson());
    const threadId = await seedThread();
    fullEnv = { db: DB(), program: 'mens', threadId };
  });

  it('routes READ tool (query_counts) correctly', async () => {
    const result = await executeToolCall('query_counts', {}, fullEnv);
    const parsed = JSON.parse(result);
    expect(parsed.total).toBe(1);
  });

  it('routes READ tool (event_summary) correctly', async () => {
    const result = await executeToolCall('event_summary', {}, fullEnv);
    const parsed = JSON.parse(result);
    expect(parsed.event.title).toBe('Mens Encounter');
  });

  it('routes PROPOSE tool (propose_send_campaign) correctly', async () => {
    const result = await executeToolCall(
      'propose_send_campaign',
      {
        subject: 'Via dispatcher',
        body_html: '<p>x</p>',
        body_text: 'x',
        summary: 'Test dispatcher.',
      },
      fullEnv,
    );
    const parsed = JSON.parse(result);
    expect(parsed.pending_action_id).toBeGreaterThan(0);
    // verify nothing went to email tables
    const campaigns = await DB().prepare('SELECT * FROM email_campaigns').all();
    expect(campaigns.results).toHaveLength(0);
  });

  it('routes PROPOSE tool (propose_schedule_campaign) correctly', async () => {
    const result = await executeToolCall(
      'propose_schedule_campaign',
      {
        subject: 'Sched via dispatcher',
        body_html: '<p>x</p>',
        body_text: 'x',
        scheduled_for: '2026-09-01T09:00:00.000Z',
        summary: 'Test schedule dispatcher.',
      },
      fullEnv,
    );
    const parsed = JSON.parse(result);
    expect(parsed.pending_action_id).toBeGreaterThan(0);
    const row = await DB()
      .prepare('SELECT kind FROM ai_pending_actions WHERE id = ?')
      .bind(parsed.pending_action_id)
      .first<{ kind: string }>();
    expect(row!.kind).toBe('schedule_campaign');
  });

  it('returns error JSON for unrecognized tool name', async () => {
    const result = await executeToolCall('delete_everything', {}, fullEnv);
    const parsed = JSON.parse(result);
    expect(parsed.error).toMatch(/Tool not recognized/);
  });

  it('READ tools never write to email_log even via dispatcher', async () => {
    await executeToolCall('list_registrations', {}, fullEnv);
    await executeToolCall('list_launch_locations', {}, fullEnv);
    await executeToolCall('event_summary', {}, fullEnv);
    const logs = await DB().prepare('SELECT * FROM email_log').all();
    expect(logs.results).toHaveLength(0);
  });

  it('eventId filter passed through dispatcher (list_registrations)', async () => {
    const result = await executeToolCall(
      'list_registrations',
      { event_id: eventId },
      fullEnv,
    );
    const rows = JSON.parse(result);
    expect(rows).toHaveLength(1);
  });
});
