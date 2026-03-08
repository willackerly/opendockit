/**
 * Given steps for loading files and enabling modes in the viewer.
 *
 * Reuses patterns from tools/viewer/e2e/edit-mode.spec.ts and
 * tools/viewer/e2e/font-loading.spec.ts.
 */
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const TEST_DATA = path.resolve(process.cwd(), 'test-data');

const { Given, Then } = createBdd();

// ---------------------------------------------------------------------------
// Given: file loading
// ---------------------------------------------------------------------------

Given(
  'a PPTX file {string} is loaded in the viewer',
  async ({ page }, filename: string) => {
    const filePath = path.resolve(TEST_DATA, filename);
    if (!fs.existsSync(filePath)) {
      // Check corpus subdirectory as fallback
      const corpusPath = path.resolve(TEST_DATA, 'corpus', filename);
      if (!fs.existsSync(corpusPath)) {
        throw new Error(
          `Test fixture not found: ${filename} (checked ${filePath} and ${corpusPath})`
        );
      }
      await loadPptxFile(page, corpusPath);
      return;
    }
    await loadPptxFile(page, filePath);
  }
);

Given(
  'a PDF file {string} is loaded in the viewer',
  async ({ page }, _filename: string) => {
    // PDF loading is not yet implemented -- mark pending
    throw new Error('PDF loading is not yet implemented');
  }
);

// ---------------------------------------------------------------------------
// Given: mode toggles
// ---------------------------------------------------------------------------

Given('edit mode is enabled', async ({ page }) => {
  const editBtn = page.locator('#btn-edit');
  const isActive = await editBtn.evaluate((el) =>
    el.classList.contains('active')
  );
  if (!isActive) {
    await editBtn.click();
  }
  await expect(editBtn).toHaveClass(/active/);
});

Given('inspector mode is enabled', async ({ page }) => {
  const inspectBtn = page.locator('#btn-inspect');
  const isActive = await inspectBtn.evaluate((el) =>
    el.classList.contains('active')
  );
  if (!isActive) {
    await inspectBtn.click();
  }
  await expect(inspectBtn).toHaveClass(/active/);
});

// ---------------------------------------------------------------------------
// Then: status assertions (also used by other steps)
// ---------------------------------------------------------------------------

Then('the status bar shows {string}', async ({ page }, text: string) => {
  const status = page.locator('#status');
  await expect(status).toContainText(text);
});

Then(
  /^at least (\d+) slides? (?:is|are) visible$/,
  async ({ page }, count: string) => {
    const slideCount = await page.locator('.slide-wrapper').count();
    expect(slideCount).toBeGreaterThanOrEqual(parseInt(count, 10));
  }
);

Then('no console errors are present', async ({ page }) => {
  // Collect console errors during a short observation window
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  // Give a moment for any deferred errors to surface
  await page.waitForTimeout(500);
  expect(
    errors.length,
    `Expected no console errors but found: ${errors.join('; ')}`
  ).toBe(0);
});

// ---------------------------------------------------------------------------
// Then: font assertions
// ---------------------------------------------------------------------------

Then(
  'the font {string} is registered in the browser',
  async ({ page }, fontFamily: string) => {
    const registered = await page.evaluate(() => {
      const families = new Set<string>();
      for (const face of document.fonts) {
        families.add(face.family);
      }
      return [...families];
    });
    expect(registered).toContain(fontFamily);
  }
);

Then(
  'at least {int} fonts are registered in the browser',
  async ({ page }, count: number) => {
    const registered = await page.evaluate(() => {
      const families = new Set<string>();
      for (const face of document.fonts) {
        families.add(face.family);
      }
      return families.size;
    });
    expect(registered).toBeGreaterThanOrEqual(count);
  }
);

Then(
  'the font {string} renders differently from sans-serif fallback',
  async ({ page }, fontFamily: string) => {
    const isUsable = await page.evaluate((family) => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 50;
      const ctx = canvas.getContext('2d')!;

      ctx.font = `24px '${family}', sans-serif`;
      ctx.fillText('ABCDEFGHabcdefgh0123456789', 0, 30);
      const targetData = ctx.getImageData(0, 0, 400, 50).data;

      ctx.clearRect(0, 0, 400, 50);
      ctx.font = '24px sans-serif';
      ctx.fillText('ABCDEFGHabcdefgh0123456789', 0, 30);
      const fallbackData = ctx.getImageData(0, 0, 400, 50).data;

      let diffPixels = 0;
      for (let i = 0; i < targetData.length; i += 4) {
        if (
          targetData[i] !== fallbackData[i] ||
          targetData[i + 1] !== fallbackData[i + 1] ||
          targetData[i + 2] !== fallbackData[i + 2] ||
          targetData[i + 3] !== fallbackData[i + 3]
        ) {
          diffPixels++;
        }
      }
      return diffPixels > 10;
    }, fontFamily);
    expect(isUsable).toBe(true);
  }
);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function loadPptxFile(
  page: import('@playwright/test').Page,
  filePath: string
): Promise<void> {
  await page.goto('/');
  const fileInput = page.locator('#file-input');
  await fileInput.setInputFiles(filePath);

  // Wait for slides to appear
  await page.waitForSelector('#slides-container.visible', { timeout: 60_000 });
  // Wait for loading indicator to disappear
  await page.waitForFunction(
    () =>
      !document.querySelector('#loading')?.classList.contains('visible'),
    { timeout: 90_000 }
  );
  // Wait for editKit to be ready
  await page.waitForFunction(
    () => document.body.dataset.editKitReady === 'true',
    { timeout: 30_000 }
  );
  // Small buffer for FontFace registration
  await page.waitForTimeout(500);
}
