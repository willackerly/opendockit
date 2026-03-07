import { describe, it, expect } from 'vitest';

import { COSInputStream } from '../io/COSInputStream';

describe('COSInputStream', () => {
  const bytes = new TextEncoder().encode('0123456789');

  it('reads within the configured window', () => {
    const stream = new COSInputStream(bytes, 2, 7);
    expect(new TextDecoder().decode(stream.read(3))).toBe('234');
    expect(stream.readByte()).toBe('5'.charCodeAt(0));
    expect(stream.remaining()).toBe(1);
    expect(stream.readByte()).toBe('6'.charCodeAt(0));
    expect(stream.isEOF()).toBe(true);
    expect(stream.readByte()).toBe(-1);
  });

  it('supports peek and skip operations', () => {
    const stream = new COSInputStream(bytes, 0, 5);
    expect(stream.peekByte()).toBe('0'.charCodeAt(0));
    stream.skip(2);
    expect(new TextDecoder().decode(stream.read(2))).toBe('23');
  });

  it('rejects invalid start offsets', () => {
    expect(() => new COSInputStream(bytes, -1)).toThrow(/outside source bounds/);
  });
});
