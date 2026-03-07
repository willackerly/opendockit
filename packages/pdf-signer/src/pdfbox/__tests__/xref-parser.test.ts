import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parseXrefTable, parseXrefEntries } from '../parser/xref';
import { parsePdfTrailer } from '../parser/trailer';

const SAMPLE_PDF = new TextEncoder().encode(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< >>
endobj
xref
0 3
0000000000 65535 f 
0000000010 00000 n 
0000000060 00000 n 
trailer
<< /Size 3 /Root 1 0 R >>
startxref
79
%%EOF
`);

describe('parseXrefTable', () => {
  it('parses traditional xref tables into entries', () => {
    const { entries } = parseXrefTable(SAMPLE_PDF, 79);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({ objectNumber: 0, inUse: false });
    expect(entries[1]).toMatchObject({ objectNumber: 1, byteOffset: 10 });
    expect(entries[2]).toMatchObject({ objectNumber: 2, byteOffset: 60 });
  });

  it('throws on malformed xref sections', () => {
    expect(() => parseXrefTable(SAMPLE_PDF, 20)).toThrow(
      /Expected "xref" keyword/
    );
  });
});

describe('parseXrefEntries with xref stream', () => {
  it('parses xref stream entries from object-stream fixture', () => {
    const pdfPath = path.join(
      process.cwd(),
      'test-pdfs',
      'working',
      'object-stream.pdf'
    );
    const bytes = readFileSync(pdfPath);
    const trailer = parsePdfTrailer(bytes);
    expect(trailer.hasXRefStream).toBe(true);
    const { entries } = parseXrefEntries(bytes, trailer);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].objectNumber).toBe(0);
  });
});
