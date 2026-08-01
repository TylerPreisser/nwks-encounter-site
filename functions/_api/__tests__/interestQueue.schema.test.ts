import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { applyMigrations } from './setup';
import { nowIso } from '../db';

const db = () => (env as unknown as { DB: D1Database }).DB;

async function addInterest(
  email: string,
  eventId = 1,
  program: 'mens' | 'women' = 'mens'
) {
  return db()
    .prepare(
      `INSERT INTO interest_queue (program, event_id, first_name, last_name, email, phone, created_at)
       VALUES (?, ?, 'Jim', 'Halpert', ?, '(785) 555-0100', ?)`
    )
    .bind(program, eventId, email, nowIso())
    .run();
}

describe('interest_queue schema', () => {
  beforeEach(async () => {
    await applyMigrations(env as unknown as { DB: D1Database });
  });

  it('accepts an entry and defaults it to waiting', async () => {
    await addInterest('jim@example.com');
    const row = await db()
      .prepare(`SELECT status, notified_at, notified_event_id FROM interest_queue WHERE email = ?`)
      .bind('jim@example.com')
      .first<{ status: string; notified_at: string | null; notified_event_id: number | null }>();

    expect(row?.status).toBe('waiting');
    expect(row?.notified_at).toBeNull();
    expect(row?.notified_event_id).toBeNull();
  });

  it('rejects a duplicate email for the same encounter', async () => {
    await addInterest('dup@example.com');
    await expect(addInterest('dup@example.com')).rejects.toThrow(/UNIQUE/i);
  });

  it('allows the same email on a DIFFERENT encounter', async () => {
    await addInterest('repeat@example.com', 1, 'mens');
    await expect(addInterest('repeat@example.com', 2, 'women')).resolves.toBeTruthy();
  });

  it('rejects a status outside the lifecycle', async () => {
    await addInterest('bad@example.com');
    await expect(
      db()
        .prepare(`UPDATE interest_queue SET status = 'maybe' WHERE email = 'bad@example.com'`)
        .run()
    ).rejects.toThrow(/CHECK/i);
  });

  it('supports the waiting -> notified -> registered lifecycle', async () => {
    await addInterest('life@example.com');
    for (const status of ['notified', 'registered']) {
      await db()
        .prepare(`UPDATE interest_queue SET status = ? WHERE email = 'life@example.com'`)
        .bind(status)
        .run();
    }
    const row = await db()
      .prepare(`SELECT status FROM interest_queue WHERE email = 'life@example.com'`)
      .first<{ status: string }>();
    expect(row?.status).toBe('registered');
  });
});

describe('interest_invite email template', () => {
  beforeEach(async () => {
    await applyMigrations(env as unknown as { DB: D1Database });
  });

  it.each(['mens', 'women'])('is seeded for %s with all merge variables', async (program) => {
    const row = await db()
      .prepare(`SELECT subject, body_html, body_text, variables FROM email_templates WHERE program = ? AND key = 'interest_invite'`)
      .bind(program)
      .first<{ subject: string; body_html: string; body_text: string; variables: string }>();

    expect(row).toBeTruthy();
    expect(JSON.parse(row!.variables)).toEqual(
      expect.arrayContaining(['first_name', 'encounter_name', 'start_date', 'end_date', 'register_url'])
    );
    // Every declared variable must actually appear in both bodies, or the merge
    // silently ships a blank where a date or a link should be.
    for (const v of ['first_name', 'encounter_name', 'start_date', 'end_date', 'register_url']) {
      expect(row!.body_html).toContain(`{{${v}}}`);
    }
    expect(row!.body_text).toContain('{{register_url}}');
    expect(row!.subject).toContain('{{encounter_name}}');
  });
});
