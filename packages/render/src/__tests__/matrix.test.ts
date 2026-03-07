import { describe, it, expect } from 'vitest';
import {
  identity,
  translation,
  scaling,
  rotation,
  rotationDeg,
  multiply,
  transformPoint,
  transformVector,
  inverse,
  determinant,
  decompose,
  fromCanvas2D,
  toCanvas2D,
  compose,
} from '../matrix.js';
import type { Matrix2D } from '../matrix.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function expectMatrix(m: Matrix2D, expected: Partial<Matrix2D>, precision = 5) {
  for (const [key, val] of Object.entries(expected)) {
    expect((m as Record<string, number>)[key]).toBeCloseTo(val as number, precision);
  }
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

describe('identity', () => {
  it('returns identity matrix', () => {
    const m = identity();
    expect(m).toEqual({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });
  });
});

describe('translation', () => {
  it('creates a translation matrix', () => {
    const m = translation(10, 20);
    expect(m).toEqual({ a: 1, b: 0, c: 0, d: 1, tx: 10, ty: 20 });
  });

  it('zero translation is identity', () => {
    const m = translation(0, 0);
    expect(m).toEqual(identity());
  });
});

describe('scaling', () => {
  it('creates a uniform scale matrix', () => {
    const m = scaling(2);
    expect(m).toEqual({ a: 2, b: 0, c: 0, d: 2, tx: 0, ty: 0 });
  });

  it('creates a non-uniform scale matrix', () => {
    const m = scaling(2, 3);
    expect(m).toEqual({ a: 2, b: 0, c: 0, d: 3, tx: 0, ty: 0 });
  });
});

describe('rotation', () => {
  it('creates identity at angle=0', () => {
    const m = rotation(0);
    expectMatrix(m, { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });
  });

  it('creates 90-degree rotation', () => {
    const m = rotation(Math.PI / 2);
    expectMatrix(m, { a: 0, b: 1, c: -1, d: 0, tx: 0, ty: 0 });
  });

  it('creates 180-degree rotation', () => {
    const m = rotation(Math.PI);
    expectMatrix(m, { a: -1, b: 0, c: 0, d: -1, tx: 0, ty: 0 });
  });
});

describe('rotationDeg', () => {
  it('matches rotation() in radians', () => {
    const m1 = rotation(Math.PI / 4);
    const m2 = rotationDeg(45);
    expectMatrix(m1, { a: m2.a, b: m2.b, c: m2.c, d: m2.d });
  });
});

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

describe('multiply', () => {
  it('identity * identity = identity', () => {
    const result = multiply(identity(), identity());
    expectMatrix(result, identity());
  });

  it('m * identity = m', () => {
    const m = translation(10, 20);
    const result = multiply(m, identity());
    expectMatrix(result, m);
  });

  it('identity * m = m', () => {
    const m = translation(10, 20);
    const result = multiply(identity(), m);
    expectMatrix(result, m);
  });

  it('composes translation correctly', () => {
    const t1 = translation(10, 0);
    const t2 = translation(0, 20);
    const result = multiply(t1, t2);
    expectMatrix(result, { tx: 10, ty: 20 });
  });

  it('composes scale and translation', () => {
    const s = scaling(2);
    const t = translation(5, 10);
    // Apply scale first, then translate
    const result = multiply(t, s);
    // A point at (1,1) should map to (2*1+5, 2*1+10) = (7, 12)
    const p = transformPoint(result, { x: 1, y: 1 });
    expect(p.x).toBeCloseTo(7);
    expect(p.y).toBeCloseTo(12);
  });
});

describe('transformPoint', () => {
  it('identity transform returns same point', () => {
    const p = transformPoint(identity(), { x: 5, y: 10 });
    expect(p).toEqual({ x: 5, y: 10 });
  });

  it('translation moves point', () => {
    const m = translation(10, 20);
    const p = transformPoint(m, { x: 5, y: 5 });
    expect(p).toEqual({ x: 15, y: 25 });
  });

  it('scale scales point', () => {
    const m = scaling(2);
    const p = transformPoint(m, { x: 3, y: 4 });
    expect(p).toEqual({ x: 6, y: 8 });
  });

  it('90-degree rotation maps (1, 0) to (0, 1)', () => {
    const m = rotation(Math.PI / 2);
    const p = transformPoint(m, { x: 1, y: 0 });
    expect(p.x).toBeCloseTo(0, 5);
    expect(p.y).toBeCloseTo(1, 5);
  });
});

