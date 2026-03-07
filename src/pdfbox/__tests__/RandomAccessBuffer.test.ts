import { describe, it, expect } from 'vitest';

import { RandomAccessBuffer } from '../io/RandomAccessBuffer';

describe('RandomAccessBuffer', () => {
  const bytes = new TextEncoder().encode('abcdef');

  it('reads sequential bytes and tracks position', () => {
    const buf = new RandomAccessBuffer(bytes);
    expect(new TextDecoder().decode(buf.read(3))).toBe('abc');
    expect(buf.tell()).toBe(3);
    expect(buf.readByte()).toBe('d'.charCodeAt(0));
    expect(buf.tell()).toBe(4);
  });

  it('supports seek and peek operations', () => {
    const buf = new RandomAccessBuffer(bytes);
    buf.seek(2);
    expect(buf.peekByte()).toBe('c'.charCodeAt(0));
    expect(new TextDecoder().decode(buf.read(2))).toBe('cd');
    buf.seek(buf.length - 1);
    expect(buf.readByte()).toBe('f'.charCodeAt(0));
    expect(buf.readByte()).toBe(-1);
  });

  it('throws when seeking outside bounds', () => {
    const buf = new RandomAccessBuffer(bytes);
    expect(() => buf.seek(-1)).toThrow(/outside buffer bounds/);
    expect(() => buf.seek(bytes.length + 1)).toThrow(/outside buffer bounds/);
  });

  it('reads fully into target buffers', () => {
    const buf = new RandomAccessBuffer(new Uint8Array([1, 2, 3, 4]));
    const target = new Uint8Array(4);
    const first = buf.readFully(target, 0, 2);
    expect(first).toBe(2);
    const second = buf.readFully(target, 2);
    expect(second).toBe(2);
    expect(Array.from(target)).toEqual([1, 2, 3, 4]);
  });

  it('clones without sharing cursor state', () => {
    const buf = new RandomAccessBuffer(new Uint8Array([9, 8, 7]));
    buf.seek(1);
    const clone = buf.clone();
    expect(Array.from(clone.read(2))).toEqual([8, 7]);
    // Original cursor still at 1
    expect(buf.readByte()).toBe(8);
  });

  it('reads absolute slices without moving the cursor', () => {
    const data = new Uint8Array([10, 11, 12, 13]);
    const buf = new RandomAccessBuffer(data);
    const slice = buf.readAt(1, 2);
    expect(Array.from(slice)).toEqual([11, 12]);
    expect(buf.tell()).toBe(0);
  });
});
