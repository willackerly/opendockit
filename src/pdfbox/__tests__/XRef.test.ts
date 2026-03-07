/**
 * Tests for XRef Table Formatting
 *
 * Verifies that our xref formatting matches PDFBox EXACTLY.
 * PDF xref format is VERY strict (ISO 32000-1:2008 Section 7.5.4)
 */

import { describe, it, expect } from 'vitest';
import {
  formatXrefOffset,
  formatXrefGeneration,
  writeXrefEntry,
  writeXrefTable,
} from '../writer/XRefWriter';
import type { TableXRefEntry } from '../writer/XRefEntries';
import { COSStandardOutputStream } from '../writer/COSStandardOutputStream';

function parseXrefPayload(raw: string): Array<{ objectNumber: number; line: string }> {
  const lines = raw.split('\n').map((line) => line.trimEnd());
  const entries: Array<{ objectNumber: number; line: string }> = [];
  let currentObject = -1;
  let remaining = 0;
  for (const line of lines) {
    if (/^\d+\s+\d+$/.test(line)) {
      const [start, count] = line.split(/\s+/).map((value) => Number(value));
      currentObject = start;
      remaining = count;
      continue;
    }
    if (/^\d{10}\s+\d{5}\s+[nf]/.test(line) && currentObject >= 0) {
      entries.push({ objectNumber: currentObject, line });
      currentObject += 1;
      remaining -= 1;
      if (remaining === 0) {
        currentObject = -1;
      }
    }
  }
  return entries;
}

describe('XRef Offset Formatting', () => {
  it('should format offsets with 10 digits', () => {
    // PDFBox: "0000000123"
    expect(formatXrefOffset(123)).toBe('0000000123');
  });

  it('should handle zero', () => {
    expect(formatXrefOffset(0)).toBe('0000000000');
  });

  it('should handle large offsets', () => {
    // PDFBox: "9999999999"
    expect(formatXrefOffset(9999999999)).toBe('9999999999');
  });

  it('should pad with leading zeros', () => {
    expect(formatXrefOffset(1)).toBe('0000000001');
    expect(formatXrefOffset(42)).toBe('0000000042');
    expect(formatXrefOffset(1234567)).toBe('0001234567');
  });

  it('should throw on negative offsets', () => {
    expect(() => formatXrefOffset(-1)).toThrow();
  });

  it('should throw on too-large offsets', () => {
    expect(() => formatXrefOffset(10000000000)).toThrow();
  });
});

describe('XRef Generation Formatting', () => {
  it('should format generation with 5 digits', () => {
    // PDFBox: "00000"
    expect(formatXrefGeneration(0)).toBe('00000');
  });

  it('should handle non-zero generations', () => {
    expect(formatXrefGeneration(1)).toBe('00001');
    expect(formatXrefGeneration(42)).toBe('00042');
    expect(formatXrefGeneration(99999)).toBe('99999');
  });

  it('should throw on negative generations', () => {
    expect(() => formatXrefGeneration(-1)).toThrow();
  });

  it('should throw on too-large generations', () => {
    expect(() => formatXrefGeneration(100000)).toThrow();
  });
});

