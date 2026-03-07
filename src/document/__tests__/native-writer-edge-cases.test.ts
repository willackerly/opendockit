/**
 * Edge-case tests for NativePDFWriter serialization.
 *
 * Covers: header/footer structure, metadata encoding, special characters,
 * round-trip fidelity, empty documents, font/content stream presence,
 * multi-page scaling, and file size sanity.
 */

import { describe, it, expect } from 'vitest';
import { PDFDocument } from '../PDFDocument.js';
import { NativeDocumentContext } from '../NativeDocumentContext.js';
import { NativePDFWriter } from '../NativePDFWriter.js';

/** Decode bytes to UTF-8 string for content assertions. */
function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

describe('NativePDFWriter edge cases', () => {
  // -------------------------------------------------------------------------
  // Basic structure
  // -------------------------------------------------------------------------

  it('1-page document starts with %PDF- and ends with %%EOF', () => {
    const ctx = new NativeDocumentContext();
    ctx.addPage();
    const bytes = NativePDFWriter.write(ctx);
    const text = decode(bytes);

    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('10-page document is valid and file size grows with pages', () => {
    const ctx1 = new NativeDocumentContext();
    ctx1.addPage();
    const bytes1 = NativePDFWriter.write(ctx1);

    const ctx10 = new NativeDocumentContext();
    for (let i = 0; i < 10; i++) {
      ctx10.addPage();
    }
    const bytes10 = NativePDFWriter.write(ctx10);

    // 10-page file must be larger than 1-page file
    expect(bytes10.length).toBeGreaterThan(bytes1.length);

    // Both must be valid PDFs
    const text10 = decode(bytes10);
    expect(text10.startsWith('%PDF-')).toBe(true);
    expect(text10.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('%PDF header matches version string', () => {
    const ctx = new NativeDocumentContext();
    ctx.addPage();
    const bytes = NativePDFWriter.write(ctx);
    const header = decode(bytes.slice(0, 10));

    // Default version is 1.7
    expect(header).toContain('%PDF-1.7');
  });

  it('%%EOF is at the very end of the file', () => {
    const ctx = new NativeDocumentContext();
    ctx.addPage();
    const bytes = NativePDFWriter.write(ctx);
    const text = decode(bytes);

    // The file should end with %%EOF (trailing newline stripped per NativePDFWriter)
    const lastFive = text.slice(-5);
    expect(lastFive).toBe('%%EOF');
  });

  // -------------------------------------------------------------------------
  // Metadata encoding
  // -------------------------------------------------------------------------

  it('metadata appears in PDF bytes', () => {
    const ctx = new NativeDocumentContext();
    ctx.setTitle('Test Title XYZ');
    ctx.setAuthor('Author ABC');
    ctx.addPage();

    const bytes = NativePDFWriter.write(ctx);
    const text = decode(bytes);

    expect(text).toContain('Test Title XYZ');
    expect(text).toContain('Author ABC');
    // Info dict should be referenced in trailer
    expect(text).toContain('/Info');
  });

  it('long strings in info dict (>256 chars) are correctly encoded', () => {
    const ctx = new NativeDocumentContext();
    const longTitle = 'A'.repeat(300);
    ctx.setTitle(longTitle);
    ctx.addPage();

    const bytes = NativePDFWriter.write(ctx);
    const text = decode(bytes);

    // The full 300-character string must survive serialization
    expect(text).toContain(longTitle);
  });

  it('special characters in metadata (parentheses, backslashes) are properly escaped', () => {
    const ctx = new NativeDocumentContext();
    ctx.setTitle('Title with (parens) and \\backslash\\');
    ctx.setAuthor('Author (test)');
    ctx.addPage();

    const bytes = NativePDFWriter.write(ctx);
    const text = decode(bytes);

    // PDF literal strings escape parens and backslashes with a backslash
    expect(text).toContain('\\(parens\\)');
    expect(text).toContain('\\\\backslash\\\\');
    expect(text).toContain('\\(test\\)');
  });

  // -------------------------------------------------------------------------
  // Round-trip fidelity
  // -------------------------------------------------------------------------

  it('write then load round-trip: page count preserved', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.addPage();
    doc.addPage();

    const bytes = await doc.save();
    const loaded = await PDFDocument.load(bytes);

    expect(loaded.getPageCount()).toBe(3);
  });

  it('write then load round-trip: metadata preserved (Title, Author)', async () => {
    const doc = await PDFDocument.create();
    doc.setTitle('Round-Trip Title');
    doc.setAuthor('Round-Trip Author');
    doc.addPage();

    const bytes = await doc.save();
    const loaded = await PDFDocument.load(bytes);

    expect(loaded.getTitle()).toBe('Round-Trip Title');
    expect(loaded.getAuthor()).toBe('Round-Trip Author');
  });

  // -------------------------------------------------------------------------
  // Edge: empty document
  // -------------------------------------------------------------------------

  it('empty document (0 pages) still produces parseable output', async () => {
    const ctx = new NativeDocumentContext();
    // No pages added — 0-page document
    const bytes = NativePDFWriter.write(ctx);
    const text = decode(bytes);

    // Must still be a structurally valid PDF
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain('xref');
    expect(text).toContain('trailer');
    expect(text).toContain('startxref');
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);

    // Should be loadable (even with 0 pages)
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Font and content stream presence
  // -------------------------------------------------------------------------

  it('document with font embedded contains /Type /Font', () => {
    const ctx = new NativeDocumentContext();
    ctx.addPage();
    ctx.embedStandardFont('Helvetica');

    const bytes = NativePDFWriter.write(ctx);
    const text = decode(bytes);

    expect(text).toContain('/Type /Font');
    expect(text).toContain('/BaseFont /Helvetica');
    expect(text).toContain('/Subtype /Type1');
  });

  it('document with content stream contains stream...endstream', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const font = doc.embedStandardFont('Courier');

    page.drawText('Hello World', { x: 50, y: 700, size: 12, font });

    const bytes = await doc.save();
    const text = decode(bytes);

    expect(text).toContain('stream\r\n');
    expect(text).toContain('endstream');
  });

  // -------------------------------------------------------------------------
  // File size sanity
  // -------------------------------------------------------------------------

  it('create + save: file size is reasonable (< 5KB for empty 1-page doc)', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();

    const bytes = await doc.save();

    // An empty single-page PDF should be well under 5KB
    expect(bytes.length).toBeLessThan(5 * 1024);
    // But should be at least a minimal PDF (~200 bytes)
    expect(bytes.length).toBeGreaterThan(100);
  });

  it('xref /Size in trailer matches actual object count', () => {
    const ctx = new NativeDocumentContext();
    ctx.addPage();
    ctx.addPage();
    ctx.embedStandardFont('TimesRoman');

    const bytes = NativePDFWriter.write(ctx);
    const text = decode(bytes);

    // objectCount includes object 0 (free head) + all registered objects
    const expectedSize = ctx.objectCount;
    expect(text).toContain(`/Size ${expectedSize}`);

    // Verify the xref table has entries for 0..N-1
    const xrefMatch = text.match(/xref\r?\n0 (\d+)/);
    expect(xrefMatch).not.toBeNull();
    expect(parseInt(xrefMatch![1], 10)).toBe(expectedSize);
  });

  it('file size scales reasonably: 100-page doc is under 100KB', async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 100; i++) {
      doc.addPage();
    }

    const bytes = await doc.save();

    // 100 empty pages should still be compact
    expect(bytes.length).toBeLessThan(100 * 1024);
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
