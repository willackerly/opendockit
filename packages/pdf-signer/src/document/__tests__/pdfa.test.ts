/**
 * PDF/A compliance tests.
 *
 * Validates that PDFDocument.save({ pdfaConformance: ... }) produces
 * PDFs with the required PDF/A structures:
 *   - /Metadata stream with XMP containing pdfaid:part and pdfaid:conformance
 *   - /OutputIntents array with sRGB ICC profile
 *   - Correct PDF version header
 *   - Metadata consistency between /Info dict and XMP
 */

import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from '../index.js';
import { generateXMPMetadata } from '../pdfa/XMPMetadata.js';
import { buildSRGBICCProfile } from '../pdfa/ICCProfile.js';
import { applyPDFAConformance } from '../pdfa/PDFAConformance.js';
import type { PDFALevel } from '../pdfa/PDFAConformance.js';
import { NativeDocumentContext } from '../NativeDocumentContext.js';

// ---------------------------------------------------------------------------
// Helper: extract text from PDF bytes (simple regex, not a full parser)
// ---------------------------------------------------------------------------

function pdfBytesToString(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join('');
}

/** Extract the PDF version from the header (%PDF-X.Y). */
function extractPdfVersion(bytes: Uint8Array): string {
  const header = pdfBytesToString(bytes.subarray(0, 20));
  const match = header.match(/%PDF-(\d+\.\d+)/);
  return match ? match[1] : 'unknown';
}

/** Check if the PDF catalog contains /Metadata reference. */
function hasMetadataInCatalog(pdfStr: string): boolean {
  // Look for /Metadata in any dictionary
  return /\/Metadata\s+\d+\s+\d+\s+R/.test(pdfStr);
}

/** Check if the PDF contains /OutputIntents. */
function hasOutputIntents(pdfStr: string): boolean {
  return /\/OutputIntents\s*\[/.test(pdfStr);
}

/** Check if the PDF contains a /GTS_PDFA1 output intent. */
function hasGTSPDFA1Intent(pdfStr: string): boolean {
  return /\/S\s*\/GTS_PDFA1/.test(pdfStr);
}

/** Check if the PDF contains an sRGB identifier. */
function hasSRGBIdentifier(pdfStr: string): boolean {
  return pdfStr.includes('sRGB IEC61966-2.1');
}

/** Extract XMP metadata from PDF bytes (between <?xpacket ...?> markers). */
function extractXMPFromPdf(bytes: Uint8Array): string | null {
  const str = pdfBytesToString(bytes);
  // XMP is stored as stream content. Look for the xpacket markers.
  const startMarker = '<?xpacket begin=';
  const endMarker = '<?xpacket end="w"?>';
  const startIdx = str.indexOf(startMarker);
  const endIdx = str.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1) return null;
  return str.substring(startIdx, endIdx + endMarker.length);
}

// ---------------------------------------------------------------------------
// XMP Metadata unit tests
// ---------------------------------------------------------------------------

