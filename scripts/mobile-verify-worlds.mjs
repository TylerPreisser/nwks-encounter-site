// Mobile-only self-verification for worlds.css: 390x844 iPhone viewport.
// Loads dist, enters men + women worlds, screenshots world + form page, each.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = '/Users/tylerpreisser/Desktop/nwks-encounter-site';
const target = 'file://' + path.join(repo, 'dist', 'index.html');
const outDir = path.join(__dirname, 'shots');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();

// .world (and .world-formpage__scroll) are internal scroll containers stretched
// to exactly the viewport height by #stage's flex layout (body has overflow:hidden
// per gateway.css) — a single fullPage/element screenshot only ever captures one
// viewport's worth. Walk scrollTop in viewport-height steps and shoot each frame
// so the whole page is actually reviewed, top to bottom.
async function captureScrolled(page, selector, tag, outDir) {
  const info = await page.$eval(selector, (el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  const step = info.clientHeight;
  let i = 0;
  for (let top = 0; top < info.scrollHeight; top += step) {
    await page.$eval(selector, (el, t) => { el.scrollTop = t; }, top);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(outDir, `${tag}-${i}.png`) });
    i++;
    if (top + step >= info.scrollHeight) break;
  }
  return i;
}

async function run(door, tag) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto(target, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3900);
  await page.click(`.half[data-door="${door}"] .enter`, { timeout: 5000 });
  await page.waitForTimeout(1000);
  const n1 = await captureScrolled(page, `.world--${door}`, `${tag}-world`, outDir);

  // click the CTA to open the register form page
  const cta = await page.$('.world-cta');
  if (cta) {
    await cta.click();
    await page.waitForTimeout(700);
    const n2 = await captureScrolled(page, '.world-formpage__scroll', `${tag}-form`, outDir);
    console.log(`[${tag}] world frames: ${n1}, form frames: ${n2}`);
  } else {
    console.log(`[${tag}] no .world-cta found; world frames: ${n1}`);
  }

  console.log(`[${tag}] console errors:`, errors.length ? errors : 'none');
  await ctx.close();
}

await run('men', 'men');
await run('women', 'women');

await browser.close();
console.log('screenshots ->', outDir);
