/**
 * E2E tests for annotation workflows.
 *
 * Tests adding annotations to PDFs, signing annotated PDFs,
 * and verifying annotations survive signing and round-trip.
 */

import { test, expect } from './helpers/test-setup';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DIR = path.resolve(__dirname, '..', 'tmp');

test.beforeAll(() => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
});

test.describe('annotation workflow', () => {
  test('add annotations to demo PDF', async ({ page }) => {
    await page.goto('/');

    // Load demo PDF
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Add annotations
    await page.click('#add-annotations');
    await expect(page.locator('#log-output')).toContainText('Added 4 annotations');

    // Verify individual annotations were logged
    await expect(page.locator('#log-output')).toContainText('highlight annotation');
    await expect(page.locator('#log-output')).toContainText('rubber stamp');
    await expect(page.locator('#log-output')).toContainText('sticky note');
    await expect(page.locator('#log-output')).toContainText('rectangle annotation');

    // Download and validate with qpdf
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'annotated.pdf');
    await download.saveAs(downloadPath);

    const qpdfBin = ['/opt/homebrew/bin/qpdf', '/usr/bin/qpdf', '/usr/local/bin/qpdf']
      .find(p => fs.existsSync(p));
    if (qpdfBin) {
      const result = execSync(`"${qpdfBin}" --check "${downloadPath}" 2>&1`, {
        encoding: 'utf8',
        timeout: 10_000,
      });
      console.log('qpdf --check:', result.trim());
    }
  });

  test('annotate + sign', async ({ page }) => {
    await page.goto('/');

    // Load demo PDF
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Add annotations
    await page.click('#add-annotations');
    await expect(page.locator('#log-output')).toContainText('Added 4 annotations');

    // Sign
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Download and validate signature
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'annotated-signed.pdf');
    await download.saveAs(downloadPath);

    const pdfsigBin = ['/opt/homebrew/bin/pdfsig', '/usr/bin/pdfsig', '/usr/local/bin/pdfsig']
      .find(p => fs.existsSync(p));
    if (pdfsigBin) {
      let result: string;
      try {
        result = execSync(`"${pdfsigBin}" "${downloadPath}" 2>&1`, {
          encoding: 'utf8',
          timeout: 10_000,
        });
      } catch (err: any) {
        result = err.stdout || err.message || '';
      }
      expect(result).toContain('Signature #1');
      expect(result).toContain('Signature is Valid');
    }
  });

  test('annotate + sign + round-trip', async ({ page }) => {
    await page.goto('/');

    // Load demo PDF
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Add annotations
    await page.click('#add-annotations');
    await expect(page.locator('#log-output')).toContainText('Added 4 annotations');

    // Sign
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Download
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'annotated-round-trip.pdf');
    await download.saveAs(downloadPath);

    // Verify annotations preserved via qpdf --json
    const qpdfBin = ['/opt/homebrew/bin/qpdf', '/usr/bin/qpdf', '/usr/local/bin/qpdf']
      .find(p => fs.existsSync(p));
    if (qpdfBin) {
      const jsonOutput = execSync(
        `"${qpdfBin}" --json "${downloadPath}" 2>&1`,
        { encoding: 'utf8', timeout: 10_000, maxBuffer: 10 * 1024 * 1024 },
      );
      // Should contain annotation-related keys
      expect(jsonOutput).toContain('/Annots');
    }

    // Re-upload to verify form fields still work
    await page.evaluate(() => {
      document.getElementById('log-output')!.innerHTML = '';
    });
    const fileInput = page.locator('#file-input');
    await fileInput.setInputFiles(downloadPath);

    await expect(page.locator('#fields-section')).toBeVisible();
    await expect(page.locator('#log-output')).toContainText('Pages: 2');
  });

  test('annotate + dual sign workflow', async ({ page }) => {
    await page.goto('/');

    // Load demo PDF
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Add annotations before signing
    await page.click('#add-annotations');
    await expect(page.locator('#log-output')).toContainText('Added 4 annotations');

    // Sign as User 1
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Counter-sign as User 2
    await page.click('#sign-user2');
    await expect(page.locator('#log-output')).toContainText('Signed by User 2!', {
      timeout: 15_000,
    });

    // Download and validate both signatures
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'annotated-dual-sign.pdf');
    await download.saveAs(downloadPath);

    const pdfsigBin = ['/opt/homebrew/bin/pdfsig', '/usr/bin/pdfsig', '/usr/local/bin/pdfsig']
      .find(p => fs.existsSync(p));
    if (pdfsigBin) {
      let result: string;
      try {
        result = execSync(`"${pdfsigBin}" "${downloadPath}" 2>&1`, {
          encoding: 'utf8',
          timeout: 10_000,
        });
      } catch (err: any) {
        result = err.stdout || err.message || '';
      }
      expect(result).toContain('Signature #1');
      expect(result).toContain('Signature #2');

      // Final signature must be valid
      const sig2Section = result.split('Signature #2')[1];
      expect(sig2Section).toBeDefined();
      expect(sig2Section).toContain('Signature is Valid');
    }
  });
});
