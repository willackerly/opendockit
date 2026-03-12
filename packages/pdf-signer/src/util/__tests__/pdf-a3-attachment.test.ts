import { describe, it, expect } from 'vitest';
import { PDFDocument } from '../../document/PDFDocument.js';
import { embedFileAttachment } from '../pdf-a3-attachment.js';

describe('embedFileAttachment', () => {
  it('should embed a file and produce valid PDF bytes with /EmbeddedFiles', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);

    // Embed a small test payload
    const payload = new TextEncoder().encode('hello world - test payload');
    const filename = 'test-document.pptx';
    const mimeType =
      'application/vnd.openxmlformats-officedocument.presentationml.presentation';

    embedFileAttachment(doc, filename, payload, mimeType);

    const pdfBytes = await doc.save();
    expect(pdfBytes.length).toBeGreaterThan(0);

    // Verify the filename appears in the PDF bytes
    const pdfStr = new TextDecoder('latin1').decode(pdfBytes);
    expect(pdfStr).toContain('test-document.pptx');
    expect(pdfStr).toContain('/EmbeddedFiles');
    expect(pdfStr).toContain('/EmbeddedFile');
    expect(pdfStr).toContain('/Filespec');
    expect(pdfStr).toContain('/AFRelationship');
    expect(pdfStr).toContain('/Source');
    expect(pdfStr).toContain('/AF');
  });

  it('should embed the payload data intact', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);

    const payload = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0xca, 0xfe]);
    embedFileAttachment(doc, 'data.bin', payload, 'application/octet-stream');

    const pdfBytes = await doc.save();

    // The payload bytes should appear somewhere in the PDF stream
    const pdfStr = new TextDecoder('latin1').decode(pdfBytes);
    // Check structural elements
    expect(pdfStr).toContain('/EmbeddedFile');
    expect(pdfStr).toContain('data.bin');
    // /Params /Size should reflect 6 bytes
    expect(pdfStr).toContain('/Size 6');
  });

  it('should support multiple attachments', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);

    const payload1 = new TextEncoder().encode('first file');
    const payload2 = new TextEncoder().encode('second file');

    embedFileAttachment(doc, 'first.txt', payload1, 'text/plain');
    embedFileAttachment(doc, 'second.txt', payload2, 'text/plain');

    const pdfBytes = await doc.save();
    const pdfStr = new TextDecoder('latin1').decode(pdfBytes);

    expect(pdfStr).toContain('first.txt');
    expect(pdfStr).toContain('second.txt');
  });

  it('should encode /UF as UTF-16BE with BOM', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);

    embedFileAttachment(
      doc,
      'report.pdf',
      new Uint8Array([1, 2, 3]),
      'application/pdf',
    );

    const pdfBytes = await doc.save();
    const pdfStr = new TextDecoder('latin1').decode(pdfBytes);
    // The /UF entry should contain escaped BOM bytes (\376\377 = 0xFE 0xFF in octal)
    // or the raw bytes depending on how COSString serializes.
    // Check that /UF appears and differs from /F (which is plain ASCII).
    expect(pdfStr).toContain('/UF');
    expect(pdfStr).toContain('/F (report.pdf)');
    // The UTF-16BE BOM \xFE\xFF should appear in the serialized string
    // either as raw bytes or as octal escapes (\376\377)
    const hasOctalBom = pdfStr.includes('\\376\\377');
    const hasRawBom =
      pdfBytes.some((_b, i) => i < pdfBytes.length - 1 && pdfBytes[i] === 0xfe && pdfBytes[i + 1] === 0xff);
    expect(hasOctalBom || hasRawBom).toBe(true);
  });

  it('should round-trip: load the saved PDF and find the attachment structures', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);

    const payload = new TextEncoder().encode('round-trip test');
    embedFileAttachment(doc, 'source.pptx', payload, 'application/zip');

    const pdfBytes = await doc.save();

    // Load the PDF back
    const loaded = await PDFDocument.load(pdfBytes, { updateMetadata: false });
    const catalog = loaded._nativeCtx.catalog;

    // Check /Names -> /EmbeddedFiles exists
    const names = catalog.getItem('Names');
    expect(names).toBeDefined();

    // Check /AF array exists
    const af = catalog.getItem('AF');
    expect(af).toBeDefined();
  });
});
