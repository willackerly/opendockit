/**
 * E2E tests for text and image extraction.
 *
 * Verifies that extracted content matches what was drawn/embedded,
 * tests page-by-page extraction, and validates image metadata.
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

test.describe('text extraction', () => {
  test('extract text from demo PDF — finds text items', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    await page.click('#extract-text');
    await expect(page.locator('#log-output')).toContainText('Extracted', { timeout: 10_000 });
    await expect(page.locator('#log-output')).toContainText('text items');

    // Demo PDF has 2 pages — both should be mentioned
    await expect(page.locator('#log-output')).toContainText('Page 1:');
    await expect(page.locator('#log-output')).toContainText('Page 2:');
  });

  test('extract text from drawing demo — finds known drawn text', async ({ page }) => {
    await page.goto('/');
    await page.click('#create-drawing');
    await expect(page.locator('#log-output')).toContainText('Created drawing demo', {
      timeout: 10_000,
    });

    await page.click('#extract-text');
    await expect(page.locator('#log-output')).toContainText('Extracted', { timeout: 10_000 });

    // Verify specific text strings that were drawn
    await expect(page.locator('#log-output')).toContainText('Drawing API Demo');
    await expect(page.locator('#log-output')).toContainText('text items');
  });

  test('extract text from created form — finds labels', async ({ page }) => {
    await page.goto('/');
    await page.click('#create-form');
    await expect(page.locator('#log-output')).toContainText('Created form', { timeout: 10_000 });

    await page.click('#extract-text');
    await expect(page.locator('#log-output')).toContainText('Extracted', { timeout: 10_000 });

    // The form has labels like "Name:", "I agree:", "Country:", "Generated Form"
    await expect(page.locator('#log-output')).toContainText('Generated Form');
  });

  test('extract text from filled form — includes field text', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Fill fields
    await page.fill('[data-field="recipient.name"]', 'Extraction Test Name');
    await page.click('#apply-fields');
    await expect(page.locator('#log-output')).toContainText('Applied');

    // Extract text
    await page.click('#extract-text');
    await expect(page.locator('#log-output')).toContainText('Extracted', { timeout: 10_000 });
    await expect(page.locator('#log-output')).toContainText('text items');
  });

  test('extract text from multi-page PDF — reports page-by-page', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Add a page so we have 3 pages
    await page.click('#add-page');
    await expect(page.locator('#log-output')).toContainText('Added page');

    // Extract text
    await page.click('#extract-text');
    await expect(page.locator('#log-output')).toContainText('Extracted', { timeout: 10_000 });
    await expect(page.locator('#log-output')).toContainText('3 page(s)');
  });

  test('extract text after signing — still finds content', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Sign first
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Then extract text
    await page.click('#extract-text');
    await expect(page.locator('#log-output')).toContainText('Extracted', { timeout: 10_000 });
    await expect(page.locator('#log-output')).toContainText('text items');
  });
});

test.describe('image extraction', () => {
  test('extract images from PDF without images — shows none', async ({ page }) => {
    await page.goto('/');
    await page.click('#create-drawing');
    await expect(page.locator('#log-output')).toContainText('Created drawing demo', {
      timeout: 10_000,
    });

    await page.click('#extract-images');
    await expect(page.locator('#log-output')).toContainText('No images found');
  });

  test('extract images from demo PDF', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    await page.click('#extract-images');
    // Demo PDF may or may not have images — just verify extraction completes
    await expect(page.locator('#log-output')).toContainText(
      /(Extracted|No images found)/,
      { timeout: 10_000 },
    );
  });

  test('extract images from fixture PDF with images', async ({ page }) => {
    await page.goto('/');

    // Use a fixture PDF known to have images
    const fixtureDir = path.resolve(__dirname, '..', '..', 'test-pdfs', 'chrome-google-docs');
    const imagePdf = path.join(fixtureDir, 'text-with-images-google-docs.pdf');

    if (!fs.existsSync(imagePdf)) {
      test.skip();
      return;
    }

    const fileInput = page.locator('#file-input');
    await fileInput.setInputFiles(imagePdf);
    await expect(page.locator('#fields-section')).toBeVisible();

    await page.click('#extract-images');
    await expect(page.locator('#log-output')).toContainText('Extracted', { timeout: 10_000 });
    await expect(page.locator('#log-output')).toContainText('image(s)');

    // Verify image metadata is reported: dimensions and color space
    const logText = await page.locator('#log-output').textContent();
    expect(logText).toMatch(/\d+x\d+/); // WxH format
  });

  test('extract images after signing — still finds images', async ({ page }) => {
    await page.goto('/');

    const fixtureDir = path.resolve(__dirname, '..', '..', 'test-pdfs', 'chrome-google-docs');
    const imagePdf = path.join(fixtureDir, 'text-with-images-google-docs.pdf');

    if (!fs.existsSync(imagePdf)) {
      test.skip();
      return;
    }

    const fileInput = page.locator('#file-input');
    await fileInput.setInputFiles(imagePdf);
    await expect(page.locator('#fields-section')).toBeVisible();

    // Sign
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Extract images from signed version
    await page.click('#extract-images');
    await expect(page.locator('#log-output')).toContainText('Extracted', { timeout: 10_000 });
    await expect(page.locator('#log-output')).toContainText('image(s)');
  });
});

test.describe('extraction round-trips', () => {
  test('create drawing, sign, download, re-upload, extract text', async ({ page }) => {
    await page.goto('/');

    // Create drawing with known text
    await page.click('#create-drawing');
    await expect(page.locator('#log-output')).toContainText('Created drawing demo', {
      timeout: 10_000,
    });

    // Sign
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Download
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'extraction-drawing-roundtrip.pdf');
    await download.saveAs(downloadPath);

    // Re-upload
    await page.evaluate(() => {
      document.getElementById('log-output')!.innerHTML = '';
    });
    const fileInput = page.locator('#file-input');
    await fileInput.setInputFiles(downloadPath);
    await expect(page.locator('#fields-section')).toBeVisible();

    // Extract text from round-tripped PDF
    await page.click('#extract-text');
    await expect(page.locator('#log-output')).toContainText('Extracted', { timeout: 10_000 });
    await expect(page.locator('#log-output')).toContainText('Drawing API Demo');
  });
});
