/**
 * E2E tests for the viewer's core file-loading and UI flows.
 *
 * Covers: initial empty state, PPTX loading, file switching,
 * re-opening the same file (regression for fileInput.value bug),
 * and inspector/edit mode toggles.
 */

import { test, expect, type Page, type Locator } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DATA = path.resolve(__dirname, '../../../test-data');
const BASIC_SHAPES_PATH = path.resolve(TEST_DATA, 'basic-shapes.pptx');
const TEXT_STRESS_PATH = path.resolve(TEST_DATA, 'text-stress-test.pptx');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Load a file in the viewer and wait for rendering to complete.
 * Does NOT wait for editKit (faster than edit-mode's loadPptx).
 */
async function loadFile(page: Page, filePath: string): Promise<void> {
  // Wait for viewer module to initialize (attaches event listeners)
  await page.waitForFunction(() => !!(window as any).__debug, { timeout: 10_000 });

  const fileInput = page.locator('#file-input');
  await fileInput.setInputFiles(filePath);

  await page.waitForSelector('#slides-container.visible', { timeout: 60_000 });
  await page.waitForFunction(
    () => !document.querySelector('#loading')?.classList.contains('visible'),
    { timeout: 90_000 },
  );
}

/**
 * Check whether a slide image has actual rendered content (not all-white).
 * Samples pixels from the image data and checks for non-white values.
 */
async function isImageNonBlank(imgLocator: Locator): Promise<boolean> {
  return imgLocator.evaluate((img: HTMLImageElement) => {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    // Sample a grid of pixels across the image
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let nonWhite = 0;
    const step = Math.max(1, Math.floor(data.length / 4 / 1000)); // ~1000 samples
    for (let i = 0; i < data.length; i += step * 4) {
      const r = data[i],
        g = data[i + 1],
        b = data[i + 2];
      if (r < 250 || g < 250 || b < 250) nonWhite++;
    }
    return nonWhite > 10; // At least some non-white pixels
  });
}

// ---------------------------------------------------------------------------
// Tests — Initial state
// ---------------------------------------------------------------------------

test.describe('Viewer — initial state', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for viewer module to finish initializing
    await page.waitForFunction(() => !!(window as any).__debug, { timeout: 10_000 });
  });

  test('shows empty state on first load', async ({ page }) => {
    const dropZone = page.locator('#drop-zone');
    await expect(dropZone).toHaveClass(/empty/);

    const emptyState = page.locator('#empty-state');
    await expect(emptyState).toBeVisible();

    const slidesContainer = page.locator('#slides-container');
    await expect(slidesContainer).not.toHaveClass(/visible/);

    const formatBadge = page.locator('#format-badge');
    await expect(formatBadge).toBeHidden();

    const btnSave = page.locator('#btn-save');
    await expect(btnSave).toBeDisabled();
  });

  test('shows initial status message', async ({ page }) => {
    const status = page.locator('#status');
    await expect(status).toContainText('No file loaded');
  });
});

// ---------------------------------------------------------------------------
// Tests — File loading
// ---------------------------------------------------------------------------

test.describe('Viewer — file loading', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('loads PPTX and renders slides', async ({ page }) => {
    await loadFile(page, BASIC_SHAPES_PATH);

    const slidesContainer = page.locator('#slides-container');
    await expect(slidesContainer).toHaveClass(/visible/);

    const wrappers = page.locator('.slide-wrapper');
    const count = await wrappers.count();
    expect(count).toBeGreaterThan(0);

    const status = page.locator('#status');
    await expect(status).toContainText('Rendered');
  });

  test('displays file name and format badge', async ({ page }) => {
    await loadFile(page, BASIC_SHAPES_PATH);

    const fileName = page.locator('#file-name');
    await expect(fileName).toContainText('basic-shapes.pptx');

    const formatBadge = page.locator('#format-badge');
    await expect(formatBadge).toBeVisible();
    await expect(formatBadge).toHaveClass(/pptx/);
    await expect(formatBadge).toContainText('PPTX');
  });

  test('shows slide info in footer', async ({ page }) => {
    await loadFile(page, BASIC_SHAPES_PATH);

    const slideInfo = page.locator('#slide-info');
    await expect(slideInfo).toBeVisible();
    // Should show something like "3 slides @ 2x"
    const text = await slideInfo.textContent();
    expect(text).toMatch(/\d+\s+slide/i);
  });

  test('rendered slides are non-blank images', async ({ page }) => {
    await loadFile(page, BASIC_SHAPES_PATH);

    const firstImage = page.locator('.slide-image').first();
    await expect(firstImage).toBeVisible();

    // Verify it's a data URL PNG
    const src = await firstImage.getAttribute('src');
    expect(src).toMatch(/^data:image\/png/);

    // Verify the image has actual content
    const nonBlank = await isImageNonBlank(firstImage);
    expect(nonBlank).toBe(true);
  });

  test('slide wrappers have sequential data-slide-index', async ({ page }) => {
    await loadFile(page, BASIC_SHAPES_PATH);

    const wrappers = page.locator('.slide-wrapper');
    const count = await wrappers.count();
    expect(count).toBeGreaterThan(0);

    const firstIndex = await wrappers.first().getAttribute('data-slide-index');
    expect(firstIndex).toBe('0');

    const lastIndex = await wrappers.last().getAttribute('data-slide-index');
    expect(lastIndex).toBe(String(count - 1));
  });

  test('loading indicator hidden after load', async ({ page }) => {
    await loadFile(page, BASIC_SHAPES_PATH);

    const loading = page.locator('#loading');
    await expect(loading).not.toHaveClass(/visible/);
  });

  test('re-opening same file works', async ({ page }) => {
    // Load file first time
    await loadFile(page, BASIC_SHAPES_PATH);
    const wrappers1 = page.locator('.slide-wrapper');
    const count1 = await wrappers1.count();
    expect(count1).toBeGreaterThan(0);

    // Load same file again (regression test for fileInput.value bug)
    await loadFile(page, BASIC_SHAPES_PATH);
    const wrappers2 = page.locator('.slide-wrapper');
    const count2 = await wrappers2.count();
    expect(count2).toBe(count1);

    const status = page.locator('#status');
    await expect(status).toContainText('Rendered');
  });
});

