import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  signPDFWithPDFBox,
  preparePdfWithAppearance,
  signPreparedPdfWithPDFBox,
} from '../pdfbox-signer';
import { getFixtureSigner } from '../../testing/fixture-signer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');

function loadTestPdf(relativePath: string): Uint8Array {
  const absolute = path.resolve(repoRoot, relativePath);
  return new Uint8Array(fs.readFileSync(absolute));
}

/**
 * Minimal valid 1x1 red PNG (67 bytes).
 * Generated from the PNG spec: IHDR(1x1, 8-bit RGBA) + IDAT + IEND.
 */
function createMinimalPng(): Uint8Array {
  // prettier-ignore
  return new Uint8Array([
    // PNG signature
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    // IHDR chunk: width=1, height=1, bit depth=8, color type=2 (RGB)
    0x00, 0x00, 0x00, 0x0D, // chunk length
    0x49, 0x48, 0x44, 0x52, // "IHDR"
    0x00, 0x00, 0x00, 0x01, // width=1
    0x00, 0x00, 0x00, 0x01, // height=1
    0x08,                   // bit depth=8
    0x02,                   // color type=2 (RGB)
    0x00, 0x00, 0x00,       // compression, filter, interlace
    0x72, 0x73, 0x70, 0x60, // CRC
    // IDAT chunk: zlib-compressed 1x1 RGB pixel (red)
    0x00, 0x00, 0x00, 0x0C, // chunk length
    0x49, 0x44, 0x41, 0x54, // "IDAT"
    0x08, 0xD7,             // zlib header
    0x63, 0xF8, 0xCF, 0xC0, 0x00, 0x00, // compressed data
    0x01, 0x01, 0x01, 0x00, // adler32
    0x18, 0xDD, 0x8D, 0xB4, // CRC
    // IEND chunk
    0x00, 0x00, 0x00, 0x00, // chunk length
    0x49, 0x45, 0x4E, 0x44, // "IEND"
    0xAE, 0x42, 0x60, 0x82, // CRC
  ]);
}

describe('Visual signature (PNG image)', () => {
  const signer = getFixtureSigner();
  let originalPdf: Uint8Array;
  let testPng: Uint8Array;

  beforeAll(() => {
    originalPdf = loadTestPdf('test-pdfs/working/wire-instructions.pdf');
    testPng = createMinimalPng();
  });

  it('embeds PNG image in appearance stream', async () => {
    const result = await signPDFWithPDFBox(originalPdf, signer, {
      signatureAppearance: {
        imageData: testPng,
        position: { page: 0, x: 50, y: 50, width: 200, height: 100 },
      },
    });

    expect(result.signedData).toBeInstanceOf(Uint8Array);
    expect(result.signedData.length).toBeGreaterThan(originalPdf.length);

    // Verify appearance stream contains image drawing command
    const text = new TextDecoder('latin1').decode(result.signedData);
    expect(text).toContain('/Img Do');
    expect(text).toContain('/Img');
  });

  it('sets non-zero widget Rect when image is provided', async () => {
    const result = await signPDFWithPDFBox(originalPdf, signer, {
      signatureAppearance: {
        imageData: testPng,
        position: { page: 0, x: 100, y: 200, width: 150, height: 75 },
      },
    });

    // The widget /Rect should contain the actual coordinates, not [0 0 0 0]
    const text = new TextDecoder('latin1').decode(result.signedData);
    // Look for Rect with non-zero values near the signature field
    // Rect should be [x, y, x+width, y+height] = [100, 200, 250, 275]
    expect(text).toContain('100');
    expect(text).toContain('200');
    expect(text).toContain('250');
    expect(text).toContain('275');
  });

  it('has valid ByteRange covering full document', async () => {
    const result = await signPDFWithPDFBox(originalPdf, signer, {
      signatureAppearance: {
        imageData: testPng,
        position: { page: 0, x: 50, y: 50, width: 200, height: 100 },
      },
    });

    const [a, b, c, d] = result.signatureInfo.byteRange;
    expect(a).toBe(0);
    expect(b).toBeGreaterThan(0);
    expect(c).toBeGreaterThan(b);
    expect(d).toBeGreaterThan(0);
    // ByteRange should cover the entire document
    expect(b + d + (c - b)).toBe(result.signedData.length);
  });

  it('prepare/sign two-step API preserves image metadata', async () => {
    const prepared = await preparePdfWithAppearance(originalPdf, signer, {
      signatureAppearance: {
        imageData: testPng,
        position: { page: 0, x: 50, y: 50, width: 200, height: 100 },
      },
    });

    // Image data should be carried through for Phase 2
    expect(prepared.imageData).toBeDefined();
    expect(prepared.imageData!.length).toBeGreaterThan(0);
    expect(prepared.signatureRect).toEqual([50, 50, 200, 100]);

    const result = await signPreparedPdfWithPDFBox(prepared, signer);
    expect(result.signedData).toBeInstanceOf(Uint8Array);

    const text = new TextDecoder('latin1').decode(result.signedData);
    expect(text).toContain('/Img Do');
  });

  it('without imageData, appearance stream has text (not image)', async () => {
    const result = await signPDFWithPDFBox(originalPdf, signer, {
      signatureAppearance: {
        position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
      },
    });

    // Should NOT contain image references
    const text = new TextDecoder('latin1').decode(result.signedData);
    const imgDoCount = (text.match(/\/Img Do/g) || []).length;
    expect(imgDoCount).toBe(0);
    // Should contain text operators from the text appearance
    expect(text).toContain('BT');
    expect(text).toContain('ET');
  });
});

