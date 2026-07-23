import { Resend } from 'resend';
import { nowIso } from './db';
import type { Env } from './app';

export interface SendResult {
  ok: boolean;
  providerId?: string;
  error?: string;
  skipped?: boolean;
}

interface EmailMsg {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** Optional: link this send to an email_log parent campaign. */
  campaignId?: number;
  /** Optional: associate with a person record. */
  personId?: number;
  /** Optional: template key for logging. */
  templateKey?: string;
  /** 'transactional' | 'broadcast' — defaults to 'transactional'. */
  type?: 'transactional' | 'broadcast';
  /** Optional override for program column in email_log. */
  program?: string;
}

/**
 * Sends a single email via Resend (or skips if EMAIL_ENABLED !== 'true').
 * Always writes an email_log row.
 */
export async function sendEmail(
  env: Env,
  msg: EmailMsg
): Promise<SendResult> {
  const createdAt = nowIso();
  const emailEnabled = env.EMAIL_ENABLED === 'true';
  const emailType = msg.type ?? 'transactional';
  const program = (msg.program ?? 'mens') as string;

  // We need a log row — insert with status='queued' first, update after send attempt.
  const { meta } = await env.DB.prepare(
    `INSERT INTO email_log
       (campaign_id, program, person_id, to_email, type, template_key, subject, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?)`
  )
    .bind(
      msg.campaignId ?? null,
      program,
      msg.personId ?? null,
      msg.to,
      emailType,
      msg.templateKey ?? null,
      msg.subject,
      createdAt
    )
    .run();

  const logId = meta.last_row_id as number;

  if (!emailEnabled) {
    await env.DB.prepare(
      `UPDATE email_log SET status='queued' WHERE id=?`
    ).bind(logId).run();
    return { ok: true, skipped: true };
  }

  try {
    const resend = new Resend(env.RESEND_API_KEY);
    const response = await resend.emails.send({
      from: env.EMAIL_FROM,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      replyTo: msg.replyTo ?? (env.EMAIL_REPLY_TO || undefined),
    });

    if (response.error) {
      await env.DB.prepare(
        `UPDATE email_log SET status='failed', error=?, sent_at=? WHERE id=?`
      ).bind(String(response.error.message ?? response.error), nowIso(), logId).run();
      return { ok: false, error: String(response.error.message ?? response.error) };
    }

    const providerId = response.data?.id ?? undefined;
    await env.DB.prepare(
      `UPDATE email_log SET status='sent', provider_id=?, sent_at=? WHERE id=?`
    ).bind(providerId ?? null, nowIso(), logId).run();
    return { ok: true, providerId };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await env.DB.prepare(
      `UPDATE email_log SET status='failed', error=?, sent_at=? WHERE id=?`
    ).bind(errorMsg, nowIso(), logId).run();
    return { ok: false, error: errorMsg };
  }
}

/**
 * Substitutes {{TOKEN}} placeholders in subject, body_html, and body_text.
 * Token names are case-sensitive and must match exactly.
 */
export function renderTemplate(
  tpl: { subject: string; body_html: string; body_text: string },
  vars: Record<string, string>
): { subject: string; html: string; text: string } {
  function substitute(str: string): string {
    return str.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
      return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : `{{${key}}}`;
    });
  }
  return {
    subject: substitute(tpl.subject),
    html: substitute(tpl.body_html),
    text: substitute(tpl.body_text),
  };
}
