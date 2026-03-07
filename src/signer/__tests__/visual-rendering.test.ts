import { describe, it, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { signPDFWithPDFBox } from '../pdfbox-signer';
import { getFixtureSigner } from '../../testing/fixture-signer';
import {
  isPdftoppmAvailable,
  isPdfjsAvailable,
  renderPdfPage,
  renderAndCompare,
  compareSnapshots,
  snapshotPath,
  readSnapshot,
  updateSnapshot,
  writeDiff,
  isUpdateMode,
} from '../../testing/visual-test-helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');

function loadTestPdf(relativePath: string): Uint8Array {
  const absolute = path.resolve(repoRoot, relativePath);
  return new Uint8Array(fs.readFileSync(absolute));
}

/**
 * Minimal valid 1x1 red PNG (67 bytes).
 */
function createMinimalPng(): Uint8Array {
  // prettier-ignore
  return new Uint8Array([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01,
    0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00,
    0x72, 0x73, 0x70, 0x60,
    0x00, 0x00, 0x00, 0x0C,
    0x49, 0x44, 0x41, 0x54,
    0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00, 0x00,
    0x01, 0x01, 0x01, 0x00,
    0x18, 0xDD, 0x8D, 0xB4,
    0x00, 0x00, 0x00, 0x00,
    0x49, 0x45, 0x4E, 0x44,
    0xAE, 0x42, 0x60, 0x82,
  ]);
}

/**
 * Helper: sign PDF, render page 1, compare or update snapshot.
 */
