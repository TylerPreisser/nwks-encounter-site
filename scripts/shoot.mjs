// Visual verification: screenshot the site (desktop + mobile), gateway + each world.
// Usage: node scripts/shoot.mjs [url]   (default: local dist via file://)
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, '..');
const target = process.argv[2] || 'file://' + path.join(repo, 'dist', 'index.html');
const outDir = path.join(repo, 'screenshots-qa');

import fs from 'fs';
fs.mkdirSync(outDir, { recursive: true });

const shots = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, isMobile: false },
  { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, dsf: 3 },
];

const browser = await chromium.launch();
for (const s of shots) {
  const ctx = await browser.newContext({
    viewport: s.viewport,
    deviceScaleFactor: s.dsf || 1,
    isMobile: s.isMobile,
    hasTouch: s.isMobile,
    userAgent: s.isMobile
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      : undefined,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto(target, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3800); // let the intro sequence finish
  await page.screenshot({ path: path.join(outDir, `${s.name}-gateway.png`) });

  // enter each door, screenshot the world, then use the real back control to return
  for (const door of ['men', 'women']) {
    try {
      await page.click(`.half[data-door="${door}"] .enter`, { timeout: 3000 });
      await page.waitForTimeout(1400);
      await page.screenshot({ path: path.join(outDir, `${s.name}-world-${door}.png`), fullPage: true });
      // click the world's own back affordance (real UX), fall back to one history.back()
      const back = await page.$('[data-back]');
      if (back) { await back.click().catch(() => {}); }
      else { await page.evaluate(() => history.back()); }
      await page.waitForTimeout(1200);
    } catch (e) {
      console.log(`[${s.name}] could not enter ${door}: ${e.message}`);
    }
  }
  console.log(`[${s.name}] console errors:`, errors.length ? errors : 'none');
  await ctx.close();
}
await browser.close();
console.log('screenshots →', outDir);
