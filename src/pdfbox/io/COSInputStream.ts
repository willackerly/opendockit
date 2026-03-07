import { RandomAccessBuffer } from './RandomAccessBuffer';

/**
 * Minimal COSInputStream that reads a bounded window from a RandomAccessBuffer.
 * Mirrors the subset of PDFBox's COSInputStream behavior needed for inspecting
 * existing objects during incremental signing.
 */
export class COSInputStream {
  private readonly source: RandomAccessBuffer;
  private readonly endOffset: number;

  constructor(
    source: RandomAccessBuffer | Uint8Array,
    startOffset: number = 0,
    endOffset?: number
  ) {
    if (source instanceof RandomAccessBuffer) {
      this.source = source;
    } else {
      this.source = new RandomAccessBuffer(source);
    }

    if (startOffset < 0 || startOffset > this.source.length) {
      throw new Error(`startOffset ${startOffset} outside source bounds`);
    }

    this.endOffset = Math.min(endOffset ?? this.source.length, this.source.length);
    this.source.seek(startOffset);
  }

  read(length: number): Uint8Array {
    if (length < 0) {
      throw new Error('Cannot read a negative number of bytes');
    }
    const remaining = this.remaining();
    const toRead = Math.min(length, remaining);
    return this.source.read(toRead);
  }

  readByte(): number {
    if (this.remaining() <= 0) {
      return -1;
    }
    return this.source.readByte();
  }

  peekByte(): number {
    if (this.remaining() <= 0) {
      return -1;
    }
    return this.source.peekByte();
  }

  skip(length: number): void {
    if (length < 0) {
      throw new Error('Cannot skip a negative number of bytes');
    }
    const newPos = Math.min(this.source.tell() + length, this.endOffset);
    this.source.seek(newPos);
  }

  remaining(): number {
    return Math.max(this.endOffset - this.source.tell(), 0);
  }

  isEOF(): boolean {
    return this.remaining() === 0;
  }
}
