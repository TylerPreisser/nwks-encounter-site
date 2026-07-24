import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { applyMigrations } from './setup';

describe('schema smoke tests', () => {
  beforeEach(async () => {
    await applyMigrations(env as unknown as { DB: D1Database });
  });

  it('SELECT 1 returns 1', async () => {
    const result = await (env as any).DB.prepare('SELECT 1 AS n').first<{ n: number }>();
    expect(result?.n).toBe(1);
  });

  const EXPECTED_TABLES = [
    'people', 'events', 'registrations',
    'email_templates', 'email_campaigns', 'email_log',
    'admin_users', 'photos',
    'ai_threads', 'ai_messages', 'ai_pending_actions',
    'testimonies', 'testimony_attachments', 'testimony_comments',
  ];

  it.each(EXPECTED_TABLES)('table "%s" exists', async (table) => {
    const result = await (env as any).DB
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .bind(table)
      .first<{ name: string }>();
    expect(result?.name).toBe(table);
  });
});
