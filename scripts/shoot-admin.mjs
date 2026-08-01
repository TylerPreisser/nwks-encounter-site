// scripts/shoot-admin.mjs
// Screenshots the admin panel against a locally running `wrangler pages dev`,
// so the roster, the detail page and the enrollment controls can be reviewed by
// eye before shipping.
//
// Usage:
//   node scripts/seed-admin.mjs --email qa@nwks.test --password 'QaPass1!'
//   npx wrangler pages dev dist --local --port 8788
//   node scripts/shoot-admin.mjs [outDir]

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] ?? 'screenshots-qa/admin';
const BASE = 'http://localhost:8788';
const EMAIL = process.env.QA_EMAIL ?? 'qa@nwks.test';
const PASSWORD = process.env.QA_PASSWORD ?? 'QaPass1!';

const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: vp.viewport,
    isMobile: vp.isMobile ?? false,
    hasTouch: vp.hasTouch ?? false,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  // Log in.
  await page.goto(`${BASE}/admin/`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.screenshot({ path: `${OUT}/00-login-${vp.name}.png` });
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/01-dashboard-${vp.name}.png` });

  // Attendees roster.
  await page.goto(`${BASE}/admin/#/attendees`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/02-attendees-${vp.name}.png` });

  // Servers roster.
  await page.goto(`${BASE}/admin/#/servers`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/03-servers-${vp.name}.png` });

  // Detail page: click the first roster row.
  await page.goto(`${BASE}/admin/#/attendees`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const firstRow = page.locator('[data-testid^="roster-row-"]').first();
  if (await firstRow.count()) {
    await firstRow.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/04-detail-${vp.name}.png`, fullPage: true });
  }

  // Encounter / enrollment controls.
  await page.goto(`${BASE}/admin/#/events`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/05-events-${vp.name}.png`, fullPage: true });

  await ctx.close();
}

await browser.close();
console.log(`screenshots written to ${OUT}`);
