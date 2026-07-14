// Debug transitions: capture frames DURING enter/exit, time them, sample men's logo bg.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, '..');
const target = process.argv[2] || 'file://' + path.join(repo, 'dist', 'index.html');
const out = path.join(repo, 'screenshots-qa', 'tx');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1440, height: 900 } }).then((c) => c.newPage());
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto(target, { waitUntil: 'networkidle' });
await page.waitForTimeout(3800);

// sample the men's logo image corner + center-background color
const logoColors = await page.evaluate(() => {
  const img = document.querySelector('.half--men .mark');
  if (!img) return { error: 'no .half--men .mark' };
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const px = (x, y) => { const d = g.getImageData(x, y, 1, 1).data; return `rgba(${d[0]},${d[1]},${d[2]},${d[3]})`; };
  return {
    size: [img.naturalWidth, img.naturalHeight], src: img.currentSrc.slice(0, 40),
    topLeft: px(2, 2), topRight: px(img.naturalWidth - 3, 2),
    bottomLeft: px(2, img.naturalHeight - 3), center: px(img.naturalWidth >> 1, 4),
  };
});
console.log('MEN LOGO COLORS:', JSON.stringify(logoColors));

async function captureTransition(tag, clickSel) {
  const t0 = Date.now();
  await page.click(clickSel, { timeout: 4000 });
  for (let i = 0; i < 9; i++) {
    await page.screenshot({ path: path.join(out, `${tag}-${String(i).padStart(2, '0')}.png`) });
    await page.waitForTimeout(85);
  }
  // wait until cover layer is gone (transition settled)
  await page.waitForFunction(() => !document.querySelector('.nwks-tx-cover'), { timeout: 6000 }).catch(() => {});
  console.log(`${tag}: settled in ~${Date.now() - t0}ms`);
}

// ENTER men's (Dawn), then BACK
await captureTransition('enter-men', '.half[data-door="men"] .enter');
const back = await page.$('[data-back]');
const tBack = Date.now();
if (back) await back.click();
await page.waitForFunction(() => { const s = document.getElementById('stage'); return s && !s.classList.contains('world-open'); }, { timeout: 8000 }).catch(() => {});
console.log(`back-men: gateway restored in ~${Date.now() - tBack}ms`);
await page.waitForTimeout(400);

console.log('console/page errors:', errors.length ? errors : 'none');
await browser.close();
console.log('frames →', out);
