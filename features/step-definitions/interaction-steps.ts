/**
 * When steps for interacting with the viewer: clicking, pressing keys,
 * scrolling, nudging elements.
 *
 * Reuses helper patterns from tools/viewer/e2e/edit-mode.spec.ts.
 */
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';

const { When } = createBdd();

// Common click positions for finding shapes on slide 1
const SHAPE_POSITIONS = [
  { x: 0.5, y: 0.35 }, // Title area
  { x: 0.5, y: 0.65 }, // Subtitle area
  { x: 0.5, y: 0.5 }, // Center
  { x: 0.3, y: 0.35 }, // Left of title
  { x: 0.7, y: 0.35 }, // Right of title
];

// ---------------------------------------------------------------------------
// When: scrolling
// ---------------------------------------------------------------------------

When('I scroll to slide {int}', async ({ page }, slideNumber: number) => {
  const slideIndex = slideNumber - 1;
  const wrapper = page.locator(
    `.slide-wrapper[data-slide-index="${slideIndex}"]`
  );
  await wrapper.scrollIntoViewIfNeeded();
  await expect(wrapper).toBeVisible();
  await page.waitForTimeout(300);
});

// ---------------------------------------------------------------------------
// When: clicking
// ---------------------------------------------------------------------------

When(
  /^I click at position (\d+)%, (\d+)% on slide (\d+)$/,
  async ({ page }, pctX: string, pctY: string, slideNumber: string) => {
    const slideIndex = parseInt(slideNumber, 10) - 1;
    await clickSlideAtPercent(
      page,
      slideIndex,
      parseInt(pctX, 10) / 100,
      parseInt(pctY, 10) / 100
    );
  }
);

When('I click on a text region', async ({ page }) => {
  await clickSlideAtPercent(page, 0, 0.5, 0.35);
});

// ---------------------------------------------------------------------------
// When: element selection
// ---------------------------------------------------------------------------

When(
  'I select an element on slide {int}',
  async ({ page }, slideNumber: number) => {
    const slideIndex = slideNumber - 1;
    const editPanel = page.locator('#edit-panel');
    let selected = false;

    for (const pos of SHAPE_POSITIONS) {
      await clickSlideAtPercent(page, slideIndex, pos.x, pos.y);
      const isVisible = await editPanel.evaluate((el) =>
        el.classList.contains('visible')
      );
      if (isVisible) {
        selected = true;
        break;
      }
    }

    expect(
      selected,
      'Should select at least one element on the slide'
    ).toBe(true);
  }
);

When(
  'I select a text-containing element on slide {int}',
  async ({ page }, slideNumber: number) => {
    const slideIndex = slideNumber - 1;
    let found = false;

    for (const pos of SHAPE_POSITIONS) {
      await clickSlideAtPercent(page, slideIndex, pos.x, pos.y);
      const isVisible = await page
        .locator('#edit-panel')
        .evaluate((el) => el.classList.contains('visible'));
      if (!isVisible) continue;

      const textVisible = await page
        .locator('#edit-text-group')
        .evaluate((el) => el.style.display !== 'none');
      if (textVisible) {
        found = true;
        break;
      }
    }

    expect(
      found,
      'Should find a text-containing element on the slide'
    ).toBe(true);
  }
);

When(
  /^I select the element at position (\d+)%, (\d+)%$/,
  async ({ page }, pctX: string, pctY: string) => {
    await clickSlideAtPercent(
      page,
      0,
      parseInt(pctX, 10) / 100,
      parseInt(pctY, 10) / 100
    );
    await page.waitForTimeout(500);
  }
);

// ---------------------------------------------------------------------------
// When: keyboard
// ---------------------------------------------------------------------------

When('I press {word}', async ({ page }, key: string) => {
  if (key === 'Escape') {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    return;
  }

  // Click the slide image first to ensure keyboard focus is not in an input
  const img = page.locator('.slide-wrapper .slide-image').first();
  const imgVisible = await img.isVisible().catch(() => false);
  if (imgVisible) {
    await img.click();
    await page.waitForTimeout(200);
  }
  await page.keyboard.press(key);
  await page.waitForTimeout(500);
});

// ---------------------------------------------------------------------------
// When: nudge
// ---------------------------------------------------------------------------

