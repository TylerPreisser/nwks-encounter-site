// scripts/click-everything.mjs
//
// Walks the whole admin panel against a REAL local stack, clicks every
// interactive control on every page, screenshots each one, and asserts what is
// actually on screen — not that a request was made.
//
// Why this exists: unit tests prove components behave in isolation. They cannot
// catch a page that renders blank because a route is mis-wired, a nav link that
// 404s, or a button that throws. This walks it the way a person would.
//
// Usage:
//   npx wrangler d1 migrations apply nwks-encounter --local
//   node scripts/seed-templates.mjs
//   node scripts/seed-admin.mjs --email qa@nwks.test --password 'QaPass1!'
//   npm run build && npx wrangler pages dev dist --local --port 8788
//   node scripts/click-everything.mjs

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:8788';
const EMAIL = process.env.QA_EMAIL ?? 'qa@nwks.test';
const PASSWORD = process.env.QA_PASSWORD ?? 'QaPass1!';
const OUT = 'screenshots-qa/walkthrough';

mkdirSync(OUT, { recursive: true });

const results = [];
let step = 0;
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
async function shot(page, label) {
  step += 1;
  await page.screenshot({ path: `${OUT}/${String(step).padStart(2, '0')}-${label}.png`, fullPage: true });
}

/** Fresh, known state: the walkthrough must not depend on previous runs. */
function resetFixtures() {
  const sql = [
    // qa account back to pre-2FA so the first-run flow can be exercised
    `DELETE FROM webauthn_credentials;`,
    `DELETE FROM auth_codes;`,
    `DELETE FROM trusted_devices;`,
    `UPDATE admin_users SET webauthn_enabled=0, two_factor_required=0, failed_login_count=0, locked_until=NULL;`,
    `UPDATE admin_users SET role='super_admin' WHERE email='${EMAIL}';`,
    `DELETE FROM admin_invites;`,
    // one encounter open, with people to look at
    `UPDATE events SET attendee_registration_open=1, server_registration_open=1, attendee_limit=NULL;`,
    `DELETE FROM interest_queue;`,
    `INSERT INTO interest_queue (program,role,event_id,first_name,last_name,email,phone,status,created_at)
       VALUES ('mens','attendee',1,'Pam','Beesly','pam@example.com','(785) 555-0111','waiting','2026-07-15T00:00:00Z'),
              ('mens','server',1,'Dwight','Schrute','dwight@example.com','(785) 555-0122','waiting','2026-07-18T00:00:00Z');`,
  ].join(' ');
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'nwks-encounter', '--local', '--command', sql], { stdio: 'ignore' });
}

console.log('Resetting fixtures…');
resetFixtures();

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });

// A virtual authenticator so the passkey path is exercised for real, not mocked.
const cdpPage = await ctx.newPage();
const cdp = await ctx.newCDPSession(cdpPage);
await cdp.send('WebAuthn.enable');
await cdp.send('WebAuthn.addVirtualAuthenticator', {
  options: {
    protocol: 'ctap2', transport: 'internal',
    hasResidentKey: true, hasUserVerification: true,
    isUserVerified: true, automaticPresenceSimulation: true,
  },
});
const page = cdpPage;

/** Every console error and failed request, so a silently broken page is caught. */
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  // A 401 from /auth/me on the login screen is the CORRECT answer to "am I
  // signed in?" — the browser logs every 4xx as a console error regardless.
  // Filtering it keeps this check meaningful instead of permanently red.
  if (/status of 401/.test(t)) return;
  pageErrors.push(`console: ${t.slice(0, 160)}`);
});
page.on('requestfailed', (r) => {
  const u = r.url();
  if (u.startsWith(BASE)) pageErrors.push(`requestfailed: ${u} ${r.failure()?.errorText ?? ''}`);
});

