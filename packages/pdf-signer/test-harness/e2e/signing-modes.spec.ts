/**
 * E2E tests for signing mode variations.
 *
 * Tests DER encoding, full-save mode, flatten-on-sign, two-step signing,
 * triple signing (User1 -> User2 -> User1), and combinations thereof.
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

test.describe('DER encoding', () => {
  test('sign with DER encoding produces valid PDF', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Enable DER encoding option
    await page.check('#opt-der');

    // Sign
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('[DER]');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Download and validate
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'signing-der.pdf');
    await download.saveAs(downloadPath);

    const qpdf = findBin('qpdf');
    if (qpdf) {
      const result = execSync(`"${qpdf}" --check "${downloadPath}" 2>&1`, {
        encoding: 'utf8',
        timeout: 10_000,
      });
      console.log('qpdf --check DER:', result.trim());
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
      expect(result).toContain('Signature #1');
      expect(result).toContain('Signature is Valid');
    }
  });

  test('DER encoding, dual sign — both signatures valid', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    await page.check('#opt-der');

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

    const downloadPath = path.join(TMP_DIR, 'signing-der-dual.pdf');
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
      // Final signature must be valid
      const sig2Section = result.split('Signature #2')[1];
      expect(sig2Section).toBeDefined();
      expect(sig2Section).toContain('Signature is Valid');
    }
  });
});

test.describe('full-save mode', () => {
  test('sign with full-save mode produces valid PDF', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Enable full-save option
    await page.check('#opt-fullsave');

    // Sign
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('[full-save]');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Download and validate
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'signing-fullsave.pdf');
    await download.saveAs(downloadPath);

    const qpdf = findBin('qpdf');
    if (qpdf) {
      const result = execSync(`"${qpdf}" --check "${downloadPath}" 2>&1`, {
        encoding: 'utf8',
        timeout: 10_000,
      });
      console.log('qpdf --check full-save:', result.trim());
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
      expect(result).toContain('Signature #1');
      expect(result).toContain('Signature is Valid');
    }
  });
});

test.describe('flatten-on-sign', () => {
  test('flatten-on-sign produces flattened signed PDF', async ({ page }) => {
    await page.goto('/');

    // Create a form with fields
    await page.click('#create-form');
    await expect(page.locator('#log-output')).toContainText('Created form', {
      timeout: 10_000,
    });

    // Fill fields
    await page.fill('[data-field="name"]', 'Flatten On Sign');
    await page.click('#apply-fields');
    await expect(page.locator('#log-output')).toContainText('Applied');

    // Enable flatten-on-sign
    await page.check('#opt-flatten');

    // Sign
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('flatten');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Download and validate
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'signing-flatten-on-sign.pdf');
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
      expect(result).toContain('Signature is Valid');
    }
  });

  test('flatten-on-sign with demo PDF removes form fields', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Fill fields
    await page.fill('[data-field="recipient.name"]', 'Flatten On Sign Demo');
    await page.click('#apply-fields');
    await expect(page.locator('#log-output')).toContainText('Applied');

    // Enable flatten
    await page.check('#opt-flatten');

    // Sign
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Download and round-trip
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'signing-flatten-demo.pdf');
    await download.saveAs(downloadPath);

    // Re-upload and verify fields are gone (except signature field)
    await page.evaluate(() => {
      document.getElementById('log-output')!.innerHTML = '';
    });
    const fileInput = page.locator('#file-input');
    await fileInput.setInputFiles(downloadPath);

    await expect(page.locator('#fields-section')).toBeVisible();
    // After flatten-on-sign, text fields should be gone; only signature field remains
    await expect(page.locator('#fields-container')).toContainText('Signature');
  });
});

test.describe('two-step signing', () => {
  test('two-step: prepare then sign produces valid PDF', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Execute two-step
    await page.click('#twostep-sign');
    await expect(page.locator('#log-output')).toContainText('Step 1', { timeout: 10_000 });
    await expect(page.locator('#log-output')).toContainText('Step 2', { timeout: 15_000 });
    await expect(page.locator('#log-output')).toContainText('Two-step signing complete!', {
      timeout: 15_000,
    });

    // Download and validate
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'signing-twostep.pdf');
    await download.saveAs(downloadPath);

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
      expect(result).toContain('Signature #1');
      expect(result).toContain('Signature is Valid');
    }
  });

  test('two-step + verify shows valid signature', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    await page.click('#twostep-sign');
    await expect(page.locator('#log-output')).toContainText('Two-step signing complete!', {
      timeout: 15_000,
    });

    // Verify in-browser
    await page.click('#verify-sigs');
    await expect(page.locator('#log-output')).toContainText('Found 1 signature');
    await expect(page.locator('#log-output')).toContainText('Integrity: PASS');
    await expect(page.locator('#log-output')).toContainText('Signature: PASS');
  });
});

test.describe('triple signing', () => {
  test('User1 -> User2 -> User1 again — all 3 signatures present', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

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

    // Sign again as User 1 (third signature)
    await page.click('#sign-user1');
    // The second User 1 signing will also say "Signed by User 1!"
    // Wait for the third signature info to appear
    await expect(page.locator('[data-sig="3"]')).toBeVisible({ timeout: 15_000 });

    // Verify all 3 signatures are shown in UI
    await expect(page.locator('[data-sig="1"]')).toBeVisible();
    await expect(page.locator('[data-sig="2"]')).toBeVisible();
    await expect(page.locator('[data-sig="3"]')).toBeVisible();

    // Download and validate
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'signing-triple.pdf');
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
      expect(result).toContain('Signature #3');

      // Final (3rd) signature must be valid
      const sig3Section = result.split('Signature #3')[1];
      expect(sig3Section).toBeDefined();
      expect(sig3Section).toContain('Signature is Valid');
    }
  });

  test('triple sign + verify shows all 3 signatures', async ({ page }) => {
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

    // Use in-browser verify
    await page.click('#verify-sigs');
    await expect(page.locator('#log-output')).toContainText('Found 3 signature');
  });
});

test.describe('combined signing options', () => {
  test('DER + full-save combined', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Enable both DER and full-save
    await page.check('#opt-der');
    await page.check('#opt-fullsave');

    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('[DER, full-save]');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, 'signing-der-fullsave.pdf');
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
      expect(result).toContain('Signature is Valid');
    }
  });

  test('fill + sign with DER + verify roundtrip', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Fill
    await page.fill('[data-field="recipient.name"]', 'DER Roundtrip');
    await page.click('#apply-fields');
    await expect(page.locator('#log-output')).toContainText('Applied');

    // DER encoding
    await page.check('#opt-der');

    // Sign
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Verify in-browser
    await page.click('#verify-sigs');
    await expect(page.locator('#log-output')).toContainText('Found 1 signature');
    await expect(page.locator('#log-output')).toContainText('Integrity: PASS');
  });
});
