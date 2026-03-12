/**
 * Roundtrip fidelity tests — verifies PDFDocument.load() + save() preserves
 * visual content for various PDF types.
 *
 * These tests catch regressions in the COS serializer (NativePDFWriter)
 * that could cause blank pages, lost content streams, or broken references.
 *
 * Requires: pdftoppm (poppler-utils) for rendering.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { PDFDocument } from '../index.js';

const OUT_DIR = '/tmp/roundtrip-fidelity-test';

const hasPdftoppm = (() => {
  try { execSync('which pdftoppm', { stdio: 'pipe' }); return true; } catch { return false; }
})();

function renderPage1(pdfPath: string, prefix: string): number {
  execSync(
    `pdftoppm -png -r 150 -f 1 -l 1 "${pdfPath}" "${OUT_DIR}/${prefix}"`,
    { timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }
  );
  // pdftoppm uses different padding depending on total page count:
  // single-page → "-1.png", multi-page → "-01.png"
  for (const suffix of ['-01.png', '-1.png']) {
    const png = `${OUT_DIR}/${prefix}${suffix}`;
    if (existsSync(png)) return statSync(png).size;
  }
  return 0;
}

describe.skipIf(!hasPdftoppm)('PDFDocument roundtrip fidelity', () => {
  // Threshold: a blank page is ~3-4KB, a simple rendered page is >10KB
  const MIN_RENDERED_SIZE = 10000;

  it('load+save preserves content for simple created PDF', async () => {
    mkdirSync(OUT_DIR, { recursive: true });

    // Create a PDF with some content
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const font = await doc.embedFont('Helvetica');
    page.drawText('Hello World - Roundtrip Test', {
      x: 50, y: 700, size: 24, font,
    });
    page.drawRectangle({ x: 50, y: 600, width: 200, height: 50, color: { red: 0.2, green: 0.4, blue: 0.8 } });
    const created = await doc.save();

    // Load and re-save
    const loaded = await PDFDocument.load(created, {
      updateMetadata: false,
      throwOnInvalidObject: false,
    });
    const resaved = await loaded.save();

    // Write both to disk
    const createdPath = `${OUT_DIR}/created.pdf`;
    const resavedPath = `${OUT_DIR}/resaved.pdf`;
    writeFileSync(createdPath, Buffer.from(created));
    writeFileSync(resavedPath, Buffer.from(resaved));

    // Render page 1 of both
    const createdSize = renderPage1(createdPath, 'created');
    const resavedSize = renderPage1(resavedPath, 'resaved');

    console.log(`Created page 1: ${createdSize} bytes`);
    console.log(`Resaved page 1: ${resavedSize} bytes`);

    expect(createdSize).toBeGreaterThan(MIN_RENDERED_SIZE);
    expect(resavedSize).toBeGreaterThan(MIN_RENDERED_SIZE);
  }, 30000);

  // This is the critical test — the USG Briefing is a complex PowerPoint export
  // that was producing blank pages before the NativePDFWriter fix
  const USG_PDF = '/Users/will/dev/USG Briefing/USG Briefing Mar 7 - UNCLAS.pdf';
  const hasUsgPdf = existsSync(USG_PDF);

  it.skipIf(!hasUsgPdf)('load+save preserves content for complex PowerPoint export (USG Briefing)', async () => {
    mkdirSync(OUT_DIR, { recursive: true });

    const pdfBytes = readFileSync(USG_PDF);
    const doc = await PDFDocument.load(pdfBytes, {
      updateMetadata: false,
      throwOnInvalidObject: false,
    });
    const saved = await doc.save({ useObjectStreams: false });

    const origPath = USG_PDF;
    const savedPath = `${OUT_DIR}/usg-roundtrip.pdf`;
    writeFileSync(savedPath, Buffer.from(saved));

    console.log(`Original: ${pdfBytes.length} bytes, ${doc.getPageCount()} pages`);
    console.log(`Saved:    ${saved.byteLength} bytes`);

    const origSize = renderPage1(origPath, 'usg-orig');
    const savedSize = renderPage1(savedPath, 'usg-saved');

    console.log(`Original page 1 PNG: ${origSize} bytes`);
    console.log(`Saved page 1 PNG:    ${savedSize} bytes`);

    // Page 1 must render as a real page, not blank
    expect(origSize).toBeGreaterThan(MIN_RENDERED_SIZE);
    expect(savedSize).toBeGreaterThan(MIN_RENDERED_SIZE);

    // Saved should be within 10x of original (not blank ~3KB vs ~100KB)
    expect(savedSize / origSize).toBeGreaterThan(0.1);
  }, 60000);
});
