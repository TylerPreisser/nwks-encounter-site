// scripts/verify-passkey.mjs
// End-to-end proof that passkey enrollment and passkey login actually work in a
// real browser — using Chrome's virtual authenticator (CDP WebAuthn domain)
// rather than mocking the WebAuthn API. Mocked WebAuthn proves only that the
// mock was called.
//
// Usage:
//   npx wrangler d1 migrations apply nwks-encounter --local
//   node scripts/seed-admin.mjs --email qa@nwks.test --password 'QaPass1!'
//   npx wrangler pages dev dist --local --port 8788
//   node scripts/verify-passkey.mjs

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE ?? 'http://localhost:8788';
const EMAIL = process.env.QA_EMAIL ?? 'qa@nwks.test';
const PASSWORD = process.env.QA_PASSWORD ?? 'QaPass1!';

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

// The run enrolls a passkey, so it must start from a known-clean state or the
// second run fails at step 1 with "already enrolled".
console.log('Resetting QA account 2FA state…');
execFileSync('npx', [
  'wrangler', 'd1', 'execute', 'nwks-encounter', '--local', '--command',
  `DELETE FROM webauthn_credentials WHERE admin_user_id IN (SELECT id FROM admin_users WHERE email='${EMAIL}');` +
  `DELETE FROM auth_codes WHERE admin_user_id IN (SELECT id FROM admin_users WHERE email='${EMAIL}');` +
  `DELETE FROM trusted_devices WHERE admin_user_id IN (SELECT id FROM admin_users WHERE email='${EMAIL}');` +
  `UPDATE admin_users SET webauthn_enabled=0, two_factor_required=0, failed_login_count=0, locked_until=NULL WHERE email='${EMAIL}';`,
], { stdio: 'ignore' });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

// Chrome's virtual authenticator: a real WebAuthn implementation backed by a
// software key, so the whole ceremony (challenge, origin binding, signature,
// counter) is genuinely exercised.
const cdp = await ctx.newCDPSession(page);
await cdp.send('WebAuthn.enable');
const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
  options: {
    protocol: 'ctap2',
    transport: 'internal',
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,
    automaticPresenceSimulation: true,
  },
});

async function login(password = PASSWORD) {
  await page.goto(`${BASE}/admin/`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
}

try {
  console.log('\n1. Password-only login still works before enrollment (rollout safety)');
  await login();
  check('signed in with password alone', !page.url().includes('/login') || (await page.locator('nav').count()) > 0);

  console.log('\n2. Enroll a passkey');
  await page.goto(`${BASE}/admin/#/security`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const stateBefore = await page.getByTestId('twofa-state').textContent();
  check('2FA starts off', /not set up/i.test(stateBefore ?? ''), stateBefore ?? '');

  await page.getByTestId('add-passkey').click();
  await page.waitForTimeout(3000);

  const codes = await page.getByTestId('recovery-codes').locator('li').allTextContents();
  check('10 recovery codes shown once', codes.length === 10, `${codes.length} codes`);
  check('codes avoid ambiguous characters', codes.every((c) => /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(c)));

  const creds = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
  check('a real credential exists on the authenticator', creds.credentials.length === 1);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const stateAfter = await page.getByTestId('twofa-state').textContent();
  check('2FA now on', /on/i.test(stateAfter ?? ''), stateAfter ?? '');

  console.log('\n3. Sign out, then sign in with the passkey');
  await page.evaluate(() =>
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
  );
  await page.waitForTimeout(500);

  // Assert this at the API, not the UI: the challenge component auto-invokes the
  // passkey immediately, so racing it in the DOM is flaky. What actually matters
  // is that the password response carries NO session cookie.
  const pwOnly = await page.request.post(`${BASE}/api/auth/login`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  const pwBody = await pwOnly.json();
  const setCookies = pwOnly.headersArray()
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => h.value)
    .join(' ');
  check(
    'password alone now stops at the second factor',
    pwBody.two_factor_required === true && !setCookies.includes('nwks_session='),
    `2fa=${pwBody.two_factor_required} session_cookie=${setCookies.includes('nwks_session=')}`
  );

  await login();

  // The component auto-invokes the passkey; give it a moment.
  await page.waitForTimeout(3500);
  const signedIn = !(await page.getByTestId('two-factor-challenge').isVisible().catch(() => false));
  check('passkey completed the sign-in', signedIn, page.url());

  console.log('\n4. A wrong password is still refused');
  await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }));
  await login('WrongPassword!');
  const stillOnLogin = await page.locator('input[type="password"]').count();
  check('wrong password does not reach the second factor', stillOnLogin > 0);

  console.log('\n5. Security headers on the admin');
  const res = await page.request.get(`${BASE}/admin/`);
  const csp = res.headers()['content-security-policy'];
  const xfo = res.headers()['x-frame-options'];
  check('CSP present', Boolean(csp), csp ? csp.slice(0, 60) + '…' : 'MISSING');
  check('X-Frame-Options DENY', xfo === 'DENY', xfo ?? 'MISSING');
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error('FAILED:', failed.map((f) => f.name).join(', '));
  process.exit(1);
}
