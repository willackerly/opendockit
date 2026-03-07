import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 1,
  workers: 3,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:11173',
    trace: 'on-first-retry',
  },
  expect: {
    toHaveScreenshot: {
      // Allow small pixel differences (anti-aliasing, font rendering)
      maxDiffPixels: 100,
      // Threshold for per-pixel color comparison (0 = exact, 1 = any)
      threshold: 0.2,
    },
  },
  webServer: {
    command: 'pnpm dev',
    port: 11173,
    reuseExistingServer: true,
    // Allow extra time for Vite dep optimization on first start
    timeout: 30_000,
  },
});
