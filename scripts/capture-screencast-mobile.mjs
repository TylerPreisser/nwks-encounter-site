// Mobile variant of capture-screencast.mjs — 390x844 viewport, dpr 3, so the
// freedom-banner sizing fix can be verified at the exact phone geometry the
// operator reported ("looks terrible on mobile"). Usage:
//   node scripts/capture-screencast-mobile.mjs <conceptId> <door>
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, '..');
const conceptId = process.argv[2];
const door = process.argv[3] || (conceptId?.startsWith('women') ? 'women' : 'men');
if (!conceptId) { console.error('usage: node scripts/capture-screencast-mobile.mjs <conceptId> <door>'); process.exit(1); }

const target = 'file://' + path.join(repo, 'dist', 'index.html');
const out = path.join(repo, 'screenshots-qa', 'cast-mobile-' + conceptId);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true
});
const page = await ctx.newPage();
await page.goto(target, { waitUntil: 'networkidle' });
await page.waitForTimeout(3900);
await page.evaluate(({ id, door }) => NWKS.registry.setActive(door, id), { id: conceptId, door });

const client = await ctx.newCDPSession(page);
const frames = [];
let t0 = 0;
client.on('Page.screencastFrame', async (f) => {
  const ts = f.metadata.timestamp;
  if (!t0) t0 = ts;
  frames.push({ ms: Math.round((ts - t0) * 1000), data: f.data });
  try { await client.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch {}
});

async function record(action, label, ms) {
  await client.send('Page.startScreencast', { format: 'jpeg', quality: 90, everyNthFrame: 1 });
  frames.length = 0; t0 = 0;
  await action();
  await page.waitForTimeout(ms);
  await client.send('Page.stopScreencast');
  frames.forEach((fr, i) => {
    fs.writeFileSync(path.join(out, `${label}-${String(i).padStart(2, '0')}-${fr.ms}ms.jpg`), Buffer.from(fr.data, 'base64'));
  });
  console.log(`${label}: ${frames.length} frames over ~${frames.length ? frames[frames.length - 1].ms : 0}ms`);
}

await record(() => page.click(`.half[data-door="${door}"] .enter`), 'enter', 1400);
await page.waitForTimeout(300);
const back = await page.$('[data-back]');
await record(async () => { if (back) await back.click(); }, 'exit', 1400);

await browser.close();
console.log('frames →', out);
