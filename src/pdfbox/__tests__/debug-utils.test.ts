/**
 * Tests for PDF Debugging Utilities
 *
 * Verifies that our debugging tools work correctly for comparing PDFs.
 */

import { describe, it, expect } from 'vitest';
import {
  comparePDFBytes,
  extractPDFStructure,
  hexDump,
  comparePDFStructures,
  validatePDF,
} from './debug-utils';

describe('PDF Byte Comparison', () => {
  it('should detect identical PDFs', () => {
    const pdf1 = new TextEncoder().encode('%PDF-1.4\nHello World\n%%EOF');
    const pdf2 = new TextEncoder().encode('%PDF-1.4\nHello World\n%%EOF');

    const result = comparePDFBytes(pdf1, pdf2);

    expect(result.identical).toBe(true);
    expect(result.differences.length).toBe(0);
    expect(result.summary).toContain('identical');
  });

  it('should detect byte differences', () => {
    const pdf1 = new TextEncoder().encode('%PDF-1.4\nHello World\n%%EOF');
    const pdf2 = new TextEncoder().encode('%PDF-1.4\nHello Earth\n%%EOF');

    const result = comparePDFBytes(pdf1, pdf2);

    expect(result.identical).toBe(false);
    expect(result.differences.length).toBeGreaterThan(0);
    expect(result.summary).toContain('difference');
  });

  it('should detect length differences', () => {
    const pdf1 = new TextEncoder().encode('%PDF-1.4\nShort\n%%EOF');
    const pdf2 = new TextEncoder().encode('%PDF-1.4\nLonger Text\n%%EOF');

    const result = comparePDFBytes(pdf1, pdf2);

    expect(result.identical).toBe(false);
    expect(result.summary).toContain(pdf1.length.toString());
    expect(result.summary).toContain(pdf2.length.toString());
  });

  it('should limit number of reported differences', () => {
    // Create PDFs with many differences
    const pdf1 = new Uint8Array(100).fill(65); // 'A'
    const pdf2 = new Uint8Array(100).fill(66); // 'B'

    const result = comparePDFBytes(pdf1, pdf2, { maxDifferences: 10 });

    expect(result.differences.length).toBe(10);
  });
});

describe('PDF Structure Extraction', () => {
  it('should extract basic PDF structure', () => {
    const pdf = new TextEncoder().encode(
      '%PDF-1.4\n' +
      '1 0 obj\n<< /Type /Catalog >>\nendobj\n' +
      'xref\n' +
      '0 2\n' +
      '0000000000 65535 f \n' +
      '0000000009 00000 n \n' +
      'trailer\n' +
      '<< /Size 2 /Root 1 0 R >>\n' +
      'startxref\n' +
      '100\n' +
      '%%EOF'
    );

    const structure = extractPDFStructure(pdf);

    expect(structure.header).toBe('%PDF-1.4');
    expect(structure.objects.length).toBe(1);
    expect(structure.objects[0].number).toBe(1);
    expect(structure.xref).not.toBeNull();
    expect(structure.trailer).not.toBeNull();
    expect(structure.eof).not.toBeNull();
  });

  it('should find multiple objects', () => {
    const pdf = new TextEncoder().encode(
      '%PDF-1.4\n' +
      '1 0 obj\n<< /Type /Catalog >>\nendobj\n' +
      '2 0 obj\n<< /Type /Pages >>\nendobj\n' +
      '%%EOF'
    );

    const structure = extractPDFStructure(pdf);

    expect(structure.objects.length).toBe(2);
    expect(structure.objects[0].number).toBe(1);
    expect(structure.objects[1].number).toBe(2);
  });
});

