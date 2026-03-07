/**
 * COSStandardOutputStream - PDF Output Stream with Position Tracking
 *
 * =============================================================================
 * PORTED FROM: Apache PDFBox COSStandardOutputStream.java
 * Source: pdfbox/src/main/java/org/apache/pdfbox/pdfwriter/COSStandardOutputStream.java
 * =============================================================================
 *
 * Simple output stream with position tracking for generating PDF files.
 * Key feature: tracks current byte position which is CRITICAL for:
 * - xref table entries (need exact byte offsets of objects)
 * - ByteRange calculation (need to know where /Contents starts)
 * - Signature placeholder positioning
 *
 * Original Author: Michael Traut (PDFBox)
 * TypeScript Port: 2024
 */

/**
 * Standard line/end-of-line markers used in PDF files
 * PORTED FROM: COSStandardOutputStream.java lines 30-43
 */
export const CRLF = new Uint8Array([0x0d, 0x0a]); // \r\n
export const LF = new Uint8Array([0x0a]); // \n
export const EOL = new Uint8Array([0x0a]); // \n (PDF standard)

/**
 * Output stream that tracks byte position for PDF writing
 *
 * PORTED FROM: COSStandardOutputStream.java lines 28-167
 */
export class COSStandardOutputStream {
  private buffer: number[] = [];
  private position: number = 0;
  private onNewLine: boolean = false;

  /**
   * Creates a new output stream
   *
   * PORTED FROM: COSStandardOutputStream.java lines 56-71
   *
   * @param initialPosition - Starting position (for incremental updates)
   */
  constructor(initialPosition: number = 0) {
    this.position = initialPosition;
  }

  /**
   * Get current position in the stream
   *
   * PORTED FROM: COSStandardOutputStream.java lines 78-81
   *
   * This is THE critical method - COSWriter calls getPos() constantly to
   * track where objects are being written for xref tables and ByteRange.
   */
  getPos(): number {
    return this.position;
  }

  /**
   * Check if we're currently on a newline
   *
   * PORTED FROM: COSStandardOutputStream.java lines 88-91
   */
  isOnNewLine(): boolean {
    return this.onNewLine;
  }

  /**
   * Set newline flag
   *
   * PORTED FROM: COSStandardOutputStream.java lines 97-100
   */
  setOnNewLine(value: boolean): void {
    this.onNewLine = value;
  }

  /**
   * Write a byte array to the stream
   *
   * PORTED FROM: COSStandardOutputStream.java lines 112-117
   */
  write(data: Uint8Array | number[]): void {
    this.setOnNewLine(false);

    if (data instanceof Uint8Array) {
      for (let i = 0; i < data.length; i++) {
        this.buffer.push(data[i]);
      }
      this.position += data.length;
    } else {
      this.buffer.push(...data);
      this.position += data.length;
    }
  }

  /**
   * Write a single byte to the stream
   *
   * PORTED FROM: COSStandardOutputStream.java lines 127-132
   */
  writeByte(byte: number): void {
    this.setOnNewLine(false);
    this.buffer.push(byte);
    this.position++;
  }

  /**
   * Write a string as bytes (ISO-8859-1 encoding)
   *
   * PDF uses ISO-8859-1 (Latin-1) for most strings, not UTF-8
   */
  writeString(str: string): void {
    // ISO-8859-1 encoding: each character is exactly one byte
    for (let i = 0; i < str.length; i++) {
      const charCode = str.charCodeAt(i);
      if (charCode > 255) {
        throw new Error(
          `Character '${str[i]}' (code ${charCode}) is not ISO-8859-1. ` +
          `PDF strings must use ISO-8859-1 encoding.`
        );
      }
      this.buffer.push(charCode);
    }
    this.position += str.length;
    this.setOnNewLine(false);
  }

  /**
   * Write CRLF (\\r\\n) to the stream
   *
   * PORTED FROM: COSStandardOutputStream.java lines 139-142
   */
  writeCRLF(): void {
    this.write(CRLF);
  }

  /**
   * Write EOL (\\n) to the stream, but only if not already on a newline
   *
   * PORTED FROM: COSStandardOutputStream.java lines 149-156
   *
   * This prevents generating two newlines in sequence, which keeps
   * PDF output consistent with PDFBox formatting.
   */
  writeEOL(): void {
    if (!this.isOnNewLine()) {
      this.write(EOL);
      this.setOnNewLine(true);
    }
  }

  /**
   * Write LF (\\n) to the stream unconditionally
   *
   * PORTED FROM: COSStandardOutputStream.java lines 163-166
   */
  writeLF(): void {
    this.write(LF);
  }

  /**
   * Get the complete buffer as Uint8Array
   *
   * Note: This is NOT in PDFBox (they write directly to OutputStream).
   * We use an in-memory buffer for browser compatibility.
   */
  toUint8Array(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  /**
   * Get buffer size
   */
  size(): number {
    return this.buffer.length;
  }

  /**
   * Reset the stream (clear buffer, reset position)
   */
  reset(): void {
    this.buffer = [];
    this.position = 0;
    this.onNewLine = false;
  }
}