describe('XMP Metadata generation', () => {
  it('should generate valid XMP with PDF/A-1b identification', () => {
    const xmp = generateXMPMetadata({
      part: 1,
      conformance: 'B',
      title: 'Test Document',
      author: 'Test Author',
    });

    expect(xmp).toContain('<?xpacket begin=');
    expect(xmp).toContain('<?xpacket end="w"?>');
    expect(xmp).toContain('<pdfaid:part>1</pdfaid:part>');
    expect(xmp).toContain('<pdfaid:conformance>B</pdfaid:conformance>');
    expect(xmp).toContain('xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"');
    expect(xmp).toContain('Test Document');
    expect(xmp).toContain('Test Author');
  });

  it('should generate valid XMP with PDF/A-2b identification', () => {
    const xmp = generateXMPMetadata({
      part: 2,
      conformance: 'B',
    });

    expect(xmp).toContain('<pdfaid:part>2</pdfaid:part>');
    expect(xmp).toContain('<pdfaid:conformance>B</pdfaid:conformance>');
  });

  it('should generate valid XMP with PDF/A-3b identification', () => {
    const xmp = generateXMPMetadata({
      part: 3,
      conformance: 'B',
    });

    expect(xmp).toContain('<pdfaid:part>3</pdfaid:part>');
  });

  it('should include Dublin Core metadata', () => {
    const xmp = generateXMPMetadata({
      part: 1,
      conformance: 'B',
      title: 'My Title',
      author: 'My Author',
      subject: 'My Subject',
    });

    expect(xmp).toContain('xmlns:dc="http://purl.org/dc/elements/1.1/"');
    expect(xmp).toContain('<dc:title>');
    expect(xmp).toContain('My Title');
    expect(xmp).toContain('<dc:creator>');
    expect(xmp).toContain('My Author');
    expect(xmp).toContain('<dc:description>');
    expect(xmp).toContain('My Subject');
  });

  it('should include XMP basic properties', () => {
    const date = new Date('2024-06-15T10:30:00Z');
    const xmp = generateXMPMetadata({
      part: 1,
      conformance: 'B',
      creator: 'My App',
      producer: 'pdfbox-ts',
      createDate: date,
      modifyDate: date,
    });

    expect(xmp).toContain('xmlns:xmp="http://ns.adobe.com/xap/1.0/"');
    expect(xmp).toContain('<xmp:CreatorTool>My App</xmp:CreatorTool>');
    expect(xmp).toContain('<xmp:CreateDate>2024-06-15T10:30:00Z</xmp:CreateDate>');
    expect(xmp).toContain('<xmp:ModifyDate>2024-06-15T10:30:00Z</xmp:ModifyDate>');
  });

  it('should include PDF namespace properties', () => {
    const xmp = generateXMPMetadata({
      part: 1,
      conformance: 'B',
      producer: 'pdfbox-ts',
      keywords: 'test, pdf, archive',
    });

    expect(xmp).toContain('xmlns:pdf="http://ns.adobe.com/pdf/1.3/"');
    expect(xmp).toContain('<pdf:Producer>pdfbox-ts</pdf:Producer>');
    expect(xmp).toContain('<pdf:Keywords>test, pdf, archive</pdf:Keywords>');
  });

  it('should escape XML special characters', () => {
    const xmp = generateXMPMetadata({
      part: 1,
      conformance: 'B',
      title: 'A & B <C> "D"',
    });

    expect(xmp).toContain('A &amp; B &lt;C&gt; &quot;D&quot;');
    // Should NOT contain unescaped characters
    expect(xmp).not.toMatch(/A & B/);
  });

  it('should include padding for in-place updates', () => {
    const xmp = generateXMPMetadata({
      part: 1,
      conformance: 'B',
    });

    // Padding should be whitespace between the last element and <?xpacket end>
    const endMarkerIdx = xmp.indexOf('<?xpacket end="w"?>');
    const metaEndIdx = xmp.indexOf('</x:xmpmeta>');
    expect(endMarkerIdx).toBeGreaterThan(metaEndIdx);
    // There should be substantial padding (at least 1KB)
    const padding = xmp.substring(metaEndIdx + '</x:xmpmeta>'.length, endMarkerIdx);
    expect(padding.length).toBeGreaterThan(1000);
  });
});

// ---------------------------------------------------------------------------
// ICC Profile unit tests
// ---------------------------------------------------------------------------

describe('ICC Profile generation', () => {
  it('should generate a valid ICC profile', () => {
    const profile = buildSRGBICCProfile();

    // Should be a non-trivial size (minimal profile is ~300+ bytes)
    expect(profile.length).toBeGreaterThan(200);

    // Check ICC signature at offset 36: 'acsp'
    const acsp = String.fromCharCode(
      profile[36], profile[37], profile[38], profile[39],
    );
    expect(acsp).toBe('acsp');
  });

  it('should declare RGB color space', () => {
    const profile = buildSRGBICCProfile();

    // Color space at offset 16: 'RGB '
    const cs = String.fromCharCode(
      profile[16], profile[17], profile[18], profile[19],
    );
    expect(cs).toBe('RGB ');
  });

  it('should declare PCS as XYZ', () => {
    const profile = buildSRGBICCProfile();

    // PCS at offset 20: 'XYZ '
    const pcs = String.fromCharCode(
      profile[20], profile[21], profile[22], profile[23],
    );
    expect(pcs).toBe('XYZ ');
  });

  it('should declare monitor device class', () => {
    const profile = buildSRGBICCProfile();

    // Device class at offset 12: 'mntr'
    const cls = String.fromCharCode(
      profile[12], profile[13], profile[14], profile[15],
    );
    expect(cls).toBe('mntr');
  });

  it('should have ICC v2 version', () => {
    const profile = buildSRGBICCProfile();

    // Version at offset 8: major version should be 2
    expect(profile[8]).toBe(2);
  });

  it('should have correct profile size in header', () => {
    const profile = buildSRGBICCProfile();

    // Profile size at offset 0 (big-endian uint32)
    const view = new DataView(profile.buffer, profile.byteOffset, profile.byteLength);
    const declaredSize = view.getUint32(0);
    expect(declaredSize).toBe(profile.length);
  });

  it('should be deterministic (same output each time)', () => {
    const profile1 = buildSRGBICCProfile();
    const profile2 = buildSRGBICCProfile();
    expect(profile1).toEqual(profile2);
  });
});

