// tests/e2e/admin-editor.spec.ts
// Browser-driven test of the admin Web Page editor: log in, render the live
// inline editor, edit a field, hit Publish, and confirm it persisted to D1.
import { test, expect } from 'playwright/test';
import { execSync } from 'node:child_process';

const ROOT = '/Users/tylerpreisser/Desktop/nwks-encounter-site';
const EMAIL = 'e2e-admin@example.com';
const PASS = 'E2ePass1x';

test.beforeAll(() => {
  // Seed a local admin (idempotent enough for repeat runs; ignore if it already exists).
  try {
    execSync(`node scripts/seed-admin.mjs --email ${EMAIL} --password ${PASS} --name E2E`, { cwd: ROOT, stdio: 'ignore' });
  } catch { /* admin may already exist */ }
});

test.describe('Admin: Web Page editor → Publish', () => {
  test('logs in, renders the live page editor with two buttons, edits + publishes to D1', async ({ page }) => {
    // Log in via the API — sets the session cookie on this browser context.
    const login = await page.request.post('/api/auth/login', { data: { email: EMAIL, password: PASS } });
    expect(login.ok()).toBeTruthy();

    await page.goto('/admin/#/page-details', { waitUntil: 'load' });

    // The inline editor renders the real men's page.
    const eventName = page.getByLabel('Event name');
    await expect(eventName).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('page-editor')).toHaveClass(/pe-page--men/);

    // Both register buttons render (Attendee + Server).
    await expect(page.getByLabel('Register button 1 label')).toBeVisible();
    await expect(page.getByLabel('Register button 2 label')).toBeVisible();

    // Edit the tagline in place (contentEditable): triple-click selects, type replaces.
    const marker = `E2E tagline ${Date.now()}`;
    const tagline = page.getByLabel('Tagline');
    await tagline.click({ clickCount: 3 });
    await page.keyboard.type(marker);

    // Publish becomes enabled → click → confirmation shows.
    const publish = page.getByTestId('publish-btn');
    await expect(publish).toBeEnabled({ timeout: 5000 });
    await publish.click();
    await expect(page.getByText(/published/i)).toBeVisible({ timeout: 8000 });

    // Verify it persisted: the admin page-document API returns the new tagline.
    const doc = await page.request.get('/api/admin/page-document?program=mens');
    expect(doc.ok()).toBeTruthy();
    const body = await doc.json();
    expect(body.doc.tagline).toContain(marker);
  });
});
