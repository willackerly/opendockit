/**
 * E2E tests for ALL pdfbox-ts features exercised through the test harness.
 *
 * This spec covers features not in other spec files:
 * - Drawing operations (step 15)
 * - Image embedding (step 16)
 * - Page management (step 17)
 * - Two-step signing (step 18)
 * - Signing options (DER, full-save, flatten-on-sign)
 * - Verify signatures (step 8)
 * - Copy pages (step 9)
 * - PDF/A save (step 10)
 * - Redaction (step 12)
 * - Extract text (step 13)
 * - Extract images (step 14)
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

// ─── Drawing Operations ────────────────────────────────────────

test.describe('drawing operations', () => {
  test('create drawing demo with all shape types', async ({ page }) => {
    await page.goto('/');
    await page.click('#create-drawing');
    await expect(page.locator('#log-output')).toContainText('Created drawing demo', {
      timeout: 10_000,
    });

    // Verify all drawing APIs were exercised
    await expect(page.locator('#log-output')).toContainText('drawText');
    await expect(page.locator('#log-output')).toContainText('drawRectangle');
    await expect(page.locator('#log-output')).toContainText('drawLine');
    await expect(page.locator('#log-output')).toContainText('drawCircle');
    await expect(page.locator('#log-output')).toContainText('drawEllipse');
    await expect(page.locator('#log-output')).toContainText('drawSquare');
  });

  test('drawing demo + sign + download', async ({ page }) => {
    await page.goto('/');
    await page.click('#create-drawing');
    await expect(page.locator('#log-output')).toContainText('Created drawing demo', {
      timeout: 10_000,
    });

    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'drawing-signed.pdf');
    await download.saveAs(downloadPath);

    const qpdf = findBin('qpdf');
    if (qpdf) {
      const result = execSync(`"${qpdf}" --check "${downloadPath}" 2>&1`, {
        encoding: 'utf8', timeout: 10_000,
      });
      console.log('qpdf:', result.trim());
    }

    const pdfsig = findBin('pdfsig');
    if (pdfsig) {
      let result: string;
      try {
        result = execSync(`"${pdfsig}" "${downloadPath}" 2>&1`, {
          encoding: 'utf8', timeout: 10_000,
        });
      } catch (err: any) {
        result = err.stdout || '';
      }
      expect(result).toContain('Signature is Valid');
    }
  });
});

// ─── Page Management ───────────────────────────────────────────

test.describe('page management', () => {
  test('add page to loaded PDF', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    await page.click('#add-page');
    await expect(page.locator('#log-output')).toContainText('Added page');
  });

  test('rotate page 1', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    await page.click('#rotate-page');
    await expect(page.locator('#log-output')).toContainText('Rotated page 1');
    await expect(page.locator('#log-output')).toContainText('90');
  });

  test('add page + remove page round-trip', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Add a page
    await page.click('#add-page');
    await expect(page.locator('#log-output')).toContainText('Added page');

    // Remove the last page
    await page.click('#remove-last-page');
    await expect(page.locator('#log-output')).toContainText('Removed page');
  });
});

// ─── Two-Step Signing ──────────────────────────────────────────

test.describe('two-step signing', () => {
  test('prepare then sign workflow', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    await page.click('#twostep-sign');
    await expect(page.locator('#log-output')).toContainText('Step 1', { timeout: 10_000 });
    await expect(page.locator('#log-output')).toContainText('Step 2', { timeout: 15_000 });
    await expect(page.locator('#log-output')).toContainText('Two-step signing complete!', {
      timeout: 15_000,
    });

    // Should be downloadable
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'twostep-signed.pdf');
    await download.saveAs(downloadPath);
    expect(fs.existsSync(downloadPath)).toBe(true);
  });
});

// ─── Signing Options ───────────────────────────────────────────

test.describe('signing options', () => {
  test('sign with flatten-on-sign option', async ({ page }) => {
    await page.goto('/');

    // Create a form with fields
    await page.click('#create-form');
    await expect(page.locator('#log-output')).toContainText('Created form', {
      timeout: 10_000,
    });

    // Enable flatten option
    await page.check('#opt-flatten');

    // Sign
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('flatten', {
      timeout: 15_000,
    });
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });
  });
});

// ─── Verify Signatures ────────────────────────────────────────

test.describe('verify signatures', () => {
  test('verify after signing shows valid', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Sign
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Verify
    await page.click('#verify-sigs');
    await expect(page.locator('#log-output')).toContainText('Found 1 signature');
    await expect(page.locator('#log-output')).toContainText('Integrity: PASS');
    await expect(page.locator('#log-output')).toContainText('Signature: PASS');
    await expect(page.locator('#log-output')).toContainText('Chain: self-signed');
  });

  test('verify unsigned PDF shows no signatures', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    await page.click('#verify-sigs');
    await expect(page.locator('#log-output')).toContainText('No signatures found');
  });

  test('verify multi-signed PDF shows both', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    await page.click('#sign-user2');
    await expect(page.locator('#log-output')).toContainText('Signed by User 2!', {
      timeout: 15_000,
    });

    await page.click('#verify-sigs');
    await expect(page.locator('#log-output')).toContainText('Found 2 signature');
  });
});

// ─── Copy Pages ────────────────────────────────────────────────

test.describe('copy pages', () => {
  test('copy page 1 to new document', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.click('#copy-pages');
    await expect(page.locator('#log-output')).toContainText('Copied page 1', {
      timeout: 10_000,
    });

    const download = await downloadPromise;
    const downloadPath = path.join(TMP_DIR, 'copied-page.pdf');
    await download.saveAs(downloadPath);
    expect(fs.existsSync(downloadPath)).toBe(true);

    const qpdf = findBin('qpdf');
    if (qpdf) {
      const result = execSync(`"${qpdf}" --check "${downloadPath}" 2>&1`, {
        encoding: 'utf8', timeout: 10_000,
      });
      console.log('qpdf:', result.trim());
    }
  });
});

// ─── PDF/A ─────────────────────────────────────────────────────

test.describe('PDF/A save', () => {
  test('save as PDF/A-1b', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.click('#save-pdfa1b');
    await expect(page.locator('#log-output')).toContainText('Saved as PDF/A-1b', {
      timeout: 10_000,
    });

    const download = await downloadPromise;
    const downloadPath = path.join(TMP_DIR, 'pdfa1b.pdf');
    await download.saveAs(downloadPath);
    expect(fs.existsSync(downloadPath)).toBe(true);
  });

  test('save as PDF/A-2b', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.click('#save-pdfa2b');
    await expect(page.locator('#log-output')).toContainText('Saved as PDF/A-2b', {
      timeout: 10_000,
    });

    const download = await downloadPromise;
    const downloadPath = path.join(TMP_DIR, 'pdfa2b.pdf');
    await download.saveAs(downloadPath);
    expect(fs.existsSync(downloadPath)).toBe(true);
  });
});

// ─── Redaction ─────────────────────────────────────────────────

test.describe('redaction', () => {
  test('add redaction annotation', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    await page.click('#add-redaction');
    await expect(page.locator('#log-output')).toContainText('Redaction annotation added');
    await expect(page.locator('#log-output')).toContainText('[50, 520, 350, 550]');
  });

  test('redact + sign', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    await page.click('#add-redaction');
    await expect(page.locator('#log-output')).toContainText('Redaction annotation added');

    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'redacted-signed.pdf');
    await download.saveAs(downloadPath);
    expect(fs.existsSync(downloadPath)).toBe(true);
  });
});

// ─── Extract Text ──────────────────────────────────────────────

test.describe('extract text', () => {
  test('extract text from demo PDF', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    await page.click('#extract-text');
    await expect(page.locator('#log-output')).toContainText('Extracted', {
      timeout: 10_000,
    });
    await expect(page.locator('#log-output')).toContainText('text items');
  });

  test('extract text from drawing demo', async ({ page }) => {
    await page.goto('/');
    await page.click('#create-drawing');
    await expect(page.locator('#log-output')).toContainText('Created drawing demo', {
      timeout: 10_000,
    });

    await page.click('#extract-text');
    await expect(page.locator('#log-output')).toContainText('Extracted', {
      timeout: 10_000,
    });
    // Should find the text we drew
    await expect(page.locator('#log-output')).toContainText('Drawing API Demo');
  });
});

// ─── Extract Images ────────────────────────────────────────────

test.describe('extract images', () => {
  test('extract images from PDF with images', async ({ page }) => {
    await page.goto('/');

    // Use a fixture PDF known to have images
    const fileInput = page.locator('#file-input');
    const fixtureDir = path.resolve(__dirname, '..', '..', 'test-pdfs', 'chrome-google-docs');
    const imagePdf = path.join(fixtureDir, 'text-with-images-google-docs.pdf');

    if (fs.existsSync(imagePdf)) {
      await fileInput.setInputFiles(imagePdf);
      await expect(page.locator('#fields-section')).toBeVisible();

      await page.click('#extract-images');
      await expect(page.locator('#log-output')).toContainText('Extracted', {
        timeout: 10_000,
      });
      await expect(page.locator('#log-output')).toContainText('image(s)');
    }
  });

  test('extract images from PDF without images shows none', async ({ page }) => {
    await page.goto('/');
    await page.click('#create-drawing');
    await expect(page.locator('#log-output')).toContainText('Created drawing demo', {
      timeout: 10_000,
    });

    await page.click('#extract-images');
    await expect(page.locator('#log-output')).toContainText('No images found');
  });
});

// ─── Full Workflow: Create → Draw → Annotate → Sign → Verify ───

test.describe('full feature workflow', () => {
  test('complete workflow exercises all APIs', async ({ page }) => {
    await page.goto('/');

    // Step 1: Create a form
    await page.click('#create-form');
    await expect(page.locator('#log-output')).toContainText('Created form', {
      timeout: 10_000,
    });

    // Step 2: Fill fields
    await page.fill('[data-field="name"]', 'Test User');
    await page.click('#apply-fields');
    await expect(page.locator('#log-output')).toContainText('Applied 1 field value');

    // Step 3: Add annotations
    await page.click('#add-annotations');
    await expect(page.locator('#log-output')).toContainText('Added 4 annotations');

    // Step 4: Add redaction
    await page.click('#add-redaction');
    await expect(page.locator('#log-output')).toContainText('Redaction annotation added');

    // Step 5: Sign
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Step 6: Counter-sign
    await page.click('#sign-user2');
    await expect(page.locator('#log-output')).toContainText('Signed by User 2!', {
      timeout: 15_000,
    });

    // Step 7: Verify
    await page.click('#verify-sigs');
    await expect(page.locator('#log-output')).toContainText('Found 2 signature');

    // Step 8: Extract text
    await page.click('#extract-text');
    await expect(page.locator('#log-output')).toContainText('text items', {
      timeout: 10_000,
    });

    // Step 9: Download
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'full-workflow.pdf');
    await download.saveAs(downloadPath);
    expect(fs.existsSync(downloadPath)).toBe(true);

    // External validation
    const pdfsig = findBin('pdfsig');
    if (pdfsig) {
      let result: string;
      try {
        result = execSync(`"${pdfsig}" "${downloadPath}" 2>&1`, {
          encoding: 'utf8', timeout: 10_000,
        });
      } catch (err: any) {
        result = err.stdout || '';
      }
      expect(result).toContain('Signature #1');
      expect(result).toContain('Signature #2');
    }
  });
});
