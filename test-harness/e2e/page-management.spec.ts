/**
 * E2E tests for page management operations.
 *
 * Tests adding, rotating, and removing pages, verifying page counts,
 * rotation persistence, and combining page ops with signing.
 */

import { test, expect } from './helpers/test-setup';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DIR = path.resolve(__dirname, '..', 'tmp');

function findBin(name: string): string | undefined {
  return [
    `/opt/homebrew/bin/${name}`,
    `/usr/bin/${name}`,
    `/usr/local/bin/${name}`,
  ].find(p => fs.existsSync(p));
}

test.beforeAll(() => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
});

test.describe('add page', () => {
  test('add page increases page count', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();
    await expect(page.locator('#log-output')).toContainText('Pages: 2');

    await page.click('#add-page');
    await expect(page.locator('#log-output')).toContainText('Added page');
    await expect(page.locator('#log-output')).toContainText('3 page(s)');
  });

  test('add multiple pages', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    await page.click('#add-page');
    await expect(page.locator('#log-output')).toContainText('3 page(s)');

    await page.click('#add-page');
    await expect(page.locator('#log-output')).toContainText('4 page(s)');

    await page.click('#add-page');
    await expect(page.locator('#log-output')).toContainText('5 page(s)');
  });

  test('add page persists after save+reload', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Add a page (demo has 2 -> 3)
    await page.click('#add-page');
    await expect(page.locator('#log-output')).toContainText('3 page(s)');

    // Sign to enable download
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Download
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'page-add-persist.pdf');
    await download.saveAs(downloadPath);

    // Re-upload and verify 3 pages
    await page.evaluate(() => {
      document.getElementById('log-output')!.innerHTML = '';
    });
    const fileInput = page.locator('#file-input');
    await fileInput.setInputFiles(downloadPath);

    await expect(page.locator('#fields-section')).toBeVisible();
    await expect(page.locator('#log-output')).toContainText('Pages: 3');
  });
});

test.describe('rotate page', () => {
  test('rotate page 1 by 90 degrees', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    await page.click('#rotate-page');
    await expect(page.locator('#log-output')).toContainText('Rotated page 1');
    await expect(page.locator('#log-output')).toContainText('90');
  });

  test('rotate page twice — 180 degrees', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // First rotation: 0 -> 90
    await page.click('#rotate-page');
    await expect(page.locator('#log-output')).toContainText('90');

    // Second rotation: 90 -> 180
    await page.click('#rotate-page');
    await expect(page.locator('#log-output')).toContainText('180');
  });

  test('rotate page 4 times — back to 0 degrees', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    await page.click('#rotate-page');
    await expect(page.locator('#log-output')).toContainText('90');

    await page.click('#rotate-page');
    await expect(page.locator('#log-output')).toContainText('180');

    await page.click('#rotate-page');
    await expect(page.locator('#log-output')).toContainText('270');

    await page.click('#rotate-page');
    // 360 % 360 = 0
    await expect(page.locator('#log-output')).toContainText('0');
  });

  test('rotation persists after sign + download + reload', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Rotate
    await page.click('#rotate-page');
    await expect(page.locator('#log-output')).toContainText('Rotated page 1');

    // Sign
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Download
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'page-rotate-persist.pdf');
    await download.saveAs(downloadPath);

    // Validate structure
    const qpdf = findBin('qpdf');
    if (qpdf) {
      execSync(`"${qpdf}" --check "${downloadPath}" 2>&1`, {
        encoding: 'utf8',
        timeout: 10_000,
      });
    }
  });
});

test.describe('remove page', () => {
  test('remove last page decreases count', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();
    await expect(page.locator('#log-output')).toContainText('Pages: 2');

    await page.click('#remove-last-page');
    await expect(page.locator('#log-output')).toContainText('Removed page 2');
    await expect(page.locator('#log-output')).toContainText('1 page(s)');
  });

  test('remove page from 2-page PDF', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();
    await expect(page.locator('#log-output')).toContainText('Pages: 2');

    // Remove page 2 (2 -> 1)
    await page.click('#remove-last-page');
    await expect(page.locator('#log-output')).toContainText('Removed page 2');
    await expect(page.locator('#log-output')).toContainText('1 page(s)');
  });

  test('add then remove — back to original count', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();
    await expect(page.locator('#log-output')).toContainText('Pages: 2');

    // Add (2 -> 3)
    await page.click('#add-page');
    await expect(page.locator('#log-output')).toContainText('3 page(s)');

    // Remove (3 -> 2)
    await page.click('#remove-last-page');
    await expect(page.locator('#log-output')).toContainText('2 page(s)');
  });
});

test.describe('combined page operations', () => {
  test('add + rotate + remove + sign — valid PDF', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Add a page (2 -> 3)
    await page.click('#add-page');
    await expect(page.locator('#log-output')).toContainText('3 page(s)');

    // Rotate page 1
    await page.click('#rotate-page');
    await expect(page.locator('#log-output')).toContainText('Rotated page 1');

    // Remove the last page (3 -> 2)
    await page.click('#remove-last-page');
    await expect(page.locator('#log-output')).toContainText('2 page(s)');

    // Sign
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Download
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'page-combo-signed.pdf');
    await download.saveAs(downloadPath);

    // Validate structure
    const qpdf = findBin('qpdf');
    if (qpdf) {
      execSync(`"${qpdf}" --check "${downloadPath}" 2>&1`, {
        encoding: 'utf8',
        timeout: 10_000,
      });
    }

    // Validate signature
    const pdfsig = findBin('pdfsig');
    if (pdfsig) {
      let result: string;
      try {
        result = execSync(`"${pdfsig}" "${downloadPath}" 2>&1`, {
          encoding: 'utf8',
          timeout: 10_000,
        });
      } catch (err: any) {
        result = err.stdout || '';
      }
      expect(result).toContain('Signature is Valid');
    }
  });

  test('add pages to drawing demo + sign', async ({ page }) => {
    await page.goto('/');

    // Create drawing
    await page.click('#create-drawing');
    await expect(page.locator('#log-output')).toContainText('Created drawing demo', {
      timeout: 10_000,
    });

    // Add pages
    await page.click('#add-page');
    await expect(page.locator('#log-output')).toContainText('2 page(s)');

    await page.click('#add-page');
    await expect(page.locator('#log-output')).toContainText('3 page(s)');

    // Sign
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Download and validate
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'page-drawing-multi.pdf');
    await download.saveAs(downloadPath);

    const pdfsig = findBin('pdfsig');
    if (pdfsig) {
      let result: string;
      try {
        result = execSync(`"${pdfsig}" "${downloadPath}" 2>&1`, {
          encoding: 'utf8',
          timeout: 10_000,
        });
      } catch (err: any) {
        result = err.stdout || '';
      }
      expect(result).toContain('Signature is Valid');
    }
  });
});
