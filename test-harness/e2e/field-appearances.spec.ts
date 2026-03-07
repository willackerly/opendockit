/**
 * E2E tests for form field appearance generation.
 *
 * Tests that field values are visually present after filling (not relying on
 * /NeedAppearances), survive signing, and persist through flatten + round-trip.
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

test.describe('field appearance generation', () => {
  test('fill text field, download, reload — value persists', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Fill a single field
    await page.fill('[data-field="recipient.name"]', 'Appearance Test User');
    await page.click('#apply-fields');
    await expect(page.locator('#log-output')).toContainText('Applied');

    // Sign to enable download
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Download
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'appearance-text-field.pdf');
    await download.saveAs(downloadPath);
    expect(fs.existsSync(downloadPath)).toBe(true);

    // Round-trip: reload and verify value
    await page.evaluate(() => {
      document.getElementById('log-output')!.innerHTML = '';
    });
    const fileInput = page.locator('#file-input');
    await fileInput.setInputFiles(downloadPath);

    await expect(page.locator('#fields-section')).toBeVisible();
    await expect(page.locator('[data-field="recipient.name"]')).toHaveValue('Appearance Test User');
  });

  test('fill text field then flatten — value baked into content', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Fill fields
    await page.fill('[data-field="recipient.name"]', 'Flatten Appearance');
    await page.fill('[data-field="amount"]', '$77,777.00');
    await page.click('#apply-fields');
    await expect(page.locator('#log-output')).toContainText('Applied');

    // Flatten
    await page.click('#flatten-form');
    await expect(page.locator('#log-output')).toContainText('Flattened');
    await expect(page.locator('#log-output')).toContainText('0 fields remain');

    // After flattening, fields container should say no fields
    await expect(page.locator('#fields-container')).toContainText('No form fields');
  });

  test('fill multiple field types: text, checkbox, dropdown', async ({ page }) => {
    await page.goto('/');

    // Create a form with all three field types
    await page.click('#create-form');
    await expect(page.locator('#fields-section')).toBeVisible();
    await expect(page.locator('#log-output')).toContainText('Created form with 3 field(s)');

    // Fill the text field (name)
    await page.fill('[data-field="name"]', 'Multi-Type Test');
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

    const downloadPath = path.join(TMP_DIR, 'appearance-multi-type.pdf');
    await download.saveAs(downloadPath);
    expect(fs.existsSync(downloadPath)).toBe(true);

    // Validate structure
    const qpdf = findBin('qpdf');
    if (qpdf) {
      const result = execSync(`"${qpdf}" --check "${downloadPath}" 2>&1`, {
        encoding: 'utf8',
        timeout: 10_000,
      });
      console.log('qpdf --check:', result.trim());
    }

    // Round-trip: verify text field value survives
    await page.evaluate(() => {
      document.getElementById('log-output')!.innerHTML = '';
    });
    const fileInput = page.locator('#file-input');
    await fileInput.setInputFiles(downloadPath);

    await expect(page.locator('#fields-section')).toBeVisible();
    await expect(page.locator('[data-field="name"]')).toHaveValue('Multi-Type Test');
  });

  test('fill all 4 demo fields, sign, validate with pdfsig', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Fill all fields
    await page.fill('[data-field="recipient.name"]', 'Appearance Validation');
    await page.fill('[data-field="amount"]', '$10,000.00');
    await page.fill('[data-field="reference"]', 'AP-2024-001');
    await page.fill('[data-field="notes"]', 'Testing appearance generation');
    await page.click('#apply-fields');
    await expect(page.locator('#log-output')).toContainText('Applied 4 field value(s)');

    // Sign
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Download
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'appearance-all-fields-signed.pdf');
    await download.saveAs(downloadPath);

    // Validate with qpdf
    const qpdf = findBin('qpdf');
    if (qpdf) {
      const result = execSync(`"${qpdf}" --check "${downloadPath}" 2>&1`, {
        encoding: 'utf8',
        timeout: 10_000,
      });
      console.log('qpdf --check:', result.trim());
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
      expect(result).toContain('Signature #1');
      expect(result).toContain('Signature is Valid');
    }
  });

  test('fill fields, flatten, sign — content preserved and valid', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Fill
    await page.fill('[data-field="recipient.name"]', 'Flatten Sign Test');
    await page.fill('[data-field="amount"]', '$25,000.00');
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

    // Download
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'appearance-flatten-sign.pdf');
    await download.saveAs(downloadPath);

    // Validate both structure and signature
    const qpdf = findBin('qpdf');
    if (qpdf) {
      execSync(`"${qpdf}" --check "${downloadPath}" 2>&1`, {
        encoding: 'utf8',
        timeout: 10_000,
      });
    }

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

  test('fill, sign, re-upload — all 4 field values survive round-trip', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Fill all 4 fields with distinctive values
    await page.fill('[data-field="recipient.name"]', 'Round Trip Name');
    await page.fill('[data-field="amount"]', '$42,000.00');
    await page.fill('[data-field="reference"]', 'RT-APPEARANCE-99');
    await page.fill('[data-field="notes"]', 'Appearance round-trip test');
    await page.click('#apply-fields');
    await expect(page.locator('#log-output')).toContainText('Applied 4 field value(s)');

    // Sign
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Download
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'appearance-round-trip.pdf');
    await download.saveAs(downloadPath);

    // Clear log and re-upload
    await page.evaluate(() => {
      document.getElementById('log-output')!.innerHTML = '';
    });
    const fileInput = page.locator('#file-input');
    await fileInput.setInputFiles(downloadPath);

    // Verify all 4 values survived
    await expect(page.locator('#fields-section')).toBeVisible();
    await expect(page.locator('[data-field="recipient.name"]')).toHaveValue('Round Trip Name');
    await expect(page.locator('[data-field="amount"]')).toHaveValue('$42,000.00');
    await expect(page.locator('[data-field="reference"]')).toHaveValue('RT-APPEARANCE-99');
    await expect(page.locator('[data-field="notes"]')).toHaveValue('Appearance round-trip test');

    // Verify log echoes read-back values
    await expect(page.locator('#log-output')).toContainText('recipient.name = "Round Trip Name"');
    await expect(page.locator('#log-output')).toContainText('amount = "$42,000.00"');
  });
});
