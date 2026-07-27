// tests/e2e/worlds-roundtrip.spec.ts — Cross-origin worlds → backend registration round-trip
//
// Proves the full cross-origin registration flow end-to-end:
//   worlds page (http://localhost:8080) → backend API (http://localhost:8788) → D1 DB
//
// Architecture:
//   - Backend: wrangler pages dev on :8788 (started by playwright.config.ts webServer).
//     CORS_ORIGINS in wrangler.toml includes http://localhost:8080 so cross-origin
//     POSTs from the worlds page are accepted.
//   - Worlds page: a Node http.Server spawned here on :8080. It serves a patched
//     copy of the worlds SPA bundle (produced by `node build/bundle.mjs`) with
//     <script>window.NWKS_API_BASE='http://localhost:8788'</script> prepended to the
//     <head>, so the worlds form POSTs cross-origin to :8788.
//
//     IMPORTANT: npm run build (scripts/build.mjs) copies root/index.html into dist/,
//     overwriting the worlds SPA bundle. So we rebuild the worlds SPA here into a
//     dedicated temp file (dist-worlds-test/index.html) and serve it from there.
//
//   - Turnstile: site key blank in HTML → forms.js defaults to '__TEST_BYPASS__' token;
//     TURNSTILE_SECRET unset locally → verifyTurnstile() passes it.
//
// The cross-origin proof is that the browser navigates to :8080, the fetch() call in
// forms.js goes to :8788 with mode:'cors' and an Origin: http://localhost:8080 header,
// and the backend responds with CORS headers and 201, completing the handshake.
//
// DB verification: after submission, wrangler CLI queries the local D1 to confirm the
// registrations + people + email_log rows were created.

import { test, expect } from 'playwright/test';
import { execSync } from 'node:child_process';
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const BACKEND_URL = 'http://localhost:8788';
const WORLDS_PORT = 8080;
const WORLDS_ORIGIN = `http://localhost:${WORLDS_PORT}`;
// Dedicated directory for worlds SPA bundle (not overwritten by npm run build)
const WORLDS_DIST_DIR = path.join(ROOT, 'dist-worlds-test');
const WORLDS_HTML_PATH = path.join(WORLDS_DIST_DIR, 'index.html');

// ── Build worlds SPA and serve it cross-origin from the backend ─────────────

let worldsServer: http.Server | null = null;

/**
 * Run `node build/bundle.mjs` to produce the self-contained worlds SPA HTML,
 * save it to dist-worlds-test/, patch in NWKS_API_BASE, then serve on WORLDS_PORT.
 *
 * The bundle script writes to dist/index.html by default.  We copy the result to
 * our dedicated test directory immediately after, before npm run build can overwrite it.
 */
function buildAndStartWorldsServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    // 1. Build the worlds SPA bundle
    execSync('node build/bundle.mjs', { cwd: ROOT, stdio: 'pipe' });

    // 2. Copy bundled HTML to our dedicated dir (safe from npm run build overwrite)
    if (!fs.existsSync(WORLDS_DIST_DIR)) fs.mkdirSync(WORLDS_DIST_DIR, { recursive: true });
    const bundledHtml = fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8');

    // 3. Inject NWKS_API_BASE before the first inline script in the <head>.
    //    The bundled SPA wraps all scripts in <script> tags; we prepend our override
    //    injection right before </head> to guarantee it loads first as a blocking script.
    const patched = bundledHtml.replace(
      '</head>',
      `<script>window.NWKS_API_BASE='${BACKEND_URL}';</script>\n</head>`
    );
    fs.writeFileSync(WORLDS_HTML_PATH, patched, 'utf8');

    // 4. Serve the patched HTML on WORLDS_PORT
    worldsServer = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(patched);
    });

    worldsServer.listen(WORLDS_PORT, '127.0.0.1', () => resolve());
    worldsServer.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        // Port in use from a prior run — still valid; serve with the patched HTML.
        worldsServer = null;
        resolve();
      } else {
        reject(err);
      }
    });
  });
}

function stopWorldsServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!worldsServer) { resolve(); return; }
    worldsServer.close(() => resolve());
    worldsServer = null;
  });
}

// ── D1 query helper ──────────────────────────────────────────────────────────

function d1Query(sql: string): Array<Record<string, unknown>> {
  let stdout: string;
  try {
    stdout = execSync(
      `npx wrangler d1 execute nwks-encounter --local --json --command ${JSON.stringify(sql)}`,
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
  } catch (err: unknown) {
    const e = err as { stdout?: string };
    stdout = e.stdout ?? '';
    if (!stdout.trim().startsWith('[')) throw err;
  }
  const parsed = JSON.parse(stdout.trim());
  return Array.isArray(parsed) ? (parsed[0]?.results ?? []) : [];
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Cross-origin worlds → backend registration round-trip', () => {
  test.beforeAll(async () => {
    await buildAndStartWorldsServer();
  });

  test.afterAll(async () => {
    await stopWorldsServer();
  });

  test('worlds page loads with NWKS_API_BASE pointing at backend', async ({ page }) => {
    await page.goto(`${WORLDS_ORIGIN}/`);
    // Verify NWKS_API_BASE is correctly injected
    const apiBase = await page.evaluate(() => (window as unknown as Record<string, unknown>)['NWKS_API_BASE']);
    expect(apiBase).toBe(BACKEND_URL);
    // Both halves of the gateway must be visible
    await expect(page.locator('.half--men')).toBeVisible();
    await expect(page.locator('.half--women')).toBeVisible();
  });

  test('backend health check is reachable cross-origin from worlds page', async ({ page }) => {
    await page.goto(`${WORLDS_ORIGIN}/`);
    // Prove cross-origin fetch works: call /api/health from the worlds page context
    const result = await page.evaluate(async (backendUrl: string) => {
      const res = await fetch(`${backendUrl}/api/health`, {
        mode: 'cors',
        headers: { 'Accept': 'application/json' },
      });
      return { status: res.status, data: await res.json() };
    }, BACKEND_URL);
    expect(result.status).toBe(200);
    expect((result.data as Record<string, unknown>).ok).toBe(true);
  });

  test('cross-origin events API returns current mens event', async ({ page }) => {
    await page.goto(`${WORLDS_ORIGIN}/`);
    const result = await page.evaluate(async (backendUrl: string) => {
      const res = await fetch(`${backendUrl}/api/public/events/current?program=mens`, {
        mode: 'cors',
      });
      return { status: res.status, data: await res.json() };
    }, BACKEND_URL);
    expect(result.status).toBe(200);
    expect((result.data as Record<string, unknown>).ok).toBe(true);
    const event = (result.data as Record<string, unknown>).event as Record<string, unknown>;
    expect(event.program).toBe('mens');
    expect(event.attendee_registration_open).toBe(true);
  });

  test('full round-trip: worlds form submit → backend → DB row created', async ({ page }) => {
    const uniqueEmail = `worlds-roundtrip+${Date.now()}@example.com`;

    // 1. Navigate to the worlds page served cross-origin from the backend.
    //    Use 'load' to ensure all inline scripts have executed before we inspect the DOM.
    await page.goto(`${WORLDS_ORIGIN}/?door=men`, { waitUntil: 'load' });

    // 2. Wait for the world to render (JS builds world content synchronously on load).
    //    The world hero title is the first meaningful element built by NWKS.worlds.render().
    //    Use a generous timeout; on slow CI the first wrangler request can take a few seconds.
    await expect(page.locator('.world-hero__title')).toBeVisible({ timeout: 10000 });

    // 3. Open the attendee form
    const attendeeBtn = page.locator('button.world-cta', { hasText: 'Register as an Attendee' });
    await expect(attendeeBtn).toBeVisible({ timeout: 5000 });
    await attendeeBtn.click();

    // 4. The form panel should now be visible
    await expect(page.locator('.world-formpage')).toBeVisible({ timeout: 3000 });

    // 5. Fill all required fields
    // Fields are identified by name attribute (built by NWKS.forms.render)
    await page.fill('[name="first_name"]', 'WorldsTest');
    await page.fill('[name="last_name"]', 'RoundTrip');
    await page.fill('[name="email"]', uniqueEmail);
    await page.fill('[name="phone"]', '7851234567');
    await page.selectOption('[name="phone_type"]', 'Cell');
    await page.fill('[name="address"]', '123 Cross-Origin Blvd');
    await page.fill('[name="city"]', 'Hays');
    await page.fill('[name="state"]', 'KS');
    await page.selectOption('[name="launch_location"]', 'Hays');
    await page.selectOption('[name="shirt_size"]', 'M');
    await page.fill('[name="church"]', 'Test Church');
    await page.selectOption('[name="times_attended_self_report"]', 'This will be my first time!');
    await page.fill('[name="invited_by"]', 'E2E test harness');
    await page.fill('[name="prayer_contact_name"]', 'Jane RoundTrip');
    await page.fill('[name="prayer_contact_phone"]', '7859876543');

    // 6. Submit — the form POSTs cross-origin to http://localhost:8788/api/register/mens/attendee
    //    Intercept the API call to capture the response and confirm CORS headers are present.
    const apiResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/register/mens/attendee'),
      { timeout: 15_000 }
    );

    // Find and click the submit button. The form page now has BOTH an attendee
    // and a server panel (server hidden), so scope to the visible submit.
    const submitBtn = page.locator('button[type="submit"]:visible');
    await expect(submitBtn).toBeVisible({ timeout: 3000 });
    await submitBtn.click();

    // 7. Wait for the API response — this is the cross-origin POST
    const apiResponse = await apiResponsePromise;
    // The register endpoint returns 200 on success (see register.ts line ~497)
    expect(apiResponse.status()).toBe(200);

    // Confirm the CORS header is present (proves cross-origin handshake succeeded)
    const corsHeader = apiResponse.headers()['access-control-allow-origin'];
    expect(corsHeader).toBe(WORLDS_ORIGIN);

    // 8. The form should show a success message
    const statusEl = page.locator('.nwks-form__status--success');
    await expect(statusEl).toBeVisible({ timeout: 10_000 });
    const statusText = await statusEl.textContent();
    expect(statusText).toContain("registered");

    // 9. Verify the DB row was created
    const regRows = d1Query(
      `SELECT id, email, first_name, last_name, program, role FROM registrations WHERE email='${uniqueEmail}' LIMIT 1`
    );
    expect(regRows).toHaveLength(1);
    expect(regRows[0].email).toBe(uniqueEmail);
    expect(regRows[0].first_name).toBe('WorldsTest');
    expect(regRows[0].last_name).toBe('RoundTrip');
    expect(regRows[0].program).toBe('mens');
    expect(regRows[0].role).toBe('attendee');

    // 10. Verify a people row was created or matched (dedup / upsert).
    //     The dedup logic may fuzzy-match an existing person (same last_name + city/phone)
    //     rather than creating a new one — so we join through the registration's person_id.
    const regDetail = d1Query(
      `SELECT r.id, r.person_id, p.email AS person_email FROM registrations r JOIN people p ON p.id = r.person_id WHERE r.email='${uniqueEmail}' LIMIT 1`
    );
    expect(regDetail).toHaveLength(1);
    const personId = regDetail[0].person_id as number;
    expect(typeof personId).toBe('number');

    // 11. Verify an email_log row was created for this registration's email.
    //     email_log stores the recipient in `to_email`; template_key identifies the type.
    const emailRows = d1Query(
      `SELECT id, to_email, template_key FROM email_log WHERE to_email='${uniqueEmail}' LIMIT 1`
    );
    // email_log row is created even when EMAIL_ENABLED=false (logged, not sent)
    expect(emailRows.length).toBeGreaterThanOrEqual(1);
    expect(emailRows[0].to_email).toBe(uniqueEmail);
  });
});