describe('transformVector', () => {
  it('ignores translation', () => {
    const m = translation(100, 200);
    const v = transformVector(m, { x: 1, y: 0 });
    expect(v).toEqual({ x: 1, y: 0 });
  });

  it('applies rotation', () => {
    const m = rotation(Math.PI / 2);
    const v = transformVector(m, { x: 1, y: 0 });
    expect(v.x).toBeCloseTo(0, 5);
    expect(v.y).toBeCloseTo(1, 5);
  });
});

describe('inverse', () => {
  it('identity inverse is identity', () => {
    const inv = inverse(identity());
    expect(inv).toBeDefined();
    expectMatrix(inv!, identity());
  });

  it('m * inv(m) = identity', () => {
    const m = multiply(translation(5, 10), scaling(2));
    const inv = inverse(m);
    expect(inv).toBeDefined();
    const result = multiply(m, inv!);
    expectMatrix(result, identity());
  });

  it('translation inverse is negative translation', () => {
    const m = translation(10, 20);
    const inv = inverse(m);
    expect(inv).toBeDefined();
    expectMatrix(inv!, { tx: -10, ty: -20 });
  });

  it('returns undefined for singular matrix', () => {
    // Zero scale = singular
    const m: Matrix2D = { a: 0, b: 0, c: 0, d: 0, tx: 0, ty: 0 };
    expect(inverse(m)).toBeUndefined();
  });
});

describe('determinant', () => {
  it('identity has determinant 1', () => {
    expect(determinant(identity())).toBe(1);
  });

  it('scale 2 has determinant 4', () => {
    expect(determinant(scaling(2))).toBe(4);
  });

  it('rotation has determinant 1', () => {
    expect(determinant(rotation(Math.PI / 3))).toBeCloseTo(1, 10);
  });
});

// ---------------------------------------------------------------------------
// Decomposition
// ---------------------------------------------------------------------------

describe('decompose', () => {
  it('decomposes identity correctly', () => {
    const d = decompose(identity());
    expect(d.tx).toBe(0);
    expect(d.ty).toBe(0);
    expect(d.rotation).toBeCloseTo(0, 10);
    expect(d.scaleX).toBeCloseTo(1, 10);
    expect(d.scaleY).toBeCloseTo(1, 10);
  });

  it('decomposes translation correctly', () => {
    const d = decompose(translation(10, 20));
    expect(d.tx).toBe(10);
    expect(d.ty).toBe(20);
    expect(d.scaleX).toBeCloseTo(1, 10);
  });

  it('decomposes scale correctly', () => {
    const d = decompose(scaling(3, 4));
    expect(d.scaleX).toBeCloseTo(3, 10);
    expect(d.scaleY).toBeCloseTo(4, 10);
  });

  it('decomposes 45-degree rotation correctly', () => {
    const d = decompose(rotationDeg(45));
    expect(d.rotation).toBeCloseTo(Math.PI / 4, 10);
    expect(d.scaleX).toBeCloseTo(1, 10);
  });
});

// ---------------------------------------------------------------------------
// Canvas2D helpers
// ---------------------------------------------------------------------------

describe('fromCanvas2D / toCanvas2D', () => {
  it('round-trips', () => {
    const m = fromCanvas2D(1, 0, 0, 1, 10, 20);
    const [a, b, c, d, e, f] = toCanvas2D(m);
    expect([a, b, c, d, e, f]).toEqual([1, 0, 0, 1, 10, 20]);
  });

  it('converts translation correctly', () => {
    const m = translation(5, 15);
    const [a, _b, _c, d, e, f] = toCanvas2D(m);
    expect(a).toBe(1);
    expect(d).toBe(1);
    expect(e).toBe(5);
    expect(f).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// Compose helper
// ---------------------------------------------------------------------------

describe('compose', () => {
  it('no rotation or scale = translation', () => {
    const m = compose(10, 20, 0, 1, 1);
    expectMatrix(m, { tx: 10, ty: 20, a: 1, d: 1 });
  });

  it('transforms a point correctly', () => {
    // translate(10, 10) * rotate(90deg) * scale(2)
    // Point (1,0): scale -> (2,0), rotate 90 -> (0,2), translate -> (10,12)
    const m = compose(10, 10, Math.PI / 2, 2, 2);
    const p = transformPoint(m, { x: 1, y: 0 });
    expect(p.x).toBeCloseTo(10, 4);
    expect(p.y).toBeCloseTo(12, 4);
  });
});
