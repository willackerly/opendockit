export interface RandomAccessReader {
  readonly length: number;
  tell(): number;
  seek(position: number): void;
  read(length: number): Uint8Array;
  readByte(): number;
  peekByte(): number;
  skip(length: number): void;
  readFully(target: Uint8Array, offset?: number, length?: number): number;
  readAt(position: number, length: number): Uint8Array;
  slice(start: number, end?: number): Uint8Array;
  clone(position?: number): RandomAccessBuffer;
}

/**
 * RandomAccessRead-style helper mirroring the subset of PDFBox's interfaces we
 * need for full-document saves. Supports cloning, absolute reads, and bounded
 * slices so COSWriter can copy or re-read sections freely.
 */
export class RandomAccessBuffer implements RandomAccessReader {
  private readonly buffer: Uint8Array;
  private position = 0;

  constructor(bytes: Uint8Array | ArrayBuffer) {
    this.buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  }

  get length(): number {
    return this.buffer.length;
  }

  tell(): number {
    return this.position;
  }

  seek(offset: number): void {
    if (offset < 0 || offset > this.buffer.length) {
      throw new Error(`Seek offset ${offset} outside buffer bounds`);
    }
    this.position = offset;
  }

  skip(length: number): void {
    if (length < 0) {
      throw new Error('Cannot skip a negative number of bytes');
    }
    this.seek(Math.min(this.position + length, this.buffer.length));
  }

  read(length: number): Uint8Array {
    if (length < 0) {
      throw new Error('Cannot read a negative number of bytes');
    }
    const end = Math.min(this.position + length, this.buffer.length);
    const slice = this.buffer.slice(this.position, end);
    this.position = end;
    return slice;
  }

  readByte(): number {
    if (this.position >= this.buffer.length) {
      return -1;
    }
    return this.buffer[this.position++];
  }

  peekByte(): number {
    if (this.position >= this.buffer.length) {
      return -1;
    }
    return this.buffer[this.position];
  }

  readFully(target: Uint8Array, offset = 0, length?: number): number {
    if (offset < 0 || offset > target.length) {
      throw new Error(`Offset ${offset} outside target bounds`);
    }
    const toRead = Math.min(
      length ?? target.length - offset,
      target.length - offset,
      this.buffer.length - this.position
    );
    if (toRead <= 0) {
      return 0;
    }
    target.set(this.buffer.slice(this.position, this.position + toRead), offset);
    this.position += toRead;
    return toRead;
  }

  readAt(position: number, length: number): Uint8Array {
    if (length < 0) {
      throw new Error('Cannot read a negative number of bytes');
    }
    if (position < 0 || position > this.buffer.length) {
      throw new Error(`Position ${position} outside buffer bounds`);
    }
    const end = Math.min(position + length, this.buffer.length);
    return this.buffer.slice(position, end);
  }

  slice(start: number, end?: number): Uint8Array {
    if (start < 0 || start > this.buffer.length) {
      throw new Error(`Slice start ${start} outside buffer bounds`);
    }
    const boundedEnd = Math.min(end ?? this.buffer.length, this.buffer.length);
    if (boundedEnd < start) {
      throw new Error('Slice end cannot be before start');
    }
    return this.buffer.slice(start, boundedEnd);
  }

  clone(position: number = this.position): RandomAccessBuffer {
    const clone = new RandomAccessBuffer(this.buffer);
    clone.seek(position);
    return clone;
  }
}
