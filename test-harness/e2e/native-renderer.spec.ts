/**
 * E2E tests for NativeRenderer toggle and rendering metrics.
 *
 * Tests the renderer toggle UI, metrics display, and NativeRenderer output
 * in the test harness. NativeRenderer renders directly from COS objects
 * without the save→re-parse round-trip that PDF.js requires.
 */

import { test, expect } from './helpers/test-setup';

test.describe('native renderer', () => {
  test('toggle to NativeRenderer renders PDF without errors', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible({ timeout: 10_000 });

    // Wait for initial PDF.js render to complete
    await expect(page.locator('#render-metrics')).toContainText('PDF.js', {
      timeout: 10_000,
    });

    // Switch to NativeRenderer
    await page.selectOption('#renderer-select', 'native');
    await expect(page.locator('#log-output')).toContainText('Switched renderer to NativeRenderer');

    // Wait for NativeRenderer metrics to appear (confirms render completed)
    await expect(page.locator('#render-metrics')).toContainText('NativeRenderer', {
      timeout: 10_000,
    });

    // PDF should render — check for at least one page canvas
    const canvases = page.locator('#pdf-viewer canvas');
    const count = await canvases.count();
    expect(count).toBeGreaterThan(0);
  });

  test('metrics display shows timing data', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Metrics should appear with PDF.js renderer too
    const metrics = page.locator('#render-metrics');
    await expect(metrics).toBeVisible();
    await expect(metrics).toContainText('PDF.js');
    await expect(metrics).toContainText('Total:');

    // Switch to NativeRenderer
    await page.selectOption('#renderer-select', 'native');
    await page.waitForTimeout(2000);
    await expect(metrics).toContainText('NativeRenderer');
    await expect(metrics).toContainText('Total:');
  });

  test('render drawing demo with NativeRenderer', async ({ page }) => {
    await page.goto('/');

    // Create drawing demo first
    await page.click('#create-drawing');
    await expect(page.locator('#log-output')).toContainText('Created drawing demo', {
      timeout: 10_000,
    });

    // Switch to NativeRenderer
    await page.selectOption('#renderer-select', 'native');
    await page.waitForTimeout(2000);

    // Should render without errors
    const canvases = page.locator('#pdf-viewer canvas');
    const count = await canvases.count();
    expect(count).toBeGreaterThan(0);

    // Metrics should show timing
    await expect(page.locator('#render-metrics')).toContainText('NativeRenderer');
  });

  test('switch between renderers (PDF.js → Native → PDF.js)', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    const metrics = page.locator('#render-metrics');

    // Verify PDF.js is default
    await expect(metrics).toContainText('PDF.js');

    // Switch to Native
    await page.selectOption('#renderer-select', 'native');
    await page.waitForTimeout(2000);
    await expect(metrics).toContainText('NativeRenderer');

    // Switch back to PDF.js
    await page.selectOption('#renderer-select', 'pdfjs');
    await page.waitForTimeout(2000);
    await expect(metrics).toContainText('PDF.js');
  });

  test('render signed PDF with NativeRenderer', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Sign first
    await page.click('#sign-user1');
    await expect(page.locator('#log-output')).toContainText('Signed by User 1!', {
      timeout: 15_000,
    });

    // Switch to NativeRenderer
    await page.selectOption('#renderer-select', 'native');
    await page.waitForTimeout(2000);

    // Should render without errors
    const canvases = page.locator('#pdf-viewer canvas');
    const count = await canvases.count();
    expect(count).toBeGreaterThan(0);
  });

  test('timing comparison: both renderers produce valid output', async ({ page }) => {
    await page.goto('/');
    await page.click('#use-demo');
    await expect(page.locator('#fields-section')).toBeVisible();

    // Get PDF.js timing
    const metrics = page.locator('#render-metrics');
    await expect(metrics).toContainText('PDF.js');
    const pdfjsText = await metrics.textContent();

    // Switch to Native
    await page.selectOption('#renderer-select', 'native');
    await page.waitForTimeout(2000);
    await expect(metrics).toContainText('NativeRenderer');
    const nativeText = await metrics.textContent();

    // Both should have valid timing format
    expect(pdfjsText).toMatch(/Total: \d+ms/);
    expect(nativeText).toMatch(/Total: \d+ms/);

    // Log for comparison
    console.log(`PDF.js: ${pdfjsText}`);
    console.log(`Native: ${nativeText}`);
  });

  test('NativeRenderer handles form PDF', async ({ page }) => {
    await page.goto('/');

    // Create a form
    await page.click('#create-form');
    await expect(page.locator('#log-output')).toContainText('Created form', {
      timeout: 10_000,
    });

    // Switch to NativeRenderer
    await page.selectOption('#renderer-select', 'native');
    await page.waitForTimeout(2000);

    // Should render without errors
    const canvases = page.locator('#pdf-viewer canvas');
    const count = await canvases.count();
    expect(count).toBeGreaterThan(0);
  });
});
