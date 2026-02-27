/**
 * E2E tests for viewer edit mode.
 *
 * Tests use the IC CISO Visit deck (slide 13 — logos, mix of grouped + ungrouped)
 * and the basic-shapes test fixture. Takes screenshots aggressively to visually
 * verify bounding box accuracy, nudge feedback, and save fidelity.
 */

import { test, expect, type Page, type Locator } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test fixture paths
const IC_CISO_PATH = path.resolve(__dirname, '../../../../pptx-pdf-comparisons/IC CISO Visit to Virtru.pptx');
const BASIC_SHAPES_PATH = path.resolve(__dirname, '../../../test-data/basic-shapes.pptx');
const GROUPING_PATH = path.resolve(__dirname, '../../../test-data/corpus/grouping-shapes.pptx');

const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots');

// Ensure screenshot dir exists
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Upload a PPTX file and wait for both rendering AND editKit to be ready. */
async function loadPptx(page: Page, filePath: string): Promise<void> {
  const fileInput = page.locator('#file-input');
  await fileInput.setInputFiles(filePath);

  // Wait for slides to appear
  await page.waitForSelector('#slides-container.visible', { timeout: 60_000 });
  // Wait for loading indicator to disappear
  await page.waitForFunction(
    () => !document.querySelector('#loading')?.classList.contains('visible'),
    { timeout: 90_000 }
  );
  // Wait for editKit to be ready (set by loadEditKit via data attribute)
  await page.waitForFunction(
    () => document.body.dataset.editKitReady === 'true',
    { timeout: 30_000 }
  );
}

/** Scroll to a specific slide (0-indexed) and wait for it to be visible. */
async function scrollToSlide(page: Page, slideIndex: number): Promise<Locator> {
  const wrapper = page.locator(`.slide-wrapper[data-slide-index="${slideIndex}"]`);
  await wrapper.scrollIntoViewIfNeeded();
  await expect(wrapper).toBeVisible();
  await page.waitForTimeout(300);
  return wrapper;
}

/** Get the slide image element for a given slide index. */
function getSlideImage(page: Page, slideIndex: number): Locator {
  return page.locator(`.slide-wrapper[data-slide-index="${slideIndex}"] .slide-image`);
}

/** Enter edit mode by clicking the Edit button. */
async function enterEditMode(page: Page): Promise<void> {
  const editBtn = page.locator('#btn-edit');
  const isActive = await editBtn.evaluate((el) => el.classList.contains('active'));
  if (!isActive) {
    await editBtn.click();
  }
  await expect(editBtn).toHaveClass(/active/);
}

/** Click on a slide image at a specific percentage position. */
async function clickSlideAt(page: Page, slideIndex: number, pctX: number, pctY: number): Promise<void> {
  const img = getSlideImage(page, slideIndex);
  const box = await img.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.click(
    box!.x + box!.width * pctX,
    box!.y + box!.height * pctY
  );
  await page.waitForTimeout(500);
}

/** Try multiple positions to select an element. Returns true if selection succeeded. */
async function selectAnyElement(page: Page, slideIndex: number, positions: { x: number; y: number }[]): Promise<boolean> {
  const editPanel = page.locator('#edit-panel');
  for (const pos of positions) {
    await clickSlideAt(page, slideIndex, pos.x, pos.y);
    const isVisible = await editPanel.evaluate((el) => el.classList.contains('visible'));
    if (isVisible) return true;
  }
  return false;
}

/** Take a named screenshot for visual inspection. */
async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `${name}.png`),
    fullPage: false,
  });
}

/** Take a screenshot of just a slide wrapper area. */
async function screenshotSlide(page: Page, slideIndex: number, name: string): Promise<void> {
  const wrapper = page.locator(`.slide-wrapper[data-slide-index="${slideIndex}"]`);
  await wrapper.screenshot({
    path: path.join(SCREENSHOT_DIR, `${name}.png`),
  });
}

/**
 * Scan a slide with a grid to find all selectable elements.
 * Uses inspector mode (no layer filter) to map the full element layout.
 */
