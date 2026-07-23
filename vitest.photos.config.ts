// vitest.photos.config.ts — separate vitest config for the photos test suite.
// Uses isolatedStorage: false because R2 writes create SQLite WAL files that
// conflict with miniflare's storage-frame isolation cleanup mechanism.
// Photos tests manage their own state (beforeAll migrations, beforeEach cleanup).

import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    globalSetup: ['./functions/_api/__tests__/globalSetup.ts'],
    include: ['functions/_api/__tests__/photos.test.ts'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          d1Databases: ['DB'],
          kvNamespaces: ['SESSIONS'],
          r2Buckets: ['PHOTOS'],
        },
        isolatedStorage: false,
      },
    },
  },
});
