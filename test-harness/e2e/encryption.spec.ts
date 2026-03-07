/**
 * E2E tests for encryption/decryption workflows in the test harness.
 *
 * The harness UI supports AES-128/256 encryption with configurable
 * owner/user passwords and granular permissions.
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

function findBin(name: string): string | undefined {
  return [
    `/opt/homebrew/bin/${name}`,
    `/usr/bin/${name}`,
    `/usr/local/bin/${name}`,
  ].find(p => fs.existsSync(p));
}

test.describe('encryption', () => {
  test('encrypt PDF with AES-256', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Set passwords
    await page.fill('#enc-owner-pwd', 'testowner');
    await page.fill('#enc-user-pwd', 'testuser');

    // Encrypt
    await page.click('#encrypt-pdf');
    await expect(page.locator('#log-output')).toContainText('Encrypted', {
      timeout: 10_000,
    });
    await expect(page.locator('#log-output')).toContainText('AES-256');

    // Download and verify
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'encrypted-256.pdf');
    await download.saveAs(downloadPath);
    expect(fs.existsSync(downloadPath)).toBe(true);

    // qpdf can verify encryption
    const qpdf = findBin('qpdf');
    if (qpdf) {
      const result = execSync(
        `"${qpdf}" --show-encryption --password=testowner "${downloadPath}" 2>&1`,
        { encoding: 'utf8', timeout: 10_000 },
      );
      console.log('qpdf encryption info:', result.trim());
    }
  });

  test('encrypt PDF with AES-128', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Switch to AES-128
    await page.selectOption('#enc-key-length', '128');
    await page.fill('#enc-owner-pwd', 'owner128');

    await page.click('#encrypt-pdf');
    await expect(page.locator('#log-output')).toContainText('Encrypted', {
      timeout: 10_000,
    });
    await expect(page.locator('#log-output')).toContainText('AES-128');
  });

  test('decrypt PDF with correct password', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Encrypt first
    await page.fill('#enc-owner-pwd', 'owner');
    await page.fill('#enc-user-pwd', 'user');
    await page.click('#encrypt-pdf');
    await expect(page.locator('#log-output')).toContainText('Encrypted', {
      timeout: 10_000,
    });

    // Now decrypt
    await page.fill('#dec-password', 'user');
    await page.click('#decrypt-pdf');
    await expect(page.locator('#log-output')).toContainText('Decrypted', {
      timeout: 10_000,
    });
  });

  test('encrypt with custom permissions', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Disable print and copy
    await page.uncheck('#perm-print');
    await page.uncheck('#perm-copy');
    await page.check('#perm-modify');

    await page.fill('#enc-owner-pwd', 'secureowner');
    await page.click('#encrypt-pdf');
    await expect(page.locator('#log-output')).toContainText('Encrypted', {
      timeout: 10_000,
    });
    await expect(page.locator('#log-output')).toContainText('print=false');
    await expect(page.locator('#log-output')).toContainText('copy=false');
    await expect(page.locator('#log-output')).toContainText('modify=true');
  });

  test('encrypt with user password renders correctly', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Encrypt with user password
    await page.fill('#enc-owner-pwd', 'owner');
    await page.fill('#enc-user-pwd', 'user');
    await page.click('#encrypt-pdf');
    await expect(page.locator('#log-output')).toContainText('Encrypted', {
      timeout: 10_000,
    });

    // Viewer should still show the PDF (renderer uses saved password)
    await expect(page.locator('#log-output')).not.toContainText('render failed');
    await expect(page.locator('.pdf-page')).toHaveCount(1);
  });

  test('encrypt with empty user password renders without password', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Encrypt with empty user password (no password needed to open)
    await page.fill('#enc-owner-pwd', 'owneronly');
    await page.fill('#enc-user-pwd', '');
    await page.click('#encrypt-pdf');
    await expect(page.locator('#log-output')).toContainText('Encrypted', {
      timeout: 10_000,
    });

    // Should render fine — empty user password means no password needed
    await expect(page.locator('#log-output')).not.toContainText('render failed');
    await expect(page.locator('.pdf-page')).toHaveCount(1);
  });

  test('encrypt then decrypt renders at each step', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Encrypt with user password
    await page.fill('#enc-owner-pwd', 'owner');
    await page.fill('#enc-user-pwd', 'secret');
    await page.click('#encrypt-pdf');
    await expect(page.locator('#log-output')).toContainText('Encrypted', {
      timeout: 10_000,
    });

    // Should render (using saved password)
    await expect(page.locator('.pdf-page')).toHaveCount(1);

    // Decrypt
    await page.fill('#dec-password', 'secret');
    await page.click('#decrypt-pdf');
    await expect(page.locator('#log-output')).toContainText('Decrypted', {
      timeout: 10_000,
    });

    // Should still render (no password needed now)
    await expect(page.locator('#log-output')).not.toContainText('render failed');
    await expect(page.locator('.pdf-page')).toHaveCount(1);
  });

  test('encrypt then decrypt then sign round-trip', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Encrypt
    await page.fill('#enc-owner-pwd', 'owner');
    await page.fill('#enc-user-pwd', '');
    await page.click('#encrypt-pdf');
    await expect(page.locator('#log-output')).toContainText('Encrypted', {
      timeout: 10_000,
    });

    // Decrypt first (signing encrypted PDFs is not supported)
    await page.click('#decrypt-pdf');
    await expect(page.locator('#log-output')).toContainText('Decrypted', {
      timeout: 10_000,
    });

    // Now sign the decrypted PDF
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Download
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'encrypted-decrypted-signed.pdf');
    await download.saveAs(downloadPath);
    expect(fs.existsSync(downloadPath)).toBe(true);
  });
});
