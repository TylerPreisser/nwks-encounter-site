// WebKit (Safari-engine) iPhone probe: captures the men/women entrance transition
// frame-by-frame AND measures layout (innerWidth vs scrollWidth => horizontal overflow /
// zoom-out), devicePixelRatio, and the transition canvas computed size.
// Usage: node scripts/webkit-probe.mjs [url]   default: local dist file://
import { webkit, devices } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, '..');
const target = process.argv[2] || 'file://' + path.join(repo, 'dist', 'index.html');
const outDir = path.join(repo, 'screenshots-qa', 'webkit');
fs.mkdirSync(outDir, { recursive: true });

const device = devices['iPhone 14 Pro'] || devices['iPhone 13'];
console.log('device:', device.viewport, 'dsf', device.deviceScaleFactor);

const browser = await webkit.launch();
const ctx = await browser.newContext({ ...device });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('PAGEERR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

await page.goto(target, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

async function metrics(label) {
  const m = await page.evaluate(() => ({
    innerW: window.innerWidth, innerH: window.innerHeight,
    dpr: window.devicePixelRatio,
    docScrollW: document.documentElement.scrollWidth,
    docClientW: document.documentElement.clientWidth,
    bodyScrollW: document.body.scrollWidth,
    visualScale: window.visualViewport ? window.visualViewport.scale : null,
    visualW: window.visualViewport ? Math.round(window.visualViewport.width) : null,
  }));
  console.log(label, JSON.stringify(m));
  return m;
}

await page.screenshot({ path: path.join(outDir, 'gateway.png') });
await metrics('gateway');

for (const door of ['men', 'women']) {
  console.log(`\n=== ${door} ===`);
  // click enter and capture the transition lifecycle at several timepoints
  await page.click(`.half[data-door="${door}"] .enter`);
  for (const ms of [150, 350, 600, 900, 1200, 1700]) {
    await page.waitForTimeout(ms === 150 ? 150 : ms - prevMs(ms));
    await page.screenshot({ path: path.join(outDir, `${door}-tx-${ms}.png`) });
    // measure canvas + world overflow mid/after transition
    const c = await page.evaluate(() => {
      const cv = document.querySelector('.nwks-tx-canvas');
      const world = document.querySelector('.world:not([hidden])');
      return {
        canvas: cv ? { cssW: Math.round(cv.getBoundingClientRect().width), cssH: Math.round(cv.getBoundingClientRect().height), attrW: cv.width, attrH: cv.height } : null,
        worldScrollW: world ? world.scrollWidth : null,
        winW: window.innerWidth,
      };
    });
    console.log(`  t=${ms}ms`, JSON.stringify(c));
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outDir, `${door}-world.png`), fullPage: false });
  await metrics(`${door}-world-settled`);
  // go back
  const back = await page.$('[data-back]');
  if (back) await back.click().catch(()=>{});
  await page.waitForTimeout(900);
}

console.log('\nerrors:', errs.length ? errs : 'none');
await browser.close();
console.log('shots ->', outDir);

function prevMs(ms){ const seq=[0,150,350,600,900,1200,1700]; return seq[seq.indexOf(ms)-1]; }