When('I nudge the element right', async ({ page }) => {
  await page.locator('#edit-nudge-right').click();
  await page.waitForTimeout(500);
});

// ---------------------------------------------------------------------------
// When: edit panel interactions
// ---------------------------------------------------------------------------

When(
  'I increase the X position by {int} inch in the edit panel',
  async ({ page }, inches: number) => {
    const xInput = page.locator('#edit-x');
    const currentX = parseFloat(await xInput.inputValue());
    await xInput.fill(String(currentX + inches));
  }
);

When('I change the width to a new value in the edit panel', async ({ page }) => {
  const wInput = page.locator('#edit-w');
  const currentW = parseFloat(await wInput.inputValue());
  await wInput.fill(String(currentW + 0.5));
});

When('I click the Apply button', async ({ page }) => {
  await page.locator('#edit-apply').click();
  await page.waitForTimeout(500);
});

When('I click the Delete button', async ({ page }) => {
  await page.locator('#edit-delete').click();
  await page.waitForTimeout(500);
});

When('I click the Save button', async ({ page }) => {
  // Save triggers a download, handled in assertion steps
  await page.locator('#btn-save').click();
});

When('I click the Export PDF button', async ({}) => {
  // PDF export not yet implemented
  throw new Error('PDF export is not yet implemented');
});

When('I record the current position', async ({ page }) => {
  const x = await page.locator('#edit-x').inputValue();
  const y = await page.locator('#edit-y').inputValue();
  // Store in page context for later assertion
  await page.evaluate(
    ([xv, yv]) => {
      (window as any).__recordedPosition = {
        x: parseFloat(xv),
        y: parseFloat(yv),
      };
    },
    [x, y]
  );
});

When('I record the canvas image', async ({ page }) => {
  const src = await page
    .locator('.slide-wrapper[data-slide-index="0"] .slide-image')
    .getAttribute('src');
  await page.evaluate((s) => {
    (window as any).__recordedCanvasSrc = s;
  }, src);
});

When(
  'I append {string} to the text content',
  async ({ page }, suffix: string) => {
    const textarea = page.locator('#edit-text');
    const currentText = await textarea.inputValue();
    await textarea.fill(currentText + suffix);
  }
);

When(
  /^I scan slide (\d+) with a (\d+)x(\d+) grid$/,
  async (
    { page },
    slideNumber: string,
    cols: string,
    rows: string
  ) => {
    const slideIndex = parseInt(slideNumber, 10) - 1;
    const colsN = parseInt(cols, 10);
    const rowsN = parseInt(rows, 10);
    const hits: { x: number; y: number; kind: string }[] = [];
    const seenIds = new Set<string>();

    for (let row = 0; row < rowsN; row++) {
      for (let col = 0; col < colsN; col++) {
        const pctX = (col + 0.5) / colsN;
        const pctY = (row + 0.5) / rowsN;

        await clickSlideAtPercent(page, slideIndex, pctX, pctY);

        const highlight = page.locator('.inspector-highlight');
        const highlightCount = await highlight.count();
        if (highlightCount > 0) {
          const kind = await page
            .locator('.tooltip-kind')
            .textContent({ timeout: 2000 })
            .catch(() => '?');
          const id = `${kind}@(${pctX.toFixed(2)},${pctY.toFixed(2)})`;
          if (!seenIds.has(id)) {
            seenIds.add(id);
            hits.push({ x: pctX, y: pctY, kind: kind ?? '?' });
          }
        }
      }
    }

    // Store scan results for assertion steps
    await page.evaluate((h) => {
      (window as any).__scanResults = h;
    }, hits);
  }
);

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

async function clickSlideAtPercent(
  page: import('@playwright/test').Page,
  slideIndex: number,
  pctX: number,
  pctY: number
): Promise<void> {
  const img = page.locator(
    `.slide-wrapper[data-slide-index="${slideIndex}"] .slide-image`
  );
  const box = await img.boundingBox();
  if (!box)
    throw new Error(`Slide ${slideIndex} image not found or not visible`);
  await page.mouse.click(
    box.x + box.width * pctX,
    box.y + box.height * pctY
  );
  await page.waitForTimeout(500);
}
