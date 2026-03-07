/**
 * COSBase - Base Interface for PDF Objects (COS = Carousel Object Structure)
 *
 * =============================================================================
 * PORTED FROM: Apache PDFBox COSBase.java
 * Source: pdfbox/src/main/java/org/apache/pdfbox/cos/COSBase.java
 * =============================================================================
 *
 * COS ("Carousel Object Structure") is PDFBox's internal representation of
 * PDF objects. All PDF objects (dictionaries, arrays, strings, numbers, etc.)
 * implement COSBase.
 *
 * The visitor pattern is used for serialization: each COS object knows how to
 * "accept" a visitor (like COSWriter) which then writes it to PDF format.
 *
 * PDF Object Types (ISO 32000-1:2008 Section 7.3):
 * - Boolean: true, false
 * - Integer: 123, -42
 * - Real (Float): 3.14, -2.5
 * - String: (Hello World), <48656C6C6F>
 * - Name: /Type, /Font, /Resources
 * - Array: [1 2 3], [/Name (String) 42]
 * - Dictionary: << /Type /Page /Contents 5 0 R >>
 * - Stream: Dictionary followed by stream...endstream
 * - Null: null
 * - Indirect Reference: 5 0 R (reference to object 5, generation 0)
 */

import type { COSWriter } from '../writer/COSWriter';

/**
 * Base interface for all COS (PDF) objects
 *
 * PORTED FROM: COSBase.java
 */
export interface COSBase {
  /**
   * Accept a visitor (visitor pattern for serialization)
   *
   * PORTED FROM: COSBase.java accept() method
   *
   * When COSWriter wants to write this object, it calls accept(this),
   * and the object calls the appropriate visitFromXXX() method on the writer.
   */
  accept(visitor: COSWriter): void;

  /**
   * Whether this object should be written directly (not as a reference)
   *
   * PORTED FROM: COSBase.java isDirect() / setDirect()
   *
   * Direct objects: written inline: << /Type /Page >>
   * Indirect objects: written as reference: 5 0 R
   */
  isDirect(): boolean;
  setDirect(direct: boolean): void;
}

/**
 * PDF Constants
 */
export const PDF_CONSTANTS = {
  // Dictionary markers
  DICT_OPEN: '<<',
  DICT_CLOSE: '>>',

  // Array markers
  ARRAY_OPEN: '[',
  ARRAY_CLOSE: ']',

  // String markers
  STRING_OPEN: '(',
  STRING_CLOSE: ')',
  HEX_STRING_OPEN: '<',
  HEX_STRING_CLOSE: '>',

  // Common separators
  SPACE: ' ',
  NEWLINE: '\n',

  // Object/Reference markers
  OBJ: ' obj',
  ENDOBJ: 'endobj',
  R: ' R',

  // Boolean values
  TRUE: 'true',
  FALSE: 'false',
  NULL: 'null',
} as const;
