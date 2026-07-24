// functions/_api/__tests__/templates.test.ts
// Asserts that 0002_seed_templates.sql correctly seeds the email_templates table.

import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { applyMigrations } from './setup';

type TemplateRow = {
  id: number;
  program: string | null;
  key: string;
  name: string;
  subject: string;
  body_html: string;
  body_text: string;
  variables: string;
};

describe('email_templates seed (0002_seed_templates.sql)', () => {
  beforeEach(async () => {
    await applyMigrations(env as unknown as { DB: D1Database });
  });

  it('seeds exactly 4 rows after v2 migration', async () => {
    const { results } = await (env as any).DB
      .prepare('SELECT COUNT(*) AS n FROM email_templates')
      .all<{ n: number }>();
    expect(results[0].n).toBe(4);
  });

  it('seeds welcome template for mens with non-empty subject, body_html, body_text, and variables', async () => {
    const row = await (env as any).DB
      .prepare(`SELECT * FROM email_templates WHERE program = 'mens' AND key = 'welcome'`)
      .first<TemplateRow>();
    expect(row).not.toBeNull();
    expect(row!.subject.length).toBeGreaterThan(0);
    expect(row!.body_html.length).toBeGreaterThan(0);
    expect(row!.body_text.length).toBeGreaterThan(0);
    const vars = JSON.parse(row!.variables);
    expect(Array.isArray(vars)).toBe(true);
    expect(vars.length).toBeGreaterThan(0);
    expect(vars).toContain('first_name');
  });

  it('seeds welcome template for women with non-empty subject, body_html, body_text, and variables', async () => {
    const row = await (env as any).DB
      .prepare(`SELECT * FROM email_templates WHERE program = 'women' AND key = 'welcome'`)
      .first<TemplateRow>();
    expect(row).not.toBeNull();
    expect(row!.subject.length).toBeGreaterThan(0);
    expect(row!.body_html.length).toBeGreaterThan(0);
    expect(row!.body_text.length).toBeGreaterThan(0);
    const vars = JSON.parse(row!.variables);
    expect(Array.isArray(vars)).toBe(true);
    expect(vars).toContain('first_name');
  });

  it.each([
    ['shared', 'reminder'],
    ['shared', 'packing_list'],
  ])('seeds %s/%s with non-empty content and variables array', async (program, key) => {
    const row = await (env as any).DB
      .prepare(`SELECT * FROM email_templates WHERE program = ? AND key = ?`)
      .bind(program, key)
      .first<TemplateRow>();
    expect(row).not.toBeNull();
    expect(row!.subject.length).toBeGreaterThan(0);
    expect(row!.body_html.length).toBeGreaterThan(0);
    expect(row!.body_text.length).toBeGreaterThan(0);
    const vars = JSON.parse(row!.variables);
    expect(Array.isArray(vars)).toBe(true);
    expect(vars.length).toBeGreaterThan(0);
  });

  it('all 4 rows have a non-null updated_at', async () => {
    const { results } = await (env as any).DB
      .prepare(`SELECT updated_at FROM email_templates WHERE updated_at IS NOT NULL`)
      .all<{ updated_at: string }>();
    expect(results.length).toBe(4);
  });

  it('seed is idempotent (INSERT OR IGNORE — no duplicates on second apply)', async () => {
    // Run the seed SQL again inline — simulating a re-apply
    await (env as any).DB
      .prepare(`INSERT OR IGNORE INTO email_templates
        (program, key, name, subject, body_html, body_text, variables, updated_at)
        VALUES ('mens', 'welcome', 'Welcome – Men''s Encounter',
          'You''re registered for {{event_title}}!',
          '<p>duplicate</p>', 'duplicate',
          '["first_name"]', '2026-07-23T00:00:00.000Z')`)
      .run();
    const { results } = await (env as any).DB
      .prepare(`SELECT COUNT(*) AS n FROM email_templates WHERE program='mens' AND key='welcome'`)
      .all<{ n: number }>();
    expect(results[0].n).toBe(1);
  });
});
