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

/** Count /Sig field references in the AcroForm /Fields array */
function countSignatureFields(pdfBytes: Uint8Array): number {
  const text = new TextDecoder('latin1').decode(pdfBytes);
  // Count /FT /Sig occurrences (each signature field widget has this)
  const matches = text.match(/\/FT\s*\/Sig/g);
  return matches ? matches.length : 0;
}

/** Extract all /T (fieldName) string values from signature field widgets */
function extractFieldNames(pdfBytes: Uint8Array): string[] {
  const text = new TextDecoder('latin1').decode(pdfBytes);
  const names: string[] = [];
  // Match /T followed by a parenthesized string like /T (Signature1)
  const regex = /\/FT\s*\/Sig[\s\S]*?\/T\s*\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    names.push(match[1]);
  }
  return names;
}

describe('Multi-signature (counter-signing)', () => {
  const signer = getFixtureSigner();
  let originalPdf: Uint8Array;

  beforeAll(() => {
    originalPdf = loadTestPdf('test-pdfs/working/wire-instructions.pdf');
  });

  it('double-sign round trip produces two signature fields', async () => {
    // First signature
    const firstResult = await signPDFWithPDFBox(originalPdf, signer, {
      signatureAppearance: {
        position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
      },
    });
    expect(firstResult.signedData).toBeInstanceOf(Uint8Array);
    expect(firstResult.signedData.length).toBeGreaterThan(originalPdf.length);

    // Second signature on the already-signed PDF
    const secondResult = await signPDFWithPDFBox(firstResult.signedData, signer, {
      signatureAppearance: {
        position: { page: 0, x: 50, y: 110, width: 200, height: 50 },
      },
    });
    expect(secondResult.signedData).toBeInstanceOf(Uint8Array);
    expect(secondResult.signedData.length).toBeGreaterThan(firstResult.signedData.length);

    // Both signatures should be present
    const sigCount = countSignatureFields(secondResult.signedData);
    expect(sigCount).toBeGreaterThanOrEqual(2);
  });

  it('second signature skips DocMDP when first already has it', async () => {
    // First signature — should have DocMDP
    const firstResult = await signPDFWithPDFBox(originalPdf, signer);

    const firstText = new TextDecoder('latin1').decode(firstResult.signedData);
    // First signature should contain DocMDP and SigRef structures
    expect(firstText).toContain('/DocMDP');
    expect(firstText).toContain('/SigRef');

    // Second signature — should NOT add another DocMDP
    const secondResult = await signPDFWithPDFBox(firstResult.signedData, signer);

    const secondText = new TextDecoder('latin1').decode(secondResult.signedData);
    // Count /TransformMethod /DocMDP occurrences in the INCREMENTAL section only
    // (everything after the first signature's content)
    const incrementalSection = secondText.slice(firstText.length);
    // The incremental update from the second signature should NOT add new SigRef/DocMDP
    const sigRefInIncremental = (incrementalSection.match(/\/SigRef/g) || []).length;
    expect(sigRefInIncremental).toBe(0);
  });

  it('assigns unique field names (Signature1, Signature2)', async () => {
    const firstResult = await signPDFWithPDFBox(originalPdf, signer);
    const secondResult = await signPDFWithPDFBox(firstResult.signedData, signer);

    const names = extractFieldNames(secondResult.signedData);
    // Should have at least two distinct names
    const uniqueNames = [...new Set(names)];
    expect(uniqueNames.length).toBeGreaterThanOrEqual(2);
    expect(uniqueNames).toContain('Signature1');
    expect(uniqueNames).toContain('Signature2');
  });

  it('both signatures have valid ByteRange', async () => {
    const firstResult = await signPDFWithPDFBox(originalPdf, signer);
    const secondResult = await signPDFWithPDFBox(firstResult.signedData, signer);

    // First signature ByteRange
    const [a1, b1, c1, d1] = firstResult.signatureInfo.byteRange;
    expect(a1).toBe(0);
    expect(b1).toBeGreaterThan(0);
    expect(c1).toBeGreaterThan(b1);
    expect(d1).toBeGreaterThan(0);
    expect(b1 + d1 + (c1 - b1)).toBe(firstResult.signedData.length);

    // Second signature ByteRange
    const [a2, b2, c2, d2] = secondResult.signatureInfo.byteRange;
    expect(a2).toBe(0);
    expect(b2).toBeGreaterThan(0);
    expect(c2).toBeGreaterThan(b2);
    expect(d2).toBeGreaterThan(0);
    expect(b2 + d2 + (c2 - b2)).toBe(secondResult.signedData.length);
  });

  it('works with prepare/sign two-step API', async () => {
    // First sign
    const prepared1 = await preparePdfWithAppearance(originalPdf, signer);
    const firstResult = await signPreparedPdfWithPDFBox(prepared1, signer);

    // Second sign using the already-signed bytes
    const prepared2 = await preparePdfWithAppearance(firstResult.signedData, signer);
    // The prepare step processes the signed PDF; verify it produces valid output
    expect(prepared2.pdfBytes.length).toBeGreaterThan(0);
    expect(prepared2.catalogObjectNumber).toBeGreaterThan(0);

    const secondResult = await signPreparedPdfWithPDFBox(prepared2, signer);
    expect(secondResult.signedData.length).toBeGreaterThan(firstResult.signedData.length);

    const sigCount = countSignatureFields(secondResult.signedData);
    expect(sigCount).toBeGreaterThanOrEqual(2);
  });
});