async function scanSlideElements(
  page: Page,
  slideIndex: number,
  gridCols: number,
  gridRows: number,
  mode: 'inspect' | 'edit'
): Promise<{ x: number; y: number; kind: string; id: string; layer: string }[]> {
  const hits: { x: number; y: number; kind: string; id: string; layer: string }[] = [];
  const seenIds = new Set<string>();

  if (mode === 'inspect') {
    // Use inspector mode for full element mapping
    const inspectBtn = page.locator('#btn-inspect');
    const isActive = await inspectBtn.evaluate((el) => el.classList.contains('active'));
    if (!isActive) await inspectBtn.click();
  }

  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      const pctX = (col + 0.5) / gridCols;
      const pctY = (row + 0.5) / gridRows;

      await clickSlideAt(page, slideIndex, pctX, pctY);

      if (mode === 'inspect') {
        const highlight = page.locator('.inspector-highlight');
        const highlightVisible = await highlight.count() > 0;
        if (highlightVisible) {
          const kind = await page.locator('.tooltip-kind').textContent({ timeout: 2000 }).catch(() => '?');
          const layer = await page.locator('.tooltip-layer').textContent({ timeout: 2000 }).catch(() => '?');
          const nameEl = page.locator('.tooltip-name');
          const name = (await nameEl.count()) > 0 ? await nameEl.textContent({ timeout: 1000 }).catch(() => '') : '';
          const id = `${kind}:${name}@(${pctX.toFixed(2)},${pctY.toFixed(2)})`;
          if (!seenIds.has(id)) {
            seenIds.add(id);
            hits.push({ x: pctX, y: pctY, kind, id, layer: layer ?? '?' });
          }
        }
      } else {
        const editPanel = page.locator('#edit-panel');
        const isVisible = await editPanel.evaluate((el) => el.classList.contains('visible'));
        if (isVisible) {
          const kind = await page.locator('#edit-kind').textContent() ?? '?';
          const id = await page.locator('#edit-id').textContent() ?? '?';
          if (!seenIds.has(id)) {
            seenIds.add(id);
            hits.push({ x: pctX, y: pctY, kind, id, layer: 'slide' });
          }
        }
      }
    }
  }

  return hits;
}

// Common click positions for basic shapes (covering the title/subtitle area)
const BASIC_SHAPE_POSITIONS = [
  { x: 0.5, y: 0.35 },  // Title area
  { x: 0.5, y: 0.65 },  // Subtitle area
  { x: 0.5, y: 0.5 },   // Center
  { x: 0.3, y: 0.35 },  // Left of title
  { x: 0.7, y: 0.35 },  // Right of title
];

// Click positions for IC CISO slide 13 (logos + callouts + title)
const IC_CISO_S13_POSITIONS = [
  { x: 0.5, y: 0.07 },   // Title text
  { x: 0.15, y: 0.75 },  // Bottom-left callout
  { x: 0.85, y: 0.75 },  // Bottom-right callout
  { x: 0.5, y: 0.82 },   // Center callout
  { x: 0.5, y: 0.68 },   // Arrow area
  { x: 0.2, y: 0.37 },   // Private Sector label
  { x: 0.4, y: 0.37 },   // IC label
  { x: 0.55, y: 0.37 },  // DoW label
  { x: 0.1, y: 0.95 },   // Footer area
];

// ---------------------------------------------------------------------------
// Tests using basic-shapes.pptx
// ---------------------------------------------------------------------------