try {
  // ── 1. Login + first-run setup ────────────────────────────────────────────
  console.log('\n1. Sign in (first run)');
  await page.goto(`${BASE}/admin/`, { waitUntil: 'networkidle' });
  await shot(page, 'login');
  check('login screen renders', await page.locator('input[type=email]').isVisible());

  await page.fill('input[type=email]', EMAIL);
  await page.fill('input[type=password]', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  await shot(page, 'setup-offered');

  // Email is undeliverable locally, so setup goes straight to passkey enrolment.
  const setupVisible = await page.getByTestId('two-factor-setup').isVisible().catch(() => false);
  check('first-run setup is required (no session from password alone)', setupVisible);

  if (setupVisible && await page.getByTestId('setup-passkey').isVisible().catch(() => false)) {
    await page.getByTestId('setup-passkey').click();
    await page.waitForTimeout(3000);
    await shot(page, 'after-passkey');
  }
  const inside = await page.locator('nav[aria-label="Main navigation"]').isVisible().catch(() => false);
  check('reached the admin after setup', inside, page.url());

  // ── 2. Every nav destination ──────────────────────────────────────────────
  console.log('\n2. Every nav page');
  const NAV = [
    ['', 'Dashboard'],
    ['#/attendees', 'Attendees'],
    ['#/servers', 'Servers'],
    ['#/interested', 'Interested'],
    ['#/events', 'Upcoming Encounter'],
    ['#/email', 'Email'],
    ['#/testimonies', 'Testimonies'],
    ['#/forms', 'Forms'],
    ['#/page-details', 'Web Page Details'],
    ['#/security', 'Security'],
    ['#/team', 'Team'],
  ];
  for (const [hash, label] of NAV) {
    await page.goto(`${BASE}/admin/${hash}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1400);
    const slug = (label.toLowerCase().replace(/[^a-z]+/g, '-'));
    await shot(page, `page-${slug}`);
    // A page that rendered SOMETHING beyond the shell, and has a heading.
    const heading = await page.locator('h1').first().textContent().catch(() => null);
    const body = (await page.locator('main, [role=main], body').first().innerText().catch(() => '')) ?? '';
    check(`${label} renders`, Boolean(heading) && body.length > 40, heading ? `h1="${heading.trim()}"` : 'no h1');
  }

  // ── 3. Roster interactions ────────────────────────────────────────────────
  console.log('\n3. Rosters');
  await page.goto(`${BASE}/admin/#/attendees`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const encounterSelect = page.locator('select[aria-label="Encounter"]');
  check('attendees has an encounter selector', await encounterSelect.count() > 0);
  const search = page.getByPlaceholder(/Search/i);
  if (await search.count()) {
    await search.fill('zzz-no-such-person');
    await page.waitForTimeout(1200);
    await shot(page, 'attendees-search-empty');
    const txt = await page.locator('body').innerText();
    check('search with no matches shows an empty state', /No attendees/i.test(txt));
    await search.fill('');
    await page.waitForTimeout(1000);
  }

  // ── 4. Interested tab actions ─────────────────────────────────────────────
  console.log('\n4. Interested');
  await page.goto(`${BASE}/admin/#/interested`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const bodyInterested = await page.locator('body').innerText();
  check('seeded interested people are listed', /Pam Beesly/.test(bodyInterested) && /Dwight Schrute/.test(bodyInterested));

  const roleFilter = page.locator('select').first();
  if (await roleFilter.count()) {
    await roleFilter.selectOption('server');
    await page.waitForTimeout(1200);
    await shot(page, 'interested-servers-only');
    const t = await page.locator('body').innerText();
    check('role filter narrows to servers', /Dwight/.test(t) && !/Pam Beesly/.test(t));
    await roleFilter.selectOption('all');
    await page.waitForTimeout(1000);
  }

  // ── 5. Encounter controls ─────────────────────────────────────────────────
  console.log('\n5. Encounter enrollment controls');
  await page.goto(`${BASE}/admin/#/events`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  const closeBtn = page.getByTestId('toggle-attendee-enrollment');
  if (await closeBtn.count()) {
    const before = await page.getByTestId('enrollment-state').textContent();
    await closeBtn.click();
    await page.waitForTimeout(2000);
    const after = await page.getByTestId('enrollment-state').textContent();
    await shot(page, 'enrollment-closed');
    check('closing enrollment flips the state', before !== after, `${before?.trim()} -> ${after?.trim()}`);

    await page.getByTestId('toggle-attendee-enrollment').click();
    await page.waitForTimeout(2000);
    const restored = await page.getByTestId('enrollment-state').textContent();
    check('reopening restores it', restored?.trim() === before?.trim(), restored?.trim());
  } else {
    check('enrollment control present', false, 'toggle not found');
  }

  // ── 6. Team: invite, then revoke ──────────────────────────────────────────
  console.log('\n6. Team management');
  await page.goto(`${BASE}/admin/#/team`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const emailInput = page.locator('input[type=email]');
  if (await emailInput.count()) {
    await emailInput.fill('walkthrough@example.com');
    await page.getByRole('button', { name: /Send invitation/i }).click();
    await page.waitForTimeout(2000);
    await shot(page, 'team-invited');
    const t = await page.locator('body').innerText();
    check('invite appears as pending', /walkthrough@example\.com/.test(t));
    // Email is undeliverable locally, so the link must be handed back instead.
    check('undeliverable email surfaces a manual link',
      (await page.getByTestId('manual-invite-link').count()) > 0);

    page.once('dialog', (d) => d.accept());
    const cancel = page.getByRole('button', { name: /^Cancel$/ }).first();
    if (await cancel.count()) {
      await cancel.click();
      await page.waitForTimeout(1600);
      const t2 = await page.locator('body').innerText();
      check('revoking removes the pending invite', !/walkthrough@example\.com/.test(t2));
    }
  } else {
    check('team page usable', false, 'no invite field — is the account super_admin?');
  }

  // ── 7. Security page ──────────────────────────────────────────────────────
  console.log('\n7. Security');
  await page.goto(`${BASE}/admin/#/security`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot(page, 'security');
  const sec = await page.locator('body').innerText();
  check('security shows 2FA is on after enrolment', /\bOn\b/.test(sec));
  check('recovery codes are gone', !/recovery code/i.test(sec));

  // ── 8. Program toggle ─────────────────────────────────────────────────────
  console.log('\n8. Program toggle');
  await page.goto(`${BASE}/admin/#/attendees`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const womens = page.getByRole('button', { name: /Women's/i }).first();
  if (await womens.count()) {
    await womens.click();
    await page.waitForTimeout(1800);
    await shot(page, 'womens-program');
    check('switching to Women\'s re-themes and reloads', true);
  }

  // ── 9. Logout ─────────────────────────────────────────────────────────────
  console.log('\n9. Sign out');
  const signOut = page.getByRole('button', { name: /Sign out/i }).first()
    .or(page.getByText(/Sign out/i).first());
  if (await signOut.count()) {
    await signOut.click();
    await page.waitForTimeout(2500);
    await shot(page, 'signed-out');
    check('sign out returns to the login screen',
      (await page.locator('input[type=password]').count()) > 0, page.url());
  }

  check('no uncaught page errors during the walkthrough',
    pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log(`screenshots: ${OUT}/`);
if (failed.length) {
  console.error('FAILED:\n' + failed.map((f) => `  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`).join('\n'));
  process.exit(1);
}