describe('Hybrid signature appearance (PNG + branded info box)', () => {
  const signer = getFixtureSigner();
  let originalPdf: Uint8Array;
  let testPng: Uint8Array;

  beforeAll(() => {
    originalPdf = loadTestPdf('test-pdfs/working/wire-instructions.pdf');
    testPng = createMinimalPng();
  });

  it('hybrid mode (default) has both image and text operators', async () => {
    const result = await signPDFWithPDFBox(originalPdf, signer, {
      signatureAppearance: {
        imageData: testPng,
        position: { page: 0, x: 50, y: 50, width: 250, height: 80 },
      },
    });

    const text = new TextDecoder('latin1').decode(result.signedData);
    // Image XObject drawing
    expect(text).toContain('/Img Do');
    // Text operators for info box
    expect(text).toContain('BT');
    expect(text).toContain('ET');
    // Both font references (F1 = Helvetica, F2 = Helvetica-Bold)
    expect(text).toContain('/F1');
    expect(text).toContain('/F2');
    // Helvetica-Bold font dict
    expect(text).toContain('/Helvetica-Bold');
  });

  it('hybrid includes brand text "Dapple SafeSign" by default', async () => {
    const result = await signPDFWithPDFBox(originalPdf, signer, {
      signatureAppearance: {
        imageData: testPng,
        position: { page: 0, x: 50, y: 50, width: 250, height: 80 },
      },
    });

    const text = new TextDecoder('latin1').decode(result.signedData);
    // "Dapple SafeSign" encoded in WinAnsi hex
    const brandHex = '446170706C6520536166655369676E';
    expect(text).toContain(brandHex);
  });

  it('hybrid includes custom brand text when provided', async () => {
    const result = await signPDFWithPDFBox(originalPdf, signer, {
      signatureAppearance: {
        imageData: testPng,
        brandText: 'MyBrand',
        position: { page: 0, x: 50, y: 50, width: 250, height: 80 },
      },
    });

    const text = new TextDecoder('latin1').decode(result.signedData);
    // "MyBrand" in hex = 4D794272616E64
    expect(text).toContain('4D794272616E64');
  });

  it('image-only mode draws image with metadata footer', async () => {
    const result = await signPDFWithPDFBox(originalPdf, signer, {
      signatureAppearance: {
        imageData: testPng,
        appearanceMode: 'image-only',
        position: { page: 0, x: 50, y: 50, width: 200, height: 100 },
      },
    });

    const text = new TextDecoder('latin1').decode(result.signedData);
    expect(text).toContain('/Img Do');
    // Should have footer text with "Dapple SafeSign" hex
    expect(text).toContain('446170706C6520536166655369676E');
    // Should have a font resource for the footer
    expect(text).toContain('/Helvetica');
  });

  it('image-only with showFooter=false has no text', async () => {
    const result = await signPDFWithPDFBox(originalPdf, signer, {
      signatureAppearance: {
        imageData: testPng,
        appearanceMode: 'image-only',
        showFooter: false,
        position: { page: 0, x: 50, y: 50, width: 200, height: 100 },
      },
    });

    const text = new TextDecoder('latin1').decode(result.signedData);
    expect(text).toContain('/Img Do');
    // With footer disabled, no brand text in the incremental section
    const incrementalText = new TextDecoder('latin1').decode(
      result.signedData.slice(originalPdf.length)
    );
    expect(incrementalText).not.toContain('446170706C6520536166655369676E');
  });

  it('hybrid includes signer name and date', async () => {
    const result = await signPDFWithPDFBox(originalPdf, signer, {
      signatureAppearance: {
        imageData: testPng,
        position: { page: 0, x: 50, y: 50, width: 260, height: 80 },
      },
    });

    const text = new TextDecoder('latin1').decode(result.signedData);
    // "pdfbox-ts Fixture" contains "pdfbox" → hex 706466626F78
    expect(text).toContain('706466626F78');
    // Date should contain "UTC" → hex 555443
    expect(text).toContain('555443');
  });

  it('hybrid includes reason and location', async () => {
    const result = await signPDFWithPDFBox(originalPdf, signer, {
      reason: 'Approved',
      location: 'NYC',
      signatureAppearance: {
        imageData: testPng,
        position: { page: 0, x: 50, y: 50, width: 260, height: 80 },
      },
    });

    const text = new TextDecoder('latin1').decode(result.signedData);
    // "Reason: Approved" contains "Approved" → hex 417070726F766564
    expect(text).toContain('417070726F766564');
    // "Location: NYC" contains "NYC" → hex 4E5943
    expect(text).toContain('4E5943');
  });

  it('two-step API preserves hybrid metadata', async () => {
    const prepared = await preparePdfWithAppearance(originalPdf, signer, {
      signatureAppearance: {
        imageData: testPng,
        brandText: 'TestBrand',
        position: { page: 0, x: 50, y: 50, width: 250, height: 80 },
      },
    });

    expect(prepared.imageData).toBeDefined();
    expect(prepared.brandText).toBe('TestBrand');
    expect(prepared.appearanceMode).toBe('hybrid');
    expect(prepared.appearanceText).toBe('Digitally Signed');
    expect(prepared.appearanceSignerText).toContain('By:');

    const result = await signPreparedPdfWithPDFBox(prepared, signer);
    const text = new TextDecoder('latin1').decode(result.signedData);
    expect(text).toContain('/Img Do');
    expect(text).toContain('BT');
  });

  it('text-only mode shows branded info box (upgraded)', async () => {
    const result = await signPDFWithPDFBox(originalPdf, signer, {
      signatureAppearance: {
        position: { page: 0, x: 50, y: 50, width: 250, height: 80 },
      },
    });

    const text = new TextDecoder('latin1').decode(result.signedData);
    // Should have brand text and bold font
    expect(text).toContain('/F2');
    expect(text).toContain('/Helvetica-Bold');
    // Should NOT have image
    const imgDoCount = (text.match(/\/Img Do/g) || []).length;
    expect(imgDoCount).toBe(0);
    // Should have "Dapple SafeSign" hex
    expect(text).toContain('446170706C6520536166655369676E');
  });

  it('handles very long brand text without crashing', async () => {
    const result = await signPDFWithPDFBox(originalPdf, signer, {
      signatureAppearance: {
        imageData: testPng,
        brandText: 'A Very Long Brand Name That Should Be Truncated Gracefully',
        position: { page: 0, x: 50, y: 50, width: 200, height: 60 },
      },
    });

    expect(result.signedData).toBeInstanceOf(Uint8Array);
    expect(result.signedData.length).toBeGreaterThan(originalPdf.length);
  });
});