// ---------------------------------------------------------------------------
// PDFAConformance integration tests
// ---------------------------------------------------------------------------

describe('PDF/A conformance application', () => {
  it('should apply PDF/A-1b conformance to a fresh document', async () => {
    const doc = await PDFDocument.create();
    doc.setTitle('PDF/A Test');
    doc.setAuthor('Test Author');
    const page = doc.addPage();

    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText('Hello PDF/A-1b!', { x: 50, y: 700, font, size: 24 });

    const bytes = await doc.save({ pdfaConformance: 'PDF/A-1b' });

    // Check PDF version
    expect(extractPdfVersion(bytes)).toBe('1.4');

    // Check XMP metadata
    const xmp = extractXMPFromPdf(bytes);
    expect(xmp).not.toBeNull();
    expect(xmp).toContain('<pdfaid:part>1</pdfaid:part>');
    expect(xmp).toContain('<pdfaid:conformance>B</pdfaid:conformance>');

    // Check OutputIntents
    const pdfStr = pdfBytesToString(bytes);
    expect(hasOutputIntents(pdfStr)).toBe(true);
    expect(hasGTSPDFA1Intent(pdfStr)).toBe(true);
    expect(hasSRGBIdentifier(pdfStr)).toBe(true);
    expect(hasMetadataInCatalog(pdfStr)).toBe(true);
  });

  it('should apply PDF/A-2b conformance', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();

    const bytes = await doc.save({ pdfaConformance: 'PDF/A-2b' });

    // Check PDF version (should be 1.7 for PDF/A-2b)
    expect(extractPdfVersion(bytes)).toBe('1.7');

    // Check XMP metadata
    const xmp = extractXMPFromPdf(bytes);
    expect(xmp).not.toBeNull();
    expect(xmp).toContain('<pdfaid:part>2</pdfaid:part>');
    expect(xmp).toContain('<pdfaid:conformance>B</pdfaid:conformance>');
  });

  it('should apply PDF/A-3b conformance', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();

    const bytes = await doc.save({ pdfaConformance: 'PDF/A-3b' });

    // Check PDF version (should be 1.7 for PDF/A-3b)
    expect(extractPdfVersion(bytes)).toBe('1.7');

    // Check XMP metadata
    const xmp = extractXMPFromPdf(bytes);
    expect(xmp).not.toBeNull();
    expect(xmp).toContain('<pdfaid:part>3</pdfaid:part>');
  });

  it('should include document metadata in XMP', async () => {
    const doc = await PDFDocument.create();
    doc.setTitle('Archival Document');
    doc.setAuthor('Jane Doe');
    doc.setSubject('Test subject for PDF/A');
    doc.setCreator('Test Creator App');
    doc.setKeywords(['archive', 'test', 'pdfa']);
    doc.addPage();

    const bytes = await doc.save({ pdfaConformance: 'PDF/A-1b' });

    const xmp = extractXMPFromPdf(bytes);
    expect(xmp).not.toBeNull();
    expect(xmp!).toContain('Archival Document');
    expect(xmp!).toContain('Jane Doe');
    expect(xmp!).toContain('Test subject for PDF/A');
    expect(xmp!).toContain('Test Creator App');
    expect(xmp!).toContain('archive, test, pdfa');
  });

  it('should produce a valid XMP metadata stream (not compressed)', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();

    const bytes = await doc.save({ pdfaConformance: 'PDF/A-1b' });
    const pdfStr = pdfBytesToString(bytes);

    // The metadata stream should contain /Type /Metadata /Subtype /XML
    expect(pdfStr).toContain('/Type /Metadata');
    expect(pdfStr).toContain('/Subtype /XML');

    // XMP metadata must NOT be compressed for PDF/A compliance
    // Check that the XMP XML appears in plain text in the PDF
    expect(pdfStr).toContain('<?xpacket begin=');
    expect(pdfStr).toContain('pdfaid:part');
  });

  it('should contain ICC profile data in the output', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();

    const bytes = await doc.save({ pdfaConformance: 'PDF/A-1b' });
    const pdfStr = pdfBytesToString(bytes);

    // OutputIntent should have /DestOutputProfile reference
    expect(pdfStr).toMatch(/\/DestOutputProfile\s+\d+\s+\d+\s+R/);

    // ICC profile stream should have /N 3 (RGB)
    expect(pdfStr).toContain('/N 3');
  });

  it('should produce a loadable PDF after save', async () => {
    const doc = await PDFDocument.create();
    doc.setTitle('Round-trip PDF/A');
    doc.addPage();

    const bytes = await doc.save({ pdfaConformance: 'PDF/A-1b' });

    // Load the saved PDF and verify basic structure
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);
    expect(loaded.getTitle()).toBe('Round-trip PDF/A');
  });

  it('should not modify the PDF when no conformance is specified', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();

    const bytes = await doc.save();
    const pdfStr = pdfBytesToString(bytes);

    // Should NOT have PDF/A-specific structures
    expect(hasOutputIntents(pdfStr)).toBe(false);
    expect(pdfStr).not.toContain('pdfaid:part');
    expect(pdfStr).not.toContain('/GTS_PDFA1');
  });
});

