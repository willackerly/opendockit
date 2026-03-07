/**
 * Console Watcher for Playwright E2E Tests
 *
 * Captures console.error, console.warn, and uncaught exceptions during
 * Playwright test execution. Every E2E test should assert no unexpected
 * console errors occurred — hidden errors indicate real bugs.
 *
 * Usage:
 *   import { attachConsoleWatcher } from './helpers/console-watcher';
 *
 *   test('my test', async ({ page }) => {
 *     const watcher = attachConsoleWatcher(page);
 *     // ... test actions ...
 *     watcher.assertNoErrors();
 *   });
 */

import type { Page, ConsoleMessage } from '@playwright/test';

export interface ConsoleWatcher {
  /** All console.error messages captured */
  errors: string[];
  /** All console.warn messages captured */
  warnings: string[];
  /** Uncaught exceptions / unhandled rejections */
  uncaughtErrors: string[];
  /** Throws if any console errors were captured (not in allowlist) */
  assertNoErrors(allowPatterns?: RegExp[]): void;
  /** Throws if any console warnings were captured */
  assertNoWarnings(allowPatterns?: RegExp[]): void;
  /** Clear all captured messages */
  clear(): void;
  /** Detach event listeners */
  detach(): void;
}

/**
 * Known noise patterns to always ignore. These come from third-party
 * libraries or dev tooling and don't indicate real bugs.
 */
const GLOBAL_NOISE_PATTERNS: RegExp[] = [
  // Vite HMR messages
  /\[vite\]/i,
  /\[hmr\]/i,
  // PDF.js dev warnings
  /pdf\.js/i,
  // React dev mode warnings (if ever used)
  /react-dom\.development/i,
  // Chrome DevTools
  /DevTools/,
  // Source map warnings
  /Failed to load resource.*\.map/,
  // Favicon
  /favicon\.ico/,
];

function matchesAnyPattern(msg: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(msg));
}

export function attachConsoleWatcher(page: Page): ConsoleWatcher {
  const errors: string[] = [];
  const warnings: string[] = [];
  const uncaughtErrors: string[] = [];

  const onConsole = (msg: ConsoleMessage) => {
    const text = msg.text();
    const type = msg.type();

    if (type === 'error') {
      if (!matchesAnyPattern(text, GLOBAL_NOISE_PATTERNS)) {
        errors.push(text);
      }
    } else if (type === 'warning') {
      if (!matchesAnyPattern(text, GLOBAL_NOISE_PATTERNS)) {
        warnings.push(text);
      }
    }
  };

  const onPageError = (error: Error) => {
    uncaughtErrors.push(`${error.name}: ${error.message}`);
  };

  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  const watcher: ConsoleWatcher = {
    errors,
    warnings,
    uncaughtErrors,

    assertNoErrors(allowPatterns: RegExp[] = []) {
      const allPatterns = [...GLOBAL_NOISE_PATTERNS, ...allowPatterns];
      const unexpected = [
        ...errors.filter((e) => !matchesAnyPattern(e, allPatterns)),
        ...uncaughtErrors.filter((e) => !matchesAnyPattern(e, allPatterns)),
      ];
      if (unexpected.length > 0) {
        throw new Error(
          `Unexpected console errors detected (${unexpected.length}):\n` +
            unexpected.map((e, i) => `  ${i + 1}. ${e}`).join('\n')
        );
      }
    },

    assertNoWarnings(allowPatterns: RegExp[] = []) {
      const allPatterns = [...GLOBAL_NOISE_PATTERNS, ...allowPatterns];
      const unexpected = warnings.filter(
        (w) => !matchesAnyPattern(w, allPatterns)
      );
      if (unexpected.length > 0) {
        throw new Error(
          `Unexpected console warnings detected (${unexpected.length}):\n` +
            unexpected.map((w, i) => `  ${i + 1}. ${w}`).join('\n')
        );
      }
    },

    clear() {
      errors.length = 0;
      warnings.length = 0;
      uncaughtErrors.length = 0;
    },

    detach() {
      page.removeListener('console', onConsole);
      page.removeListener('pageerror', onPageError);
    },
  };

  return watcher;
}
