// tests/e2e/load-verify.spec.ts
// Browser verification that the load-tested data DISPLAYS correctly on both ends:
// admin (dashboard counts, registrations list, email history) + public register page.
// Assumes the server already has the load data (3k submissions + a sent campaign).
import { test, expect } from 'playwright/test';

const EMAIL = 'e2e-admin@example.com';
const PASS = 'E2ePass1x';

test.describe('Load verification — browser display, both ends', () => {
  test('admin dashboard shows the big counts, registrations render, campaign is in history', async ({ page }) => {
    const login = await page.request.post('/api/auth/login', { data: { email: EMAIL, password: PASS } });
    expect(login.ok()).toBeTruthy();

    // Ground truth from the API (the browser uses the same endpoint).
    const dash = await (await page.request.get('/api/admin/dashboard?program=mens')).json();
    const attendees = dash.stats.attendee_count;
    const servers = dash.stats.server_count;
    expect(attendees).toBeGreaterThan(2000);
    expect(servers).toBeGreaterThan(500);

    // Dashboard renders and DISPLAYS the attendee count number.
    await page.goto('/admin/#/', { waitUntil: 'load' });
    await expect(page.getByText('Attendees').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(String(attendees), { exact: true }).first()).toBeVisible({ timeout: 10_000 });

    // Registrations page renders rows for the loaded people.
    await page.goto('/admin/#/registrations', { waitUntil: 'load' });
    await expect(page.getByText(/Load\d+ User\d+/).first()).toBeVisible({ timeout: 10_000 });

    // Email Center — the bulk campaign appears in Sent history.
    await page.goto('/admin/#/email', { waitUntil: 'load' });
    await expect(page.getByText('Load test blast')).toBeVisible({ timeout: 10_000 });
  });

  test('dashboard mailbox monitor + testimonies board display the inbound emails', async ({ page }) => {
    const login = await page.request.post('/api/auth/login', { data: { email: EMAIL, password: PASS } });
    expect(login.ok()).toBeTruthy();

    const dash = await (await page.request.get('/api/admin/dashboard?program=mens')).json();
    const inbox = dash.stats.inbox_count;
    expect(inbox).toBeGreaterThan(400);

    // Dashboard Inbox card displays the count + "need a response".
    await page.goto('/admin/#/', { waitUntil: 'load' });
    await expect(page.getByText(/need a response/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(String(inbox), { exact: true }).first()).toBeVisible({ timeout: 10_000 });

    // Testimonies board renders the inbound items.
    await page.goto('/admin/#/testimonies', { waitUntil: 'load' });
    await expect(page.getByText(/Testimony \d+|Sender \d+/).first()).toBeVisible({ timeout: 10_000 });
  });

  test('public register page renders the form (public end)', async ({ page }) => {
    await page.goto('/register/mens-attendee.html', { waitUntil: 'load' });
    // The native attendee form renders a first-name field + submit.
    await expect(page.locator('[name="first_name"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });
});
