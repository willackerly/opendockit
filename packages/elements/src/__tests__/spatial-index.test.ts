import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialIndex } from '../spatial-index.js';
import { makeShapeElement, makeTextElement, baseProps } from './test-helpers.js';
import type { ShapeElement } from '../types.js';

describe('SpatialIndex', () => {
  let index: SpatialIndex;

  beforeEach(() => {
    index = new SpatialIndex();
  });

  // ─── build / size ─────────────────────────────────────

  it('reports size 0 on empty index', () => {
    expect(index.size).toBe(0);
  });

  it('bulk-loads elements and reports correct size', () => {
    const els = [
      makeShapeElement('a', 0, 0, 100, 100),
      makeShapeElement('b', 200, 200, 50, 50),
    ];
    index.build(els);
    expect(index.size).toBe(2);
  });

  // ─── query ────────────────────────────────────────────

  it('returns elements intersecting a query rect', () => {
    const els = [
      makeShapeElement('a', 0, 0, 100, 100),
      makeShapeElement('b', 200, 200, 50, 50),
      makeShapeElement('c', 50, 50, 60, 60),
    ];
    index.build(els);

    const results = index.query({ x: 0, y: 0, width: 80, height: 80 });
    const ids = results.map((e) => e.id);
    expect(ids).toContain('a');
    expect(ids).toContain('c');
    expect(ids).not.toContain('b');
  });

  it('returns empty array when no elements intersect', () => {
    const els = [makeShapeElement('a', 0, 0, 10, 10)];
    index.build(els);
    expect(index.query({ x: 500, y: 500, width: 10, height: 10 })).toEqual([]);
  });

  it('returns results in z-order (back to front)', () => {
    const els = [
      makeShapeElement('back', 0, 0, 100, 100),
      makeShapeElement('mid', 10, 10, 80, 80),
      makeShapeElement('front', 20, 20, 60, 60),
    ];
    index.build(els);
    const results = index.query({ x: 25, y: 25, width: 10, height: 10 });
    expect(results.map((e) => e.id)).toEqual(['back', 'mid', 'front']);
  });

  it('query returns empty array on empty index', () => {
    expect(index.query({ x: 0, y: 0, width: 100, height: 100 })).toEqual([]);
  });

  // ─── hitTest ──────────────────────────────────────────

  it('returns topmost element at a point', () => {
    const els = [
      makeShapeElement('back', 0, 0, 100, 100),
      makeShapeElement('front', 0, 0, 100, 100),
    ];
    index.build(els);
    const hit = index.hitTest(50, 50);
    expect(hit).not.toBeNull();
    expect(hit!.id).toBe('front');
  });

  it('returns null when no element at point', () => {
    const els = [makeShapeElement('a', 0, 0, 10, 10)];
    index.build(els);
    expect(index.hitTest(500, 500)).toBeNull();
  });

  it('returns null on empty index', () => {
    expect(index.hitTest(0, 0)).toBeNull();
  });

  it('hitTest distinguishes non-overlapping elements', () => {
    const els = [
      makeShapeElement('left', 0, 0, 50, 50),
      makeShapeElement('right', 100, 0, 50, 50),
    ];
    index.build(els);

    expect(index.hitTest(25, 25)!.id).toBe('left');
    expect(index.hitTest(125, 25)!.id).toBe('right');
    expect(index.hitTest(75, 25)).toBeNull();
  });

  // ─── clear / rebuild ─────────────────────────────────

  it('clear empties the index', () => {
    index.build([makeShapeElement('a', 0, 0, 100, 100)]);
    expect(index.size).toBe(1);
    index.clear();
    expect(index.size).toBe(0);
    expect(index.hitTest(50, 50)).toBeNull();
  });

  it('build clears previous data', () => {
    index.build([makeShapeElement('old', 0, 0, 100, 100)]);
    index.build([makeShapeElement('new', 200, 200, 50, 50)]);
    expect(index.size).toBe(1);
    expect(index.hitTest(50, 50)).toBeNull();
    expect(index.hitTest(225, 225)!.id).toBe('new');
  });

  // ─── rotation ─────────────────────────────────────────

  it('handles rotated elements using expanded AABB', () => {
    // A 100x10 rectangle at (0,0), rotated 45 degrees.
    // Unrotated: occupies x=[0,100], y=[0,10]
    // Rotated 45 deg around center (50,5): AABB expands significantly in Y
    const rotated: ShapeElement = {
      ...baseProps,
      id: 'rot',
      type: 'shape',
      x: 0,
      y: 0,
      width: 100,
      height: 10,
      rotation: 45,
      shapeType: 'rectangle',
      fill: null,
      stroke: null,
    };
    index.build([rotated]);

    // Center of original element — should always hit
    expect(index.hitTest(50, 5)).not.toBeNull();

    // A point that would be outside the unrotated rect but inside the
    // rotated AABB. The AABB of a 100x10 rect rotated 45 deg around (50,5)
    // extends roughly 38 units above and below center.
    // The center is at (50, 5), so the AABB goes from about y=-33 to y=43.
    expect(index.hitTest(50, 30)).not.toBeNull();
  });

  // ─── mixed element types ──────────────────────────────

  it('works with text elements', () => {
    const els = [
      makeTextElement('t1', 10, 10, 200, 20, 'Hello'),
      makeShapeElement('s1', 300, 300, 50, 50),
    ];
    index.build(els);
    const hit = index.hitTest(110, 20);
    expect(hit).not.toBeNull();
    expect(hit!.id).toBe('t1');
    expect(hit!.type).toBe('text');
  });

  // ─── edge cases ───────────────────────────────────────

  it('handles zero-size elements', () => {
    const zero: ShapeElement = {
      ...baseProps,
      id: 'zero',
      type: 'shape',
      x: 50,
      y: 50,
      width: 0,
      height: 0,
      shapeType: 'rectangle',
      fill: null,
      stroke: null,
    };
    index.build([zero]);
    // Point query at exact location should find it (rbush uses inclusive bounds)
    expect(index.hitTest(50, 50)).not.toBeNull();
  });

  it('handles large element counts', () => {
    const els: ShapeElement[] = [];
    for (let i = 0; i < 1000; i++) {
      els.push({
        ...baseProps,
        id: `el-${i}`,
        type: 'shape',
        x: (i % 100) * 10,
        y: Math.floor(i / 100) * 10,
        width: 10,
        height: 10,
        shapeType: 'rectangle',
        fill: null,
        stroke: null,
      });
    }
    index.build(els);
    expect(index.size).toBe(1000);

    // Query a small region
    const results = index.query({ x: 0, y: 0, width: 25, height: 15 });
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThan(1000);
  });
});
