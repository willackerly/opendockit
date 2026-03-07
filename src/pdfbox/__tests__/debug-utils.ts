/**
 * PDF Debugging Utilities
 *
 * Tools for comparing PDFs byte-by-byte and analyzing structure differences.
 * These are CRITICAL for verifying our PDFBox port produces identical output.
 */

/**
 * Compare two PDFs byte-by-byte and report differences
 */
export function comparePDFBytes(
  pdf1: Uint8Array,
  pdf2: Uint8Array,
  options: { maxDifferences?: number; contextLines?: number } = {}
): {
  identical: boolean;
  differences: Array<{
    offset: number;
    byte1: number;
    byte2: number;
    char1: string;
    char2: string;
    context: string;
  }>;
  summary: string;
} {
  const maxDifferences = options.maxDifferences || 100;
  const contextLines = options.contextLines || 20;
  const differences: Array<{
    offset: number;
    byte1: number;
    byte2: number;
    char1: string;
    char2: string;
    context: string;
  }> = [];

  const minLength = Math.min(pdf1.length, pdf2.length);
  const maxLength = Math.max(pdf1.length, pdf2.length);

  // Compare byte by byte
  for (let i = 0; i < minLength && differences.length < maxDifferences; i++) {
    if (pdf1[i] !== pdf2[i]) {
      const byte1 = pdf1[i];
      const byte2 = pdf2[i];
      const char1 = isPrintable(byte1) ? String.fromCharCode(byte1) : `\\x${byte1.toString(16).padStart(2, '0')}`;
      const char2 = isPrintable(byte2) ? String.fromCharCode(byte2) : `\\x${byte2.toString(16).padStart(2, '0')}`;

      // Get context around the difference
      const start = Math.max(0, i - contextLines);
      const end = Math.min(maxLength, i + contextLines);
      const context = getContext(pdf1, pdf2, start, end, i);

      differences.push({
        offset: i,
        byte1,
        byte2,
        char1,
        char2,
        context,
      });
    }
  }

  // Check for length differences
  if (pdf1.length !== pdf2.length) {
    differences.push({
      offset: minLength,
      byte1: pdf1.length > pdf2.length ? pdf1[minLength] : -1,
      byte2: pdf2.length > pdf1.length ? pdf2[minLength] : -1,
      char1: pdf1.length > pdf2.length ? 'EOF' : 'MISSING',
      char2: pdf2.length > pdf1.length ? 'EOF' : 'MISSING',
      context: `Length difference: ${pdf1.length} vs ${pdf2.length}`,
    });
  }

  const summary = differences.length === 0
    ? `✓ PDFs are identical (${pdf1.length} bytes)`
    : `✗ Found ${differences.length} difference${differences.length === 1 ? '' : 's'}\n` +
      `  PDF1: ${pdf1.length} bytes\n` +
      `  PDF2: ${pdf2.length} bytes\n` +
      differences.slice(0, 10).map(d =>
        `  @ offset ${d.offset}: '${d.char1}' (0x${d.byte1.toString(16)}) != '${d.char2}' (0x${d.byte2.toString(16)})`
      ).join('\n');

  return {
    identical: differences.length === 0,
    differences,
    summary,
  };
}

/**
 * Check if a byte is printable ASCII
 */
function isPrintable(byte: number): boolean {
  return byte >= 32 && byte <= 126;
}

/**
 * Get context around a difference
 */
function getContext(
  pdf1: Uint8Array,
  pdf2: Uint8Array,
  start: number,
  end: number,
  diffOffset: number
): string {
  const decoder = new TextDecoder('iso-8859-1');

  const context1 = decoder.decode(pdf1.slice(start, end));
  const context2 = decoder.decode(pdf2.slice(start, end));

  const relativeOffset = diffOffset - start;

  return `PDF1: ${context1.substring(0, relativeOffset)}[${context1[relativeOffset]}]${context1.substring(relativeOffset + 1)}\n` +
         `PDF2: ${context2.substring(0, relativeOffset)}[${context2[relativeOffset]}]${context2.substring(relativeOffset + 1)}`;
}

/**
 * Extract PDF structure for analysis
 */
export function extractPDFStructure(pdf: Uint8Array): {
  header: string;
  xref: { offset: number; content: string } | null;
  trailer: { offset: number; content: string } | null;
  objects: Array<{ number: number; offset: number; content: string }>;
  eof: { offset: number; content: string } | null;
} {
  const decoder = new TextDecoder('iso-8859-1');
  const pdfText = decoder.decode(pdf);

  // Find header
  const headerMatch = pdfText.match(/^%PDF-[\d.]+/);
  const header = headerMatch ? headerMatch[0] : 'NOT FOUND';

  // Find xref table
  const xrefMatch = pdfText.match(/xref\s+[\s\S]*?(?=trailer)/);
  const xref = xrefMatch ? {
    offset: pdfText.indexOf('xref'),
    content: xrefMatch[0]
  } : null;

  // Find trailer
  const trailerMatch = pdfText.match(/trailer\s*<<[\s\S]*?>>/);
  const trailer = trailerMatch ? {
    offset: pdfText.indexOf('trailer'),
    content: trailerMatch[0]
  } : null;

  // Find all objects
  const objectRegex = /(\d+)\s+0\s+obj\s+([\s\S]*?)\s+endobj/g;
  const objects: Array<{ number: number; offset: number; content: string }> = [];
  let match;
  while ((match = objectRegex.exec(pdfText)) !== null) {
    objects.push({
      number: parseInt(match[1], 10),
      offset: match.index,
      content: match[0]
    });
  }

  // Find EOF
  const eofMatch = pdfText.match(/%%EOF/);
  const eof = eofMatch ? {
    offset: pdfText.indexOf('%%EOF'),
    content: '%%EOF'
  } : null;

  return {
    header,
    xref,
    trailer,
    objects,
    eof,
  };
}

