// playwright.config.ts — NWKS Encounter E2E configuration
// Serves the built site via `wrangler pages dev dist` (Pages Functions + local D1/KV).
// Turnstile: site key is blank in HTML so form.js defaults to '__TEST_BYPASS__' token;
// TURNSTILE_SECRET is absent (local) so verifyTurnstile() lets it through.

import { defineConfig, devices } from 'playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 30_000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:8788',
    trace: 'on-first-retry',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Build first, then serve. Build is fast (just file copies).
    command: 'npm run build && npx wrangler pages dev dist --local --port 8788 --ip 127.0.0.1',
    url: 'http://localhost:8788/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
