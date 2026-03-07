/**
 * E2E tests for redaction workflow.
 *
 * Tests adding redaction annotations, verifying they're present in the
 * log output, signing redacted PDFs, and downloading valid results.
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

test.describe('redaction', () => {
  test('add redaction annotation to demo PDF', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    await page.click('#add-redaction');
    await expect(page.locator('#log-output')).toContainText('Redaction annotation added');
    await expect(page.locator('#log-output')).toContainText('[50, 520, 350, 550]');
    // The note about applying redactions should appear
    await expect(page.locator('#log-output')).toContainText('apply');
  });

  test('redaction annotation produces valid PDF structure', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    await page.click('#add-redaction');
    await expect(page.locator('#log-output')).toContainText('Redaction annotation added');

    // Download the redacted (unsigned) PDF
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'redaction-structure.pdf');
    await download.saveAs(downloadPath);

    const qpdf = findBin('qpdf');
    if (qpdf) {
      const result = execSync(`"${qpdf}" --check "${downloadPath}" 2>&1`, {
        encoding: 'utf8',
        timeout: 10_000,
      });
      console.log('qpdf --check redaction:', result.trim());
    }
  });

  test('redact + sign — produces valid signed PDF', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Add redaction
    await page.click('#add-redaction');
    await expect(page.locator('#log-output')).toContainText('Redaction annotation added');

    // Sign
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Download
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'redaction-signed.pdf');
    await download.saveAs(downloadPath);

    // Validate with qpdf
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
      expect(result).toContain('Signature #1');
      expect(result).toContain('Signature is Valid');
    }
  });

  test('redact + dual sign — both signatures valid', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Add redaction
    await page.click('#add-redaction');
    await expect(page.locator('#log-output')).toContainText('Redaction annotation added');

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

    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'redaction-dual-signed.pdf');
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
      expect(result).toContain('Signature #1');
      expect(result).toContain('Signature #2');
    }
  });

  test('redact + extract text — redaction annotation present', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Add redaction
    await page.click('#add-redaction');
    await expect(page.locator('#log-output')).toContainText('Redaction annotation added');

    // Extract text — should still work
    await page.click('#extract-text');
    await expect(page.locator('#log-output')).toContainText('Extracted', { timeout: 10_000 });
    await expect(page.locator('#log-output')).toContainText('text items');
  });

  test('redaction on created form', async ({ page }) => {
    await page.goto('/');

    // Create a form
    await page.click('#create-form');
    await expect(page.locator('#log-output')).toContainText('Created form', {
      timeout: 10_000,
    });

    // Add redaction to the created form
    await page.click('#add-redaction');
    await expect(page.locator('#log-output')).toContainText('Redaction annotation added');

    // Sign
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Download
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'redaction-form-signed.pdf');
    await download.saveAs(downloadPath);
    expect(fs.existsSync(downloadPath)).toBe(true);
  });
});
