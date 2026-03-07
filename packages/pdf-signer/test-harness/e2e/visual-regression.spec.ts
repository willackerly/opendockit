/**
 * Visual Regression Tests
 *
 * Uses Playwright's built-in toHaveScreenshot() for pixel-level comparison
 * of the PDF viewer panel. Each test renders a specific PDF state and captures
 * a screenshot of the viewer pane for baseline comparison.
 *
 * To update baselines: npx playwright test visual-regression --update-snapshots
 */

import { test, expect } from './helpers/test-setup';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DIR = path.resolve(__dirname, '..', 'tmp');

test.beforeAll(() => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
});

test.describe('visual regression', () => {
  test('demo PDF render', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Wait for PDF to render in viewer
    await page.waitForTimeout(1000);
    const viewer = page.locator('#pdf-viewer');
    await expect(viewer).toHaveScreenshot('demo-pdf-render.png', {
      maxDiffPixels: 500,
    });
  });

  test('drawing demo render', async ({ page }) => {
    await page.goto('/');
    await page.click('#create-drawing');
    await expect(page.locator('#log-output')).toContainText('Created drawing demo', {
      timeout: 10_000,
    });

    await page.waitForTimeout(1000);
    const viewer = page.locator('#pdf-viewer');
    await expect(viewer).toHaveScreenshot('drawing-demo-render.png', {
      maxDiffPixels: 500,
    });
  });

  test('signed PDF render', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    await page.waitForTimeout(1000);
    const viewer = page.locator('#pdf-viewer');
    await expect(viewer).toHaveScreenshot('signed-pdf-render.png', {
      maxDiffPixels: 500,
    });
  });

  test('form fields render', async ({ page }) => {
    await page.goto('/');
    await page.click('#create-form');
    await expect(page.locator('#log-output')).toContainText('Created form', {
      timeout: 10_000,
    });

    await page.waitForTimeout(1000);
    const viewer = page.locator('#pdf-viewer');
    await expect(viewer).toHaveScreenshot('form-fields-render.png', {
      maxDiffPixels: 500,
    });
  });

  test('filled form render', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    await page.fill('[data-field="recipient.name"]', 'Visual Test Name');
    await page.click('#apply-fields');
    await expect(page.locator('#log-output')).toContainText('Applied');

    await page.waitForTimeout(1000);
    const viewer = page.locator('#pdf-viewer');
    await expect(viewer).toHaveScreenshot('filled-form-render.png', {
      maxDiffPixels: 500,
    });
  });

  test('annotations render', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    await page.click('#add-annotations');
    await expect(page.locator('#log-output')).toContainText('Added 4 annotations');

    await page.waitForTimeout(1000);
    const viewer = page.locator('#pdf-viewer');
    await expect(viewer).toHaveScreenshot('annotations-render.png', {
      maxDiffPixels: 500,
    });
  });

  test('redaction annotation render', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    await page.click('#add-redaction');
    await expect(page.locator('#log-output')).toContainText('Redaction annotation added');

    await page.waitForTimeout(1000);
    const viewer = page.locator('#pdf-viewer');
    await expect(viewer).toHaveScreenshot('redaction-render.png', {
      maxDiffPixels: 500,
    });
  });

  test('counter-signed PDF render', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    await page.click('#sign-user2');
    await expect(page.locator('#log-output')).toContainText('Signed by User 2!', {
      timeout: 15_000,
    });

    await page.waitForTimeout(1000);
    const viewer = page.locator('#pdf-viewer');
    await expect(viewer).toHaveScreenshot('counter-signed-render.png', {
      maxDiffPixels: 500,
    });
  });

  test('flattened form render', async ({ page }) => {
    await page.goto('/');
    await page.click('#create-form');
    await expect(page.locator('#log-output')).toContainText('Created form', {
      timeout: 10_000,
    });

    await page.click('#flatten-form');
    await expect(page.locator('#log-output')).toContainText('Flatten', {
      timeout: 10_000,
    });

    await page.waitForTimeout(1000);
    const viewer = page.locator('#pdf-viewer');
    await expect(viewer).toHaveScreenshot('flattened-form-render.png', {
      maxDiffPixels: 500,
    });
  });

  test('sidebar layout', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    const sidebar = page.locator('#sidebar');
    await expect(sidebar).toHaveScreenshot('sidebar-layout.png', {
      maxDiffPixels: 500,
    });
  });
});

// ── NativeRenderer visual regression ──────────────────────────────
// Higher maxDiffPixels threshold because NativeRenderer Phase 1 has known
// differences: system fonts instead of embedded PDF fonts, no JPEG image
// rendering, approximate CMYK-to-RGB conversion.

test.describe('visual regression (NativeRenderer)', () => {
  test('demo PDF render (native)', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    await page.selectOption('#renderer-select', 'native');
    await page.waitForTimeout(2000);

    const viewer = page.locator('#pdf-viewer');
    await expect(viewer).toHaveScreenshot('native-demo-pdf-render.png', {
      maxDiffPixels: 5000,
    });
  });

  test('drawing demo render (native)', async ({ page }) => {
    await page.goto('/');
    await page.click('#create-drawing');
    await expect(page.locator('#log-output')).toContainText('Created drawing demo', {
      timeout: 10_000,
    });

    await page.selectOption('#renderer-select', 'native');
    await page.waitForTimeout(2000);

    const viewer = page.locator('#pdf-viewer');
    await expect(viewer).toHaveScreenshot('native-drawing-demo-render.png', {
      maxDiffPixels: 5000,
    });
  });

  test('form render (native)', async ({ page }) => {
    await page.goto('/');
    await page.click('#create-form');
    await expect(page.locator('#log-output')).toContainText('Created form', {
      timeout: 10_000,
    });

    await page.selectOption('#renderer-select', 'native');
    await page.waitForTimeout(2000);

    const viewer = page.locator('#pdf-viewer');
    await expect(viewer).toHaveScreenshot('native-form-render.png', {
      maxDiffPixels: 5000,
    });
  });
});