describe('XRef Entry Writing', () => {
  it('should write in-use entry with correct format', () => {
    // PDFBox format: "0000001234 00000 n\r\n"
    // Total: exactly 20 bytes
    const output = new COSStandardOutputStream();
    const entry: XRefEntry = {
      objectNumber: 1,
      byteOffset: 1234,
      generation: 0,
      inUse: true,
    };

    writeXrefEntry(output, entry);

    const result = new TextDecoder('iso-8859-1').decode(output.toUint8Array());
    expect(result).toBe('0000001234 00000 n\r\n');
    expect(output.size()).toBe(20); // Exactly 20 bytes
  });

  it('should write free entry with f flag', () => {
    // PDFBox format: "0000000000 65535 f \n"
    const output = new COSStandardOutputStream();
    const entry: XRefEntry = {
      objectNumber: 0,
      byteOffset: 0,
      generation: 65535,
      inUse: false,
    };

    writeXrefEntry(output, entry);

    const result = new TextDecoder('iso-8859-1').decode(output.toUint8Array());
    expect(result).toBe('0000000000 65535 f\r\n');
  });

  it('should write multiple entries', () => {
    const output = new COSStandardOutputStream();

    const entries: TableXRefEntry[] = [
      { objectNumber: 0, byteOffset: 0, generation: 65535, inUse: false },
      { objectNumber: 1, byteOffset: 18, generation: 0, inUse: true },
      { objectNumber: 2, byteOffset: 123, generation: 0, inUse: true },
    ];

    entries.forEach(entry => writeXrefEntry(output, entry));

    const result = new TextDecoder('iso-8859-1').decode(output.toUint8Array());
    const lines = result.split('\r\n').filter(l => l.length > 0);

    expect(lines.length).toBe(3);
    expect(lines[0]).toBe('0000000000 65535 f');
    expect(lines[1]).toBe('0000000018 00000 n');
    expect(lines[2]).toBe('0000000123 00000 n');
  });
});

