// tests/e2e-worlds/transitions.spec.ts
// Verifies the gateway/world transition mechanics in a real browser:
//   1. Gateway load — both panels settle visible (content faded/slid in).
//   2. Enter a door — a door-colored cover element appears, then we land on the
//      world page with its content visible.
//   3. Back — the door we left is flagged (html[data-return]) and the home
//      content is released (html.content-ready).
//   4. World -> form — the in-page form panel opens (fades in, not [hidden]).
import { test, expect } from 'playwright/test';

test.describe('Worlds transitions', () => {
  test('gateway load: both panels settle fully visible', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto('/', { waitUntil: 'load' });

    await expect(page.locator('.half--men')).toBeVisible();
    await expect(page.locator('.half--women')).toBeVisible();

    // Content resolves to full opacity (the slide-up finishes).
    await expect
      .poll(async () => page.locator('.half--men .half__inner').evaluate((el) => Number(getComputedStyle(el).opacity)))
      .toBeGreaterThan(0.99);
    await expect(page.getByText("Men's Encounter").first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('enter men: a men-colored cover slides over, then the world page loads', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.locator('.half--men .enter').click();

    // The door cover is created immediately (before navigation).
    await expect(page.locator('.nwks-door-cover--men')).toHaveCount(1);

    // Then we land on the world page and its hero content is visible.
    await page.waitForURL(/\?door=men/, { timeout: 10_000 });
    await expect(page.locator('#world-men')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.world-hero__title')).toBeVisible({ timeout: 10_000 });
  });

  test('back from world: return is flagged and home content is released', async ({ page }) => {
    await page.goto('/?door=men', { waitUntil: 'load' });
    await expect(page.locator('[data-back]')).toBeVisible({ timeout: 10_000 });
    await page.locator('[data-back]').click();

    // Lands back on the gateway, flagged as returning from men's.
    await page.waitForURL((u) => !u.search.includes('door='), { timeout: 10_000 });
    await expect(page.locator('html')).toHaveAttribute('data-return', 'men');

    // The return cover must have an interpolatable inset clip-path (NOT 'none'),
    // otherwise the recede snaps instead of animating (the bug being fixed).
    const clip = await page.locator('#nwks-return-cover').evaluate((el) => {
      const s = getComputedStyle(el);
      return s.clipPath || (s as unknown as { webkitClipPath: string }).webkitClipPath;
    });
    expect(clip).toContain('inset');

    // The recede completes and releases the home content.
    await expect(page.locator('html.content-ready')).toHaveCount(1, { timeout: 5_000 });
    await expect(page.locator('.half--men')).toBeVisible();
  });

  test("women's page has NO server/email button — attendee CTA only", async ({ page }) => {
    await page.goto('/?door=women', { waitUntil: 'load' });
    await expect(page.locator('#world-women')).toBeVisible({ timeout: 10_000 });
    // Exactly one hero CTA (attendee); no server / "Email Registration Questions".
    await expect(page.locator('.world-cta')).toHaveCount(1);
    await expect(page.getByText(/Email Registration Questions/i)).toHaveCount(0);
    await expect(page.getByText(/Register as a Server/i)).toHaveCount(0);
  });

  test('world -> form: the register panel opens (fades in)', async ({ page }) => {
    await page.goto('/?door=men', { waitUntil: 'load' });
    const cta = page.locator('.world-cta').first();
    await expect(cta).toBeVisible({ timeout: 10_000 });
    await cta.click();
    await expect(page.locator('.world-formpage')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.world-formpage')).not.toHaveAttribute('hidden', /.*/);
  });
});
