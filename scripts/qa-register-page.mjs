// QA script for P2.6 (men's dark theme + full-screen register page).
// Not part of the shared shoot.mjs (which doesn't click Register). One-off verification
// tool for this task — clicks into a world, screenshots it, then clicks Register and
// screenshots the resulting form page, for both men and women.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, '..');
const target = process.argv[2] || 'file://' + path.join(repo, 'dist', 'index.html');
const outDir = path.join(repo, 'screenshots-qa');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(target, { waitUntil: 'networkidle' });
await page.waitForTimeout(3900); // let the intro sequence finish

for (const door of ['men', 'women']) {
  console.log(`\n=== ${door} ===`);
  await page.click(`.half[data-door="${door}"] .enter`, { timeout: 5000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, `qa-world-${door}.png`), fullPage: true });
  console.log(`saved qa-world-${door}.png`);

  // click the primary Register CTA in the hero
  const cta = await page.$(`#world-${door} .world-cta`);
  if (cta) {
    await cta.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, `qa-formpage-${door}.png`), fullPage: true });
    console.log(`saved qa-formpage-${door}.png`);

    // verify the overlay is visible, then click its back control and verify it hides
    const overlayVisible = await page.evaluate((d) => {
      const p = document.querySelector(`#world-${d} .world-formpage`);
      return p && !p.hidden;
    }, door);
    console.log(`overlay visible after CTA click: ${overlayVisible}`);

    const backBtn = await page.$(`#world-${door} .world-formpage__back`);
    if (backBtn) {
      await backBtn.click();
      await page.waitForTimeout(400);
      const worldStillOpenAfterBack = await page.evaluate((d) => {
        const w = document.getElementById(`world-${d}`);
        const p = document.querySelector(`#world-${d} .world-formpage`);
        return { worldHidden: w.hidden, overlayHidden: p ? p.hidden : null };
      }, door);
      console.log('after clicking form-page back:', JSON.stringify(worldStillOpenAfterBack));
      await page.screenshot({ path: path.join(outDir, `qa-after-formback-${door}.png`), fullPage: true });
    }
  } else {
    console.log('no .world-cta found!');
  }

  // men only: also check the Server register button opens the closed-notice panel
  if (door === 'men') {
    const regSec = await page.$(`#world-${door} #register`);
    if (regSec) await regSec.scrollIntoViewIfNeeded();
    const btns = await page.$$(`#world-${door} .world-section--register .world-register__btn`);
    console.log(`men register-section buttons: ${btns.length}`);
    if (btns.length >= 2) {
      await btns[1].click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(outDir, `qa-formpage-men-server.png`), fullPage: true });
      console.log('saved qa-formpage-men-server.png');
      const backBtn2 = await page.$(`#world-${door} .world-formpage__back`);
      if (backBtn2) await backBtn2.click();
      await page.waitForTimeout(300);
    }
  }

  // return to gateway via the world's real back control
  const back = await page.$(`#world-${door} [data-back]`);
  if (back) { await back.click().catch(() => {}); }
  await page.waitForTimeout(1200);
}

console.log('\nconsole errors:', errors.length ? errors : 'none');
await ctx.close();
await browser.close();
console.log('\nscreenshots ->', outDir);
