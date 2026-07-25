// functions/_api/__tests__/templates.test.ts
// Asserts that 0013_templates_simple.sql correctly seeds the email_templates table.
// 6 rows total: mens + women x welcome/reminder/packing_list.
// No shared rows. Each template carries ONLY its program's logo.

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

const MENS_LOGO  = 'email-assets/men-logo-300x300-1.jpg';
const WOMENS_LOGO = 'email-assets/source-womens-logo-1024x1024.jpg';

describe('email_templates seed (0013_templates_simple.sql)', () => {
  beforeEach(async () => {
    await applyMigrations(env as unknown as { DB: D1Database });
  });

  // ── Row count ────────────────────────────────────────────────────────────────

  it('seeds exactly 6 rows (3 per program, no shared)', async () => {
    const { results } = await (env as any).DB
      .prepare('SELECT COUNT(*) AS n FROM email_templates')
      .all<{ n: number }>();
    expect(results[0].n).toBe(6);
  });

  it('has 0 shared rows', async () => {
    const { results } = await (env as any).DB
      .prepare(`SELECT COUNT(*) AS n FROM email_templates WHERE program = 'shared'`)
      .all<{ n: number }>();
    expect(results[0].n).toBe(0);
  });

  it('has exactly 3 mens rows', async () => {
    const { results } = await (env as any).DB
      .prepare(`SELECT COUNT(*) AS n FROM email_templates WHERE program = 'mens'`)
      .all<{ n: number }>();
    expect(results[0].n).toBe(3);
  });

  it('has exactly 3 women rows', async () => {
    const { results } = await (env as any).DB
      .prepare(`SELECT COUNT(*) AS n FROM email_templates WHERE program = 'women'`)
      .all<{ n: number }>();
    expect(results[0].n).toBe(3);
  });

  // ── Per-key existence ────────────────────────────────────────────────────────

  it.each([
    ['mens',  'welcome'],
    ['mens',  'reminder'],
    ['mens',  'packing_list'],
    ['women', 'welcome'],
    ['women', 'reminder'],
    ['women', 'packing_list'],
  ])('%s/%s exists with non-empty subject, body_html, body_text', async (program, key) => {
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
    expect(vars).toContain('first_name');
  });

  // ── Logo correctness — each template has ONLY its program's logo ─────────────

  it.each([
    ['mens',  'welcome'],
    ['mens',  'reminder'],
    ['mens',  'packing_list'],
  ])('mens/%s body_html contains the men\'s logo and NOT the women\'s logo', async (_prog, key) => {
    const row = await (env as any).DB
      .prepare(`SELECT body_html FROM email_templates WHERE program = 'mens' AND key = ?`)
      .bind(key)
      .first<{ body_html: string }>();
    expect(row).not.toBeNull();
    expect(row!.body_html).toContain(MENS_LOGO);
    expect(row!.body_html).not.toContain(WOMENS_LOGO);
  });

  it.each([
    ['women', 'welcome'],
    ['women', 'reminder'],
    ['women', 'packing_list'],
  ])('women/%s body_html contains the women\'s logo and NOT the men\'s logo', async (_prog, key) => {
    const row = await (env as any).DB
      .prepare(`SELECT body_html FROM email_templates WHERE program = 'women' AND key = ?`)
      .bind(key)
      .first<{ body_html: string }>();
    expect(row).not.toBeNull();
    expect(row!.body_html).toContain(WOMENS_LOGO);
    expect(row!.body_html).not.toContain(MENS_LOGO);
  });

  // ── Minimal / Placeholder bodies ─────────────────────────────────────────────

  it.each([
    ['mens',  'welcome'],
    ['mens',  'reminder'],
    ['mens',  'packing_list'],
    ['women', 'welcome'],
    ['women', 'reminder'],
    ['women', 'packing_list'],
  ])('%s/%s body contains "Placeholder" and no merge-field date awkwardness', async (program, key) => {
    const row = await (env as any).DB
      .prepare(`SELECT body_html, body_text FROM email_templates WHERE program = ? AND key = ?`)
      .bind(program, key)
      .first<{ body_html: string; body_text: string }>();
    expect(row).not.toBeNull();
    expect(row!.body_html).toContain('Placeholder');
    expect(row!.body_text).toContain('Placeholder');
    // No awkward literal parenthesis + date fields
    expect(row!.body_html).not.toContain('{{start_date}}');
    expect(row!.body_html).not.toContain('{{end_date}}');
  });

  // ── updated_at populated ─────────────────────────────────────────────────────

  it('all 6 rows have a non-null updated_at', async () => {
    const { results } = await (env as any).DB
      .prepare(`SELECT updated_at FROM email_templates WHERE updated_at IS NOT NULL`)
      .all<{ updated_at: string }>();
    expect(results.length).toBe(6);
  });

  // ── Idempotency guard ────────────────────────────────────────────────────────

  it('INSERT OR IGNORE prevents duplicates (mens/welcome)', async () => {
    await (env as any).DB
      .prepare(`INSERT OR IGNORE INTO email_templates
        (program, key, name, subject, body_html, body_text, variables, updated_at)
        VALUES ('mens', 'welcome', 'Dup', 'Dup', '<p>dup</p>', 'dup',
          '["first_name"]', '2026-07-24T00:00:00.000Z')`)
      .run();
    const { results } = await (env as any).DB
      .prepare(`SELECT COUNT(*) AS n FROM email_templates WHERE program='mens' AND key='welcome'`)
      .all<{ n: number }>();
    expect(results[0].n).toBe(1);
  });
});
