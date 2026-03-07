/**
 * E2E tests for form creation workflow.
 *
 * Tests creating forms from scratch in the browser, filling fields,
 * signing, flattening, and round-trip verification.
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

test.describe('form creation workflow', () => {
  test('create form shows fields', async ({ page }) => {
    await page.goto('/');

    // Click "Create Form"
    await page.click('#create-form');

    // Wait for fields to appear
    await expect(page.locator('#fields-section')).toBeVisible();

    // Should show 3 form fields (name, agree, country)
    const fields = page.locator('.field-input');
    await expect(fields).toHaveCount(3);

    // Check field names
    await expect(page.locator('[data-field="name"]')).toBeVisible();
    await expect(page.locator('[data-field="agree"]')).toBeVisible();
    await expect(page.locator('[data-field="country"]')).toBeVisible();

    // Log should show success
    await expect(page.locator('#log-output')).toContainText('Created form with 3 field(s)');
    await expect(page.locator('#log-output')).toContainText('name, agree, country');
  });

  test('create + fill + sign', async ({ page }) => {
    await page.goto('/');

    // Create form
    await page.click('#create-form');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Fill name field
    await page.fill('[data-field="name"]', 'Jane Doe');
    await page.click('#apply-fields');
    await expect(page.locator('#log-output')).toContainText('Applied');

    // Sign as User 1
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Download and validate
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'form-created-signed.pdf');
    await download.saveAs(downloadPath);
    expect(fs.existsSync(downloadPath)).toBe(true);

    // Validate with pdfsig
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

  test('create + fill + flatten + download', async ({ page }) => {
    await page.goto('/');

    // Create form
    await page.click('#create-form');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Fill name field
    await page.fill('[data-field="name"]', 'Flatten Test');
    await page.click('#apply-fields');
    await expect(page.locator('#log-output')).toContainText('Applied');

    // Flatten
    await page.click('#flatten-form');
    await expect(page.locator('#log-output')).toContainText('Flattened');
    await expect(page.locator('#log-output')).toContainText('0 fields remain');

    // Fields container should show "No form fields"
    await expect(page.locator('#fields-container')).toContainText('No form fields');
  });

  test('create + fill + sign + round-trip', async ({ page }) => {
    await page.goto('/');

    // Create form
    await page.click('#create-form');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Fill name
    await page.fill('[data-field="name"]', 'Round Trip');
    await page.click('#apply-fields');
    await expect(page.locator('#log-output')).toContainText('Applied');

    // Sign
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Download
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'form-round-trip.pdf');
    await download.saveAs(downloadPath);

    // Clear log
    await page.evaluate(() => {
      document.getElementById('log-output')!.innerHTML = '';
    });

    // Re-upload
    const fileInput = page.locator('#file-input');
    await fileInput.setInputFiles(downloadPath);

    // Verify field value survived
    await expect(page.locator('#fields-section')).toBeVisible();
    await expect(page.locator('[data-field="name"]')).toHaveValue('Round Trip');
  });

  test('form creation from scratch — qpdf validates structure', async ({ page }) => {
    await page.goto('/');

    // Create form
    await page.click('#create-form');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Fill all 3 fields
    await page.fill('[data-field="name"]', 'Structure Test');
    await page.click('#apply-fields');
    await expect(page.locator('#log-output')).toContainText('Applied');

    // Sign
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Download
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'form-structure-check.pdf');
    await download.saveAs(downloadPath);

    // Validate with qpdf
    const qpdfBin = ['/opt/homebrew/bin/qpdf', '/usr/bin/qpdf', '/usr/local/bin/qpdf']
      .find(p => fs.existsSync(p));
    if (qpdfBin) {
      const result = execSync(`"${qpdfBin}" --check "${downloadPath}" 2>&1`, {
        encoding: 'utf8',
        timeout: 10_000,
      });
      // qpdf exits 0 for valid PDFs — no assertion needed beyond not throwing
      console.log('qpdf --check:', result.trim());
    }
  });

  test('create + flatten + sign', async ({ page }) => {
    await page.goto('/');

    // Create form
    await page.click('#create-form');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Fill
    await page.fill('[data-field="name"]', 'Flat Sign');
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

    const downloadPath = path.join(TMP_DIR, 'flatten-then-sign.pdf');
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
});
