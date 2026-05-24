import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // Skip `_example-` prefixed specs — these are non-shipping debug
  // scaffolds; run them explicitly when adapting them, not in CI.
  testIgnore: ['**/_example-*.spec.ts'],
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  // Electron can only run one instance at a time (single instance lock),
  // so we must run test files serially.
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
});
