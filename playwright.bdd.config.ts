import { defineConfig } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';
import path from 'node:path';

const testDir = defineBddConfig({
  features: [
    'features/file-loading/**/*.feature',
    'features/rendering/**/*.feature',
    'features/editing/**/*.feature',
    'features/export/**/*.feature',
  ],
  steps: ['features/step-definitions/**/*.ts'],
});

export default defineConfig({
  testDir,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'bdd-report' }]],
  use: {
    baseURL: 'http://localhost:5174',
    screenshot: 'on',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: {
    command: 'pnpm --filter @opendockit/viewer dev',
    port: 5174,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
