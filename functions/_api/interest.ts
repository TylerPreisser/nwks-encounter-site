// functions/_api/interest.ts
// The Express Interest waitlist — a STANDING list, not a per-encounter one.
//
// Someone who raises their hand stays on the list until they actually register
// (or an admin removes them). Whenever a new encounter becomes current — via
// the rollover OR by simply switching the current encounter to one that already
// exists — everyone still waiting is emailed an invitation to sign up.
//
// Design: docs/superpowers/specs/2026-08-01-attendees-seasons-interest-queue-design.md
// (amended 2026-08-02 per operator feedback; see 0030_interest_standing_list.sql)

import type { Env } from './app';
import { nowIso } from './db';
import { sendEmail, renderTemplate } from './email';
import { displayName } from './seasons';
import type { Program } from './db';

/** Public site origin used to build the register link in invite emails. */
const SITE_ORIGIN = 'https://nwks-encounter-site.pages.dev';

export type InterestRole = 'attendee' | 'server';

export interface InterestEntry {
  id: number;
  role: InterestRole;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
}

export interface NotifyResult {
  sent: number;
  failed: number;
  errors: { email: string; error: string }[];
}

/**
 * Formats a YYYY-MM-DD for an email body: "August 6, 2026".
 * Parsed as UTC so a date-only string never slips a day westward.
 */
export function formatEmailDate(ymd: string | null): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

export function registerUrl(program: Program, _role: InterestRole): string {
  // Operator-specified: the invite link drops people at their door on the
  // public site, e.g. https://nwks-encounter-site.pages.dev/?door=men
  const door = program === 'mens' ? 'men' : 'women';
  return `${SITE_ORIGIN}/?door=${door}`;
}

/**
 * "You're on the list" — sent the moment someone expresses interest, so the
 * form doesn't just swallow their details silently.
 */
export async function sendInterestConfirmation(
  env: Env, program: Program, role: InterestRole, entry: { first_name: string; email: string }
): Promise<void> {
  const key = role === 'server' ? 'interest_confirmation_server' : 'interest_confirmation';
  const tpl = await env.DB.prepare(
    `SELECT subject, body_html, body_text FROM email_templates WHERE program = ? AND key = ?`
  ).bind(program, key).first<{ subject: string; body_html: string; body_text: string }>();

  if (!tpl) {
    console.error(`[interest] missing ${key} template for ${program}`);
    return;
  }

  const rendered = renderTemplate(tpl, { first_name: entry.first_name });
  await sendEmail(env, {
    to: entry.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    replyTo: env.EMAIL_REPLY_TO || undefined,
    type: 'transactional',
    templateKey: key,
    program,
  });
}

/**
 * Emails everyone still waiting on a program's standing list that registration
 * for `newEvent` is open, and marks them notified against it.
 *
 * Includes entries already 'notified' for a PREVIOUS encounter: someone who
 * didn't take up the last invitation is still interested in the next one. Only
 * 'registered' and 'removed' drop off the list.
 *
 * Only entries that actually send are advanced. A failure leaves the row where
 * it was and is reported to the caller — a half-sent blast must never look like
 * a clean one.
 */
