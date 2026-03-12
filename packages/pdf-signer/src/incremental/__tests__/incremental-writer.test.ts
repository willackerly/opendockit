import { describe, it, expect } from 'vitest';
import { IncrementalWriter } from '../incremental-writer';
import { ChangeTracker } from '../change-tracker';
import { COSDictionary, COSName, COSInteger, COSString } from '../../pdfbox/cos/COSTypes';
import { parsePdfTrailer } from '../../pdfbox/parser/trailer';

/**
 * Build a minimal valid PDF as bytes for testing.
 * This creates a simple 1-page PDF with a known structure.
 */
function buildMinimalPdf(): Uint8Array {
  const lines = [
    '%PDF-1.4',
    '1 0 obj',
    '<< /Type /Catalog /Pages 2 0 R >>',
    'endobj',
    '2 0 obj',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    'endobj',
    '3 0 obj',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>',
    'endobj',
  ];

  // Calculate offsets for xref
  const encoder = new TextEncoder();
  let content = '';
  const offsets: number[] = [];

  for (const line of lines) {
    if (line.match(/^\d+ \d+ obj$/)) {
      offsets.push(content.length);
    }
    content += line + '\n';
  }

  // Build xref table
  const xrefOffset = content.length;
  content += 'xref\n';
  content += '0 4\n';
  content += '0000000000 65535 f \r\n';
  for (const offset of offsets) {
    content += offset.toString().padStart(10, '0') + ' 00000 n \r\n';
  }

  // Build trailer
  content += 'trailer\n';
  content += '<< /Size 4 /Root 1 0 R >>\n';
  content += 'startxref\n';
  content += xrefOffset.toString() + '\n';
  content += '%%EOF\n';

  return encoder.encode(content);
}

