import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { PDFDocument } from '../PDFDocument.js';
import { COSArray, COSName, COSObjectReference, COSStream } from '../../pdfbox/cos/COSTypes.js';

const USG_PDF = '/Users/will/dev/USG Briefing/USG Briefing Mar 7 - UNCLAS.pdf';

describe('PDFDocument roundtrip save', () => {
  const hasFile = existsSync(USG_PDF);

  it.skipIf(!hasFile)(
    'load + save produces valid rendering (not blank pages)',
    async () => {
      const bytes = readFileSync(USG_PDF);
      const doc = await PDFDocument.load(bytes, { updateMetadata: false });
      const saved = await doc.save();

      // Saved size should be comparable to original
      expect(saved.length).toBeGreaterThan(bytes.length * 0.8);
      expect(saved.length).toBeLessThan(bytes.length * 1.2);

      // Render page 1 via pdftoppm and check it's not blank
      const tmpOrig = '/tmp/roundtrip-test-orig';
      const tmpSaved = '/tmp/roundtrip-test-saved';

      // Write saved PDF to temp
      const { writeFileSync, unlinkSync } = await import('fs');
      const savedPath = '/tmp/roundtrip-test-saved.pdf';
      writeFileSync(savedPath, saved);

      try {
        // Render original page 1
        execSync(
          `pdftoppm -png -f 1 -l 1 -r 72 "${USG_PDF}" ${tmpOrig}`,
          { timeout: 10000 },
        );
        // Render saved page 1
        execSync(
          `pdftoppm -png -f 1 -l 1 -r 72 "${savedPath}" ${tmpSaved}`,
          { timeout: 10000 },
        );

        const origPng = readFileSync(`${tmpOrig}-01.png`);
        const savedPng = readFileSync(`${tmpSaved}-01.png`);

        // Saved page should not be blank (> 5KB)
        expect(savedPng.length).toBeGreaterThan(5000);
        // Should match original size closely (same rendering)
        expect(savedPng.length).toBe(origPng.length);
      } finally {
        // Cleanup
        for (const f of [
          savedPath,
          `${tmpOrig}-01.png`,
          `${tmpSaved}-01.png`,
        ]) {
          try { unlinkSync(f); } catch {}
        }
      }
    },
  );

  it.skipIf(!hasFile)(
    'non-stream objects (arrays) are preserved through load+save',
    async () => {
      const bytes = readFileSync(USG_PDF);
      const doc = await PDFDocument.load(bytes, { updateMetadata: false });
      const ctx = doc._nativeCtx;

      // Object 6 in the USG Briefing is [/ICCBased 19 0 R] — an array, not a stream
      const obj6 = ctx.lookup(6);
      expect(obj6).toBeInstanceOf(COSArray);
      const arr = obj6 as COSArray;
      expect(arr.size()).toBe(2);
      expect(arr.get(0)).toBeInstanceOf(COSName);
      expect((arr.get(0) as COSName).getName()).toBe('ICCBased');
      expect(arr.get(1)).toBeInstanceOf(COSObjectReference);
    },
  );

  it('extractStreamObject does not scan past endobj for non-stream objects', async () => {
    // Construct a minimal PDF where object 3 is an array followed by object 4 as a stream.
    // The parser should not confuse them.
    const pdfStr = [
      '%PDF-1.4',
      '1 0 obj',
      '<< /Type /Catalog /Pages 2 0 R >>',
      'endobj',
      '2 0 obj',
      '<< /Type /Pages /Kids [] /Count 0 >>',
      'endobj',
      '3 0 obj',
      '[ /ICCBased 4 0 R ]',
      'endobj',
      '4 0 obj',
      '<< /Length 5 >>',
      'stream',
      'hello',
      'endstream',
      'endobj',
      'xref',
      '0 5',
      '0000000000 65535 f \r',
      '0000000009 00000 n \r',
      '0000000058 00000 n \r',
      '0000000111 00000 n \r',
      '0000000146 00000 n \r',
      'trailer',
      '<< /Size 5 /Root 1 0 R >>',
      'startxref',
      '211',
      '%%EOF',
    ].join('\n');

    const bytes = new TextEncoder().encode(pdfStr);
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const ctx = doc._nativeCtx;

    // Object 3 should be an array, NOT a stream
    const obj3 = ctx.lookup(3);
    expect(obj3).toBeInstanceOf(COSArray);

    // Object 4 should be a stream
    const obj4 = ctx.lookup(4);
    expect(obj4).toBeInstanceOf(COSStream);
  });
});
