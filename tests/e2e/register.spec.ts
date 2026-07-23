// tests/e2e/register.spec.ts — Playwright E2E: Men's Attendee registration flow
//
// Prerequisites (already done by CI fixture / dev setup):
//   1. `npm run build`  — assembles dist/
//   2. `npm run db:migrate:local`  — applies D1 migrations locally
//   3. Seed a current men's event:
//        npx wrangler d1 execute nwks-encounter --local --command \
//          "INSERT INTO events (program,year,title,start_date,end_date,launch_locations,
//           attendee_registration_open,server_registration_open,is_current,created_at,updated_at)
//           VALUES ('mens',2026,'Men''s Encounter 2026','2026-09-01','2026-09-03',
//           '[\"Hays\",\"Norton\"]',1,1,1,datetime('now'),datetime('now'));"
//
// Turnstile bypass: turnstileSiteKey is blank in HTML, so form.js defaults the token to
// '__TEST_BYPASS__'. On the server side, verifyTurnstile() treats that token as always-pass
// when TURNSTILE_SECRET is absent or set to 'test' (register.ts, line ~20).
//
// The webServer block in playwright.config.ts starts `wrangler pages dev dist --local`
// which binds the local D1. DB verification uses the wrangler CLI after the test.

import { test, expect } from 'playwright/test';
import { execSync } from 'node:child_process';

// Helper: query local D1 and return parsed results array.
// Uses wrangler --json; stderr (info/warn lines) is captured separately and ignored.
function d1Query(sql: string): Array<Record<string, unknown>> {
  let stdout: string;
  try {
    stdout = execSync(
      `npx wrangler d1 execute nwks-encounter --local --json --command ${JSON.stringify(sql)}`,
      { cwd: '/Users/tylerpreisser/Desktop/nwks-encounter-site', encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
  } catch (err: unknown) {
    // execSync throws on non-zero exit; extract stdout from the error object
    const e = err as { stdout?: string; message?: string };
    stdout = e.stdout ?? '';
    if (!stdout.trim().startsWith('[')) throw err;
  }
  const parsed = JSON.parse(stdout.trim());
  return Array.isArray(parsed) ? (parsed[0]?.results ?? []) : [];
}

test.describe("Men's Attendee registration form", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register/mens-attendee.html');
  });

  test('page renders with a submit button', async ({ page }) => {
    await expect(page.locator('#btn-submit')).toBeVisible();
    await expect(page.locator('h1')).toContainText("Men's Encounter");
  });

  test('shows validation error when first name is missing', async ({ page }) => {
    // Leave form blank, click submit
    await page.locator('#btn-submit').click();
    await expect(page.locator('.field-error').first()).toBeVisible();
  });

  test('successful submission redirects to thanks page and creates DB row', async ({ page }) => {
    const uniqueEmail = `e2e-test+${Date.now()}@example.com`;

    // Fill all required fields
    await page.fill('[name="first_name"]', 'Test');
    await page.fill('[name="last_name"]', 'User');
    await page.fill('[name="email"]', uniqueEmail);
    await page.fill('[name="phone"]', '7851234567');
    await page.selectOption('[name="phone_type"]', 'Cell');
    await page.fill('[name="address"]', '123 Test St');
    await page.fill('[name="city"]', 'Hays');
    await page.fill('[name="state"]', 'KS');
    await page.selectOption('[name="launch_location"]', 'Hays');
    await page.selectOption('[name="shirt_size"]', 'L');
    await page.fill('[name="church"]', 'Test Church');
    await page.selectOption('[name="times_attended_self_report"]', 'This will be my first time!');
    await page.fill('[name="invited_by"]', 'A friend');
    await page.fill('[name="prayer_contact_name"]', 'Jane User');
    await page.fill('[name="prayer_contact_phone"]', '7859876543');

    await page.locator('#btn-submit').click();

    // Expect redirect to thanks page.
    // wrangler pages dev issues a 308 clean-URL redirect: /thanks.html → /thanks,
    // so we match either form.
    await expect(page).toHaveURL(/\/thanks(\.html)?/, { timeout: 10_000 });
    await expect(page.locator('h1')).toContainText("You're Registered");

    // Verify a registrations row was created in the local D1
    const rows = d1Query(
      `SELECT r.id, r.email, r.first_name, r.last_name FROM registrations r WHERE r.email = '${uniqueEmail}' LIMIT 1`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe(uniqueEmail);
    expect(rows[0].first_name).toBe('Test');
    expect(rows[0].last_name).toBe('User');
  });
});
