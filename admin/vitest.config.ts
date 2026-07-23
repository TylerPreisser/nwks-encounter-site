import { defineConfig } from 'vitest/config';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
// Load the react plugin from admin/node_modules (not root)
const react = require('./node_modules/@vitejs/plugin-react/dist/index.cjs');

const adminDir = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const adminNodeModules = path.join(adminDir, 'node_modules');

/**
 * Vitest config for `npm run test:admin` (run from repo root).
 *
 * Covers two suites in one jsdom environment:
 *   1. public/__tests__/form.test.js   — P1 legacy form.js jsdom tests (26 tests)
 *   2. admin/src/__tests__/            — P2 React component + unit tests
 */
export default defineConfig({
  plugins: [react.default?.() ?? react()],
  resolve: {
    alias: [
      // Pin React to admin/node_modules so JSX transform and @testing-library/react use the same instance
      { find: 'react/jsx-runtime',     replacement: path.join(adminNodeModules, 'react/jsx-runtime.js') },
      { find: 'react/jsx-dev-runtime', replacement: path.join(adminNodeModules, 'react/jsx-dev-runtime.js') },
      { find: 'react-dom/client',      replacement: path.join(adminNodeModules, 'react-dom/client.js') },
      { find: 'react-dom',             replacement: path.join(adminNodeModules, 'react-dom/index.js') },
      { find: 'react',                 replacement: path.join(adminNodeModules, 'react/index.js') },
      { find: '@',                     replacement: path.join(adminDir, 'src') },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./admin/src/__tests__/setup.ts'],
    include: [
      'public/__tests__/**/*.test.{js,ts}',
      'public/gallery/**/*.test.{js,ts}',
      'admin/__tests__/**/*.test.{js,ts}',
      'admin/src/__tests__/**/*.test.{ts,tsx}',
    ],
  },
});