describe('XRef Table Writing', () => {
  it('should write simple xref table', () => {
    // PDFBox format:
    // xref\n
    // 0 3\n
    // 0000000000 65535 f \r\n
    // 0000000018 00000 n \r\n
    // 0000000123 00000 n \r\n

    const output = new COSStandardOutputStream();

    const entries: TableXRefEntry[] = [
      { objectNumber: 0, byteOffset: 0, generation: 65535, inUse: false },
      { objectNumber: 1, byteOffset: 18, generation: 0, inUse: true },
      { objectNumber: 2, byteOffset: 123, generation: 0, inUse: true },
    ];

    writeXrefTable(output, entries);

    const result = new TextDecoder('iso-8859-1').decode(output.toUint8Array());

    expect(result).toContain('xref');
    expect(result).toContain('0 3'); // Start at 0, 3 entries
    expect(result).toContain('0000000000 65535 f\r\n');
    expect(result).toContain('0000000018 00000 n\r\n');
    expect(result).toContain('0000000123 00000 n\r\n');
  });

  it('should fill gaps when writing non-consecutive entries', () => {
    // When objects aren't consecutive, PDFBox creates multiple subsections
    const output = new COSStandardOutputStream();

    const entries: TableXRefEntry[] = [
      { objectNumber: 0, byteOffset: 0, generation: 65535, inUse: false },
      { objectNumber: 5, byteOffset: 1234, generation: 0, inUse: true },
      { objectNumber: 6, byteOffset: 2345, generation: 0, inUse: true },
    ];

    writeXrefTable(output, entries);

    const result = new TextDecoder('iso-8859-1').decode(output.toUint8Array());
    const parsed = parseXrefPayload(result);

    expect(result).toContain('0 7');
    expect(parsed.map((entry) => entry.objectNumber)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('should sort entries by object number', () => {
    const output = new COSStandardOutputStream();

    // Provide entries out of order
    const entries: TableXRefEntry[] = [
      { objectNumber: 2, byteOffset: 123, generation: 0, inUse: true },
      { objectNumber: 0, byteOffset: 0, generation: 65535, inUse: false },
      { objectNumber: 1, byteOffset: 18, generation: 0, inUse: true },
    ];

    writeXrefTable(output, entries);

    const result = new TextDecoder('iso-8859-1').decode(output.toUint8Array());
    const lines = result.split('\n').filter(l => l.includes('00000'));

    // Should be sorted: 0, 1, 2
    expect(lines[0]).toContain('0000000000'); // Object 0
    expect(lines[1]).toContain('0000000018'); // Object 1
    expect(lines[2]).toContain('0000000123'); // Object 2
  });

  it('fills gaps with linked free entries for non-incremental tables', () => {
    const output = new COSStandardOutputStream();
    const entries: TableXRefEntry[] = [
      { objectNumber: 1, byteOffset: 18, generation: 0, inUse: true },
      { objectNumber: 4, byteOffset: 500, generation: 0, inUse: true },
    ];

    writeXrefTable(output, entries, { incremental: false });
    const parsed = parseXrefPayload(new TextDecoder('iso-8859-1').decode(output.toUint8Array()));

    expect(parsed.map((entry) => entry.objectNumber)).toEqual([0, 1, 2, 3, 4]);
    expect(parsed.find((entry) => entry.objectNumber === 0)?.line.startsWith('0000000002')).toBe(
      true
    );
    expect(parsed.find((entry) => entry.objectNumber === 2)?.line.startsWith('0000000003')).toBe(
      true
    );
    expect(parsed.find((entry) => entry.objectNumber === 3)?.line.startsWith('0000000000')).toBe(
      true
    );
  });

  it('preserves minimal subsections for incremental tables', () => {
    const output = new COSStandardOutputStream();
    const entries: XRefEntry[] = [
      { objectNumber: 5, byteOffset: 1234, generation: 0, inUse: true },
      // builder may omit the null entry; writer should inject it.
    ];

    writeXrefTable(output, entries, { incremental: true });
    const parsed = parseXrefPayload(new TextDecoder('iso-8859-1').decode(output.toUint8Array()));

    expect(parsed.map((entry) => entry.objectNumber)).toEqual([0, 5]);
    expect(parsed[0].line.startsWith('0000000000')).toBe(true);
    expect(parsed[1].line.startsWith('0000001234')).toBe(true);
  });
});

describe('Incremental Update XRef', () => {
  it('should handle incremental update xref for signatures', () => {
    // When adding signature, we typically add 2 new objects to existing PDF
    // PDFBox format:
    // xref\n
    // 0 1\n
    // 0000000000 65535 f \r\n
    // 63 2\n
    // 0000012345 00000 n \r\n
    // 0000023456 00000 n \r\n

    const output = new COSStandardOutputStream();

    const entries: XRefEntry[] = [
      { objectNumber: 0, byteOffset: 0, generation: 65535, inUse: false },
      { objectNumber: 63, byteOffset: 12345, generation: 0, inUse: true }, // Signature dict
      { objectNumber: 64, byteOffset: 23456, generation: 0, inUse: true }, // Signature field
    ];

    writeXrefTable(output, entries, { incremental: true });

    const result = new TextDecoder('iso-8859-1').decode(output.toUint8Array());

    expect(result).toContain('0 1'); // Object 0 (required free entry)
    expect(result).toContain('63 2'); // Objects 63-64
    expect(result).toContain('0000012345 00000 n');
    expect(result).toContain('0000023456 00000 n');
  });
});

describe('XRef Format Compliance', () => {
  it('should use exact 20-byte entry format', () => {
    const output = new COSStandardOutputStream();
    const entry: XRefEntry = {
      objectNumber: 1,
      byteOffset: 123,
      generation: 0,
      inUse: true,
    };

    writeXrefEntry(output, entry);

    // PDF spec requires EXACTLY 20 bytes per entry (including CRLF)
    expect(output.size()).toBe(20);
  });

  it('should use CRLF for line ending', () => {
    const output = new COSStandardOutputStream();
    const entry: XRefEntry = {
      objectNumber: 1,
      byteOffset: 123,
      generation: 0,
      inUse: true,
    };

    writeXrefEntry(output, entry);

    const bytes = output.toUint8Array();
    // Last byte should be \n (0x0a)
    expect(bytes[bytes.length - 1]).toBe(0x0a); // \n
    // Second to last should be \r (0x0d)
    expect(bytes[bytes.length - 2]).toBe(0x0d); // \r
  });
});
