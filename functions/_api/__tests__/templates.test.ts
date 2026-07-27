// functions/_api/__tests__/templates.test.ts
// Asserts that after all migrations (0015_templates_general.sql last) the
// email_templates table holds ONE editable "general" template per program:
//   mens/general  + women/general
// Each carries its program's logo, the branded olive/yellow wrapper, an editable
// message region, NWKS branding and a contact email.

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

describe('email_templates seed (0015_templates_general.sql)', () => {
  beforeEach(async () => {
    await applyMigrations(env as unknown as { DB: D1Database });
  });

  // ── Row count ────────────────────────────────────────────────────────────────

  it('seeds exactly 2 rows (one general template per program)', async () => {
    const { results } = await (env as any).DB
      .prepare('SELECT COUNT(*) AS n FROM email_templates')
      .all<{ n: number }>();
    expect(results[0].n).toBe(2);
  });

  it('has 0 shared rows and 1 row per program', async () => {
    const rows = await (env as any).DB
      .prepare(`SELECT program, COUNT(*) AS n FROM email_templates GROUP BY program`)
      .all<{ program: string; n: number }>();
    const byProgram = Object.fromEntries(rows.results.map((r: any) => [r.program, r.n]));
    expect(byProgram['shared']).toBeUndefined();
    expect(byProgram['mens']).toBe(1);
    expect(byProgram['women']).toBe(1);
  });

  // ── The general template exists per program ──────────────────────────────────

  it.each([
    ['mens'],
    ['women'],
  ])('%s/general exists with non-empty subject, body_html, body_text', async (program) => {
    const row = await (env as any).DB
      .prepare(`SELECT * FROM email_templates WHERE program = ? AND key = 'general'`)
      .bind(program)
      .first<TemplateRow>();
    expect(row).not.toBeNull();
    expect(row!.subject.length).toBeGreaterThan(0);
    expect(row!.body_html.length).toBeGreaterThan(0);
    expect(row!.body_text.length).toBeGreaterThan(0);
    const vars = JSON.parse(row!.variables);
    expect(Array.isArray(vars)).toBe(true);
    expect(vars).toContain('first_name');
  });

  // ── Branding: olive/yellow wrapper + editable region + NWKS + contact ─────────

  it('mens/general uses the exact logo olive + yellow and carries an editable region', async () => {
    const row = await (env as any).DB
      .prepare(`SELECT body_html, body_text FROM email_templates WHERE program = 'mens' AND key = 'general'`)
      .first<{ body_html: string; body_text: string }>();
    expect(row).not.toBeNull();
    // Exact logo colors
    expect(row!.body_html).toContain('#6E765F'); // olive bands
    expect(row!.body_html).toContain('#FFEB00'); // yellow text
    // Locked wrapper + editable message markers
    expect(row!.body_html).toContain('EDITABLE_START');
    expect(row!.body_html).toContain('EDITABLE_END');
    // NWKS branding + contact email
    expect(row!.body_html).toContain('NWKS Men');
    expect(row!.body_html).toContain('nwksmensencounter@gmail.com');
    // Correct logo, not the women's
    expect(row!.body_html).toContain(MENS_LOGO);
    expect(row!.body_html).not.toContain(WOMENS_LOGO);
  });

  it('women/general is branded with NWKS + the women\'s logo and contact', async () => {
    const row = await (env as any).DB
      .prepare(`SELECT body_html FROM email_templates WHERE program = 'women' AND key = 'general'`)
      .first<{ body_html: string }>();
    expect(row).not.toBeNull();
    expect(row!.body_html).toContain('EDITABLE_START');
    expect(row!.body_html).toContain('NWKS Women');
    expect(row!.body_html).toContain('nwkswomensencounter@gmail.com');
    expect(row!.body_html).toContain(WOMENS_LOGO);
    expect(row!.body_html).not.toContain(MENS_LOGO);
  });

  it('general templates keep the {{first_name}} merge field and no bare date fields', async () => {
    const rows = await (env as any).DB
      .prepare(`SELECT body_html FROM email_templates WHERE key = 'general'`)
      .all<{ body_html: string }>();
    for (const r of rows.results as Array<{ body_html: string }>) {
      expect(r.body_html).toContain('{{first_name}}');
      expect(r.body_html).not.toContain('{{start_date}}');
      expect(r.body_html).not.toContain('{{end_date}}');
    }
  });

  // ── updated_at populated ─────────────────────────────────────────────────────

  it('all rows have a non-null updated_at', async () => {
    const { results } = await (env as any).DB
      .prepare(`SELECT updated_at FROM email_templates WHERE updated_at IS NOT NULL`)
      .all<{ updated_at: string }>();
    expect(results.length).toBe(2);
  });
});