describe('Hex Dump', () => {
  it('should create basic hex dump', () => {
    const data = new TextEncoder().encode('Hello World');
    const dump = hexDump(data);

    expect(dump).toContain('00000000');
    expect(dump).toContain('48'); // 'H'
    expect(dump).toContain('65'); // 'e'
    expect(dump).toContain('6c'); // 'l'
  });

  it('should show ASCII representation', () => {
    const data = new TextEncoder().encode('Test');
    const dump = hexDump(data, 0, data.length, { showASCII: true });

    expect(dump).toContain('Test');
  });

  it('should handle non-printable characters', () => {
    const data = new Uint8Array([0x00, 0x01, 0x02, 0x48, 0x69]); // \0, \1, \2, 'H', 'i'
    const dump = hexDump(data, 0, data.length, { showASCII: true });

    expect(dump).toContain('00 01 02');
    expect(dump).toContain('...Hi'); // Non-printable as dots
  });

  it('should respect offset and length', () => {
    const data = new TextEncoder().encode('0123456789ABCDEF');
    const dump = hexDump(data, 5, 5); // Start at 5, length 5

    expect(dump).toContain('00000005'); // Offset should be 5
  });
});

describe('PDF Structure Comparison', () => {
  it('should detect matching structures', () => {
    const pdf = new TextEncoder().encode(
      '%PDF-1.4\n' +
      '1 0 obj\n<< /Type /Catalog >>\nendobj\n' +
      'xref\n0 2\ntrailer\n<< /Size 2 >>\n%%EOF'
    );

    const result = comparePDFStructures(pdf, pdf);

    expect(result.headerMatch).toBe(true);
    expect(result.objectCountMatch).toBe(true);
    expect(result.xrefMatch).toBe(true);
    expect(result.trailerMatch).toBe(true);
    expect(result.eofMatch).toBe(true);
  });

  it('should detect header differences', () => {
    const pdf1 = new TextEncoder().encode('%PDF-1.4\n%%EOF');
    const pdf2 = new TextEncoder().encode('%PDF-1.7\n%%EOF');

    const result = comparePDFStructures(pdf1, pdf2);

    expect(result.headerMatch).toBe(false);
    expect(result.details).toContain('Header mismatch');
  });

  it('should detect object count differences', () => {
    const pdf1 = new TextEncoder().encode(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF'
    );
    const pdf2 = new TextEncoder().encode(
      '%PDF-1.4\n' +
      '1 0 obj\n<< /Type /Catalog >>\nendobj\n' +
      '2 0 obj\n<< /Type /Pages >>\nendobj\n' +
      '%%EOF'
    );

    const result = comparePDFStructures(pdf1, pdf2);

    expect(result.objectCountMatch).toBe(false);
    expect(result.details).toContain('Object count mismatch');
  });
});

describe('PDF Validation', () => {
  it('should validate a well-formed PDF', () => {
    const pdf = new TextEncoder().encode(
      '%PDF-1.4\n' +
      '1 0 obj\n<< /Type /Catalog >>\nendobj\n' +
      'xref\n' +
      '0 2\n' +
      'trailer\n' +
      '<< /Size 2 >>\n' +
      '%%EOF'
    );

    const result = validatePDF(pdf);

    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('should detect missing header', () => {
    const pdf = new TextEncoder().encode(
      '1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF'
    );

    const result = validatePDF(pdf);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('header'))).toBe(true);
  });

  it('should detect missing xref', () => {
    const pdf = new TextEncoder().encode(
      '%PDF-1.4\n' +
      '1 0 obj\n<< /Type /Catalog >>\nendobj\n' +
      'trailer\n<< /Size 2 >>\n' +
      '%%EOF'
    );

    const result = validatePDF(pdf);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('xref'))).toBe(true);
  });

  it('should detect missing EOF', () => {
    const pdf = new TextEncoder().encode(
      '%PDF-1.4\n' +
      '1 0 obj\n<< /Type /Catalog >>\nendobj\n' +
      'xref\n0 2\ntrailer\n<< /Size 2 >>'
    );

    const result = validatePDF(pdf);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('EOF'))).toBe(true);
  });

  it('should detect obj/endobj mismatch', () => {
    const pdf = new TextEncoder().encode(
      '%PDF-1.4\n' +
      '1 0 obj\n<< /Type /Catalog >>\n' + // Missing endobj
      'xref\n0 2\ntrailer\n<< /Size 2 >>\n%%EOF'
    );

    const result = validatePDF(pdf);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Object/endobj'))).toBe(true);
  });
});
