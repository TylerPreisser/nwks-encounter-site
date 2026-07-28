// playwright.worlds.config.ts — E2E for the WORLDS front-end (gateway + world
// page transitions). Serves the self-contained dist-worlds bundle statically.
// Run: npx playwright test --config playwright.worlds.config.ts
import { defineConfig, devices } from 'playwright/test';

export default defineConfig({
  testDir: './tests/e2e-worlds',
  timeout: 30_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8799',
    headless: true,
    reducedMotion: 'no-preference', // ensure the transitions actually run
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build:worlds && python3 -m http.server 8799 --directory dist-worlds',
    url: 'http://localhost:8799/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