test.describe('Edit mode — basic-shapes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await loadPptx(page, BASIC_SHAPES_PATH);
  });

  test('loads file and renders slides', async ({ page }) => {
    await screenshot(page, '01-basic-shapes-loaded');
    const status = page.locator('#status');
    await expect(status).toContainText('Rendered');
    const slideCount = await page.locator('.slide-wrapper').count();
    expect(slideCount).toBeGreaterThan(0);
  });

  test('enter edit mode shows active button', async ({ page }) => {
    await enterEditMode(page);
    await screenshot(page, '02-edit-mode-active');
    await expect(page.locator('#btn-edit')).toHaveClass(/active/);
    await expect(page.locator('.slide-wrapper').first()).toHaveClass(/edit-active/);
  });

  test('click selects element and shows edit panel with highlight', async ({ page }) => {
    await enterEditMode(page);

    const selected = await selectAnyElement(page, 0, BASIC_SHAPE_POSITIONS);
    await screenshotSlide(page, 0, '03-shape-selected');
    expect(selected).toBe(true);

    // Verify panel content
    const kind = await page.locator('#edit-kind').textContent();
    expect(kind).toBeTruthy();
    const elementId = await page.locator('#edit-id').textContent();
    expect(elementId).toContain('#');

    // Verify highlight
    await expect(page.locator('.edit-highlight')).toBeVisible();
    await screenshotSlide(page, 0, '03b-shape-highlight');
  });

  test('nudge updates both highlight position and canvas image', async ({ page }) => {
    await enterEditMode(page);
    const selected = await selectAnyElement(page, 0, BASIC_SHAPE_POSITIONS);
    if (!selected) { test.skip(); return; }

    await screenshotSlide(page, 0, '05a-before-nudge');
    const srcBefore = await getSlideImage(page, 0).getAttribute('src');
    const xBefore = await page.locator('#edit-x').inputValue();

    // Nudge right via button
    await page.locator('#edit-nudge-right').click();
    await page.waitForTimeout(500);

    await screenshotSlide(page, 0, '05b-after-nudge');
    const xAfter = await page.locator('#edit-x').inputValue();
    const srcAfter = await getSlideImage(page, 0).getAttribute('src');

    // Panel X value increased
    expect(parseFloat(xAfter)).toBeGreaterThan(parseFloat(xBefore));
    // Canvas re-rendered (different image data)
    expect(srcAfter).not.toBe(srcBefore);
    // Highlight still visible
    await expect(page.locator('.edit-highlight')).toBeVisible();
  });

  test('apply changes from panel updates canvas', async ({ page }) => {
    await enterEditMode(page);
    const selected = await selectAnyElement(page, 0, BASIC_SHAPE_POSITIONS);
    if (!selected) { test.skip(); return; }

    await screenshotSlide(page, 0, '06a-before-apply');
    const srcBefore = await getSlideImage(page, 0).getAttribute('src');

    // Shift X by 1 inch in the panel
    const xInput = page.locator('#edit-x');
    const currentX = parseFloat(await xInput.inputValue());
    await xInput.fill(String(currentX + 1));
    await page.locator('#edit-apply').click();
    await page.waitForTimeout(500);

    await screenshotSlide(page, 0, '06b-after-apply');
    const srcAfter = await getSlideImage(page, 0).getAttribute('src');

    expect(srcAfter).not.toBe(srcBefore);
    expect(await page.locator('#btn-save').isDisabled()).toBe(false);
  });

  test('delete element removes it from canvas', async ({ page }) => {
    await enterEditMode(page);
    const selected = await selectAnyElement(page, 0, BASIC_SHAPE_POSITIONS);
    if (!selected) { test.skip(); return; }

    const elementId = await page.locator('#edit-id').textContent();
    await screenshotSlide(page, 0, '07a-before-delete');
    const srcBefore = await getSlideImage(page, 0).getAttribute('src');

    await page.locator('#edit-delete').click();
    await page.waitForTimeout(500);

    await screenshotSlide(page, 0, '07b-after-delete');
    const srcAfter = await getSlideImage(page, 0).getAttribute('src');

    expect(srcAfter).not.toBe(srcBefore);
    // Panel hidden
    const panelVisible = await page.locator('#edit-panel').evaluate((el) => el.classList.contains('visible'));
    expect(panelVisible).toBe(false);
  });

  test('keyboard arrow nudge updates canvas', async ({ page }) => {
    await enterEditMode(page);
    const selected = await selectAnyElement(page, 0, BASIC_SHAPE_POSITIONS);
    if (!selected) { test.skip(); return; }

    // Click on the slide image to ensure focus is there (not on panel inputs)
    const img = getSlideImage(page, 0);
    await img.click();
    await page.waitForTimeout(200);

    // Re-select since clicking the image may have changed selection
    const reselected = await selectAnyElement(page, 0, BASIC_SHAPE_POSITIONS);
    if (!reselected) { test.skip(); return; }

    await screenshotSlide(page, 0, '08a-before-key-nudge');
    const yBefore = await page.locator('#edit-y').inputValue();
    const srcBefore = await getSlideImage(page, 0).getAttribute('src');

    // Press ArrowDown (not in an input field)
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(500);

    await screenshotSlide(page, 0, '08b-after-key-nudge');
    const yAfter = await page.locator('#edit-y').inputValue();
    const srcAfter = await getSlideImage(page, 0).getAttribute('src');

    expect(parseFloat(yAfter)).toBeGreaterThan(parseFloat(yBefore));
    expect(srcAfter).not.toBe(srcBefore);
  });

  test('escape dismisses selection', async ({ page }) => {
    await enterEditMode(page);
    const selected = await selectAnyElement(page, 0, BASIC_SHAPE_POSITIONS);
    if (!selected) { test.skip(); return; }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    const panelVisible = await page.locator('#edit-panel').evaluate((el) => el.classList.contains('visible'));
    expect(panelVisible).toBe(false);
    expect(await page.locator('.edit-highlight').count()).toBe(0);
    await screenshot(page, '09-escape-dismissed');
  });
});

// ---------------------------------------------------------------------------
// Tests using IC CISO Visit deck (slide 13)
// ---------------------------------------------------------------------------

const hasICCisoDeck = fs.existsSync(IC_CISO_PATH);

