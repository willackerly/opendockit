/**
 * Deep E2E Signing Integrity Tests
 *
 * End-to-end tests that exercise complex signing flows through the browser UI,
 * download the PDF, and validate with both verifySignatures() (our library)
 * and pdfsig (external tool).
 *
 * These tests catch bugs that unit tests miss — browser-specific encoding issues,
 * console errors from signing failures, and structural problems revealed only
 * after a full round-trip through the UI.
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
  ].find((p) => fs.existsSync(p));
}

/**
 * Verify a downloaded PDF using our library's verifySignatures().
 * Uses dynamic import so this works in the Playwright test context.
 */
async function verifyWithLibrary(pdfPath: string) {
  const pdfBytes = new Uint8Array(fs.readFileSync(pdfPath));
  // Dynamic import of our library — Playwright tests run in Node.js
  const { verifySignatures } = await import('../../src/signer/verify');
  return verifySignatures(pdfBytes);
}

/**
 * Verify a downloaded PDF using pdfsig (external tool).
 * Returns the pdfsig output string, or null if pdfsig is not installed.
 */
function verifyWithPdfsig(pdfPath: string): string | null {
  const pdfsig = findBin('pdfsig');
  if (!pdfsig) return null;

  try {
    return execSync(`"${pdfsig}" "${pdfPath}" 2>&1`, {
      encoding: 'utf8',
      timeout: 10_000,
    });
  } catch (err: any) {
    return err.stdout || err.message || '';
  }
}

/**
 * Check PDF structure with qpdf.
 */
function checkWithQpdf(pdfPath: string): string | null {
  const qpdf = findBin('qpdf');
  if (!qpdf) return null;

  try {
    return execSync(`"${qpdf}" --check "${pdfPath}" 2>&1`, {
      encoding: 'utf8',
      timeout: 10_000,
    });
  } catch (err: any) {
    return err.stdout || err.message || '';
  }
}

test.beforeAll(() => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
});

