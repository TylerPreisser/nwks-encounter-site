import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  // @simplewebauthn/server pulls in @peculiar/asn1-* (attestation parsing), which
  // ships CJS interop against tslib. Bundling those deps rather than externalizing
  // them lets the Workers pool resolve tslib's default export.
  ssr: {
    noExternal: ['@simplewebauthn/server', /^@peculiar\//, '@hexagon/base64', '@levischuck/tiny-cbor', 'tslib', 'jose'],
  },
  test: {
    globalSetup: ['./functions/_api/__tests__/globalSetup.ts'],
    // Exclude photos test — it runs under a separate project (vitest.photos.config.ts)
    // because R2 writes leave SQLite WAL files that break miniflare isolated storage.
    include: ['functions/_api/__tests__/**/*.test.ts'],
    exclude: ['functions/_api/__tests__/photos.test.ts'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          // wrangler.toml now sets EMAIL_ENABLED=true for PRODUCTION. Tests must
          // not inherit it: sendEmail() would attempt a real Resend call and the
          // email suites assert the skipped/queued path. Individual tests that
          // need deliverable email pass their own env override.
          bindings: { EMAIL_ENABLED: 'false' },
          d1Databases: ['DB'],
          kvNamespaces: ['SESSIONS'],
          r2Buckets: ['PHOTOS'],
        },
      },
    },
  },
});
