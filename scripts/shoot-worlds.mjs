// scripts/shoot-worlds.mjs
// Screenshots the public worlds site in both enrollment states, desktop and
// mobile, so the rendered page can be reviewed by eye before shipping.
// A text grep cannot tell you a form is unreadable.
//
// Usage:  node scripts/shoot-worlds.mjs [outDir]
// Assumes a static server on :8799 (npm run build:worlds first).

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] ?? 'screenshots-qa/worlds';
const BASE = 'http://localhost:8799';

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
    attendee_limit: 50, attendee_count: 50,
    attendee_full: true, attendee_open: false,
    attendee_full_message: 'This upcoming Encounter is currently full.',
  },
};

const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

for (const vp of VIEWPORTS) {
  for (const [stateName, payload] of [['open', OPEN_EVENT], ['closed', CLOSED_EVENT]]) {
    for (const door of ['men', 'women']) {
      const ctx = await browser.newContext({
        viewport: vp.viewport,
        isMobile: vp.isMobile ?? false,
        hasTouch: vp.hasTouch ?? false,
        deviceScaleFactor: 2,
      });
      await ctx.addInitScript(() => { window.NWKS_API_BASE = 'https://api.test'; });
      await ctx.route('**/api/public/events/current**', (r) =>
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) }));
      await ctx.route('**/api/public/page-document**', (r) =>
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }));

      const page = await ctx.newPage();
      await page.goto(`${BASE}/?door=${door}`, { waitUntil: 'load' });
      await page.waitForSelector('.world-hero__title', { timeout: 10_000 });
      await page.waitForTimeout(400); // let the entrance settle

      await page.screenshot({ path: `${OUT}/${door}-${stateName}-${vp.name}-hero.png` });

      // Open whichever CTA is showing and shoot the form.
      const cta = page.locator(`#world-${door} [data-cta]`).first();
      if (await cta.count()) {
        await cta.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUT}/${door}-${stateName}-${vp.name}-form.png`, fullPage: true });
      }

      await ctx.close();
    }
  }
}

await browser.close();
console.log(`screenshots written to ${OUT}`);