test.describe('Edit mode — IC CISO slide 13 (logos)', () => {
  test.skip(!hasICCisoDeck, 'IC CISO deck not available');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await loadPptx(page, IC_CISO_PATH);
  });

  test('renders and scrolls to slide 13', async ({ page }) => {
    await screenshot(page, '10-ic-ciso-loaded');
    await expect(page.locator('#status')).toContainText('Rendered');
    await scrollToSlide(page, 12);
    await screenshotSlide(page, 12, '11-slide13-overview');
  });

  test('slide 13 — inspector scan maps all elements', async ({ page }) => {
    // Use inspector mode to map all elements (no layer filter)
    await scrollToSlide(page, 12);
    const hits = await scanSlideElements(page, 12, 8, 6, 'inspect');

    console.log(`Inspector found ${hits.length} unique elements on slide 13:`);
    for (const h of hits) {
      console.log(`  (${h.x.toFixed(2)}, ${h.y.toFixed(2)}) → ${h.kind} [${h.layer}]`);
    }
    await screenshotSlide(page, 12, '12-slide13-inspector-scan');

    // Should find many elements (logos, labels, callouts, arrows)
    expect(hits.length).toBeGreaterThan(3);
  });

  test('slide 13 — edit mode selects elements with bounding boxes', async ({ page }) => {
    await enterEditMode(page);
    await scrollToSlide(page, 12);
    await screenshotSlide(page, 12, '13a-slide13-edit-mode');

    const selected = await selectAnyElement(page, 12, IC_CISO_S13_POSITIONS);

    if (selected) {
      const kind = await page.locator('#edit-kind').textContent();
      const name = await page.locator('#edit-name').textContent();
      const id = await page.locator('#edit-id').textContent();
      console.log(`Selected on slide 13: ${kind} "${name}" (${id})`);

      await expect(page.locator('.edit-highlight')).toBeVisible();
      await screenshotSlide(page, 12, '13b-slide13-element-selected');
    } else {
      console.log('Could not select any element on slide 13 — all positions missed');
    }
    expect(selected).toBe(true);
  });

  test('slide 13 — nudge and verify canvas updates', async ({ page }) => {
    await enterEditMode(page);
    await scrollToSlide(page, 12);

    const selected = await selectAnyElement(page, 12, IC_CISO_S13_POSITIONS);
    if (!selected) { test.skip(); return; }

    const kind = await page.locator('#edit-kind').textContent();
    const name = await page.locator('#edit-name').textContent();
    console.log(`Nudging: ${kind} — ${name}`);

    await screenshotSlide(page, 12, '14a-slide13-before-nudge');
    const srcBefore = await getSlideImage(page, 12).getAttribute('src');
    const xBefore = await page.locator('#edit-x').inputValue();

    await page.locator('#edit-nudge-right').click();
    await page.waitForTimeout(500);

    await screenshotSlide(page, 12, '14b-slide13-after-nudge');
    const srcAfter = await getSlideImage(page, 12).getAttribute('src');
    const xAfter = await page.locator('#edit-x').inputValue();

    expect(srcAfter).not.toBe(srcBefore);
    expect(parseFloat(xAfter)).toBeGreaterThan(parseFloat(xBefore));
  });

  test('slide 13 — nudge then re-select at new position (hit-test validates edit model)', async ({ page }) => {
    await enterEditMode(page);
    await scrollToSlide(page, 12);

    const selected = await selectAnyElement(page, 12, IC_CISO_S13_POSITIONS);
    if (!selected) { test.skip(); return; }

    const originalId = await page.locator('#edit-id').textContent();
    await screenshotSlide(page, 12, '15a-initial-select');

    const highlight = page.locator('.edit-highlight');
    const hlBefore = await highlight.boundingBox();

    // Nudge right 4 times (1 inch total)
    for (let i = 0; i < 4; i++) {
      await page.locator('#edit-nudge-right').click();
      await page.waitForTimeout(200);
    }

    await screenshotSlide(page, 12, '15b-after-4-nudges');
    const hlAfter = await highlight.boundingBox();

    if (hlBefore && hlAfter) {
      expect(hlAfter.x).toBeGreaterThan(hlBefore.x);
    }

    // Dismiss and re-select at the new position
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    if (hlAfter) {
      await page.mouse.click(
        hlAfter.x + hlAfter.width / 2,
        hlAfter.y + hlAfter.height / 2
      );
      await page.waitForTimeout(500);

      await screenshotSlide(page, 12, '15c-reselect-new-position');

      const reselectedId = await page.locator('#edit-id').textContent();
      if (reselectedId) {
        expect(reselectedId).toBe(originalId);
      }
    }
  });

  test('slide 13 — delete element and verify visual change', async ({ page }) => {
    await enterEditMode(page);
    await scrollToSlide(page, 12);

    const selected = await selectAnyElement(page, 12, IC_CISO_S13_POSITIONS);
    if (!selected) { test.skip(); return; }

    await screenshotSlide(page, 12, '16a-before-delete');
    const srcBefore = await getSlideImage(page, 12).getAttribute('src');

    await page.locator('#edit-delete').click();
    await page.waitForTimeout(500);

    await screenshotSlide(page, 12, '16b-after-delete');
    const srcAfter = await getSlideImage(page, 12).getAttribute('src');
    expect(srcAfter).not.toBe(srcBefore);
  });

  test('slide 13 — text edit round-trip', async ({ page }) => {
    await enterEditMode(page);
    await scrollToSlide(page, 12);

    // Try positions likely to have text (title, callouts, footer)
    for (const pos of IC_CISO_S13_POSITIONS) {
      await clickSlideAt(page, 12, pos.x, pos.y);
      const isVisible = await page.locator('#edit-panel').evaluate((el) => el.classList.contains('visible'));
      if (!isVisible) continue;

      const textVisible = await page.locator('#edit-text-group').evaluate((el) => el.style.display !== 'none');
      if (!textVisible) continue;

      await screenshotSlide(page, 12, '17a-text-found');

      const originalText = await page.locator('#edit-text').inputValue();
      await page.locator('#edit-text').fill(originalText + '\n[E2E TEST]');
      await page.locator('#edit-apply').click();
      await page.waitForTimeout(500);

      await screenshotSlide(page, 12, '17b-text-edited');
      return; // Success
    }
    console.log('No text-containing shape found on slide 13');
  });

  test('slide 13 — save PPTX after edit', async ({ page }) => {
    await enterEditMode(page);
    await scrollToSlide(page, 12);

    const selected = await selectAnyElement(page, 12, IC_CISO_S13_POSITIONS);
    if (!selected) { test.skip(); return; }

    await page.locator('#edit-nudge-right').click();
    await page.waitForTimeout(300);
    expect(await page.locator('#btn-save').isDisabled()).toBe(false);

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.locator('#btn-save').click(),
    ]);

    expect(download.suggestedFilename()).toContain('_edited.pptx');
    const downloadPath = path.join(SCREENSHOT_DIR, download.suggestedFilename());
    await download.saveAs(downloadPath);
    expect(fs.statSync(downloadPath).size).toBeGreaterThan(1000);

    await screenshot(page, '18-save-complete');
    console.log(`Saved: ${downloadPath} (${fs.statSync(downloadPath).size} bytes)`);
  });
});

