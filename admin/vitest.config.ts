import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['public/__tests__/**/*.test.{js,ts}', 'admin/__tests__/**/*.test.{js,ts}'],
    globals: true,
  },
});
