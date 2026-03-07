/**
 * E2E tests for the copyPages feature.
 *
 * Tests copying pages to new documents, verifying page counts,
 * signing copied documents, and ensuring form fields don't carry over.
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

test.describe('copy pages', () => {
  test('copy page 1 to new document — produces valid PDF', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.click('#copy-pages');
    await expect(page.locator('#log-output')).toContainText('Copied page 1', {
      timeout: 10_000,
    });

    const download = await downloadPromise;
    const downloadPath = path.join(TMP_DIR, 'copy-page-valid.pdf');
    await download.saveAs(downloadPath);
    expect(fs.existsSync(downloadPath)).toBe(true);

    // Validate structure with qpdf
    const qpdf = findBin('qpdf');
    if (qpdf) {
      const result = execSync(`"${qpdf}" --check "${downloadPath}" 2>&1`, {
        encoding: 'utf8',
        timeout: 10_000,
      });
      console.log('qpdf --check copy:', result.trim());
    }
  });

  test('copied page PDF can be uploaded and has 1 page', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // The demo has 2 pages; copying page 1 should produce 1 page
    const downloadPromise = page.waitForEvent('download');
    await page.click('#copy-pages');
    await expect(page.locator('#log-output')).toContainText('Copied page 1', {
      timeout: 10_000,
    });

    const download = await downloadPromise;
    const downloadPath = path.join(TMP_DIR, 'copy-page-count.pdf');
    await download.saveAs(downloadPath);

    // Re-upload the copied PDF
    await page.evaluate(() => {
      document.getElementById('log-output')!.innerHTML = '';
    });
    const fileInput = page.locator('#file-input');
    await fileInput.setInputFiles(downloadPath);

    await expect(page.locator('#fields-section')).toBeVisible();
    // The new doc should have 1 page
    await expect(page.locator('#log-output')).toContainText('Pages: 1');
  });

  test('copy page from form PDF — no form fields in new doc', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Demo PDF has 4 form fields
    await expect(page.locator('#log-output')).toContainText('4 form field(s)');

    // Copy page 1
    const downloadPromise = page.waitForEvent('download');
    await page.click('#copy-pages');
    await expect(page.locator('#log-output')).toContainText('Copied page 1', {
      timeout: 10_000,
    });

    const download = await downloadPromise;
    const downloadPath = path.join(TMP_DIR, 'copy-page-no-fields.pdf');
    await download.saveAs(downloadPath);

    // Re-upload and verify no form fields
    await page.evaluate(() => {
      document.getElementById('log-output')!.innerHTML = '';
    });
    const fileInput = page.locator('#file-input');
    await fileInput.setInputFiles(downloadPath);

    await expect(page.locator('#fields-section')).toBeVisible();
    // Copied pages create a fresh document — no fields expected
    await expect(page.locator('#fields-container')).toContainText('No form fields');
  });

  test('copy page then sign — produces valid signed PDF', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Copy page first
    const copyDownloadPromise = page.waitForEvent('download');
    await page.click('#copy-pages');
    await expect(page.locator('#log-output')).toContainText('Copied page 1', {
      timeout: 10_000,
    });

    const copyDownload = await copyDownloadPromise;
    const copyPath = path.join(TMP_DIR, 'copy-then-sign-intermediate.pdf');
    await copyDownload.saveAs(copyPath);

    // Upload the copied PDF
    await page.evaluate(() => {
      document.getElementById('log-output')!.innerHTML = '';
    });
    const fileInput = page.locator('#file-input');
    await fileInput.setInputFiles(copyPath);
    await expect(page.locator('#fields-section')).toBeVisible();

    // Sign the copied PDF
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Download signed copy
    const signDownloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const signDownload = await signDownloadPromise;

    const signedPath = path.join(TMP_DIR, 'copy-then-signed.pdf');
    await signDownload.saveAs(signedPath);

    // Validate signature
    const pdfsig = findBin('pdfsig');
    if (pdfsig) {
      let result: string;
      try {
        result = execSync(`"${pdfsig}" "${signedPath}" 2>&1`, {
          encoding: 'utf8',
          timeout: 10_000,
        });
      } catch (err: any) {
        result = err.stdout || '';
      }
      expect(result).toContain('Signature #1');
      expect(result).toContain('Signature is Valid');
    }
  });
});
