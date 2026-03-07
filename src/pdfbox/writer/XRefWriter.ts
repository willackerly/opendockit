/**
 * XRefWriter - PDF Cross-Reference Table Formatting
 *
 * =============================================================================
 * PORTED FROM: Apache PDFBox COSWriter.java xref methods
 * Source: pdfbox/src/main/java/org/apache/pdfbox/pdfwriter/COSWriter.java
 * Lines: 172-177 (formatters), 993-1011 (writers)
 * =============================================================================
 *
 * PDF xref (cross-reference) tables track byte offsets of all objects.
 * Format is VERY strict per ISO 32000-1:2008 Section 7.5.4:
 *
 * xref
 * 0 6
 * 0000000000 65535 f
 * 0000000018 00000 n
 * 0000000077 00000 n
 * ...
 * trailer
 * << /Size 6 /Root 1 0 R >>
 * startxref
 * 1234
 * %%EOF
 *
 * Each entry is EXACTLY 20 bytes including CRLF:
 * - 10 digits for byte offset
 * - 1 space
 * - 5 digits for generation number
 * - 1 space
 * - 1 char: 'n' (in use) or 'f' (free)
 * - 1 space (sometimes omitted but PDFBox includes it)
 * - CR+LF (\\r\\n)
 */

import { COSStandardOutputStream } from './COSStandardOutputStream';
import { prepareXrefEntries, buildXrefRanges } from './xref-helpers';
import type { TableXRefEntry } from './XRefEntries';

/**
 * Format byte offset as 10-digit string with leading zeros
 * PORTED FROM: COSWriter.java lines 172-173
 *
 * Example: 123 → "0000000123"
 */
export function formatXrefOffset(offset: number): string {
  if (offset < 0) {
    throw new Error(`XRef offset cannot be negative: ${offset}`);
  }
  if (offset > 9999999999) {
    throw new Error(`XRef offset too large: ${offset}`);
  }
  return offset.toString().padStart(10, '0');
}

/**
 * Format generation number as 5-digit string with leading zeros
 * PORTED FROM: COSWriter.java lines 176-177
 *
 * Example: 0 → "00000", 5 → "00005"
 */
export function formatXrefGeneration(generation: number): string {
  if (generation < 0) {
    throw new Error(`XRef generation cannot be negative: ${generation}`);
  }
  if (generation > 99999) {
    throw new Error(`XRef generation too large: ${generation}`);
  }
  return generation.toString().padStart(5, '0');
}

/**
 * Write a single xref entry
 * PORTED FROM: COSWriter.java writeXrefEntry() [lines 1001-1011]
 *
 * Format: "0000001234 00000 n \r\n"
 * Total: exactly 20 bytes
 */
export function writeXrefEntry(
  output: COSStandardOutputStream,
  entry: TableXRefEntry
): void {
  const offset = formatXrefOffset(entry.byteOffset);
  const generation = formatXrefGeneration(entry.generation);
  const flag = entry.inUse ? 'n' : 'f';

  output.writeString(offset);
  output.writeString(' ');
  output.writeString(generation);
  output.writeString(' ');
  output.writeString(flag);
  output.writeCRLF();
}

/**
 * Write xref subsection header
 * PORTED FROM: COSWriter.java writeXrefRange() [lines 993-999]
 *
 * Format: "0 6\n" means "starting at object 0, 6 entries follow"
 */
export function writeXrefRange(
  output: COSStandardOutputStream,
  startObjectNumber: number,
  count: number
): void {
  output.writeString(startObjectNumber.toString());
  output.writeString(' ');
  output.writeString(count.toString());
  output.writeEOL();
}

/**
 * Write complete xref table for incremental update
 *
 * For signatures, we typically add 2 new objects (signature dict + field)
 * and update the existing xref table.
 *
 * Example output:
 * xref
 * 0 1
 * 0000000000 65535 f
 * 63 2
 * 0000012345 00000 n
 * 0000023456 00000 n
 */
export function writeXrefTable(
  output: COSStandardOutputStream,
  entries: TableXRefEntry[],
  options: { incremental: boolean } = { incremental: false }
): void {
  if (entries.length === 0) {
    throw new Error('Cannot write empty xref table');
  }

  // Write xref keyword
  output.writeString('xref');
  output.writeEOL();

  const prepared = prepareXrefEntries(entries, options);
  const ranges = buildXrefRanges(prepared);

  let index = 0;
  for (const range of ranges) {
    writeXrefRange(output, range.start, range.count);
    for (let i = 0; i < range.count; i++, index++) {
      writeXrefEntry(output, prepared[index]);
    }
  }
}

/**
 * Write trailer dictionary and startxref
 *
 * Example:
 * trailer
 * << /Size 65 /Root 1 0 R /Prev 12345 >>
 * startxref
 * 98765
 * %%EOF
 */
export function writeTrailer(
  output: COSStandardOutputStream,
  trailerDict: string, // Pre-formatted trailer dictionary
  xrefPosition: number
): void {
  output.writeString('trailer');
  output.writeEOL();
  output.writeString(trailerDict);
  output.writeEOL();

  output.writeString('startxref');
  output.writeEOL();
  output.writeString(xrefPosition.toString());
  output.writeEOL();

  output.writeString('%%EOF');
  output.writeEOL();
}

export type { TableXRefEntry as XRefEntry };

/**
 * =============================================================================
 * USAGE EXAMPLE:
 * =============================================================================
 *
 * const output = new COSStandardOutputStream();
 *
 * // Write new objects
 * const sigDictStart = output.getPos();
 * output.writeString('63 0 obj\n<< /Type /Sig ... >>\nendobj\n');
 *
 * const fieldStart = output.getPos();
 * output.writeString('64 0 obj\n<< /FT /Sig ... >>\nendobj\n');
 *
 * // Write xref table
 * const xrefStart = output.getPos();
 * writeXrefTable(output, [
 *   { objectNumber: 63, byteOffset: sigDictStart, generation: 0, inUse: true },
 *   { objectNumber: 64, byteOffset: fieldStart, generation: 0, inUse: true },
 * ]);
 *
 * // Write trailer
 * writeTrailer(output, '<< /Size 65 /Root 1 0 R /Prev 12345 >>', xrefStart);
 * =============================================================================
 */
