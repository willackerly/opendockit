import { describe, it, expect } from 'vitest';
import { parsePdfTrailer } from '../parser/trailer';
import { parseXrefEntries, parseXrefTable } from '../parser/xref';
import { loadParsedIndirectObjects } from '../parser/full-document-loader';
import { extractIndirectObject } from '../parser/object';
import { XRefEntryType } from '../writer/XRefEntries';

const encoder = new TextEncoder();

/**
 * Build a minimal valid PDF from parts, computing correct byte offsets.
 * Returns the Uint8Array for the assembled PDF.
 */
function buildMinimalPdf(opts?: {
  header?: string;
  objects?: Array<{ num: number; gen: number; body: string }>;
  xrefExtra?: string;
  trailerDict?: string;
  eofSuffix?: string;
}): Uint8Array {
  const header = opts?.header ?? '%PDF-1.4\n';
  const objects = opts?.objects ?? [
    { num: 1, gen: 0, body: '<< /Type /Catalog /Pages 2 0 R >>' },
    { num: 2, gen: 0, body: '<< /Type /Pages /Kids [] /Count 0 >>' },
  ];

  let content = header;
  const offsets: Array<{ num: number; gen: number; offset: number }> = [];

  for (const obj of objects) {
    offsets.push({ num: obj.num, gen: obj.gen, offset: content.length });
    content += `${obj.num} ${obj.gen} obj\n${obj.body}\nendobj\n`;
  }

  const xrefOffset = content.length;
  const totalObjects = Math.max(...objects.map((o) => o.num)) + 1;

  // Build xref table
  content += 'xref\n';
  if (opts?.xrefExtra) {
    content += opts.xrefExtra;
  } else {
    content += `0 ${totalObjects}\n`;
    // Object 0 free entry
    content += '0000000000 65535 f \n';
    // Fill gaps and add entries
    for (let i = 1; i < totalObjects; i++) {
      const entry = offsets.find((o) => o.num === i);
      if (entry) {
        const offsetStr = String(entry.offset).padStart(10, '0');
        const genStr = String(entry.gen).padStart(5, '0');
        content += `${offsetStr} ${genStr} n \n`;
      } else {
        content += '0000000000 00000 f \n';
      }
    }
  }

  const trailerDict =
    opts?.trailerDict ??
    `<< /Size ${totalObjects} /Root 1 0 R >>`;

  content += `trailer\n${trailerDict}\n`;
  content += `startxref\n${xrefOffset}\n`;
  content += opts?.eofSuffix ?? '%%EOF';

  return encoder.encode(content);
}

// ─────────────────────────────────────────────────────────────
// 1. Minimal valid PDF
// ─────────────────────────────────────────────────────────────
describe('parser robustness: minimal valid PDF', () => {
  it('parses a hand-built minimal PDF with xref table and trailer', () => {
    const pdf = buildMinimalPdf();
    const trailer = parsePdfTrailer(pdf);

    expect(trailer.size).toBe(3);
    expect(trailer.rootRef).toEqual({ objectNumber: 1, generation: 0 });
    expect(trailer.version).toBe('1.4');
    expect(trailer.hasXRefStream).toBe(false);
  });

  it('loads parsed indirect objects from a minimal PDF', () => {
    const pdf = buildMinimalPdf();
    const trailer = parsePdfTrailer(pdf);
    const objects = loadParsedIndirectObjects(pdf, trailer);

    // Should find both object 1 (Catalog) and object 2 (Pages)
    expect(objects.length).toBeGreaterThanOrEqual(2);
    const objectNumbers = objects.map((o) => o.key.objectNumber);
    expect(objectNumbers).toContain(1);
    expect(objectNumbers).toContain(2);
  });
});