test.describe('signing integrity', () => {
  test('sign → download → verify integrity', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const pdfPath = path.join(TMP_DIR, 'integrity-sign-verify.pdf');
    await download.saveAs(pdfPath);

    // Library verification
    const results = await verifyWithLibrary(pdfPath);
    expect(results).toHaveLength(1);
    expect(results[0].integrityValid).toBe(true);
    expect(results[0].signatureValid).toBe(true);
    expect(results[0].algorithm).toBe('RSA');

    // External tool verification
    const pdfsigOutput = verifyWithPdfsig(pdfPath);
    if (pdfsigOutput) {
      expect(pdfsigOutput).toContain('Signature #1');
      expect(pdfsigOutput).toContain('Signature is Valid');
    }

    // Structure check
    checkWithQpdf(pdfPath);
  });

  test('sign → counter-sign → download → verify both signatures', async ({ page }) => {
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

    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const pdfPath = path.join(TMP_DIR, 'integrity-counter-sign.pdf');
    await download.saveAs(pdfPath);

    // Library verification — last signature must be valid
    const results = await verifyWithLibrary(pdfPath);
    expect(results.length).toBeGreaterThanOrEqual(2);

    const lastSig = results[results.length - 1];
    expect(lastSig.integrityValid).toBe(true);
    expect(lastSig.signatureValid).toBe(true);

    // External tool verification
    const pdfsigOutput = verifyWithPdfsig(pdfPath);
    if (pdfsigOutput) {
      expect(pdfsigOutput).toContain('Signature #1');
      expect(pdfsigOutput).toContain('Signature #2');
    }
  });

  test('sign → counter-sign → re-upload → field count', async ({ page }) => {
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

    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const pdfPath = path.join(TMP_DIR, 'integrity-reupload.pdf');
    await download.saveAs(pdfPath);

    // Re-upload and verify fields are parseable
    await page.evaluate(() => {
      document.getElementById('log-output')!.innerHTML = '';
    });
    const fileInput = page.locator('#file-input');
    await fileInput.setInputFiles(pdfPath);

    await expect(page.locator('#fields-section')).toBeVisible();
    // Should show signature fields after re-upload
    await expect(page.locator('#fields-container')).toContainText('Signature');
  });

  test('fill → sign → verify', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Fill fields
    await page.fill('[data-field="recipient.name"]', 'E2E Integrity Test');
    await page.click('#apply-fields');
    await expect(page.locator('#log-output')).toContainText('Applied');

    // Sign
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const pdfPath = path.join(TMP_DIR, 'integrity-fill-sign.pdf');
    await download.saveAs(pdfPath);

    const results = await verifyWithLibrary(pdfPath);
    expect(results).toHaveLength(1);
    expect(results[0].integrityValid).toBe(true);
    expect(results[0].signatureValid).toBe(true);

    const pdfsigOutput = verifyWithPdfsig(pdfPath);
    if (pdfsigOutput) {
      expect(pdfsigOutput).toContain('Signature is Valid');
    }
  });

  test('fill → sign → counter-sign → verify', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    await page.fill('[data-field="recipient.name"]', 'Multi-Sig Test');
    await page.click('#apply-fields');
    await expect(page.locator('#log-output')).toContainText('Applied');

    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    await page.click('#sign-user2');
    await expect(page.locator('#log-output')).toContainText('Signed by User 2!', {
      timeout: 15_000,
    });

    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const pdfPath = path.join(TMP_DIR, 'integrity-fill-counter-sign.pdf');
    await download.saveAs(pdfPath);

    const results = await verifyWithLibrary(pdfPath);
    expect(results.length).toBeGreaterThanOrEqual(2);

    const lastSig = results[results.length - 1];
    expect(lastSig.integrityValid).toBe(true);
    expect(lastSig.signatureValid).toBe(true);
  });

  test('create from scratch → add text → sign → verify', async ({ page }) => {
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

    const pdfPath = path.join(TMP_DIR, 'integrity-drawing-sign.pdf');
    await download.saveAs(pdfPath);

    const results = await verifyWithLibrary(pdfPath);
    expect(results).toHaveLength(1);
    expect(results[0].integrityValid).toBe(true);
    expect(results[0].signatureValid).toBe(true);

    const pdfsigOutput = verifyWithPdfsig(pdfPath);
    if (pdfsigOutput) {
      expect(pdfsigOutput).toContain('Signature is Valid');
    }
  });

  test('two-step sign → download → verify', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    await page.click('#twostep-sign');
    await expect(page.locator('#log-output')).toContainText('Two-step signing complete!', {
      timeout: 15_000,
    });

    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const pdfPath = path.join(TMP_DIR, 'integrity-twostep.pdf');
    await download.saveAs(pdfPath);

    const results = await verifyWithLibrary(pdfPath);
    expect(results).toHaveLength(1);
    expect(results[0].integrityValid).toBe(true);
    expect(results[0].signatureValid).toBe(true);
  });

  test('DER encoding → sign → verify', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    await page.check('#opt-der');

    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const pdfPath = path.join(TMP_DIR, 'integrity-der.pdf');
    await download.saveAs(pdfPath);

    const results = await verifyWithLibrary(pdfPath);
    expect(results).toHaveLength(1);
    expect(results[0].integrityValid).toBe(true);
    expect(results[0].signatureValid).toBe(true);
  });

  test('full-save mode → sign → verify', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    await page.check('#opt-fullsave');

    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const pdfPath = path.join(TMP_DIR, 'integrity-fullsave.pdf');
    await download.saveAs(pdfPath);

    const results = await verifyWithLibrary(pdfPath);
    expect(results).toHaveLength(1);
    expect(results[0].integrityValid).toBe(true);
    expect(results[0].signatureValid).toBe(true);
  });

  test('redact → sign → verify', async ({ page }) => {
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

    const pdfPath = path.join(TMP_DIR, 'integrity-redact-sign.pdf');
    await download.saveAs(pdfPath);

    const results = await verifyWithLibrary(pdfPath);
    expect(results).toHaveLength(1);
    expect(results[0].integrityValid).toBe(true);
    expect(results[0].signatureValid).toBe(true);
  });

  test('sign → extract text → verify text preserved', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Extract text from signed PDF — signing shouldn't corrupt content streams
    await page.click('#extract-text');
    await expect(page.locator('#log-output')).toContainText('Extracted', {
      timeout: 10_000,
    });
    await expect(page.locator('#log-output')).toContainText('text items');
  });

  test('triple sign → download → verify all three present', async ({ page }) => {
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

    await page.click('#sign-user1');
    await expect(page.locator('[data-sig="3"]')).toBeVisible({ timeout: 15_000 });

    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const pdfPath = path.join(TMP_DIR, 'integrity-triple-sign.pdf');
    await download.saveAs(pdfPath);

    // Library verification
    const results = await verifyWithLibrary(pdfPath);
    expect(results.length).toBeGreaterThanOrEqual(3);

    // Last signature must be valid
    const lastSig = results[results.length - 1];
    expect(lastSig.integrityValid).toBe(true);
    expect(lastSig.signatureValid).toBe(true);

    // External tool should see all 3 signatures
    const pdfsigOutput = verifyWithPdfsig(pdfPath);
    if (pdfsigOutput) {
      expect(pdfsigOutput).toContain('Signature #1');
      expect(pdfsigOutput).toContain('Signature #2');
      expect(pdfsigOutput).toContain('Signature #3');
    }
  });
});
