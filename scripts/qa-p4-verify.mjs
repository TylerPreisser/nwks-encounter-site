// QA for P4: ambient backgrounds + uniform Attendee/Server registration + women's
// typography + safe-area. Runs at BOTH desktop (1440x900) and mobile (390x844 iPhone).
// For each viewport: enter men's & women's worlds, screenshot; click Attendee (real
// form), screenshot; back; click Server (real form for men, closed-notice for women),
// screenshot; back; verify ambient canvas exists + is animating (unless reduced-motion).
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, '..');
const target = process.argv[2] || 'file://' + path.join(repo, 'dist', 'index.html');
const outDir = path.join(repo, 'screenshots-qa', 'p4');
fs.mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, isMobile: false },
  {
    name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, dsf: 3,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  }
];

const browser = await chromium.launch();
let allOk = true;

for (const v of viewports) {
  const ctx = await browser.newContext({
    viewport: v.viewport,
    deviceScaleFactor: v.dsf || 1,
    isMobile: v.isMobile,
    hasTouch: v.isMobile,
    userAgent: v.userAgent
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto(target, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  for (const door of ['men', 'women']) {
    console.log(`\n=== [${v.name}] ${door} ===`);
    await page.click(`.half[data-door="${door}"] .enter`, { timeout: 5000 });
    await page.waitForTimeout(1200);

    // ---- ambient canvas check ----
    const ambient = await page.evaluate((d) => {
      const c = document.querySelector(`#world-${d} canvas.world-ambient`);
      if (!c) return { present: false };
      const rect = c.getBoundingClientRect();
      const cs = getComputedStyle(c);
      return {
        present: true,
        position: cs.position,
        zIndex: cs.zIndex,
        pointerEvents: cs.pointerEvents,
        w: rect.width, h: rect.height
      };
    }, door);
    console.log('ambient canvas:', JSON.stringify(ambient));
    if (!ambient.present) { console.log(`FAIL: no ambient canvas for ${door}`); allOk = false; }
    else if (ambient.position !== 'fixed' || ambient.pointerEvents !== 'none') {
      console.log(`FAIL: ambient canvas wrong position/pointer-events for ${door}`);
      allOk = false;
    }

    // sample two FULL-canvas frames to confirm actual animation (a small corner crop is
    // often all-transparent with this particle density, giving a false "unchanged" read).
    if (ambient.present) {
      const reducedMotion = await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      const grab = (d) => document.querySelector(`#world-${d} canvas.world-ambient`).toDataURL();
      const frame1 = await page.evaluate(grab, door);
      await page.waitForTimeout(600);
      const frame2 = await page.evaluate(grab, door);
      const changed = frame1 !== frame2;
      console.log(`ambient animating over 600ms (reduced-motion=${reducedMotion}):`, changed);
      if (!reducedMotion && !changed) { console.log(`FAIL: ambient canvas not animating for ${door}`); allOk = false; }
    }

    await page.screenshot({ path: path.join(outDir, `${v.name}-world-${door}.png`), fullPage: true });

    // ---- hero CTA group: both buttons present ----
    const ctaCount = await page.evaluate((d) => document.querySelectorAll(`#world-${d} .world-hero__cta-group .world-cta`).length, door);
    console.log(`hero CTA buttons: ${ctaCount} (expect 2)`);
    if (ctaCount !== 2) { console.log(`FAIL: expected 2 hero CTAs for ${door}, got ${ctaCount}`); allOk = false; }

    // ---- Attendee flow ----
    await page.click(`#world-${door} .world-hero__cta-group .world-cta:not(.world-cta--secondary)`);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, `${v.name}-formpage-${door}-attendee.png`), fullPage: true });
    const attendeeOverlayVisible = await page.evaluate((d) => {
      const p = document.querySelector(`#world-${d} .world-formpage`);
      return p && !p.hidden;
    }, door);
    console.log('attendee overlay visible:', attendeeOverlayVisible);
    if (!attendeeOverlayVisible) { console.log(`FAIL: attendee overlay not visible for ${door}`); allOk = false; }
    // no overflow check
    const attendeeOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
    console.log('horizontal overflow on attendee page:', attendeeOverflow);
    if (attendeeOverflow) { console.log(`FAIL: horizontal overflow on ${door} attendee page`); allOk = false; }

    await page.click(`#world-${door} .world-formpage__back`);
    await page.waitForTimeout(400);

    // ---- Server flow ----
    await page.click(`#world-${door} .world-hero__cta-group .world-cta--secondary`);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, `${v.name}-formpage-${door}-server.png`), fullPage: true });
    const serverPanelText = await page.evaluate((d) => {
      const p = document.querySelector(`#world-${d} .world-formpage__panel:not([hidden])`);
      return p ? p.textContent.trim().slice(0, 200) : null;
    }, door);
    console.log('server panel text:', serverPanelText);
    if (!serverPanelText) { console.log(`FAIL: no visible server panel for ${door}`); allOk = false; }
    const closedNoticePresent = await page.evaluate((d) => {
      return !!document.querySelector(`#world-${d} .world-formpage__panel:not([hidden]) .nwks-form--closed`);
    }, door);
    console.log('closed notice present (expect true for both men+women Server):', closedNoticePresent);
    if (!closedNoticePresent) { console.log(`FAIL: expected closed notice for ${door} Server`); allOk = false; }

    await page.click(`#world-${door} .world-formpage__back`);
    await page.waitForTimeout(400);

    // ---- women's typography sanity (font family actually applied) ----
    if (door === 'women') {
      const fonts = await page.evaluate((d) => {
        const title = document.querySelector(`#world-${d} .world-hero__title`);
        const p = document.querySelector(`#world-${d} .world-p`);
        return {
          title: title ? getComputedStyle(title).fontFamily : null,
          body: p ? getComputedStyle(p).fontFamily : null,
          bodyLineHeight: p ? getComputedStyle(p).lineHeight : null
        };
      }, door);
      console.log('women fonts:', JSON.stringify(fonts));
    }

    // return to gateway
    const back = await page.$(`#world-${door} [data-back]`);
    if (back) { await back.click().catch(() => {}); }
    await page.waitForTimeout(1200);

    // ---- ambient teardown check after close ----
    const canvasGoneAfterClose = await page.evaluate((d) => !document.querySelector(`#world-${d} canvas.world-ambient`), door);
    console.log('ambient canvas removed after close (expect true):', canvasGoneAfterClose);
    if (!canvasGoneAfterClose) { console.log(`FAIL: ambient canvas not torn down for ${door}`); allOk = false; }
  }

  console.log(`\n[${v.name}] console errors:`, errors.length ? errors : 'none');
  if (errors.length) allOk = false;
  await ctx.close();
}

await browser.close();
console.log('\n' + (allOk ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED — see FAIL lines above'));
console.log('screenshots ->', outDir);
process.exit(allOk ? 0 : 1);