function assertSnapshot(testName: string, pngBuf: Buffer): void {
  if (isUpdateMode()) {
    updateSnapshot(testName, pngBuf);
    console.log(`  [snapshot updated] ${snapshotPath(testName)}`);
    return;
  }

  const reference = readSnapshot(testName);
  if (!reference) {
    throw new Error(
      `No reference snapshot found for "${testName}". ` +
      `Run with PDFBOX_TS_UPDATE_SNAPSHOTS=1 to generate.`,
    );
  }

  const result = compareSnapshots(pngBuf, reference);
  if (!result.match) {
    writeDiff(testName, result.diffPng);
    throw new Error(
      `Visual mismatch for "${testName}": ${result.mismatchPercent.toFixed(2)}% pixels differ ` +
      `(${result.mismatchPixels}/${result.totalPixels}). ` +
      `Diff saved to ${snapshotPath(testName).replace('.png', '-diff.png')}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Test suite — gated by PDFBOX_TS_E2E_VISUAL=1
// ---------------------------------------------------------------------------

const skipVisual = !process.env.PDFBOX_TS_E2E_VISUAL;

describe.skipIf(skipVisual)('visual rendering (pdftoppm snapshots)', () => {
  const signer = getFixtureSigner();
  let originalPdf: Uint8Array;
  let testPng: Uint8Array;

  beforeAll(() => {
    if (!isPdftoppmAvailable()) {
      console.warn(
        'WARNING: pdftoppm not found. Install poppler: brew install poppler / apt install poppler-utils',
      );
      throw new Error('pdftoppm not available — cannot run visual rendering tests');
    }

    originalPdf = loadTestPdf('test-pdfs/working/wire-instructions.pdf');
    testPng = createMinimalPng();
  });

  it('simple invisible signature — page visually unchanged', async () => {
    const result = await signPDFWithPDFBox(originalPdf, signer);
    const rendered = renderPdfPage(result.signedData);
    assertSnapshot('simple-invisible-signature', rendered);
  });

  it('visual signature with text — appearance box renders', async () => {
    const result = await signPDFWithPDFBox(originalPdf, signer, {
      signatureAppearance: {
        position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
      },
    });
    const rendered = renderPdfPage(result.signedData);
    assertSnapshot('visual-signature-text', rendered);
  });

  it('visual signature with image — PNG visible in render', async () => {
    const result = await signPDFWithPDFBox(originalPdf, signer, {
      signatureAppearance: {
        imageData: testPng,
        position: { page: 0, x: 50, y: 50, width: 200, height: 100 },
      },
    });
    const rendered = renderPdfPage(result.signedData);
    assertSnapshot('visual-signature-image', rendered);
  });

  it('multi-user signatures — both appearance boxes render', async () => {
    // First signature
    const firstResult = await signPDFWithPDFBox(originalPdf, signer, {
      signatureAppearance: {
        position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
      },
    });

    // Second signature
    const secondResult = await signPDFWithPDFBox(firstResult.signedData, signer, {
      signatureAppearance: {
        position: { page: 0, x: 50, y: 110, width: 200, height: 50 },
      },
    });

    const rendered = renderPdfPage(secondResult.signedData);
    assertSnapshot('multi-user-signatures', rendered);
  });
});

// ---------------------------------------------------------------------------
// Renderer comparison: pdftoppm vs PDF.js
// Exports side-by-side PNGs to test-snapshots/compare/
// ---------------------------------------------------------------------------

const skipCompare = !process.env.PDFBOX_TS_E2E_VISUAL || !isPdfjsAvailable();

describe.skipIf(skipCompare)('renderer comparison (pdftoppm vs PDF.js)', () => {
  const signer = getFixtureSigner();
  let originalPdf: Uint8Array;
  let testPng: Uint8Array;

  beforeAll(() => {
    originalPdf = loadTestPdf('test-pdfs/working/wire-instructions.pdf');
    testPng = createMinimalPng();
  });

  it('invisible signature — pdftoppm vs PDF.js', async () => {
    const result = await signPDFWithPDFBox(originalPdf, signer);
    const stats = await renderAndCompare('invisible-sig', result.signedData);
    console.log(`  pdftoppm: ${stats.pdftoppmPath}`);
    console.log(`  pdfjs:    ${stats.pdfjsPath}`);
    console.log(`  diff:     ${stats.diffPath}`);
    console.log(`  mismatch: ${stats.mismatchPercent.toFixed(2)}%`);
  });

  it('visual text signature — pdftoppm vs PDF.js', async () => {
    const result = await signPDFWithPDFBox(originalPdf, signer, {
      signatureAppearance: {
        position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
      },
    });
    const stats = await renderAndCompare('visual-text-sig', result.signedData);
    console.log(`  pdftoppm: ${stats.pdftoppmPath}`);
    console.log(`  pdfjs:    ${stats.pdfjsPath}`);
    console.log(`  diff:     ${stats.diffPath}`);
    console.log(`  mismatch: ${stats.mismatchPercent.toFixed(2)}%`);
  });

  it('visual image signature — pdftoppm vs PDF.js', async () => {
    const result = await signPDFWithPDFBox(originalPdf, signer, {
      signatureAppearance: {
        imageData: testPng,
        position: { page: 0, x: 50, y: 50, width: 200, height: 100 },
      },
    });
    const stats = await renderAndCompare('visual-image-sig', result.signedData);
    console.log(`  pdftoppm: ${stats.pdftoppmPath}`);
    console.log(`  pdfjs:    ${stats.pdfjsPath}`);
    console.log(`  diff:     ${stats.diffPath}`);
    console.log(`  mismatch: ${stats.mismatchPercent.toFixed(2)}%`);
  });

  it('counter-signed — pdftoppm vs PDF.js', async () => {
    const first = await signPDFWithPDFBox(originalPdf, signer, {
      signatureAppearance: {
        position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
      },
    });
    const second = await signPDFWithPDFBox(first.signedData, signer, {
      signatureAppearance: {
        position: { page: 0, x: 50, y: 110, width: 200, height: 50 },
      },
    });
    const stats = await renderAndCompare('counter-signed', second.signedData);
    console.log(`  pdftoppm: ${stats.pdftoppmPath}`);
    console.log(`  pdfjs:    ${stats.pdfjsPath}`);
    console.log(`  diff:     ${stats.diffPath}`);
    console.log(`  mismatch: ${stats.mismatchPercent.toFixed(2)}%`);
  });
});