describe('IncrementalWriter', () => {
  it('should parse trailer from original PDF', () => {
    const pdf = buildMinimalPdf();
    const writer = new IncrementalWriter(pdf);

    expect(writer.trailer.size).toBe(4);
    expect(writer.trailer.rootRef.objectNumber).toBe(1);
    expect(writer.trailer.rootRef.generation).toBe(0);
    expect(writer.prevXrefOffset).toBeGreaterThan(0);
  });

  it('should return original bytes when no changes are made', () => {
    const pdf = buildMinimalPdf();
    const writer = new IncrementalWriter(pdf);
    const result = writer.write();

    // Result should be a copy of original bytes (not identical reference)
    expect(result).toEqual(pdf);
    expect(result).not.toBe(pdf);
  });

  it('should report zero modified count initially', () => {
    const pdf = buildMinimalPdf();
    const writer = new IncrementalWriter(pdf);
    expect(writer.modifiedCount).toBe(0);
  });

  it('should track modified objects', () => {
    const pdf = buildMinimalPdf();
    const writer = new IncrementalWriter(pdf);

    const dict = new COSDictionary();
    dict.setItem(COSName.TYPE, new COSName('Page'));
    writer.markModified(3, 0, dict);

    expect(writer.modifiedCount).toBe(1);
  });

  it('should append modified object to output', () => {
    const pdf = buildMinimalPdf();
    const writer = new IncrementalWriter(pdf);

    const dict = new COSDictionary();
    dict.setItem(COSName.TYPE, new COSName('Page'));
    dict.setItem(new COSName('Parent'), new COSName('Test'));
    writer.markModified(3, 0, dict);

    const result = writer.write();

    // Output should be longer than original
    expect(result.length).toBeGreaterThan(pdf.length);

    // Original bytes should be preserved at the start
    const originalPart = result.slice(0, pdf.length);
    expect(originalPart).toEqual(pdf);

    // The appended part should contain the modified object
    const appended = new TextDecoder('latin1').decode(result.slice(pdf.length));
    expect(appended).toContain('3 0 obj');
    expect(appended).toContain('endobj');
  });

  it('should include xref table in appended section', () => {
    const pdf = buildMinimalPdf();
    const writer = new IncrementalWriter(pdf);

    const dict = new COSDictionary();
    dict.setItem(COSName.TYPE, new COSName('Page'));
    writer.markModified(3, 0, dict);

    const result = writer.write();
    const appended = new TextDecoder('latin1').decode(result.slice(pdf.length));

    expect(appended).toContain('xref');
    // Should have entries for obj 0 (free) and obj 3 (modified)
    expect(appended).toMatch(/0 1/); // free entry subsection
    expect(appended).toMatch(/3 1/); // modified obj subsection
  });

  it('should include trailer with /Prev pointing to original xref', () => {
    const pdf = buildMinimalPdf();
    const writer = new IncrementalWriter(pdf);
    const originalStartxref = writer.prevXrefOffset;

    const dict = new COSDictionary();
    dict.setItem(COSName.TYPE, new COSName('Page'));
    writer.markModified(3, 0, dict);

    const result = writer.write();
    const appended = new TextDecoder('latin1').decode(result.slice(pdf.length));

    expect(appended).toContain('trailer');
    expect(appended).toContain(`/Prev ${originalStartxref}`);
    expect(appended).toContain('/Root 1 0 R');
    expect(appended).toContain('startxref');
    expect(appended).toContain('%%EOF');
  });

  it('should preserve /Size as max(original, modified+1)', () => {
    const pdf = buildMinimalPdf();
    const writer = new IncrementalWriter(pdf);

    // Modify existing object (within original size)
    const dict = new COSDictionary();
    dict.setItem(COSName.TYPE, new COSName('Page'));
    writer.markModified(3, 0, dict);

    const result = writer.write();
    const appended = new TextDecoder('latin1').decode(result.slice(pdf.length));

    // /Size should be at least 4 (original size)
    expect(appended).toContain('/Size 4');
  });

  it('should handle adding new objects beyond original size', () => {
    const pdf = buildMinimalPdf();
    const writer = new IncrementalWriter(pdf);

    // Add an object with number beyond original /Size
    const dict = new COSDictionary();
    dict.setItem(new COSName('Value'), new COSInteger(42));
    writer.markModified(10, 0, dict);

    const result = writer.write();
    const appended = new TextDecoder('latin1').decode(result.slice(pdf.length));

    expect(appended).toContain('10 0 obj');
    // /Size should be updated to 11 (10 + 1)
    expect(appended).toContain('/Size 11');
  });

  it('should handle multiple modified objects', () => {
    const pdf = buildMinimalPdf();
    const writer = new IncrementalWriter(pdf);

    const dict1 = new COSDictionary();
    dict1.setItem(COSName.TYPE, new COSName('Page'));
    writer.markModified(3, 0, dict1);

    const dict2 = new COSDictionary();
    dict2.setItem(COSName.TYPE, new COSName('Catalog'));
    writer.markModified(1, 0, dict2);

    const result = writer.write();
    const appended = new TextDecoder('latin1').decode(result.slice(pdf.length));

    expect(appended).toContain('3 0 obj');
    expect(appended).toContain('1 0 obj');
    expect(appended).toContain('xref');
  });

  it('should write correct xref offsets for modified objects', () => {
    const pdf = buildMinimalPdf();
    const writer = new IncrementalWriter(pdf);

    const dict = new COSDictionary();
    dict.setItem(COSName.TYPE, new COSName('Page'));
    writer.markModified(3, 0, dict);

    const result = writer.write();
    const resultText = new TextDecoder('latin1').decode(result);

    // Find the last startxref value (the new one)
    const lastStartxref = resultText.lastIndexOf('startxref');
    const afterStartxref = resultText.slice(lastStartxref + 'startxref'.length).trim();
    const newXrefOffset = parseInt(afterStartxref, 10);

    // The xref keyword should appear at that offset
    const atOffset = resultText.slice(newXrefOffset, newXrefOffset + 4);
    expect(atOffset).toBe('xref');

    // The new xref offset should be in the appended section (after original bytes)
    expect(newXrefOffset).toBeGreaterThan(pdf.length);
  });

  it('should produce a valid PDF that can be re-parsed', () => {
    const pdf = buildMinimalPdf();
    const writer = new IncrementalWriter(pdf);

    const dict = new COSDictionary();
    dict.setItem(COSName.TYPE, new COSName('Page'));
    dict.setItem(new COSName('MediaBox'), new COSName('Test'));
    writer.markModified(3, 0, dict);

    const result = writer.write();

    // The result should be parseable as a PDF (trailer should be findable)
    const trailer = parsePdfTrailer(result);
    expect(trailer.rootRef.objectNumber).toBe(1);
    expect(trailer.rootRef.generation).toBe(0);
    // /Prev should point to the original xref
    expect(trailer.prev).toBe(writer.prevXrefOffset);
    // New startxref should be different from original
    expect(trailer.startxref).not.toBe(writer.prevXrefOffset);
  });

  it('should support importFromTracker', () => {
    const pdf = buildMinimalPdf();
    const writer = new IncrementalWriter(pdf);
    const tracker = new ChangeTracker();

    const dict3 = new COSDictionary();
    dict3.setItem(COSName.TYPE, new COSName('Page'));

    const dict1 = new COSDictionary();
    dict1.setItem(COSName.TYPE, new COSName('Catalog'));

    tracker.trackModification(3, 0);
    tracker.trackModification(1, 0);

    const objectStore = new Map<string, COSDictionary>();
    objectStore.set('3-0', dict3);
    objectStore.set('1-0', dict1);

    writer.importFromTracker(tracker, (objNum, gen) => {
      return objectStore.get(`${objNum}-${gen}`);
    });

    expect(writer.modifiedCount).toBe(2);

    const result = writer.write();
    const appended = new TextDecoder('latin1').decode(result.slice(pdf.length));
    expect(appended).toContain('3 0 obj');
    expect(appended).toContain('1 0 obj');
  });

  it('should handle importFromTracker when resolver returns undefined', () => {
    const pdf = buildMinimalPdf();
    const writer = new IncrementalWriter(pdf);
    const tracker = new ChangeTracker();

    tracker.trackModification(3, 0);
    tracker.trackModification(99, 0); // object that doesn't exist

    const dict3 = new COSDictionary();
    dict3.setItem(COSName.TYPE, new COSName('Page'));

    writer.importFromTracker(tracker, (objNum) => {
      if (objNum === 3) return dict3;
      return undefined;
    });

    // Only object 3 should be imported (99 was undefined)
    expect(writer.modifiedCount).toBe(1);
  });

  it('should produce output with original bytes preserved byte-for-byte', () => {
    const pdf = buildMinimalPdf();
    const writer = new IncrementalWriter(pdf);

    const dict = new COSDictionary();
    dict.setItem(COSName.TYPE, new COSName('Annotation'));
    writer.markModified(5, 0, dict);

    const result = writer.write();

    // Verify every byte of the original is preserved
    for (let i = 0; i < pdf.length; i++) {
      expect(result[i]).toBe(pdf[i]);
    }
  });

  it('should use real test PDF from fixtures', () => {
    const fs = require('fs');
    const path = require('path');
    const fixturePath = path.join(__dirname, '../../..', 'test-pdfs/working/simple-test.pdf');

    if (!fs.existsSync(fixturePath)) {
      return; // Skip if fixture not available
    }

    const pdfBytes = new Uint8Array(fs.readFileSync(fixturePath));
    const writer = new IncrementalWriter(pdfBytes);

    expect(writer.trailer.rootRef).toBeDefined();
    expect(writer.prevXrefOffset).toBeGreaterThan(0);

    // Modify an object and write
    const dict = new COSDictionary();
    dict.setItem(new COSName('CustomKey'), new COSString('CustomValue'));
    writer.markModified(1, 0, dict);

    const result = writer.write();

    // Original bytes preserved
    expect(result.length).toBeGreaterThan(pdfBytes.length);
    for (let i = 0; i < pdfBytes.length; i++) {
      expect(result[i]).toBe(pdfBytes[i]);
    }

    // Result is re-parseable
    const newTrailer = parsePdfTrailer(result);
    expect(newTrailer.prev).toBe(writer.prevXrefOffset);
  });
});
