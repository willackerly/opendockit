/**
 * E2E tests for the pdfbox-ts test harness.
 *
 * Tests the full browser workflow:
 *   1. Load a PDF with form fields
 *   2. Fill form fields
 *   3. Sign as User 1
 *   4. Counter-sign as User 2
 *   5. Download and validate the result
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

test.describe('fill and sign workflow', () => {
  test('loads demo PDF and displays form fields', async ({ page }) => {
    await page.goto('/');

    // Verify page loaded
    await expect(page.locator('h1')).toContainText('pdfbox-ts Test Harness');

    // Click "Use Demo PDF"
    await page.click('#use-demo');

    // Wait for fields to appear
    await expect(page.locator('#fields-section')).toBeVisible();

    // Should show 4 form fields
    const fields = page.locator('.field-input');
    await expect(fields).toHaveCount(4);

    // Check field names
    await expect(page.locator('[data-field="recipient.name"]')).toBeVisible();
    await expect(page.locator('[data-field="amount"]')).toBeVisible();
    await expect(page.locator('[data-field="reference"]')).toBeVisible();
    await expect(page.locator('[data-field="notes"]')).toBeVisible();

    // Log should show success
    await expect(page.locator('#log-output')).toContainText('Loaded demo.pdf');
    await expect(page.locator('#log-output')).toContainText('4 form field(s)');
  });

  test('fills fields and applies values', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Fill in the form fields
    await page.fill('[data-field="recipient.name"]', 'Alice Johnson');
    await page.fill('[data-field="amount"]', '$50,000.00');
    await page.fill('[data-field="reference"]', 'WT-2024-0042');
    await page.fill('[data-field="notes"]', 'Approved by compliance.\nProcessing priority: HIGH');

    // Apply field values
    await page.click('#apply-fields');

    // Verify log shows success
    await expect(page.locator('#log-output')).toContainText('Applied 4 field value(s)');
  });

  test('signs as User 1', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Fill a field first
    await page.fill('[data-field="recipient.name"]', 'Bob Smith');
    await page.click('#apply-fields');
    await expect(page.locator('#log-output')).toContainText('Applied');

    // Sign as User 1
    await page.click('#sign-user1');

    // Wait for signing to complete (may take a moment)
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Signature info should be displayed
    await expect(page.locator('[data-sig="1"]')).toBeVisible();
    await expect(page.locator('[data-sig="1"]')).toContainText('ByteRange');

    // Download section should be visible
    await expect(page.locator('#result-section')).toBeVisible();
  });

  test('full workflow: fill, sign, counter-sign, download, round-trip verify', async ({ page }) => {
    await page.goto('/');

    // ── Step 1: Load PDF ──────────────────────────────────────────
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Verify initial page count
    await expect(page.locator('#log-output')).toContainText('Pages: 2');

    // ── Step 2: Fill all 4 fields ─────────────────────────────────
    await page.fill('[data-field="recipient.name"]', 'Charlie Wilson');
    await page.fill('[data-field="amount"]', '$125,000.00');
    await page.fill('[data-field="reference"]', 'WT-2024-0099');
    await page.fill('[data-field="notes"]', 'Dual-signature wire transfer');
    await page.click('#apply-fields');
    await expect(page.locator('#log-output')).toContainText('Applied 4 field value(s)');

    // ── Step 3a: Sign as User 1 ───────────────────────────────────
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // ── Step 3b: Counter-sign as User 2 ───────────────────────────
    await page.click('#sign-user2');
    await expect(page.locator('#log-output')).toContainText('Signed by User 2!', {
      timeout: 15_000,
    });

    // Verify both signatures displayed in UI
    await expect(page.locator('[data-sig="1"]')).toBeVisible();
    await expect(page.locator('[data-sig="2"]')).toBeVisible();
    await expect(page.locator('[data-sig="1"]')).toContainText('User 1');
    await expect(page.locator('[data-sig="2"]')).toContainText('User 2');

    // ── Step 4: Download ──────────────────────────────────────────
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'dual-signed.pdf');
    await download.saveAs(downloadPath);
    expect(fs.existsSync(downloadPath)).toBe(true);

    const pdfBytes = fs.readFileSync(downloadPath);
    expect(pdfBytes.length).toBeGreaterThan(1000);
    await expect(page.locator('#log-output')).toContainText('Downloaded signed-2sigs.pdf');

    // ── Step 5: Validate signatures with pdfsig ───────────────────
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
      console.log('pdfsig output:', result);

      // Both signatures must be present
      expect(result).toContain('Signature #1');
      expect(result).toContain('Signature #2');

      // Signature #2 (the final counter-signature) MUST be cryptographically valid
      // Split by signature sections and check Sig #2 specifically
      const sig2Section = result.split('Signature #2')[1];
      expect(sig2Section).toBeDefined();
      expect(sig2Section).toContain('Signature is Valid');

      // Both signers should be identified
      expect(result).toContain('Test User 1');
      expect(result).toContain('Test User 2');

      // Both should be SHA-256
      expect(result).toContain('SHA-256');
    } else {
      console.log('pdfsig not installed — skipping signature validation');
    }

    // ── Step 6: Round-trip — re-upload and verify form data ───────
    //
    // This is the critical test: upload the downloaded dual-signed
    // PDF back into the browser and verify all 4 field values
    // survived the fill → sign → counter-sign pipeline.

    // Clear the log so we can check the reload output cleanly
    await page.evaluate(() => {
      document.getElementById('log-output')!.innerHTML = '';
    });

    const fileInput = page.locator('#file-input');
    await fileInput.setInputFiles(downloadPath);

    // Wait for the PDF to reload and fields to appear
    await expect(page.locator('#fields-section')).toBeVisible();
    await expect(page.locator('#log-output')).toContainText('Pages: 2');

    // Verify all 4 field values persisted through the signing pipeline
    await expect(page.locator('[data-field="recipient.name"]')).toHaveValue('Charlie Wilson');
    await expect(page.locator('[data-field="amount"]')).toHaveValue('$125,000.00');
    await expect(page.locator('[data-field="reference"]')).toHaveValue('WT-2024-0099');
    await expect(page.locator('[data-field="notes"]')).toHaveValue('Dual-signature wire transfer');

    // Verify the log shows the round-tripped values
    await expect(page.locator('#log-output')).toContainText('recipient.name = "Charlie Wilson"');
    await expect(page.locator('#log-output')).toContainText('amount = "$125,000.00"');
    await expect(page.locator('#log-output')).toContainText('reference = "WT-2024-0099"');
    await expect(page.locator('#log-output')).toContainText('notes = "Dual-signature wire transfer"');
  });

  test('handles PDF without form fields', async ({ page }) => {
    await page.goto('/');

    // Use the pre-generated no-fields fixture
    const noFieldsPath = path.resolve(__dirname, '..', 'public', 'no-fields.pdf');
    expect(fs.existsSync(noFieldsPath)).toBe(true);

    // Upload via file input
    const fileInput = page.locator('#file-input');
    await fileInput.setInputFiles(noFieldsPath);

    // Should show "no form fields" message
    await expect(page.locator('#fields-section')).toBeVisible();
    await expect(page.locator('#fields-container')).toContainText('No form fields');

    // Should still be able to sign
    await expect(page.locator('#sign-section')).toBeVisible();
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });
  });
});
