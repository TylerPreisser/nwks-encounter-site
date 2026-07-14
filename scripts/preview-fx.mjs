// Self-verification harness for a single transition concept.
// Usage: node scripts/preview-fx.mjs <conceptId> <door>
//   e.g. node scripts/preview-fx.mjs men-banner men
// Forces that concept active, triggers Enter, and captures a strip of frames DURING
// the animation (enter + exit) so you can Read them and judge/iterate on the motion.
// Requires a fresh `node build/bundle.mjs` first (it loads dist/index.html).
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, '..');
const conceptId = process.argv[2];
const door = process.argv[3] || (conceptId && conceptId.startsWith('women') ? 'women' : 'men');
if (!conceptId) { console.error('usage: node scripts/preview-fx.mjs <conceptId> <door>'); process.exit(1); }

const target = 'file://' + path.join(repo, 'dist', 'index.html');
const out = path.join(repo, 'screenshots-qa', 'fx-' + conceptId);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1440, height: 900 } }).then((c) => c.newPage());
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

await page.goto(target, { waitUntil: 'networkidle' });
await page.waitForTimeout(3900); // intro finishes

// force the concept active + confirm it's registered
const info = await page.evaluate(({ id, door }) => {
  const reg = window.NWKS && NWKS.registry;
  const has = window.NWKS && NWKS.transitions && !!NWKS.transitions[id];
  if (reg && has) reg.setActive(door, id);
  return { registered: has, active: reg ? reg.getActive(door) : null };
}, { id: conceptId, door });
console.log('concept', conceptId, JSON.stringify(info));

async function strip(tag, action) {
  await action();
  for (let i = 0; i < 12; i++) {
    await page.screenshot({ path: path.join(out, `${tag}-${String(i).padStart(2, '0')}.png`) });
    await page.waitForTimeout(55);
  }
  await page.waitForTimeout(300);
}

await strip('enter', () => page.click(`.half[data-door="${door}"] .enter`, { timeout: 4000 }));
await strip('exit', async () => { const b = await page.$('[data-back]'); if (b) await b.click(); });

console.log('errors:', errs.length ? errs : 'none');
await browser.close();
console.log('frames →', out, '(Read enter-04..08 for the covered midpoint; exit-* for the reveal)');