/**
 * Create a hex dump of a byte range
 */
export function hexDump(
  data: Uint8Array,
  offset: number = 0,
  length: number = data.length,
  options: { showASCII?: boolean; bytesPerLine?: number } = {}
): string {
  const showASCII = options.showASCII !== false;
  const bytesPerLine = options.bytesPerLine || 16;
  const lines: string[] = [];

  const end = Math.min(offset + length, data.length);

  for (let i = offset; i < end; i += bytesPerLine) {
    const lineOffset = i.toString(16).padStart(8, '0');
    const bytes: string[] = [];
    const ascii: string[] = [];

    for (let j = 0; j < bytesPerLine; j++) {
      const byteIndex = i + j;
      if (byteIndex < end) {
        const byte = data[byteIndex];
        bytes.push(byte.toString(16).padStart(2, '0'));
        ascii.push(isPrintable(byte) ? String.fromCharCode(byte) : '.');
      } else {
        bytes.push('  ');
        ascii.push(' ');
      }
    }

    let line = `${lineOffset}  ${bytes.slice(0, 8).join(' ')}  ${bytes.slice(8).join(' ')}`;
    if (showASCII) {
      line += `  |${ascii.join('')}|`;
    }
    lines.push(line);
  }

  return lines.join('\n');
}

/**
 * Compare PDF structures and report differences
 */
export function comparePDFStructures(
  pdf1: Uint8Array,
  pdf2: Uint8Array
): {
  headerMatch: boolean;
  objectCountMatch: boolean;
  xrefMatch: boolean;
  trailerMatch: boolean;
  eofMatch: boolean;
  details: string;
} {
  const struct1 = extractPDFStructure(pdf1);
  const struct2 = extractPDFStructure(pdf2);

  const headerMatch = struct1.header === struct2.header;
  const objectCountMatch = struct1.objects.length === struct2.objects.length;
  const xrefMatch = struct1.xref?.content === struct2.xref?.content;
  const trailerMatch = struct1.trailer?.content === struct2.trailer?.content;
  const eofMatch = struct1.eof?.content === struct2.eof?.content;

  let details = '';

  if (!headerMatch) {
    details += `Header mismatch:\n  PDF1: ${struct1.header}\n  PDF2: ${struct2.header}\n\n`;
  }

  if (!objectCountMatch) {
    details += `Object count mismatch:\n  PDF1: ${struct1.objects.length} objects\n  PDF2: ${struct2.objects.length} objects\n\n`;
  }

  if (!xrefMatch) {
    details += `XRef table mismatch:\n  PDF1:\n${struct1.xref?.content || 'MISSING'}\n\n  PDF2:\n${struct2.xref?.content || 'MISSING'}\n\n`;
  }

  if (!trailerMatch) {
    details += `Trailer mismatch:\n  PDF1:\n${struct1.trailer?.content || 'MISSING'}\n\n  PDF2:\n${struct2.trailer?.content || 'MISSING'}\n\n`;
  }

  if (!eofMatch) {
    details += `EOF mismatch:\n  PDF1: ${struct1.eof?.content || 'MISSING'}\n  PDF2: ${struct2.eof?.content || 'MISSING'}\n\n`;
  }

  return {
    headerMatch,
    objectCountMatch,
    xrefMatch,
    trailerMatch,
    eofMatch,
    details,
  };
}

/**
 * Validate PDF format compliance
 */
export function validatePDF(pdf: Uint8Array): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const struct = extractPDFStructure(pdf);

  // Check header
  if (!struct.header.startsWith('%PDF-')) {
    errors.push('Invalid or missing PDF header');
  }

  // Check xref table
  if (!struct.xref) {
    errors.push('Missing xref table');
  }

  // Check trailer
  if (!struct.trailer) {
    errors.push('Missing trailer');
  }

  // Check EOF marker
  if (!struct.eof) {
    errors.push('Missing %%EOF marker');
  }

  // Check for common issues
  const decoder = new TextDecoder('iso-8859-1');
  const pdfText = decoder.decode(pdf);

  // Check for proper line endings in xref
  if (struct.xref && !struct.xref.content.includes('\r\n') && !struct.xref.content.includes('\n')) {
    warnings.push('XRef table may be missing proper line endings');
  }

  // Check object/endobj pairing
  const objCount = (pdfText.match(/\d+ 0 obj/g) || []).length;
  const endobjCount = (pdfText.match(/endobj/g) || []).length;
  if (objCount !== endobjCount) {
    errors.push(`Object/endobj mismatch: ${objCount} obj vs ${endobjCount} endobj`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