// ---------------------------------------------------------------------------
// Low-level applyPDFAConformance tests
// ---------------------------------------------------------------------------

describe('applyPDFAConformance (low-level)', () => {
  it('should set PDF version to 1.4 for PDF/A-1b', () => {
    const ctx = new NativeDocumentContext();
    applyPDFAConformance(ctx, 'PDF/A-1b');
    expect(ctx.version).toBe('1.4');
  });

  it('should set PDF version to 1.7 for PDF/A-2b', () => {
    const ctx = new NativeDocumentContext();
    applyPDFAConformance(ctx, 'PDF/A-2b');
    expect(ctx.version).toBe('1.7');
  });

  it('should add /Metadata to catalog', () => {
    const ctx = new NativeDocumentContext();
    applyPDFAConformance(ctx, 'PDF/A-1b');

    const metadataEntry = ctx.catalog.getItem('Metadata');
    expect(metadataEntry).toBeDefined();
  });

  it('should add /OutputIntents to catalog', () => {
    const ctx = new NativeDocumentContext();
    applyPDFAConformance(ctx, 'PDF/A-1b');

    const outputIntents = ctx.catalog.getItem('OutputIntents');
    expect(outputIntents).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Edge case tests
// ---------------------------------------------------------------------------

describe('PDF/A edge cases', () => {
  it('should handle documents with no metadata', async () => {
    const doc = await PDFDocument.create({ updateMetadata: false });
    doc.addPage();

    // Should not throw even without metadata
    const bytes = await doc.save({ pdfaConformance: 'PDF/A-1b' });
    expect(bytes.length).toBeGreaterThan(0);

    const xmp = extractXMPFromPdf(bytes);
    expect(xmp).not.toBeNull();
    expect(xmp!).toContain('<pdfaid:part>1</pdfaid:part>');
  });

  it('should handle documents with drawings and images', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();

    // Draw some content
    page.drawRectangle({
      x: 50,
      y: 50,
      width: 200,
      height: 100,
      color: rgb(0.8, 0.2, 0.2),
    });

    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText('PDF/A with drawings', {
      x: 60,
      y: 80,
      font,
      size: 14,
      color: rgb(1, 1, 1),
    });

    const bytes = await doc.save({ pdfaConformance: 'PDF/A-1b' });
    expect(bytes.length).toBeGreaterThan(0);

    // Verify it loads back
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);
  });

  it('should handle multi-page documents', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.addPage();
    doc.addPage();

    const bytes = await doc.save({ pdfaConformance: 'PDF/A-2b' });

    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(3);

    const xmp = extractXMPFromPdf(bytes);
    expect(xmp!).toContain('<pdfaid:part>2</pdfaid:part>');
  });

  it('should produce different output for different conformance levels', async () => {
    const doc1 = await PDFDocument.create();
    doc1.addPage();
    const bytes1 = await doc1.save({ pdfaConformance: 'PDF/A-1b' });

    const doc2 = await PDFDocument.create();
    doc2.addPage();
    const bytes2 = await doc2.save({ pdfaConformance: 'PDF/A-2b' });

    // Different PDF versions
    expect(extractPdfVersion(bytes1)).toBe('1.4');
    expect(extractPdfVersion(bytes2)).toBe('1.7');

    // Different pdfaid:part values
    const xmp1 = extractXMPFromPdf(bytes1);
    const xmp2 = extractXMPFromPdf(bytes2);
    expect(xmp1).toContain('<pdfaid:part>1</pdfaid:part>');
    expect(xmp2).toContain('<pdfaid:part>2</pdfaid:part>');
  });
});