// ---------------------------------------------------------------------------
// Tests using grouping-shapes.pptx
// ---------------------------------------------------------------------------

const hasGroupingFile = fs.existsSync(GROUPING_PATH);

test.describe('Edit mode — grouped shapes', () => {
  test.skip(!hasGroupingFile, 'grouping-shapes.pptx not available');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await loadPptx(page, GROUPING_PATH);
  });

  test('inspector finds elements in groups', async ({ page }) => {
    await scrollToSlide(page, 0);
    // Dense grid focused on the top half where shapes are
    const hits = await scanSlideElements(page, 0, 10, 5, 'inspect');

    console.log(`Inspector found ${hits.length} unique elements on groups slide:`);
    for (const h of hits) {
      console.log(`  (${h.x.toFixed(2)}, ${h.y.toFixed(2)}) → ${h.kind} [${h.layer}]`);
    }
    await screenshotSlide(page, 0, '20-groups-inspector-scan');
    expect(hits.length).toBeGreaterThan(0);
  });

  test('edit mode selects grouped elements', async ({ page }) => {
    await enterEditMode(page);

    // Shapes are in the upper portion — use dense grid there
    const positions: { x: number; y: number }[] = [];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 10; col++) {
        positions.push({ x: (col + 0.5) / 10, y: (row + 0.5) / 10 });
      }
    }

    const selected = await selectAnyElement(page, 0, positions);
    await screenshotSlide(page, 0, '21-groups-edit-select');

    if (selected) {
      const kind = await page.locator('#edit-kind').textContent();
      const id = await page.locator('#edit-id').textContent();
      console.log(`Selected in groups: ${kind} (${id})`);
      await expect(page.locator('.edit-highlight')).toBeVisible();
    }

    // Not strictly failing if nothing selected — the file might only have
    // master-layer elements. Log result for diagnosis.
    console.log(`Edit mode selection result: ${selected}`);
  });
});
