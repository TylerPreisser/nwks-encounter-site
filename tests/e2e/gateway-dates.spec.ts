import { test, expect } from 'playwright/test';

/**
 * Gateway date E2E checks.
 * Assumes `npm run build && npx wrangler pages dev dist --local` is running,
 * which is managed by the `webServer` block in `playwright.config.ts`.
 *
 * Seed data (0003_seed_events.sql) must be applied before these tests run.
 */

test.describe('Gateway date display', () => {
  test('Men\'s date is visible and matches expected text', async ({ page }) => {
    await page.goto('/');
    // Wait for the animation to finish revealing content. The men's half's
    // reveal can take longer than the women's, so allow up to 10s.
    const mensDates = page.locator('[data-nwks-date="mens"]');
    await expect(mensDates).toBeVisible({ timeout: 10_000 });
    // The text should be a non-empty date string — either the hard-coded fallback
    // or the API value (both are "August 6 – 8, 2026" after seed).
    await expect(mensDates).not.toBeEmpty();
    const text = await mensDates.textContent();
    expect(text?.trim()).toMatch(/\w+ \d+/); // at minimum "MonthName Day"
  });

  test('Women\'s date is visible and matches expected text', async ({ page }) => {
    await page.goto('/');
    const womenDates = page.locator('[data-nwks-date="women"]');
    await expect(womenDates).toBeVisible({ timeout: 4000 });
    await expect(womenDates).not.toBeEmpty();
    const text = await womenDates.textContent();
    expect(text?.trim()).toMatch(/\w+ \d+/);
  });

  test('Gateway appearance is unchanged — both halves render', async ({ page }) => {
    await page.goto('/');
    // Both program halves must be present
    await expect(page.locator('.half--men')).toBeVisible();
    await expect(page.locator('.half--women')).toBeVisible();
  });

  test('date-sync.js updates date when API returns different dates', async ({ page, context }) => {
    // Intercept the public events API to return a different date
    await context.route('**/api/public/events/current?program=mens', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          event: {
            id: 99,
            program: 'mens',
            year: 2027,
            title: 'Future Event',
            start_date: '2027-09-10',
            end_date: '2027-09-12',
            launch_locations: [],
            attendee_registration_open: true,
            server_registration_open: true,
          },
        }),
      });
    });
    await context.route('**/api/public/events/current?program=women', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          event: {
            id: 100,
            program: 'women',
            year: 2027,
            title: 'Future Women',
            start_date: '2027-08-14',
            end_date: '2027-08-16',
            launch_locations: [],
            attendee_registration_open: true,
            server_registration_open: true,
          },
        }),
      });
    });

    await page.goto('/');

    // After fetch resolves, the DOM should show the API-returned dates
    await expect(page.locator('[data-nwks-date="mens"]')).toHaveText('September 10 – 12, 2027', {
      timeout: 5000,
    });
    await expect(page.locator('[data-nwks-date="women"]')).toHaveText('August 14 – 16, 2027', {
      timeout: 5000,
    });
  });

  test('date-sync.js falls back to hard-coded text when API is unavailable', async ({
    page,
    context,
  }) => {
    // Make the API return an error
    await context.route('**/api/public/events/current**', (route) => {
      route.fulfill({ status: 500, body: 'Internal Server Error' });
    });

    await page.goto('/');

    // Hard-coded text must still be present after a short wait
    await page.waitForTimeout(200);
    const mensText = await page.locator('[data-nwks-date="mens"]').textContent();
    const womenText = await page.locator('[data-nwks-date="women"]').textContent();

    // Hard-coded fallback values
    expect(mensText?.trim()).toBe('August 6 – 8, 2026');
    expect(womenText?.trim()).toBe('July 17 – 19, 2026');
  });
});
