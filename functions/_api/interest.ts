// functions/_api/interest.ts
// The "Express Interest" waitlist — shared logic between the public submit
// endpoint, the admin queue view, and the rollover notification.

import type { Env } from './app';
import { nowIso } from './db';
import { sendEmail, renderTemplate } from './email';
import { displayName } from './seasons';
import type { Program } from './db';

/** Public site origin used to build the register link in the invite email. */
const SITE_ORIGIN = 'https://nwks-encounter-site.pages.dev';

export interface InterestEntry {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
}

export interface NotifyResult {
  /** How many invites actually went out (or were skipped because email is off). */
  sent: number;
  /** How many failed — these stay 'waiting' so a retry can pick them up. */
  failed: number;
  /** Per-recipient failure detail, surfaced to the admin. Never swallowed. */
  errors: { email: string; error: string }[];
}

/**
 * Formats a YYYY-MM-DD date for an email body: "August 6, 2026".
 * Parsed as UTC so a date-only string never slips a day in a western timezone.
 */
export function formatEmailDate(ymd: string | null): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

/**
 * Emails everyone still 'waiting' on `fromEventId` an invitation to register
 * for the newly opened encounter.
 *
 * Only entries that actually send are flipped to 'notified'. A failure leaves
 * the row 'waiting' and is reported back to the caller — a half-sent blast must
 * never look like a clean one, and the admin has to be able to retry the rest.
 */
export async function notifyInterestQueue(
  env: Env,
  program: Program,
  fromEventId: number,
  newEvent: { id: number; year: number; season: string; start_date: string | null; end_date: string | null }
): Promise<NotifyResult> {
  const { results } = await env.DB.prepare(
    `SELECT id, first_name, last_name, email, phone
     FROM interest_queue
     WHERE event_id = ? AND status = 'waiting'
     ORDER BY created_at`
  ).bind(fromEventId).all<InterestEntry>();

  const result: NotifyResult = { sent: 0, failed: 0, errors: [] };
  if (results.length === 0) return result;

  const tpl = await env.DB.prepare(
    `SELECT subject, body_html, body_text FROM email_templates
     WHERE program = ? AND key = 'interest_invite'`
  ).bind(program).first<{ subject: string; body_html: string; body_text: string }>();

  if (!tpl) {
    // Missing template is a real problem, not a reason to silently skip people.
    result.failed = results.length;
    result.errors.push({ email: '*', error: `no interest_invite template for ${program}` });
    return result;
  }

  const encounterName = displayName(newEvent.year, newEvent.season);
  const door = program === 'mens' ? 'men' : 'women';
  const registerUrl = `${SITE_ORIGIN}/?door=${door}&register=attendee`;

  for (const entry of results) {
    const rendered = renderTemplate(tpl, {
      first_name: entry.first_name,
      last_name: entry.last_name,
      encounter_name: encounterName,
      start_date: formatEmailDate(newEvent.start_date),
      end_date: formatEmailDate(newEvent.end_date),
      register_url: registerUrl,
    });

    const send = await sendEmail(env, {
      to: entry.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      replyTo: env.EMAIL_REPLY_TO || undefined,
      type: 'transactional',
      templateKey: 'interest_invite',
      program,
    });

    if (send.ok) {
      await env.DB.prepare(
        `UPDATE interest_queue
         SET status = 'notified', notified_at = ?, notified_event_id = ?
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
