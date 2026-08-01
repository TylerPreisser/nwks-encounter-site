// The Register -> Express Interest swap on the public site.
//
// The live status endpoint is stubbed so both states (open / closed) are
// reachable deterministically, and the interest POST is captured so we can
// assert what the browser actually sends.

import { test, expect, type Page } from 'playwright/test';

const OPEN_EVENT = {
  ok: true,
  event: {
    id: 1, program: 'mens', year: 2026, season: 'fall', display_name: 'Fall 2026',
    title: "Men's Encounter 2026", start_date: '2026-08-06', end_date: '2026-08-08',
    launch_locations: [], attendee_registration_open: true, server_registration_open: true,
    attendee_limit: null, attendee_full_message: null,
    attendee_count: 12, attendee_full: false, attendee_open: true,
  },
};

const CLOSED_EVENT = {
  ok: true,
  event: {
    ...OPEN_EVENT.event,
    attendee_registration_open: false,
    attendee_limit: 50,
    attendee_count: 50,
    attendee_full: true,
    attendee_open: false,
    attendee_full_message: 'This upcoming Encounter is currently full.',
  },
};

/**
 * Stubs the public status endpoint for both doors.
 *
 * Also sets NWKS_API_BASE: `hydrate()` in src/js/app.js returns immediately
 * without one, so the live status fetch — and therefore the whole open/closed
 * behaviour — never runs on a bare static build.
 */
async function stubStatus(page: Page, body: unknown) {
  await page.addInitScript(() => {
    (window as unknown as { NWKS_API_BASE: string }).NWKS_API_BASE = 'https://api.test';
  });
  await page.route('**/api/public/events/current**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  );
  // The page-document fetch runs alongside it; let it resolve to nothing so the
  // baked content stands.
  await page.route('**/api/public/page-document**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  );
}

/**
 * Deep-links straight into the men's world and waits for it to finish building.
 * The status fetch happens on load, so the CTA reflects the stub above.
 */
async function openMensDoor(page: Page) {
  await page.goto('/?door=men', { waitUntil: 'load' });
  await expect(page.locator('#world-men')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.world-hero__title')).toBeVisible();
}

test.describe('Express Interest', () => {
  test('enrollment OPEN shows the normal Register CTA', async ({ page }) => {
    await stubStatus(page, OPEN_EVENT);
    await openMensDoor(page);

    const cta = page.locator('#world-men [data-cta="attendee"]');
    await expect(cta).toBeVisible();
    await expect(cta).toContainText(/Register/i);
    await expect(page.locator('#world-men [data-cta="interest"]')).toHaveCount(0);
  });

  test('enrollment CLOSED swaps the CTA to Express Interest', async ({ page }) => {
    await stubStatus(page, CLOSED_EVENT);
    await openMensDoor(page);

    const cta = page.locator('#world-men [data-cta="interest"]');
    await expect(cta).toBeVisible();
    await expect(cta).toContainText(/Express Interest/i);
  });

  test('the interest form asks for exactly four fields and explains why', async ({ page }) => {
    await stubStatus(page, CLOSED_EVENT);
    await openMensDoor(page);
    await page.locator('#world-men [data-cta="interest"]').click();

    // Scope to the interest mount: the form page also carries the Server form,
    // because closing attendee enrollment does not close server sign-ups.
    const form = page.locator('[data-built-for="menInterest"] form.nwks-form');
    await expect(form).toBeVisible();

    // The encounter's own "we're full" wording rides along with the form.
    await expect(form.locator('.nwks-form__intro')).toContainText(/currently full/i);

    await expect(form.locator('input, select, textarea')).toHaveCount(4);
    for (const label of ['First Name', 'Last Name', 'Email Address', 'Phone Number']) {
      await expect(form.getByLabel(new RegExp(label, 'i'))).toBeVisible();
    }
    await expect(form.locator('.nwks-form__submit')).toContainText(/Add me to the list/i);
  });

  test('submitting posts to the interest endpoint with the program in the body', async ({ page }) => {
    await stubStatus(page, CLOSED_EVENT);

    let posted: Record<string, unknown> | null = null;
    await page.route('**/api/register/interest', async (route) => {
      posted = JSON.parse(route.request().postData() ?? '{}');
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, message: "You're on the list." }),
      });
    });

    await openMensDoor(page);
    await page.locator('#world-men [data-cta="interest"]').click();

    const form = page.locator('[data-built-for="menInterest"] form.nwks-form');
    await form.getByLabel(/First Name/i).fill('Jim');
    await form.getByLabel(/Last Name/i).fill('Halpert');
    await form.getByLabel(/Email Address/i).fill('jim@example.com');
    await form.getByLabel(/Phone Number/i).fill('7855550100');
    await form.locator('.nwks-form__submit').click();

    await expect(form.locator('.nwks-form__status--success')).toBeVisible();
    await expect(form.locator('.nwks-form__status--success')).toContainText(/on the list/i);

    expect(posted).toMatchObject({
      program: 'mens',
      first_name: 'Jim',
      last_name: 'Halpert',
      email: 'jim@example.com',
    });
    // Phone is submitted in the same pretty format as the registration form.
    expect(String((posted as Record<string, string>).phone)).toMatch(/\(785\) 555-0100/);
  });

  test('a server error is shown, not swallowed', async ({ page }) => {
    await stubStatus(page, CLOSED_EVENT);
    await page.route('**/api/register/interest', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'Please enter a valid email address.' }),
      })
    );

    await openMensDoor(page);
    await page.locator('#world-men [data-cta="interest"]').click();

    const form = page.locator('[data-built-for="menInterest"] form.nwks-form');
    await form.getByLabel(/First Name/i).fill('Jim');
    await form.getByLabel(/Last Name/i).fill('Halpert');
    await form.getByLabel(/Email Address/i).fill('jim@example.com');
    await form.getByLabel(/Phone Number/i).fill('7855550100');
    await form.locator('.nwks-form__submit').click();

    await expect(form.locator('.nwks-form__status--error')).toContainText(/valid email/i);
  });
});
