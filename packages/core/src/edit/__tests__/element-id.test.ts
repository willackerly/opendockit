import { describe, it, expect } from 'vitest';
import {
  makeElementId,
  getPartFromElementId,
  getShapeIdFromElementId,
} from '../element-id.js';

// ---------------------------------------------------------------------------
// makeElementId
// ---------------------------------------------------------------------------

describe('makeElementId', () => {
  it('creates a composite ID from part URI and string shape ID', () => {
    expect(makeElementId('/ppt/slides/slide1.xml', '42')).toBe(
      '/ppt/slides/slide1.xml#42',
    );
  });

  it('creates a composite ID from part URI and numeric shape ID', () => {
    expect(makeElementId('/ppt/slides/slide3.xml', 7)).toBe(
      '/ppt/slides/slide3.xml#7',
    );
  });

  it('handles empty part URI', () => {
    expect(makeElementId('', '1')).toBe('#1');
  });

  it('handles shape ID of 0', () => {
    expect(makeElementId('/ppt/slides/slide1.xml', 0)).toBe(
      '/ppt/slides/slide1.xml#0',
    );
  });
});

// ---------------------------------------------------------------------------
// getPartFromElementId
// ---------------------------------------------------------------------------

describe('getPartFromElementId', () => {
  it('extracts the part URI from a composite ID', () => {
    expect(getPartFromElementId('/ppt/slides/slide1.xml#42')).toBe(
      '/ppt/slides/slide1.xml',
    );
  });

  it('handles part URIs with nested paths', () => {
    expect(getPartFromElementId('/ppt/slideLayouts/slideLayout2.xml#15')).toBe(
      '/ppt/slideLayouts/slideLayout2.xml',
    );
  });

  it('handles ID where part is empty (leading hash)', () => {
    expect(getPartFromElementId('#99')).toBe('');
  });

  it('throws for invalid IDs without hash separator', () => {
    expect(() => getPartFromElementId('no-hash-here')).toThrow(
      'Invalid element ID: no-hash-here',
    );
  });

  it('throws for empty string', () => {
    expect(() => getPartFromElementId('')).toThrow('Invalid element ID: ');
  });
});

// ---------------------------------------------------------------------------
// getShapeIdFromElementId
// ---------------------------------------------------------------------------

describe('getShapeIdFromElementId', () => {
  it('extracts the shape ID from a composite ID', () => {
    expect(getShapeIdFromElementId('/ppt/slides/slide1.xml#42')).toBe('42');
  });

  it('handles numeric shape IDs that were stringified', () => {
    expect(getShapeIdFromElementId('/ppt/slides/slide1.xml#0')).toBe('0');
  });

  it('handles hash in the first position', () => {
    expect(getShapeIdFromElementId('#myShape')).toBe('myShape');
  });

  it('extracts shape ID when there are multiple hashes (uses first)', () => {
    // Only the first '#' is treated as the separator
    expect(getShapeIdFromElementId('/path#shape#extra')).toBe('shape#extra');
  });

  it('throws for invalid IDs without hash separator', () => {
    expect(() => getShapeIdFromElementId('invalid')).toThrow(
      'Invalid element ID: invalid',
    );
  });
});

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------

describe('round-trip', () => {
  it('makeElementId -> getPartFromElementId + getShapeIdFromElementId', () => {
    const partUri = '/ppt/slides/slide5.xml';
    const shapeId = '123';
    const id = makeElementId(partUri, shapeId);
    expect(getPartFromElementId(id)).toBe(partUri);
    expect(getShapeIdFromElementId(id)).toBe(shapeId);
  });

  it('round-trips with numeric shape ID', () => {
    const partUri = '/ppt/slides/slide1.xml';
    const shapeId = 42;
    const id = makeElementId(partUri, shapeId);
    expect(getPartFromElementId(id)).toBe(partUri);
    expect(getShapeIdFromElementId(id)).toBe(String(shapeId));
  });
});
