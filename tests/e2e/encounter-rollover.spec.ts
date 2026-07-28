// tests/e2e/encounter-rollover.spec.ts
// Browser smoke of the "Start Next Encounter" rollover UI + year switchers.
// Idempotent: opens the panel, verifies the typed-confirmation gating, then
// cancels WITHOUT submitting — so it never mutates the shared local D1.
import { test, expect } from 'playwright/test';
import { execSync } from 'node:child_process';

const ROOT = '/Users/tylerpreisser/Desktop/nwks-encounter-site';
const EMAIL = 'e2e-admin@example.com';
const PASS = 'E2ePass1x';

test.beforeAll(() => {
  try {
    execSync(`node scripts/seed-admin.mjs --email ${EMAIL} --password ${PASS} --name E2E`, { cwd: ROOT, stdio: 'ignore' });
  } catch { /* admin may already exist */ }
});

test.describe('Encounter rollover UI', () => {
  test('button opens the panel, confirmation gating works, switchers render', async ({ page }) => {
    const login = await page.request.post('/api/auth/login', { data: { email: EMAIL, password: PASS } });
    expect(login.ok()).toBeTruthy();

    await page.goto('/admin/#/events', { waitUntil: 'load' });

    // A current encounter exists (seeded) → the button shows.
    const btn = page.getByRole('button', { name: /start next encounter/i });
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await btn.click();

    const submit = page.getByRole('button', { name: /archive & start next encounter/i });
    await expect(submit).toBeVisible();
    await expect(submit).toBeDisabled();

    // Typed-confirmation gating: wrong year stays disabled, correct year enables
    // (plus the force checkbox if the seeded encounter hasn't ended yet).
    const yearVal = await page.getByLabel('Next year').inputValue();
    await page.getByLabel('Confirm year').fill(String(Number(yearVal) + 1));
    await expect(submit).toBeDisabled();

    await page.getByLabel('Confirm year').fill(yearVal);
    const force = page.getByLabel(/roll over anyway/i);
    if (await force.count()) {
      await expect(submit).toBeDisabled();
      await force.check();
    }
    await expect(submit).toBeEnabled();

    // Cancel — do NOT submit, keep local D1 untouched.
    await page.getByRole('button', { name: /^cancel$/i }).click();
    await expect(submit).toHaveCount(0);

    // Year switcher renders on Registrations.
    await page.goto('/admin/#/registrations', { waitUntil: 'load' });
    await expect(page.getByLabel('Encounter year').first()).toBeVisible({ timeout: 10_000 });
  });
});
