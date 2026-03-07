/**
 * Shared Test Setup for E2E Tests
 *
 * Provides a pre-configured `test` fixture that automatically attaches
 * a console watcher to every test and asserts no errors after each test.
 *
 * Usage:
 *   import { test, expect } from './helpers/test-setup';
 *
 *   test('my test', async ({ page, consoleWatcher }) => {
 *     // ... test actions ...
 *     // Console errors are automatically checked in afterEach
 *     // Use consoleWatcher.assertNoErrors([/pattern/]) for custom allow patterns
 *   });
 */

import { test as base, expect } from '@playwright/test';
import { attachConsoleWatcher, type ConsoleWatcher } from './console-watcher';

/**
 * Extended test fixture that adds a consoleWatcher to every test.
 * After each test, assertNoErrors() is called automatically.
 */
export const test = base.extend<{ consoleWatcher: ConsoleWatcher }>({
  consoleWatcher: async ({ page }, use) => {
    const watcher = attachConsoleWatcher(page);
    await use(watcher);
    // Automatic assertion after every test — any uncaught console.error = failure
    // Tests that expect specific errors should call watcher.assertNoErrors([/pattern/])
    // BEFORE this runs, which will clear the errors.
    try {
      watcher.assertNoErrors();
    } finally {
      watcher.detach();
    }
  },
});

export { expect };
