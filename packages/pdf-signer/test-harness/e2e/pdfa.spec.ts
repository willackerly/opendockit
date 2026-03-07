/**
 * E2E tests for PDF/A archival compliance.
 *
 * Tests saving PDFs as PDF/A-1b and PDF/A-2b, verifying metadata presence,
 * and testing PDF/A + sign workflows.
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

test.describe('PDF/A-1b', () => {
  test('save as PDF/A-1b — downloads valid PDF', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.click('#save-pdfa1b');
    await expect(page.locator('#log-output')).toContainText('Saved as PDF/A-1b', {
      timeout: 10_000,
    });

    const download = await downloadPromise;
    const downloadPath = path.join(TMP_DIR, 'pdfa-1b.pdf');
    await download.saveAs(downloadPath);
    expect(fs.existsSync(downloadPath)).toBe(true);

    const fileSize = fs.statSync(downloadPath).size;
    expect(fileSize).toBeGreaterThan(1000);

    // Validate structure
    const qpdf = findBin('qpdf');
    if (qpdf) {
      const result = execSync(`"${qpdf}" --check "${downloadPath}" 2>&1`, {
        encoding: 'utf8',
        timeout: 10_000,
      });
      console.log('qpdf --check PDF/A-1b:', result.trim());
    }
  });

  test('PDF/A-1b contains XMP metadata', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.click('#save-pdfa1b');
    await expect(page.locator('#log-output')).toContainText('Saved as PDF/A-1b', {
      timeout: 10_000,
    });

    const download = await downloadPromise;
    const downloadPath = path.join(TMP_DIR, 'pdfa-1b-metadata.pdf');
    await download.saveAs(downloadPath);

    // Check for XMP metadata and PDF/A markers in the raw PDF bytes
    const pdfContent = fs.readFileSync(downloadPath, 'latin1');
    // PDF/A-1b should contain XMP metadata with pdfaid namespace
    expect(pdfContent).toContain('pdfaid');
  });

  test('PDF/A-1b then sign — produces valid signed PDF', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Save as PDF/A-1b first
    const pdfaDownloadPromise = page.waitForEvent('download');
    await page.click('#save-pdfa1b');
    await expect(page.locator('#log-output')).toContainText('Saved as PDF/A-1b', {
      timeout: 10_000,
    });

    const pdfaDownload = await pdfaDownloadPromise;
    const pdfaPath = path.join(TMP_DIR, 'pdfa-1b-then-sign.pdf');
    await pdfaDownload.saveAs(pdfaPath);

    // Upload the PDF/A file
    await page.evaluate(() => {
      document.getElementById('log-output')!.innerHTML = '';
    });
    const fileInput = page.locator('#file-input');
    await fileInput.setInputFiles(pdfaPath);
    await expect(page.locator('#fields-section')).toBeVisible();

    // Sign
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Download signed PDF/A
    const signDownloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const signDownload = await signDownloadPromise;

    const signedPath = path.join(TMP_DIR, 'pdfa-1b-signed.pdf');
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

test.describe('PDF/A-2b', () => {
  test('save as PDF/A-2b — downloads valid PDF', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.click('#save-pdfa2b');
    await expect(page.locator('#log-output')).toContainText('Saved as PDF/A-2b', {
      timeout: 10_000,
    });

    const download = await downloadPromise;
    const downloadPath = path.join(TMP_DIR, 'pdfa-2b.pdf');
    await download.saveAs(downloadPath);
    expect(fs.existsSync(downloadPath)).toBe(true);

    const fileSize = fs.statSync(downloadPath).size;
    expect(fileSize).toBeGreaterThan(1000);

    // Validate structure
    const qpdf = findBin('qpdf');
    if (qpdf) {
      const result = execSync(`"${qpdf}" --check "${downloadPath}" 2>&1`, {
        encoding: 'utf8',
        timeout: 10_000,
      });
      console.log('qpdf --check PDF/A-2b:', result.trim());
    }
  });

  test('PDF/A-2b contains XMP metadata', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.click('#save-pdfa2b');
    await expect(page.locator('#log-output')).toContainText('Saved as PDF/A-2b', {
      timeout: 10_000,
    });

    const download = await downloadPromise;
    const downloadPath = path.join(TMP_DIR, 'pdfa-2b-metadata.pdf');
    await download.saveAs(downloadPath);

    const pdfContent = fs.readFileSync(downloadPath, 'latin1');
    expect(pdfContent).toContain('pdfaid');
  });

  test('PDF/A-2b then sign — produces valid signed PDF', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Save as PDF/A-2b
    const pdfaDownloadPromise = page.waitForEvent('download');
    await page.click('#save-pdfa2b');
    await expect(page.locator('#log-output')).toContainText('Saved as PDF/A-2b', {
      timeout: 10_000,
    });

    const pdfaDownload = await pdfaDownloadPromise;
    const pdfaPath = path.join(TMP_DIR, 'pdfa-2b-then-sign.pdf');
    await pdfaDownload.saveAs(pdfaPath);

    // Upload
    await page.evaluate(() => {
      document.getElementById('log-output')!.innerHTML = '';
    });
    const fileInput = page.locator('#file-input');
    await fileInput.setInputFiles(pdfaPath);
    await expect(page.locator('#fields-section')).toBeVisible();

    // Sign
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Download
    const signDownloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const signDownload = await signDownloadPromise;

    const signedPath = path.join(TMP_DIR, 'pdfa-2b-signed.pdf');
    await signDownload.saveAs(signedPath);

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

test.describe('PDF/A from created content', () => {
  test('create form + save as PDF/A-1b', async ({ page }) => {
    await page.goto('/');

    // Create form
    await page.click('#create-form');
    await expect(page.locator('#log-output')).toContainText('Created form', {
      timeout: 10_000,
    });

    // Save as PDF/A-1b
    const downloadPromise = page.waitForEvent('download');
    await page.click('#save-pdfa1b');
    await expect(page.locator('#log-output')).toContainText('Saved as PDF/A-1b', {
      timeout: 10_000,
    });

    const download = await downloadPromise;
    const downloadPath = path.join(TMP_DIR, 'pdfa-created-form.pdf');
    await download.saveAs(downloadPath);
    expect(fs.existsSync(downloadPath)).toBe(true);
  });

  test('create drawing + save as PDF/A-2b', async ({ page }) => {
    await page.goto('/');

    await page.click('#create-drawing');
    await expect(page.locator('#log-output')).toContainText('Created drawing demo', {
      timeout: 10_000,
    });

    const downloadPromise = page.waitForEvent('download');
    await page.click('#save-pdfa2b');
    await expect(page.locator('#log-output')).toContainText('Saved as PDF/A-2b', {
      timeout: 10_000,
    });

    const download = await downloadPromise;
    const downloadPath = path.join(TMP_DIR, 'pdfa-drawing.pdf');
    await download.saveAs(downloadPath);
    expect(fs.existsSync(downloadPath)).toBe(true);
  });
});
