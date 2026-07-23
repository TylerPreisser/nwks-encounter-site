import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    globalSetup: ['./functions/_api/__tests__/globalSetup.ts'],
    include: ['functions/_api/__tests__/**/*.test.ts'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          d1Databases: ['DB'],
          kvNamespaces: ['SESSIONS'],
          r2Buckets: ['PHOTOS'],
        },
      },
    },
  },
});
