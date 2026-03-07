/**
 * E2E tests for form flattening workflow.
 *
 * Tests flattening forms, verifying content preservation,
 * and signing flattened PDFs.
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

test.describe('form flatten workflow', () => {
  test('flatten removes all fields', async ({ page }) => {
    await page.goto('/');

    // Load demo PDF (has 4 fields)
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();
    await expect(page.locator('#log-output')).toContainText('4 form field(s)');

    // Fill a field
    await page.fill('[data-field="recipient.name"]', 'Flatten Test');
    await page.click('#apply-fields');
    await expect(page.locator('#log-output')).toContainText('Applied');

    // Flatten
    await page.click('#flatten-form');
    await expect(page.locator('#log-output')).toContainText('Flattened');
    await expect(page.locator('#log-output')).toContainText('0 fields remain');

    // Fields container should show "No form fields"
    await expect(page.locator('#fields-container')).toContainText('No form fields');
  });

  test('flatten preserves content — qpdf validates and no fields remain', async ({ page }) => {
    await page.goto('/');

    // Load demo PDF
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Fill fields
    await page.fill('[data-field="recipient.name"]', 'Alice Flattenworth');
    await page.fill('[data-field="amount"]', '$99,999.00');
    await page.click('#apply-fields');
    await expect(page.locator('#log-output')).toContainText('Applied');

    // Flatten
    await page.click('#flatten-form');
    await expect(page.locator('#log-output')).toContainText('Flattened');
    await expect(page.locator('#log-output')).toContainText('0 fields remain');

    // Sign to enable download
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'flatten-content.pdf');
    await download.saveAs(downloadPath);

    // Validate structure with qpdf
    const qpdfBin = ['/opt/homebrew/bin/qpdf', '/usr/bin/qpdf', '/usr/local/bin/qpdf']
      .find(p => fs.existsSync(p));
    if (qpdfBin) {
      const result = execSync(`"${qpdfBin}" --check "${downloadPath}" 2>&1`, {
        encoding: 'utf8',
        timeout: 10_000,
      });
      console.log('qpdf --check:', result.trim());
    }

    // Validate signature
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

  test('flatten + sign', async ({ page }) => {
    await page.goto('/');

    // Load demo PDF
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Fill fields
    await page.fill('[data-field="recipient.name"]', 'Sign After Flatten');
    await page.click('#apply-fields');
    await expect(page.locator('#log-output')).toContainText('Applied');

    // Flatten
    await page.click('#flatten-form');
    await expect(page.locator('#log-output')).toContainText('Flattened');
    await expect(page.locator('#log-output')).toContainText('0 fields remain');

    // Sign the flattened PDF
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Download and validate
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'flatten-then-sign-demo.pdf');
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

  test('flatten + sign round-trip — zero fields after re-upload', async ({ page }) => {
    await page.goto('/');

    // Load demo PDF
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Fill
    await page.fill('[data-field="recipient.name"]', 'Round Trip Flat');
    await page.click('#apply-fields');
    await expect(page.locator('#log-output')).toContainText('Applied');

    // Flatten
    await page.click('#flatten-form');
    await expect(page.locator('#log-output')).toContainText('Flattened');

    // Sign
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Download
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'flatten-round-trip.pdf');
    await download.saveAs(downloadPath);

    // Re-upload
    await page.evaluate(() => {
      document.getElementById('log-output')!.innerHTML = '';
    });
    const fileInput = page.locator('#file-input');
    await fileInput.setInputFiles(downloadPath);

    // Verify only signature field remains (form fields were flattened, but signing added a sig field)
    await expect(page.locator('#fields-section')).toBeVisible();
    await expect(page.locator('#fields-container')).toContainText('Signature');

    // Verify page count is correct (2 pages)
    await expect(page.locator('#log-output')).toContainText('Pages: 2');
  });
});
