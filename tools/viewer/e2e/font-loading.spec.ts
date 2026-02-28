/**
 * E2E tests for font discovery and loading in the viewer.
 *
 * Loads real PPTX fixtures in a browser and verifies that fonts are
 * registered with the FontFace API and usable for Canvas2D rendering.
 * Tests focus on observable outcomes, not internal pipeline state.
 */

import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DATA = path.resolve(__dirname, '../../../test-data');
const FONT_STRESS_PATH = path.resolve(TEST_DATA, 'font-stress-test.pptx');
const BASIC_SHAPES_PATH = path.resolve(TEST_DATA, 'basic-shapes.pptx');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Load a PPTX file in the viewer and wait for rendering to complete. */
async function loadPptx(page: Page, filePath: string): Promise<void> {
  await page.goto('/');
  const fileInput = page.locator('#file-input');
  await fileInput.setInputFiles(filePath);

  // Wait for slides to appear and loading to finish
  await page.waitForSelector('#slides-container.visible', { timeout: 60_000 });
  await page.waitForFunction(
    () => !document.querySelector('#loading')?.classList.contains('visible'),
    { timeout: 90_000 }
  );
  // Small buffer for FontFace registration to settle
  await page.waitForTimeout(500);
}

/** Query the browser's FontFace API to get all registered font families. */
async function getRegisteredFonts(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const families = new Set<string>();
    for (const face of document.fonts) {
      families.add(face.family);
    }
    return [...families].sort();
  });
}

/**
 * Check if a specific font renders differently from the fallback sans-serif
 * in Canvas2D. This proves the font is actually usable, not just registered.
 */
async function isFontUsableInCanvas(page: Page, fontFamily: string): Promise<boolean> {
  return page.evaluate((family) => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 50;
    const ctx = canvas.getContext('2d')!;

    // Render with target font
    ctx.font = `24px '${family}', sans-serif`;
    ctx.fillText('ABCDEFGHabcdefgh0123456789', 0, 30);
    const targetData = ctx.getImageData(0, 0, 400, 50).data;

    // Render with fallback only
    ctx.clearRect(0, 0, 400, 50);
    ctx.font = '24px sans-serif';
    ctx.fillText('ABCDEFGHabcdefgh0123456789', 0, 30);
    const fallbackData = ctx.getImageData(0, 0, 400, 50).data;

    // Compare pixel data — if they differ, the font is actually being used
    let diffPixels = 0;
    for (let i = 0; i < targetData.length; i += 4) {
      if (
        targetData[i] !== fallbackData[i] ||
        targetData[i + 1] !== fallbackData[i + 1] ||
        targetData[i + 2] !== fallbackData[i + 2] ||
        targetData[i + 3] !== fallbackData[i + 3]
      ) {
        diffPixels++;
      }
    }
    return diffPixels > 10; // Allow small tolerance
  }, fontFamily);
}

// ---------------------------------------------------------------------------
// Tests — basic-shapes.pptx (minimal baseline)
// ---------------------------------------------------------------------------

test.describe('font loading — basic-shapes.pptx', () => {
  test('Calibri and Calibri Light are registered with FontFace API', async ({ page }) => {
    await loadPptx(page, BASIC_SHAPES_PATH);
    const registered = await getRegisteredFonts(page);

    expect(registered).toContain('Calibri');
    expect(registered).toContain('Calibri Light');
  });

  test('Calibri renders differently from fallback sans-serif', async ({ page }) => {
    await loadPptx(page, BASIC_SHAPES_PATH);

    const isUsable = await isFontUsableInCanvas(page, 'Calibri');
    expect(isUsable).toBe(true);
  });

  test('Arial is registered (via Liberation Sans bundle)', async ({ page }) => {
    await loadPptx(page, BASIC_SHAPES_PATH);
    const registered = await getRegisteredFonts(page);

    expect(registered).toContain('Arial');
  });
});

// ---------------------------------------------------------------------------
// Tests — font-stress-test.pptx (comprehensive)
// ---------------------------------------------------------------------------

test.describe('font loading — font-stress-test.pptx', () => {
  /** Fonts with bundled WOFF2 data that MUST load from font-stress-test.pptx. */
  const MUST_LOAD_BUNDLED = [
    'Calibri',
    'Calibri Light',
    'Arial',
    'Arial Narrow',
    'Times New Roman',
    'Courier New',
    'Cambria',
    'Georgia',
    'Segoe UI',
    'Segoe UI Light',
    'Segoe UI Semibold',
    'Segoe UI Semilight',
    'Palatino Linotype',
    'Bookman Old Style',
    'Century Schoolbook',
    'Roboto',
    'Roboto Mono',
    'Roboto Slab',
    'Roboto Slab Light',
    'Roboto Slab SemiBold',
    'Lato',
    'Lato Light',
    'Barlow',
    'Barlow Light',
    'Montserrat',
    'Open Sans',
    'Poppins',
    'Raleway',
    'Noto Sans',
    'Noto Sans Symbols',
    'Noto Serif',
    'Oswald',
    'Playfair Display',
    'Source Code Pro',
    'Source Sans Pro',
    'Fira Code',
    'Courier Prime',
    'Comfortaa',
    'Tinos',
    'Arimo',
    'Ubuntu',
  ];

  test('all bundled fonts are registered with FontFace API', async ({ page }) => {
    await loadPptx(page, FONT_STRESS_PATH);
    const registered = await getRegisteredFonts(page);

    const missing: string[] = [];
    for (const font of MUST_LOAD_BUNDLED) {
      if (!registered.includes(font)) {
        missing.push(font);
      }
    }
    expect(
      missing,
      `these bundled fonts should be registered but aren't: ${missing.join(', ')}`
    ).toEqual([]);
  });

  test('at least 40 fonts are registered', async ({ page }) => {
    await loadPptx(page, FONT_STRESS_PATH);
    const registered = await getRegisteredFonts(page);

    expect(registered.length).toBeGreaterThanOrEqual(40);
  });

  test('key fonts render differently from fallback', async ({ page }) => {
    await loadPptx(page, FONT_STRESS_PATH);

    // Test fonts with distinctly different shapes from sans-serif
    const testFonts = [
      'Calibri',          // Carlito substitute
      'Roboto',           // Bundled directly
      'Fira Code',        // Monospace — very distinct
      'Playfair Display', // Serif — very distinct
      'Lato',             // Bundled directly
    ];

    for (const font of testFonts) {
      const isUsable = await isFontUsableInCanvas(page, font);
      expect(isUsable, `${font} should render differently from sans-serif`).toBe(true);
    }
  });

  test('no phantom loads — every registered font is actually in document.fonts', async ({ page }) => {
    await loadPptx(page, FONT_STRESS_PATH);

    // Verify all MUST_LOAD fonts are both registered AND usable
    const registered = await getRegisteredFonts(page);
    for (const font of MUST_LOAD_BUNDLED) {
      if (registered.includes(font)) {
        const checkResult = await page.evaluate((family) => {
          return document.fonts.check(`16px '${family}'`);
        }, font);
        expect(checkResult, `${font} is registered but document.fonts.check fails`).toBe(true);
      }
    }
  });
});