export async function notifyInterestQueue(
  env: Env,
  program: Program,
  newEvent: { id: number; year: number; season: string; start_date: string | null; end_date: string | null },
  opts: { roles?: InterestRole[] } = {}
): Promise<NotifyResult> {
  const roles = opts.roles ?? ['attendee', 'server'];
  const result: NotifyResult = { sent: 0, failed: 0, errors: [] };

  const placeholders = roles.map(() => '?').join(',');
  const { results } = await env.DB.prepare(
    `SELECT id, role, first_name, last_name, email, phone
     FROM interest_queue
     WHERE program = ?
       AND status IN ('waiting','notified')
       AND role IN (${placeholders})
       AND (last_notified_event_id IS NULL OR last_notified_event_id != ?)
     ORDER BY created_at`
  ).bind(program, ...roles, newEvent.id).all<InterestEntry>();

  if (results.length === 0) return result;

  const encounterName = displayName(newEvent.year, newEvent.season);
  const start = formatEmailDate(newEvent.start_date);
  const end = formatEmailDate(newEvent.end_date);

  // Cache templates per role so a 200-person list isn't 200 extra queries.
  const templates = new Map<string, { subject: string; body_html: string; body_text: string }>();
  async function templateFor(role: InterestRole) {
    const key = role === 'server' ? 'interest_invite_server' : 'interest_invite';
    if (!templates.has(key)) {
      const tpl = await env.DB.prepare(
        `SELECT subject, body_html, body_text FROM email_templates WHERE program = ? AND key = ?`
      ).bind(program, key).first<{ subject: string; body_html: string; body_text: string }>();
      if (tpl) templates.set(key, tpl);
    }
    return { key, tpl: templates.get(key) };
  }

  for (const entry of results) {
    const { key, tpl } = await templateFor(entry.role);
    if (!tpl) {
      // A missing template is a real problem, not a reason to silently skip.
      result.failed += 1;
      result.errors.push({ email: entry.email, error: `no ${key} template for ${program}` });
      continue;
    }

    const rendered = renderTemplate(tpl, {
      first_name: entry.first_name,
      last_name: entry.last_name,
      encounter_name: encounterName,
      start_date: start,
      end_date: end,
      register_url: registerUrl(program, entry.role),
    });

    const send = await sendEmail(env, {
      to: entry.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      replyTo: env.EMAIL_REPLY_TO || undefined,
      type: 'transactional',
      templateKey: key,
      program,
    });

    if (send.ok) {
      await env.DB.prepare(
        `UPDATE interest_queue
         SET status = 'notified', notified_at = ?, last_notified_event_id = ?
         WHERE id = ?`
      ).bind(nowIso(), newEvent.id, entry.id).run();
      result.sent += 1;
    } else {
      result.failed += 1;
      result.errors.push({ email: entry.email, error: send.error ?? 'send failed' });
    }
  }

  return result;
}

/**
 * Called after a successful registration: if this person was on the standing
 * list, take them off it.
 *
 * Without this they'd keep getting "registration is open" emails for encounters
 * they had already signed up for — the fastest way to make the whole feature
 * feel broken.
 */
export async function markInterestRegistered(
  env: Env, program: Program, role: InterestRole, email: string | null
): Promise<void> {
  if (!email) return;
  await env.DB.prepare(
    `UPDATE interest_queue
     SET status = 'registered', registered_at = ?
     WHERE program = ? AND role = ? AND email = ? AND status != 'removed'`
  ).bind(nowIso(), program, role, email.toLowerCase().trim()).run();
}

/** Everyone who has raised a hand and not yet signed up. Drives the Interested tab. */
export async function listInterested(
  env: Env, program: Program, opts: { role?: InterestRole; includeAll?: boolean } = {}
) {
  // Every column is qualified: `events` also has `program`, so a bare column
  // name here is ambiguous once the LEFT JOIN is in play.
  const clauses = ['iq.program = ?'];
  const binds: unknown[] = [program];

  if (!opts.includeAll) {
    // "Interested but not signed up" is the question the tab answers.
    clauses.push(`iq.status IN ('waiting','notified')`);
  }
  if (opts.role) {
    clauses.push('iq.role = ?');
    binds.push(opts.role);
  }

  const { results } = await env.DB.prepare(
    `SELECT iq.id, iq.role, iq.first_name, iq.last_name, iq.email, iq.phone,
            iq.status, iq.notified_at, iq.created_at,
            e.year AS notified_year, e.season AS notified_season
     FROM interest_queue iq
     LEFT JOIN events e ON e.id = iq.last_notified_event_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY iq.created_at DESC`
  ).bind(...binds).all();

  return results;
}
