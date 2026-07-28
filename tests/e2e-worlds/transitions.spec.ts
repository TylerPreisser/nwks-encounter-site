// tests/e2e-worlds/transitions.spec.ts
// Verifies the IN-PAGE gateway<->world transitions (no page reload):
//   - Enter/Back never reload the document (a window marker survives).
//   - Enter shows the world + hides the halves; Back reverses.
//   - Women's has no server/email button; the register form + form->back work.
import { test, expect } from 'playwright/test';

test.describe('Worlds transitions (in-page)', () => {
  test('gateway load: both panels settle fully visible', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/', { waitUntil: 'load' });
    await expect(page.locator('.half--men')).toBeVisible();
    await expect(page.locator('.half--women')).toBeVisible();
    await expect
      .poll(() => page.locator('.half--men .half__inner').evaluate((el) => Number(getComputedStyle(el).opacity)))
      .toBeGreaterThan(0.99);
    expect(errors).toEqual([]);
  });

  test('enter men is IN-PAGE (no reload): cover slides, world shows, marker survives', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.evaluate(() => { (window as Window & { __noReload?: boolean }).__noReload = true; });

    await page.locator('.half--men .enter').click();
    await expect(page.locator('.nwks-door-cover--men')).toHaveCount(1); // cover created immediately

    await page.waitForURL(/\?door=men/, { timeout: 5000 });             // pushState, not navigation
    await expect(page.locator('#world-men')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.world-hero__title')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-world', 'men');

    // The marker proves NO document reload happened — the whole point of the rework.
    expect(await page.evaluate(() => (window as Window & { __noReload?: boolean }).__noReload === true)).toBe(true);
  });

  test('back to gateway is in-page: world hides, halves return, marker survives', async ({ page }) => {
    await page.goto('/?door=men', { waitUntil: 'load' });
    await expect(page.locator('[data-back]')).toBeVisible({ timeout: 5000 });
    await page.evaluate(() => { (window as Window & { __noReload?: boolean }).__noReload = true; });

    await page.locator('[data-back]').click();
    await page.waitForURL((u) => !u.search.includes('door='), { timeout: 5000 });
    await expect(page.locator('#world-men')).toBeHidden({ timeout: 5000 });
    await expect(page.locator('.half--men')).toBeVisible();
    await expect(page.locator('html')).not.toHaveAttribute('data-world', /.*/);

    expect(await page.evaluate(() => (window as Window & { __noReload?: boolean }).__noReload === true)).toBe(true);
  });

  test("women's page has NO server/email button — attendee CTA only", async ({ page }) => {
    await page.goto('/?door=women', { waitUntil: 'load' });
    await expect(page.locator('#world-women')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.world-cta')).toHaveCount(1);
    await expect(page.getByText(/Email Registration Questions/i)).toHaveCount(0);
    await expect(page.getByText(/Register as a Server/i)).toHaveCount(0);
  });

  test('world -> form -> back to main still works', async ({ page }) => {
    await page.goto('/?door=men', { waitUntil: 'load' });
    await page.locator('.world-cta').first().click();
    await expect(page.locator('.world-formpage')).toBeVisible({ timeout: 5000 });
    await page.locator('.world-formpage__back').click();
    await expect(page.locator('.world-formpage')).toBeHidden({ timeout: 5000 });
    await page.locator('[data-back]').click();
    await page.waitForURL((u) => !u.search.includes('door='), { timeout: 5000 });
    await expect(page.locator('.half--men')).toBeVisible();
  });

  test('round trip: enter -> back -> enter women, all in-page', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.evaluate(() => { (window as Window & { __noReload?: boolean }).__noReload = true; });

    await page.locator('.half--men .enter').click();
    await page.waitForURL(/\?door=men/, { timeout: 5000 });
    await expect(page.locator('#world-men')).toBeVisible();
    await expect(page.locator('.nwks-door-cover')).toHaveCount(0); // slide settled

    await page.locator('[data-back]').click();
    await expect.poll(() => page.evaluate(() => location.search), { timeout: 5000 }).toBe('');
    await expect(page.locator('.half--men')).toBeVisible();
    await expect(page.locator('.nwks-door-cover')).toHaveCount(0);

    await page.locator('.half--women .enter').click();
    await expect.poll(() => page.evaluate(() => location.search), { timeout: 5000 }).toBe('?door=women');
    await expect(page.locator('#world-women')).toBeVisible();

    expect(await page.evaluate(() => (window as Window & { __noReload?: boolean }).__noReload === true)).toBe(true);
  });
});
