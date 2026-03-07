import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

import { PDFRenderer, renderPage } from '../index.js';
import { PDFDocument } from '../../document/PDFDocument.js';
import { signPDFWithPDFBox } from '../../signer/pdfbox-signer.js';
import { getFixtureSigner } from '../../testing/fixture-signer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');

function loadTestPdf(relativePath: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.resolve(repoRoot, relativePath)));
}

/** Minimal valid 1x1 red PNG (67 bytes). */
function createMinimalPng(): Uint8Array {
  // prettier-ignore
  return new Uint8Array([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x72, 0x73, 0x70,
    0x60, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
    0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
    0x00, 0x01, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D,
    0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
    0x44, 0xAE, 0x42, 0x60, 0x82,
  ]);
}

describe('PDFRenderer', () => {
  let wirePdf: Uint8Array;

  beforeAll(() => {
    wirePdf = loadTestPdf('test-pdfs/working/wire-instructions.pdf');
  });

  // -------------------------------------------------------------------------
  // Core rendering
  // -------------------------------------------------------------------------

  it('renders a page from raw bytes', async () => {
    const renderer = await PDFRenderer.create(wirePdf);
    expect(renderer.pageCount).toBeGreaterThan(0);

    const result = await renderer.renderPage(0);
    expect(result.png).toBeInstanceOf(Uint8Array);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.pageIndex).toBe(0);

    // Verify it's a valid PNG (starts with PNG magic bytes)
    expect(result.png[0]).toBe(0x89);
    expect(result.png[1]).toBe(0x50); // P
    expect(result.png[2]).toBe(0x4e); // N
    expect(result.png[3]).toBe(0x47); // G

    await renderer.destroy();
  });

  it('respects scale option', async () => {
    const renderer = await PDFRenderer.create(wirePdf);

    const small = await renderer.renderPage(0, { scale: 0.5 });
    const large = await renderer.renderPage(0, { scale: 2.0 });

    // Larger scale = more pixels
    expect(large.width).toBeGreaterThan(small.width);
    expect(large.height).toBeGreaterThan(small.height);

    await renderer.destroy();
  });

  it('throws on out-of-range page index', async () => {
    const renderer = await PDFRenderer.create(wirePdf);
    await expect(renderer.renderPage(-1)).rejects.toThrow(/out of range/);
    await expect(renderer.renderPage(999)).rejects.toThrow(/out of range/);
    await renderer.destroy();
  });

  it('throws after destroy', async () => {
    const renderer = await PDFRenderer.create(wirePdf);
    await renderer.destroy();
    expect(() => renderer.pageCount).toThrow(/destroyed/);
    await expect(renderer.renderPage(0)).rejects.toThrow(/destroyed/);
  });

  it('renderAllPages renders every page', async () => {
    const renderer = await PDFRenderer.create(wirePdf);
    const results = await renderer.renderAllPages({ scale: 0.5 });
    expect(results).toHaveLength(renderer.pageCount);
    for (let i = 0; i < results.length; i++) {
      expect(results[i].pageIndex).toBe(i);
      expect(results[i].png[0]).toBe(0x89); // PNG magic
    }
    await renderer.destroy();
  });

  // -------------------------------------------------------------------------
  // PDFDocument integration
  // -------------------------------------------------------------------------

  it('renders from a PDFDocument (fromDocument)', async () => {
    const doc = await PDFDocument.load(wirePdf);
    const renderer = await PDFRenderer.fromDocument(doc);

    const result = await renderer.renderPage(0);
    expect(result.png).toBeInstanceOf(Uint8Array);
    expect(result.width).toBeGreaterThan(0);

    await renderer.destroy();
  });

  it('PDFDocument.renderPage() convenience method works', async () => {
    const doc = await PDFDocument.load(wirePdf);
    const result = await doc.renderPage(0, { scale: 1.0 });

    expect(result.png).toBeInstanceOf(Uint8Array);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.pageIndex).toBe(0);
  });

  it('renders a modified document', async () => {
    const doc = await PDFDocument.load(wirePdf);
    const page = doc.getPage(0);
    const font = await doc.embedStandardFont('Helvetica');

    // Draw something on the page
    page.drawText('RENDERED BY PDFBOX-TS', {
      x: 50,
      y: 50,
      size: 24,
      font,
    });

    const result = await doc.renderPage(0, { scale: 1.0 });
    expect(result.png).toBeInstanceOf(Uint8Array);
    expect(result.width).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Convenience function
  // -------------------------------------------------------------------------

  it('renderPage convenience works with bytes', async () => {
    const result = await renderPage(wirePdf, 0, { scale: 1.0 });
    expect(result.png).toBeInstanceOf(Uint8Array);
    expect(result.width).toBeGreaterThan(0);
  });

  it('renderPage convenience works with PDFDocument', async () => {
    const doc = await PDFDocument.load(wirePdf);
    const result = await renderPage(doc, 0, { scale: 1.0 });
    expect(result.png).toBeInstanceOf(Uint8Array);
    expect(result.width).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Signed PDF rendering
  // -------------------------------------------------------------------------

  it('renders a signed PDF', async () => {
    const signer = getFixtureSigner();
    const signed = await signPDFWithPDFBox(wirePdf, signer);

    const result = await renderPage(signed.signedData, 0, { scale: 1.0 });
    expect(result.png).toBeInstanceOf(Uint8Array);
    expect(result.width).toBeGreaterThan(0);
  });

  it('renders a signed PDF with visual signature', async () => {
    const signer = getFixtureSigner();
    const signed = await signPDFWithPDFBox(wirePdf, signer, {
      signatureAppearance: {
        position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
      },
    });

    const result = await renderPage(signed.signedData, 0, { scale: 1.5 });
    expect(result.png).toBeInstanceOf(Uint8Array);

    // Verify the PNG is decodable
    const img = PNG.sync.read(Buffer.from(result.png));
    expect(img.width).toBe(result.width);
    expect(img.height).toBe(result.height);
  });

  it('renders a signed PDF with image signature', async () => {
    const signer = getFixtureSigner();
    const testPng = createMinimalPng();

    const signed = await signPDFWithPDFBox(wirePdf, signer, {
      signatureAppearance: {
        imageData: testPng,
        position: { page: 0, x: 50, y: 50, width: 200, height: 100 },
      },
    });

    const result = await renderPage(signed.signedData, 0, { scale: 1.5 });
    expect(result.png).toBeInstanceOf(Uint8Array);

    const img = PNG.sync.read(Buffer.from(result.png));
    expect(img.width).toBe(result.width);
    expect(img.height).toBe(result.height);
  });

  // -------------------------------------------------------------------------
  // Counter-signed rendering
  // -------------------------------------------------------------------------

  it('renders a counter-signed PDF (both signatures visible)', async () => {
    const signer = getFixtureSigner();

    const first = await signPDFWithPDFBox(wirePdf, signer, {
      signatureAppearance: {
        position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
      },
    });

    const second = await signPDFWithPDFBox(first.signedData, signer, {
      signatureAppearance: {
        position: { page: 0, x: 50, y: 110, width: 200, height: 50 },
      },
    });

    const result = await renderPage(second.signedData, 0, { scale: 1.5 });
    expect(result.png).toBeInstanceOf(Uint8Array);
    expect(result.width).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Created document rendering
  // -------------------------------------------------------------------------

  it('renders a document created from scratch', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedStandardFont('Helvetica');
    const page = doc.addPage([612, 792]);
    page.drawText('Hello from pdfbox-ts!', { x: 50, y: 700, size: 30, font });
    page.drawRectangle({ x: 100, y: 400, width: 200, height: 100, color: { red: 0.8, green: 0.2, blue: 0.2 } });

    const result = await doc.renderPage(0, { scale: 1.0 });
    expect(result.png).toBeInstanceOf(Uint8Array);
    expect(result.width).toBeGreaterThan(0);

    // Verify non-trivial image (not all white)
    const img = PNG.sync.read(Buffer.from(result.png));
    let nonWhitePixels = 0;
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i] !== 255 || img.data[i + 1] !== 255 || img.data[i + 2] !== 255) {
        nonWhitePixels++;
      }
    }
    expect(nonWhitePixels).toBeGreaterThan(100);
  });
});
