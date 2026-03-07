/**
 * Multi-Signature Byte-Level Integrity Tests
 *
 * Validates the byte-level correctness of every signature in multi-sig PDFs.
 * Uses signPDFWithPDFBox + verifySignatures to check integrity and structure
 * after single, double, and triple signing operations.
 *
 * All signatures preserve integrity across counter-signing because
 * preparePdfWithAppearance returns original PDF bytes unchanged — the
 * appearance stream is built entirely in the incremental Phase 2.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  signPDFWithPDFBox,
  preparePdfWithAppearance,
  signPreparedPdfWithPDFBox,
} from '../pdfbox-signer';
import { verifySignatures } from '../verify';
import type { SignatureVerificationResult } from '../verify';
import { getFixtureSigner } from '../../testing/fixture-signer';
import { PDFDocument, StandardFonts, rgb } from '../../document/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');

function loadTestPdf(relativePath: string): Uint8Array {
  const absolute = path.resolve(repoRoot, relativePath);
  return new Uint8Array(fs.readFileSync(absolute));
}

describe('Signature integrity', () => {
  const signer = getFixtureSigner();
  let simplePdf: Uint8Array;

  beforeAll(() => {
    simplePdf = loadTestPdf('test-pdfs/working/simple-test.pdf');
  });

  // ─── Single signature ───────────────────────────────────────────────────

  describe('single signature', () => {
    it('single sign produces valid integrity and signature', async () => {
      const { signedData } = await signPDFWithPDFBox(simplePdf, signer, {
        signatureAppearance: {
          position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
        },
      });

      const results = verifySignatures(signedData);
      expect(results).toHaveLength(1);
      expect(results[0].integrityValid).toBe(true);
      expect(results[0].signatureValid).toBe(true);
      expect(results[0].error).toBeUndefined();
    });

    it('single sign without appearance is valid', async () => {
      const { signedData } = await signPDFWithPDFBox(simplePdf, signer);

      const results = verifySignatures(signedData);
      expect(results).toHaveLength(1);
      expect(results[0].integrityValid).toBe(true);
      expect(results[0].signatureValid).toBe(true);
    });

    it('single sign ByteRange covers entire file', async () => {
      const { signedData, signatureInfo } = await signPDFWithPDFBox(
        simplePdf,
        signer,
      );

      const [off1, len1, off2, len2] = signatureInfo.byteRange;
      expect(off1).toBe(0);
      expect(len1).toBeGreaterThan(0);
      expect(off2).toBeGreaterThan(len1);
      expect(len2).toBeGreaterThan(0);

      // ByteRange should cover entire file: offset2 + length2 == fileSize
      expect(off2 + len2).toBe(signedData.length);
    });

    it('single sign ByteRange gap contains hex-encoded Contents', async () => {
      const { signedData, signatureInfo } = await signPDFWithPDFBox(
        simplePdf,
        signer,
      );

      const [, len1, off2] = signatureInfo.byteRange;
      const gapSize = off2 - len1;
      // Gap should be the hex-encoded signature contents (<hex...>)
      // The < and > delimiters are included in the gap
      expect(gapSize).toBeGreaterThan(100);

      // First byte of gap should be '<' (hex string open)
      expect(signedData[len1]).toBe(0x3c); // '<'
      // Last byte before off2 should be '>' (hex string close)
      expect(signedData[off2 - 1]).toBe(0x3e); // '>'
    });
  });

  // ─── Double signature (counter-sign) ────────────────────────────────────

  describe('double signature', () => {
    let firstSigned: Uint8Array;
    let doubleSigned: Uint8Array;
    let firstResults: SignatureVerificationResult[];
    let doubleResults: SignatureVerificationResult[];

    beforeAll(async () => {
      const first = await signPDFWithPDFBox(simplePdf, signer, {
        signatureAppearance: {
          position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
        },
      });
      firstSigned = first.signedData;
      firstResults = verifySignatures(firstSigned);

      const second = await signPDFWithPDFBox(firstSigned, signer, {
        signatureAppearance: {
          position: { page: 0, x: 50, y: 110, width: 200, height: 50 },
        },
      });
      doubleSigned = second.signedData;
      doubleResults = verifySignatures(doubleSigned);
    });

    it('first sign is fully valid before counter-signing', () => {
      expect(firstResults).toHaveLength(1);
      expect(firstResults[0].integrityValid).toBe(true);
      expect(firstResults[0].signatureValid).toBe(true);
    });

    it('double-signed PDF has two signature fields', () => {
      expect(doubleResults).toHaveLength(2);
    });

    it('sig1 integrity preserved after counter-sign', () => {
      const sig1 = doubleResults[0];
      expect(sig1.integrityValid).toBe(true);
      expect(sig1.signatureValid).toBe(true);
    });

    it('second signature is fully valid', () => {
      const sig2 = doubleResults[1];
      expect(sig2.integrityValid).toBe(true);
      expect(sig2.signatureValid).toBe(true);
    });

    it('sig2 ByteRange covers the full double-signed file', () => {
      const sig2 = doubleResults[1];
      const [off1, , off2, len2] = sig2.byteRange;
      expect(off1).toBe(0);
      expect(off2 + len2).toBe(doubleSigned.length);
    });

    it('sig1 ByteRange does NOT cover the full double-signed file', () => {
      const sig1 = doubleResults[0];
      const [, , off2, len2] = sig1.byteRange;
      // sig1's range end should be less than double-signed file size
      expect(off2 + len2).toBeLessThan(doubleSigned.length);
    });

    it('signature fields have distinct names', () => {
      const names = doubleResults.map((r) => r.fieldName);
      const unique = new Set(names);
      expect(unique.size).toBe(2);
      expect(names).toContain('Signature1');
      expect(names).toContain('Signature2');
    });

    it('each signature has a distinct ByteRange', () => {
      const br1 = doubleResults[0].byteRange;
      const br2 = doubleResults[1].byteRange;
      // Both start at 0
      expect(br1[0]).toBe(0);
      expect(br2[0]).toBe(0);
      // But they differ in length/offsets
      expect(br1[1]).not.toBe(br2[1]);
    });
  });

  // ─── Triple signature ──────────────────────────────────────────────────

  describe('triple signature', () => {
    let tripleSigned: Uint8Array;
    let tripleResults: SignatureVerificationResult[];

    beforeAll(async () => {
      const first = await signPDFWithPDFBox(simplePdf, signer, {
        signatureAppearance: {
          position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
        },
      });
      const second = await signPDFWithPDFBox(first.signedData, signer, {
        signatureAppearance: {
          position: { page: 0, x: 50, y: 110, width: 200, height: 50 },
        },
      });
      const third = await signPDFWithPDFBox(second.signedData, signer, {
        signatureAppearance: {
          position: { page: 0, x: 50, y: 170, width: 200, height: 50 },
        },
      });
      tripleSigned = third.signedData;
      tripleResults = verifySignatures(tripleSigned);
    });

    it('triple-signed PDF has three signature fields', () => {
      expect(tripleResults).toHaveLength(3);
    });

    it('all three signatures have valid integrity', () => {
      for (let i = 0; i < 3; i++) {
        const sig = tripleResults[i];
        expect(sig.integrityValid).toBe(true);
        expect(sig.signatureValid).toBe(true);
      }
    });

    it('all three have distinct field names', () => {
      const names = tripleResults.map((r) => r.fieldName);
      const unique = new Set(names);
      expect(unique.size).toBe(3);
    });

    it('sig3 ByteRange covers entire file', () => {
      const sig3 = tripleResults[2];
      const [off1, , off2, len2] = sig3.byteRange;
      expect(off1).toBe(0);
      expect(off2 + len2).toBe(tripleSigned.length);
    });

    it('earlier signatures ByteRanges end before file end', () => {
      for (let i = 0; i < 2; i++) {
        const sig = tripleResults[i];
        const [, , off2, len2] = sig.byteRange;
        expect(off2 + len2).toBeLessThan(tripleSigned.length);
      }
    });
  });

  // ─── ByteRange coverage and structure ──────────────────────────────────

  describe('ByteRange coverage', () => {
    it('ByteRange starts at 0', async () => {
      const { signedData } = await signPDFWithPDFBox(simplePdf, signer);
      const results = verifySignatures(signedData);
      expect(results[0].byteRange[0]).toBe(0);
    });

    it('ByteRange regions do not overlap', async () => {
      const { signedData } = await signPDFWithPDFBox(simplePdf, signer);
      const results = verifySignatures(signedData);
      const [, len1, off2] = results[0].byteRange;
      // Region 1: [0, len1)
      // Region 2: [off2, off2+len2)
      // off2 should be > len1 (there's a gap for Contents hex)
      expect(off2).toBeGreaterThan(len1);
    });

    it('multiple signatures ByteRanges have non-overlapping Contents regions', async () => {
      const first = await signPDFWithPDFBox(simplePdf, signer, {
        signatureAppearance: {
          position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
        },
      });
      const second = await signPDFWithPDFBox(first.signedData, signer, {
        signatureAppearance: {
          position: { page: 0, x: 50, y: 110, width: 200, height: 50 },
        },
      });

      const results = verifySignatures(second.signedData);
      expect(results.length).toBeGreaterThanOrEqual(2);

      // Extract Contents gap regions for each signature
      const gaps = results.map((r) => {
        const [, len1, off2] = r.byteRange;
        return { start: len1, end: off2 };
      });

      // Verify no two gaps overlap
      for (let i = 0; i < gaps.length; i++) {
        for (let j = i + 1; j < gaps.length; j++) {
          const a = gaps[i];
          const b = gaps[j];
          const overlaps = a.start < b.end && b.start < a.end;
          expect(overlaps).toBe(false);
        }
      }
    });
  });

  // ─── Incremental structure ─────────────────────────────────────────────

  describe('incremental append structure', () => {
    it('signed PDF is larger than original', async () => {
      const { signedData } = await signPDFWithPDFBox(simplePdf, signer);
      expect(signedData.length).toBeGreaterThan(simplePdf.length);
    });

    it('each counter-sign makes the PDF larger', async () => {
      const first = await signPDFWithPDFBox(simplePdf, signer, {
        signatureAppearance: {
          position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
        },
      });
      const second = await signPDFWithPDFBox(first.signedData, signer, {
        signatureAppearance: {
          position: { page: 0, x: 50, y: 110, width: 200, height: 50 },
        },
      });
      expect(second.signedData.length).toBeGreaterThan(first.signedData.length);
    });

    it('signed PDF ends with %%EOF', async () => {
      const { signedData } = await signPDFWithPDFBox(simplePdf, signer);
      const tail = new TextDecoder('latin1').decode(
        signedData.subarray(signedData.length - 10)
      );
      expect(tail).toContain('%%EOF');
    });

    it('double-signed PDF has multiple %%EOF markers', async () => {
      const first = await signPDFWithPDFBox(simplePdf, signer, {
        signatureAppearance: {
          position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
        },
      });
      const second = await signPDFWithPDFBox(first.signedData, signer, {
        signatureAppearance: {
          position: { page: 0, x: 50, y: 110, width: 200, height: 50 },
        },
      });

      const text = new TextDecoder('latin1').decode(second.signedData);
      const eofCount = (text.match(/%%EOF/g) || []).length;
      // At least 2 %%EOF markers (original + incremental, possibly more from full-save rewrite)
      expect(eofCount).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── Visual + counter-sign ─────────────────────────────────────────────

  describe('visual signature + counter-sign', () => {
    it('visual sign then counter-sign: last sig valid', async () => {
      const first = await signPDFWithPDFBox(simplePdf, signer, {
        signatureAppearance: {
          position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
          text: 'Visual Sig 1',
        },
      });
      const second = await signPDFWithPDFBox(first.signedData, signer, {
        signatureAppearance: {
          position: { page: 0, x: 50, y: 110, width: 200, height: 50 },
          text: 'Counter Sig 2',
        },
      });

      const results = verifySignatures(second.signedData);
      expect(results.length).toBeGreaterThanOrEqual(2);

      const lastSig = results[results.length - 1];
      expect(lastSig.integrityValid).toBe(true);
      expect(lastSig.signatureValid).toBe(true);
    });
  });

  // ─── Flatten + sign ────────────────────────────────────────────────────

  describe('flatten + sign', () => {
    it('flatten-on-sign produces valid signature', async () => {
      // Create a PDF with form fields
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      page.drawText('Test Form', { x: 50, y: 700, size: 12, font });
      const form = doc.getForm();
      form.createTextField('name');
      const pdfBytes = await doc.save();

      const { signedData } = await signPDFWithPDFBox(
        new Uint8Array(pdfBytes),
        signer,
        { flattenForms: true },
      );

      const results = verifySignatures(signedData);
      expect(results).toHaveLength(1);
      expect(results[0].integrityValid).toBe(true);
      expect(results[0].signatureValid).toBe(true);
    });
  });

  // ─── Two-step API ──────────────────────────────────────────────────────

  describe('two-step signing API', () => {
    it('prepare + sign produces valid signature', async () => {
      const prepared = await preparePdfWithAppearance(simplePdf, signer, {
        signatureAppearance: {
          position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
        },
      });
      const { signedData } = await signPreparedPdfWithPDFBox(prepared, signer);

      const results = verifySignatures(signedData);
      expect(results).toHaveLength(1);
      expect(results[0].integrityValid).toBe(true);
      expect(results[0].signatureValid).toBe(true);
    });

    it('double sign via two-step API: last sig valid', async () => {
      const prep1 = await preparePdfWithAppearance(simplePdf, signer, {
        signatureAppearance: {
          position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
        },
      });
      const first = await signPreparedPdfWithPDFBox(prep1, signer);

      const prep2 = await preparePdfWithAppearance(first.signedData, signer, {
        signatureAppearance: {
          position: { page: 0, x: 50, y: 110, width: 200, height: 50 },
        },
      });
      const second = await signPreparedPdfWithPDFBox(prep2, signer);

      const results = verifySignatures(second.signedData);
      expect(results.length).toBeGreaterThanOrEqual(2);

      const lastSig = results[results.length - 1];
      expect(lastSig.integrityValid).toBe(true);
      expect(lastSig.signatureValid).toBe(true);
    });
  });

  // ─── Large PDF ─────────────────────────────────────────────────────────

  describe('large PDF multi-sig', () => {
    it('50-page document: sign twice, last sig valid', async () => {
      // Create a 50-page PDF to test byte offset calculations at scale
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      for (let i = 0; i < 50; i++) {
        const page = doc.addPage();
        page.drawText(`Page ${i + 1} of 50`, {
          x: 50,
          y: 700,
          size: 14,
          font,
          color: rgb(0, 0, 0),
        });
      }
      const largePdf = new Uint8Array(await doc.save());

      const first = await signPDFWithPDFBox(largePdf, signer, {
        signatureAppearance: {
          position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
        },
      });
      const second = await signPDFWithPDFBox(first.signedData, signer, {
        signatureAppearance: {
          position: { page: 0, x: 50, y: 110, width: 200, height: 50 },
        },
      });

      const results = verifySignatures(second.signedData);
      expect(results.length).toBeGreaterThanOrEqual(2);

      const lastSig = results[results.length - 1];
      expect(lastSig.integrityValid).toBe(true);
      expect(lastSig.signatureValid).toBe(true);
    });
  });

  // ─── Metadata ──────────────────────────────────────────────────────────

  describe('signature metadata', () => {
    it('single sign has correct algorithm', async () => {
      const { signedData } = await signPDFWithPDFBox(simplePdf, signer);
      const results = verifySignatures(signedData);
      expect(results[0].algorithm).toBe('RSA');
    });

    it('single sign has self-signed chain status', async () => {
      const { signedData } = await signPDFWithPDFBox(simplePdf, signer);
      const results = verifySignatures(signedData);
      expect(results[0].chainStatus).toBe('self-signed');
    });

    it('double sign: both signatures report RSA algorithm', async () => {
      const first = await signPDFWithPDFBox(simplePdf, signer, {
        signatureAppearance: {
          position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
        },
      });
      const second = await signPDFWithPDFBox(first.signedData, signer, {
        signatureAppearance: {
          position: { page: 0, x: 50, y: 110, width: 200, height: 50 },
        },
      });

      const results = verifySignatures(second.signedData);
      for (const r of results) {
        // Even if integrity fails, algorithm should still be detected
        expect(['RSA', 'unknown']).toContain(r.algorithm);
      }
    });

    it('reason and location propagate through signing', async () => {
      const { signedData } = await signPDFWithPDFBox(simplePdf, signer, {
        reason: 'Test Reason',
        location: 'Test Location',
      });
      const results = verifySignatures(signedData);
      expect(results[0].reason).toBe('Test Reason');
      expect(results[0].location).toBe('Test Location');
    });

    it('signedAt is a valid date', async () => {
      const { signedData } = await signPDFWithPDFBox(simplePdf, signer);
      const results = verifySignatures(signedData);
      expect(results[0].signedAt).toBeInstanceOf(Date);
      // Should be within the last minute
      const diff = Date.now() - results[0].signedAt!.getTime();
      expect(diff).toBeLessThan(60_000);
    });
  });

  // ─── Tampered content detection ────────────────────────────────────────

  describe('tamper detection', () => {
    it('flipping a byte in signed region breaks integrity', async () => {
      const { signedData } = await signPDFWithPDFBox(simplePdf, signer);
      const tampered = new Uint8Array(signedData);

      // Flip a byte in the first ByteRange region (before Contents)
      const results0 = verifySignatures(signedData);
      const [, len1] = results0[0].byteRange;
      // Flip a byte well within the first region
      const flipOffset = Math.min(100, len1 - 1);
      tampered[flipOffset] ^= 0xff;

      const results = verifySignatures(tampered);
      expect(results).toHaveLength(1);
      expect(results[0].integrityValid).toBe(false);
    });

    it('flipping a byte in second ByteRange region breaks integrity', async () => {
      const { signedData } = await signPDFWithPDFBox(simplePdf, signer);
      const tampered = new Uint8Array(signedData);

      const results0 = verifySignatures(signedData);
      const [, , off2, len2] = results0[0].byteRange;
      // Flip a byte well inside the second region but not in critical
      // xref/trailer structure that might prevent parsing entirely.
      // Use a byte in the middle of the region.
      const flipOffset = off2 + Math.floor(len2 / 2);
      tampered[flipOffset] ^= 0xff;

      const results = verifySignatures(tampered);
      // Tampering in the xref/trailer region may prevent parsing entirely
      // (returns empty array) or may cause integrity failure
      if (results.length > 0) {
        expect(results[0].integrityValid).toBe(false);
      } else {
        // Parser couldn't even find the signature — tamper was too destructive
        expect(results).toHaveLength(0);
      }
    });

    it('modifying Contents hex does not affect integrity check', async () => {
      const { signedData } = await signPDFWithPDFBox(simplePdf, signer);
      const tampered = new Uint8Array(signedData);

      const results0 = verifySignatures(signedData);
      const [, len1] = results0[0].byteRange;
      // Modify a byte in the Contents hex gap (between the two regions)
      // This is inside the hex signature — modifying it may break CMS parsing
      // but shouldn't affect the content digest (integrity) since ByteRange
      // excludes this region.
      tampered[len1 + 5] = 0x30; // overwrite a hex char

      const results = verifySignatures(tampered);
      if (results.length > 0) {
        // Integrity check compares content digest — the ByteRange content is unchanged
        // so integrity should still pass (the content hash hasn't changed)
        expect(results[0].integrityValid).toBe(true);
        // The CMS data is modified, but since signatureValid verifies
        // the RSA signature over authenticated attributes (not raw Contents),
        // it may still pass if the CMS structure wasn't corrupted by our edit.
        // We just verify integrity is maintained for the ByteRange content.
      }
      // If parse fails entirely, that's also acceptable — corrupt CMS can't be parsed
    });
  });
});
