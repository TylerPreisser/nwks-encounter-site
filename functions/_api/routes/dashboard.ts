// functions/_api/routes/dashboard.ts — Admin dashboard stats endpoint

import { Hono } from 'hono';
import type { Env } from '../app';
import { requireAuth, requireProgram } from '../auth';
import type { Program } from '../db';

export const dashboardRouter = new Hono<{ Bindings: Env }>();

dashboardRouter.use('*', requireAuth(), requireProgram());

dashboardRouter.get('/', async (c) => {
  const program = c.get('program') as Program;
  const db = c.env.DB;

  // Resolve the current event for this program
  const event = await db
    .prepare(
      `SELECT id, year, title, start_date, end_date
       FROM events
       WHERE program = ? AND is_current = 1
       LIMIT 1`
    )
    .bind(program)
    .first<{ id: number; year: number; title: string | null; start_date: string | null; end_date: string | null }>();

  // Email sent count is always computed regardless of whether there is a current event
  const emailRow = await db
    .prepare(
      `SELECT COUNT(*) as n
       FROM email_log
       WHERE program = ? AND status IN ('sent', 'delivered')`
    )
    .bind(program)
    .first<{ n: number }>();

  const emailSentCount = emailRow?.n ?? 0;

  // Inbox / mailbox monitor: inbound emails (stored via the email worker as
  // testimonies) that have NOT yet been handled — i.e. need a response.
  // Counts this program's items plus unassigned inbound mail.
  const NEEDS_ATTENTION_STATUSES = [
    'not_received',
    'draft_1_awaiting', 'draft_1_review',
    'draft_2_awaiting', 'draft_2_review',
    'draft_3_awaiting', 'draft_3_review',
  ];
  const inboxPlaceholders = NEEDS_ATTENTION_STATUSES.map(() => '?').join(',');
  const [inboxProgramRow, inboxUnassignedRow] = await Promise.all([
    db.prepare(
      `SELECT COUNT(*) AS n FROM testimonies
       WHERE program = ? AND status IN (${inboxPlaceholders})`
    ).bind(program, ...NEEDS_ATTENTION_STATUSES).first<{ n: number }>(),
    db.prepare(
      `SELECT COUNT(*) AS n FROM testimonies
       WHERE program IS NULL AND status IN (${inboxPlaceholders})`
    ).bind(...NEEDS_ATTENTION_STATUSES).first<{ n: number }>(),
  ]);
  const inboxCount = (inboxProgramRow?.n ?? 0) + (inboxUnassignedRow?.n ?? 0);

  if (!event) {
    return c.json({
      ok: true,
      stats: {
        attendee_count: 0,
        server_count: 0,
        first_timers: 0,
        by_launch_location: [],
        by_shirt_size: [],
        recent_registrations: [],
        email_sent_count: emailSentCount,
        inbox_count: inboxCount,
        upcoming_event: null,
      },
    });
  }

  const eventId = event.id;

  // Parallel queries for counts
  const [attendeeRow, serverRow, firstTimerRow] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) as n
         FROM registrations
         WHERE program = ? AND event_id = ? AND role = 'attendee'`
      )
      .bind(program, eventId)
      .first<{ n: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) as n
         FROM registrations
         WHERE program = ? AND event_id = ? AND role = 'server'`
      )
      .bind(program, eventId)
      .first<{ n: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) as n
         FROM registrations r
         JOIN people p ON p.id = r.person_id
         WHERE r.program = ? AND r.event_id = ? AND r.role = 'attendee' AND p.times_attended <= 1`
      )
      .bind(program, eventId)
      .first<{ n: number }>(),
  ]);

  // Breakdown by launch location
  const locationResult = await db
    .prepare(
      `SELECT launch_location AS location, COUNT(*) AS count
       FROM registrations
       WHERE program = ? AND event_id = ? AND launch_location IS NOT NULL
       GROUP BY launch_location
       ORDER BY count DESC`
    )
    .bind(program, eventId)
    .all<{ location: string; count: number }>();

  // Breakdown by shirt size
  const shirtResult = await db
    .prepare(
      `SELECT shirt_size AS size, COUNT(*) AS count
       FROM registrations
       WHERE program = ? AND event_id = ? AND shirt_size IS NOT NULL
       GROUP BY shirt_size
       ORDER BY count DESC`
    )
    .bind(program, eventId)
    .all<{ size: string; count: number }>();

  // Recent registrations (last 10)
  const recentResult = await db
    .prepare(
      `SELECT r.id, r.first_name, r.last_name, r.role, r.created_at
       FROM registrations r
       WHERE r.program = ? AND r.event_id = ?
       ORDER BY r.created_at DESC
       LIMIT 10`
    )
    .bind(program, eventId)
    .all<{ id: number; first_name: string; last_name: string; role: string; created_at: string }>();

  return c.json({
    ok: true,
    stats: {
      attendee_count: attendeeRow?.n ?? 0,
      server_count: serverRow?.n ?? 0,
      first_timers: firstTimerRow?.n ?? 0,
      by_launch_location: locationResult.results,
      by_shirt_size: shirtResult.results,
      recent_registrations: recentResult.results,
      email_sent_count: emailSentCount,
      inbox_count: inboxCount,
      upcoming_event: event,
    },
  });
});