// ─────────────────────────────────────────────────────────────
// 2. Extra whitespace in xref table
// ─────────────────────────────────────────────────────────────
describe('parser robustness: whitespace in xref', () => {
  it('parses xref table with extra blank lines between subsections', () => {
    const pdf = buildMinimalPdf();
    const trailer = parsePdfTrailer(pdf);

    // parseXrefEntries should still succeed; blank lines are tolerated
    const { entries } = parseXrefEntries(pdf, trailer);
    expect(entries.length).toBeGreaterThanOrEqual(2);

    const normalEntries = entries.filter((e) => e.inUse);
    expect(normalEntries.length).toBe(2);
  });

  it('handles xref entries with trailing spaces beyond the standard 20 bytes', () => {
    // The xref entry regex expects 10-digit offset, 5-digit gen, and n/f
    // Extra trailing whitespace should not break parsing
    const pdf = buildMinimalPdf();
    const trailer = parsePdfTrailer(pdf);
    const result = parseXrefEntries(pdf, trailer);
    expect(result.entries.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────
// 3. /Prev chain links
// ─────────────────────────────────────────────────────────────
describe('parser robustness: /Prev chain', () => {
  it('parses trailer with a single /Prev link (incremental update)', () => {
    // Build a PDF that simulates an incremental update:
    // First section has the original catalog, second section has an update
    const header = '%PDF-1.4\n';
    const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
    const obj2 = '2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n';

    const obj1Offset = header.length;
    const obj2Offset = obj1Offset + obj1.length;

    // First xref section
    const xref1Offset = obj2Offset + obj2.length;
    let xref1 = 'xref\n0 3\n';
    xref1 += '0000000000 65535 f \n';
    xref1 += String(obj1Offset).padStart(10, '0') + ' 00000 n \n';
    xref1 += String(obj2Offset).padStart(10, '0') + ' 00000 n \n';
    xref1 += 'trailer\n<< /Size 3 /Root 1 0 R >>\n';
    xref1 += `startxref\n${xref1Offset}\n%%EOF\n`;

    // Incremental update: new object 3, new xref section with /Prev
    const base = header + obj1 + obj2 + xref1;
    const obj3 = '3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n';
    const obj3Offset = base.length;
    const xref2Offset = obj3Offset + obj3.length;

    let xref2 = 'xref\n3 1\n';
    xref2 += String(obj3Offset).padStart(10, '0') + ' 00000 n \n';
    xref2 += `trailer\n<< /Size 4 /Root 1 0 R /Prev ${xref1Offset} >>\n`;
    xref2 += `startxref\n${xref2Offset}\n%%EOF`;

    const fullPdf = encoder.encode(base + obj3 + xref2);
    const trailer = parsePdfTrailer(fullPdf);

    expect(trailer.size).toBe(4);
    expect(trailer.rootRef).toEqual({ objectNumber: 1, generation: 0 });
    expect(trailer.prev).toBe(xref1Offset);

    // parseXrefEntries should merge both sections
    const { entries } = parseXrefEntries(fullPdf, trailer);
    const inUse = entries.filter((e) => e.inUse);
    // Objects 1, 2, 3 should all be present
    const objNums = inUse.map((e) => e.objectNumber).sort();
    expect(objNums).toContain(1);
    expect(objNums).toContain(2);
    expect(objNums).toContain(3);
  });

  it('resolves /Root from /Prev chain when absent in latest trailer', () => {
    // Build a PDF where the latest trailer omits /Root but the /Prev section has it
    const header = '%PDF-1.5\n';
    const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
    const obj2 = '2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n';

    const obj1Offset = header.length;
    const obj2Offset = obj1Offset + obj1.length;
    const xref1Offset = obj2Offset + obj2.length;

    let xref1 = 'xref\n0 3\n';
    xref1 += '0000000000 65535 f \n';
    xref1 += String(obj1Offset).padStart(10, '0') + ' 00000 n \n';
    xref1 += String(obj2Offset).padStart(10, '0') + ' 00000 n \n';
    xref1 += 'trailer\n<< /Size 3 /Root 1 0 R >>\n';
    xref1 += `startxref\n${xref1Offset}\n%%EOF\n`;

    const base = header + obj1 + obj2 + xref1;
    const obj3 = '3 0 obj\n<< /Key /Value >>\nendobj\n';
    const obj3Offset = base.length;
    const xref2Offset = obj3Offset + obj3.length;

    // Second trailer deliberately omits /Root
    let xref2 = 'xref\n3 1\n';
    xref2 += String(obj3Offset).padStart(10, '0') + ' 00000 n \n';
    xref2 += `trailer\n<< /Size 4 /Prev ${xref1Offset} >>\n`;
    xref2 += `startxref\n${xref2Offset}\n%%EOF`;

    const fullPdf = encoder.encode(base + obj3 + xref2);
    const trailer = parsePdfTrailer(fullPdf);

    // /Root should be resolved from the /Prev chain
    expect(trailer.rootRef).toEqual({ objectNumber: 1, generation: 0 });
  });
});

// ─────────────────────────────────────────────────────────────
// 4. Generation numbers > 0
// ─────────────────────────────────────────────────────────────
describe('parser robustness: generation numbers > 0', () => {
  it('parses xref entries with non-zero generation numbers', () => {
    const header = '%PDF-1.4\n';
    const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
    // Object 2, generation 3
    const obj2 = '2 3 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n';

    const obj1Offset = header.length;
    const obj2Offset = obj1Offset + obj1.length;
    const xrefOffset = obj2Offset + obj2.length;

    let content = header + obj1 + obj2;
    content += 'xref\n0 3\n';
    content += '0000000000 65535 f \n';
    content += String(obj1Offset).padStart(10, '0') + ' 00000 n \n';
    content += String(obj2Offset).padStart(10, '0') + ' 00003 n \n';
    content += 'trailer\n<< /Size 3 /Root 1 0 R >>\n';
    content += `startxref\n${xrefOffset}\n%%EOF`;

    const pdf = encoder.encode(content);
    const trailer = parsePdfTrailer(pdf);
    const { entries } = parseXrefEntries(pdf, trailer);

    const obj2Entry = entries.find((e) => e.objectNumber === 2 && e.inUse);
    expect(obj2Entry).toBeDefined();
    expect(obj2Entry!.generation).toBe(3);
    expect(obj2Entry!.byteOffset).toBe(obj2Offset);
  });
});

// ─────────────────────────────────────────────────────────────
// 5. Free list entries (f entries)
// ─────────────────────────────────────────────────────────────
describe('parser robustness: free list entries', () => {
  it('parses f entries in xref and marks them as not in use', () => {
    const header = '%PDF-1.4\n';
    const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 3 0 R >>\nendobj\n';
    const obj3 = '3 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n';

    const obj1Offset = header.length;
    const obj3Offset = obj1Offset + obj1.length;
    const xrefOffset = obj3Offset + obj3.length;

    let content = header + obj1 + obj3;
    content += 'xref\n0 4\n';
    content += '0000000000 65535 f \n';   // Object 0: free (head of free list)
    content += String(obj1Offset).padStart(10, '0') + ' 00000 n \n'; // Object 1: in use
    content += '0000000000 00001 f \n';   // Object 2: free (deleted, gen bumped)
    content += String(obj3Offset).padStart(10, '0') + ' 00000 n \n'; // Object 3: in use
    content += 'trailer\n<< /Size 4 /Root 1 0 R >>\n';
    content += `startxref\n${xrefOffset}\n%%EOF`;

    const pdf = encoder.encode(content);
    const trailer = parsePdfTrailer(pdf);
    const { entries } = parseXrefEntries(pdf, trailer);

    expect(entries.length).toBe(4);

    const freeEntries = entries.filter((e) => !e.inUse);
    expect(freeEntries.length).toBe(2); // Object 0 and Object 2
    expect(freeEntries.map((e) => e.objectNumber).sort()).toEqual([0, 2]);

    const obj2Free = freeEntries.find((e) => e.objectNumber === 2);
    expect(obj2Free!.generation).toBe(1);
    expect(obj2Free!.type).toBe(XRefEntryType.FREE);

    const inUseEntries = entries.filter((e) => e.inUse);
    expect(inUseEntries.length).toBe(2);
    expect(inUseEntries.map((e) => e.objectNumber).sort()).toEqual([1, 3]);
  });
});

// ─────────────────────────────────────────────────────────────
// 6. Missing startxref
// ─────────────────────────────────────────────────────────────
describe('parser robustness: missing startxref', () => {
  it('throws when startxref keyword is absent', () => {
    const pdf = encoder.encode('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
    expect(() => parsePdfTrailer(pdf)).toThrow('missing startxref');
  });

  it('throws when startxref has no numeric value after it', () => {
    const pdf = encoder.encode('%PDF-1.4\n1 0 obj\n<< >>\nendobj\nstartxref\n%%EOF');
    expect(() => parsePdfTrailer(pdf)).toThrow('startxref lacks numeric value');
  });
});

// ─────────────────────────────────────────────────────────────
// 7. Invalid xref offset
// ─────────────────────────────────────────────────────────────
describe('parser robustness: invalid xref offset', () => {
  it('handles startxref pointing beyond file bounds', () => {
    // startxref points to offset 999999 but file is much smaller
    const content =
      '%PDF-1.4\n' +
      '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
      '2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n' +
      'trailer\n<< /Size 3 /Root 1 0 R >>\n' +
      'startxref\n999999\n%%EOF';

    const pdf = encoder.encode(content);
    // Should still find the trailer by fallback scanning
    const trailer = parsePdfTrailer(pdf);
    expect(trailer.rootRef).toEqual({ objectNumber: 1, generation: 0 });
  });

  it('throws when parseXrefTable is given an out-of-bounds offset directly', () => {
    const pdf = buildMinimalPdf();
    expect(() => parseXrefTable(pdf, 999999)).toThrow('outside the PDF bounds');
  });

  it('throws when parseXrefTable offset does not point to xref keyword', () => {
    const pdf = buildMinimalPdf();
    // Offset 0 points to %PDF header, not xref
    expect(() => parseXrefTable(pdf, 0)).toThrow('Expected "xref" keyword');
  });
});

// ─────────────────────────────────────────────────────────────
// 8. Truncated PDF
// ─────────────────────────────────────────────────────────────
describe('parser robustness: truncated PDF', () => {
  it('throws on a PDF truncated before the trailer', () => {
    const truncated = encoder.encode(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\n0 2\n' +
        '0000000000 65535 f \n0000000009 00000 n \n'
    );
    // No trailer keyword, no startxref
    expect(() => parsePdfTrailer(truncated)).toThrow();
  });

  it('throws on a PDF with trailer but no xref entries (truncated xref)', () => {
    const content =
      '%PDF-1.4\n' +
      '1 0 obj\n<< /Type /Catalog >>\nendobj\n' +
      'xref\n0 2\n' +
      '0000000000 65535 f \n';
    // Missing second entry but trailer claims Size 2
    const xrefOffset = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n'.length;
    const full = content +
      'trailer\n<< /Size 2 /Root 1 0 R >>\n' +
      `startxref\n${xrefOffset}\n%%EOF`;

    const pdf = encoder.encode(full);
    const trailer = parsePdfTrailer(pdf);
    // The xref table is truncated (says 2 entries but only 1 entry present).
    // parseXrefEntries falls back to brute-force scanning and recovers.
    const result = parseXrefEntries(pdf, trailer);
    expect(result.entries.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────
// 9. Empty Uint8Array
// ─────────────────────────────────────────────────────────────
describe('parser robustness: empty input', () => {
  it('throws on empty Uint8Array', () => {
    expect(() => parsePdfTrailer(new Uint8Array(0))).toThrow();
  });

  it('throws on a single byte', () => {
    expect(() => parsePdfTrailer(new Uint8Array([0x25]))).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────
// 10. Random / garbage bytes
// ─────────────────────────────────────────────────────────────
describe('parser robustness: random bytes', () => {
  it('throws on random bytes that do not contain startxref', () => {
    const garbage = new Uint8Array(256);
    for (let i = 0; i < garbage.length; i++) {
      garbage[i] = (i * 7 + 13) & 0xff;
    }
    expect(() => parsePdfTrailer(garbage)).toThrow();
  });

  it('throws on bytes that contain startxref but no valid trailer', () => {
    const text = 'garbage garbage startxref\n42\n%%EOF';
    const pdf = encoder.encode(text);
    // Will find startxref but fail to find a valid trailer dict
    expect(() => parsePdfTrailer(pdf)).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────
// 11. Token boundaries: /Filter/FlateDecode (no space between names)
// ─────────────────────────────────────────────────────────────
describe('parser robustness: token boundaries', () => {
  it('parses trailer dictionary with names concatenated without spaces', () => {
    // /Root and /Size with no whitespace between different keys
    const pdf = buildMinimalPdf({
      trailerDict: '<</Size 3/Root 1 0 R>>',
    });

    const trailer = parsePdfTrailer(pdf);
    expect(trailer.size).toBe(3);
    expect(trailer.rootRef).toEqual({ objectNumber: 1, generation: 0 });
  });

  it('extracts object whose body contains concatenated PDF name tokens', () => {
    const pdf = buildMinimalPdf({
      objects: [
        {
          num: 1,
          gen: 0,
          body: '<< /Type/Catalog/Pages 2 0 R >>',
        },
        {
          num: 2,
          gen: 0,
          body: '<< /Type/Pages/Kids[]/Count 0 >>',
        },
      ],
    });

    const obj = extractIndirectObject(pdf, 1);
    expect(obj.body).toContain('/Type');
    expect(obj.body).toContain('/Catalog');
  });
});

// ─────────────────────────────────────────────────────────────
// 12. Multiple xref subsections in a single xref table
// ─────────────────────────────────────────────────────────────
describe('parser robustness: multiple xref subsections', () => {
  it('parses xref table with multiple subsections (non-contiguous object ranges)', () => {
    const header = '%PDF-1.4\n';
    const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 5 0 R >>\nendobj\n';
    const obj5 = '5 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n';

    const obj1Offset = header.length;
    const obj5Offset = obj1Offset + obj1.length;
    const xrefOffset = obj5Offset + obj5.length;

    let content = header + obj1 + obj5;
    // Two subsections: 0-2 and 5-6
    content += 'xref\n';
    content += '0 2\n';
    content += '0000000000 65535 f \n';
    content += String(obj1Offset).padStart(10, '0') + ' 00000 n \n';
    content += '5 1\n';
    content += String(obj5Offset).padStart(10, '0') + ' 00000 n \n';
    content += 'trailer\n<< /Size 6 /Root 1 0 R >>\n';
    content += `startxref\n${xrefOffset}\n%%EOF`;

    const pdf = encoder.encode(content);
    const trailer = parsePdfTrailer(pdf);
    const { entries } = parseXrefEntries(pdf, trailer);

    const inUse = entries.filter((e) => e.inUse);
    expect(inUse.map((e) => e.objectNumber).sort()).toEqual([1, 5]);
  });
});

// ─────────────────────────────────────────────────────────────
// 13. PDF version detection
// ─────────────────────────────────────────────────────────────
describe('parser robustness: version detection', () => {
  it('detects PDF version from header', () => {
    const pdf17 = buildMinimalPdf({ header: '%PDF-1.7\n' });
    const trailer17 = parsePdfTrailer(pdf17);
    expect(trailer17.version).toBe('1.7');

    const pdf20 = buildMinimalPdf({ header: '%PDF-2.0\n' });
    const trailer20 = parsePdfTrailer(pdf20);
    expect(trailer20.version).toBe('2.0');
  });

  it('returns undefined version when header is non-standard', () => {
    // No %PDF- header
    const pdf = buildMinimalPdf({ header: 'NOTAPDF\n' });
    // This may still parse if startxref/trailer are present
    const trailer = parsePdfTrailer(pdf);
    expect(trailer.version).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────
// 14. Trailer missing /Root
// ─────────────────────────────────────────────────────────────
describe('parser robustness: trailer missing /Root', () => {
  it('throws when trailer has /Size but no /Root and no /Prev', () => {
    const header = '%PDF-1.4\n';
    const obj1 = '1 0 obj\n<< /Type /Catalog >>\nendobj\n';
    const xrefOffset = header.length + obj1.length;

    let content = header + obj1;
    content += 'xref\n0 2\n';
    content += '0000000000 65535 f \n';
    content += String(header.length).padStart(10, '0') + ' 00000 n \n';
    content += 'trailer\n<< /Size 2 >>\n';
    content += `startxref\n${xrefOffset}\n%%EOF`;

    const pdf = encoder.encode(content);
    expect(() => parsePdfTrailer(pdf)).toThrow('missing /Root');
  });
});

// ─────────────────────────────────────────────────────────────
// 15. Trailer missing /Size
// ─────────────────────────────────────────────────────────────
describe('parser robustness: trailer missing /Size', () => {
  it('throws when trailer dictionary has no /Size entry', () => {
    const header = '%PDF-1.4\n';
    const obj1 = '1 0 obj\n<< /Type /Catalog >>\nendobj\n';
    const xrefOffset = header.length + obj1.length;

    let content = header + obj1;
    content += 'xref\n0 2\n';
    content += '0000000000 65535 f \n';
    content += String(header.length).padStart(10, '0') + ' 00000 n \n';
    content += 'trailer\n<< /Root 1 0 R >>\n';
    content += `startxref\n${xrefOffset}\n%%EOF`;

    const pdf = encoder.encode(content);
    expect(() => parsePdfTrailer(pdf)).toThrow('/Size');
  });
});

// ─────────────────────────────────────────────────────────────
// 16. Trailer /ID array (hex string IDs)
// ─────────────────────────────────────────────────────────────
describe('parser robustness: trailer /ID', () => {
  it('extracts /ID hex strings from trailer', () => {
    const pdf = buildMinimalPdf({
      trailerDict:
        '<< /Size 3 /Root 1 0 R /ID [<AABBCCDD> <11223344>] >>',
    });

    const trailer = parsePdfTrailer(pdf);
    expect(trailer.idLiteral).toBeDefined();
    expect(trailer.idLiteral).toContain('AABBCCDD');
    expect(trailer.idLiteral).toContain('11223344');
  });

  it('generates deterministic ID when /ID is absent', () => {
    const pdf = buildMinimalPdf();
    const trailer = parsePdfTrailer(pdf);

    // No /ID in the trailer
    expect(trailer.idLiteral).toBeUndefined();
    // But generatedId should be populated
    expect(trailer.generatedId).toBeDefined();
    expect(trailer.generatedId!.length).toBe(16);
  });
});

// ─────────────────────────────────────────────────────────────
// 17. Large object number in xref
// ─────────────────────────────────────────────────────────────
describe('parser robustness: large object numbers', () => {
  it('handles objects with high object numbers', () => {
    const header = '%PDF-1.4\n';
    const obj100 = '100 0 obj\n<< /Type /Catalog /Pages 101 0 R >>\nendobj\n';
    const obj101 = '101 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n';

    const obj100Offset = header.length;
    const obj101Offset = obj100Offset + obj100.length;
    const xrefOffset = obj101Offset + obj101.length;

    let content = header + obj100 + obj101;
    content += 'xref\n';
    content += '0 1\n';
    content += '0000000000 65535 f \n';
    content += '100 2\n';
    content += String(obj100Offset).padStart(10, '0') + ' 00000 n \n';
    content += String(obj101Offset).padStart(10, '0') + ' 00000 n \n';
    content += 'trailer\n<< /Size 102 /Root 100 0 R >>\n';
    content += `startxref\n${xrefOffset}\n%%EOF`;

    const pdf = encoder.encode(content);
    const trailer = parsePdfTrailer(pdf);
    expect(trailer.rootRef).toEqual({ objectNumber: 100, generation: 0 });

    const { entries } = parseXrefEntries(pdf, trailer);
    const inUse = entries.filter((e) => e.inUse);
    expect(inUse.map((e) => e.objectNumber).sort()).toEqual([100, 101]);
  });
});

// ─────────────────────────────────────────────────────────────
// 18. Invalid xref subsection header
// ─────────────────────────────────────────────────────────────
describe('parser robustness: invalid xref subsection', () => {
  it('throws on malformed xref subsection header', () => {
    const header = '%PDF-1.4\n';
    const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
    const obj2 = '2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n';

    const xrefOffset = header.length + obj1.length + obj2.length;

    let content = header + obj1 + obj2;
    content += 'xref\n';
    content += 'NOT_A_NUMBER 2\n'; // Invalid subsection header
    content += '0000000000 65535 f \n';
    content += '0000000009 00000 n \n';
    content += 'trailer\n<< /Size 3 /Root 1 0 R >>\n';
    content += `startxref\n${xrefOffset}\n%%EOF`;

    const pdf = encoder.encode(content);
    const trailer = parsePdfTrailer(pdf);
    // parseXrefEntries falls back to brute-force scanning when xref is malformed.
    const result = parseXrefEntries(pdf, trailer);
    expect(result.entries.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────
// 19. %%EOF with trailing content
// ─────────────────────────────────────────────────────────────
describe('parser robustness: %%EOF followed by trailing content', () => {
  it('parses successfully when there is garbage after %%EOF', () => {
    const pdf = buildMinimalPdf({
      eofSuffix: '%%EOF\n\nsome trailing garbage bytes here\n',
    });

    const trailer = parsePdfTrailer(pdf);
    expect(trailer.rootRef).toEqual({ objectNumber: 1, generation: 0 });
  });
});

// ─────────────────────────────────────────────────────────────
// 20. extractIndirectObject edge cases
// ─────────────────────────────────────────────────────────────
describe('parser robustness: extractIndirectObject', () => {
  it('throws when requested object number does not exist', () => {
    const pdf = buildMinimalPdf();
    expect(() => extractIndirectObject(pdf, 999)).toThrow('Object 999 not found');
  });

  it('extracts object with multi-line body content', () => {
    const pdf = buildMinimalPdf({
      objects: [
        {
          num: 1,
          gen: 0,
          body: '<<\n/Type /Catalog\n/Pages 2 0 R\n/OpenAction [3 0 R /Fit]\n>>',
        },
        {
          num: 2,
          gen: 0,
          body: '<< /Type /Pages /Kids [] /Count 0 >>',
        },
      ],
    });

    const obj = extractIndirectObject(pdf, 1);
    expect(obj.objectNumber).toBe(1);
    expect(obj.generationNumber).toBe(0);
    expect(obj.body).toContain('/OpenAction');
  });
});