// ---------------------------------------------------------------------------
// Tests — Switching files
// ---------------------------------------------------------------------------

test.describe('Viewer — switching files', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('opening a different file replaces previous', async ({ page }) => {
    await loadFile(page, BASIC_SHAPES_PATH);
    const fileName1 = await page.locator('#file-name').textContent();
    expect(fileName1).toContain('basic-shapes');

    await loadFile(page, TEXT_STRESS_PATH);
    const fileName2 = await page.locator('#file-name').textContent();
    expect(fileName2).toContain('text-stress-test');

    // Slides should still be rendered
    const wrappers = page.locator('.slide-wrapper');
    const count = await wrappers.count();
    expect(count).toBeGreaterThan(0);
  });

  test('error banner cleared when loading new file', async ({ page }) => {
    // Inject a fake error banner
    await page.evaluate(() => {
      const banner = document.querySelector('#error-banner') as HTMLElement;
      banner.textContent = 'Fake error';
      banner.classList.add('visible');
    });
    const banner = page.locator('#error-banner');
    await expect(banner).toHaveClass(/visible/);

    // Load a valid file — error should clear
    await loadFile(page, BASIC_SHAPES_PATH);
    await expect(banner).not.toHaveClass(/visible/);
  });
});

// ---------------------------------------------------------------------------
// Tests — Inspector toggle
// ---------------------------------------------------------------------------

test.describe('Viewer — inspector toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await loadFile(page, BASIC_SHAPES_PATH);
  });

  test('inspector button toggles active state', async ({ page }) => {
    const btnInspect = page.locator('#btn-inspect');

    // Activate inspector
    await btnInspect.click();
    await expect(btnInspect).toHaveClass(/active/);

    const wrappers = page.locator('.slide-wrapper');
    const firstWrapper = wrappers.first();
    await expect(firstWrapper).toHaveClass(/inspector-active/);

    // Deactivate inspector
    await btnInspect.click();
    await expect(btnInspect).not.toHaveClass(/active/);
    await expect(firstWrapper).not.toHaveClass(/inspector-active/);
  });

  test('inspector and edit modes are mutually exclusive', async ({ page }) => {
    const btnInspect = page.locator('#btn-inspect');
    const btnEdit = page.locator('#btn-edit');

    // Activate inspector first
    await btnInspect.click();
    await expect(btnInspect).toHaveClass(/active/);

    // Activate edit — inspector should deactivate
    await btnEdit.click();
    await expect(btnEdit).toHaveClass(/active/);
    await expect(btnInspect).not.toHaveClass(/active/);

    // Verify slide wrappers reflect edit mode, not inspector
    const firstWrapper = page.locator('.slide-wrapper').first();
    await expect(firstWrapper).toHaveClass(/edit-active/);
    await expect(firstWrapper).not.toHaveClass(/inspector-active/);
  });

  test('scrolling to a slide makes it visible', async ({ page }) => {
    const wrappers = page.locator('.slide-wrapper');
    const count = await wrappers.count();
    if (count < 2) {
      test.skip();
      return;
    }

    const lastWrapper = wrappers.last();
    await lastWrapper.scrollIntoViewIfNeeded();

    // Verify the wrapper is in the viewport
    const isInViewport = await lastWrapper.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return (
        rect.top < window.innerHeight &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.right > 0
      );
    });
    expect(isInViewport).toBe(true);
  });
});
