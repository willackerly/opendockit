import { describe, it, expect } from 'vitest';
import { calculateCropRect, calculateStretchRect } from '../image-transforms.js';

/**
 * Helper to assert a rect's values are close to expected
 * (avoids floating-point precision issues with toEqual).
 */
function expectRectClose(
  actual: Record<string, number>,
  expected: Record<string, number>,
  precision = 10
) {
  for (const key of Object.keys(expected)) {
    expect(actual[key]).toBeCloseTo(expected[key], precision);
  }
}

// ---------------------------------------------------------------------------
// calculateCropRect
// ---------------------------------------------------------------------------

describe('calculateCropRect', () => {
  it('returns full image when crop is all zeros', () => {
    const result = calculateCropRect(1000, 800, {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
    });
    expect(result).toEqual({ sx: 0, sy: 0, sw: 1000, sh: 800 });
  });

  it('applies 10% crop from each edge', () => {
    const result = calculateCropRect(1000, 800, {
      left: 0.1,
      top: 0.1,
      right: 0.1,
      bottom: 0.1,
    });
    expectRectClose(result, { sx: 100, sy: 80, sw: 800, sh: 640 });
  });

  it('applies asymmetric crop', () => {
    const result = calculateCropRect(200, 100, {
      left: 0.25,
      top: 0.1,
      right: 0.15,
      bottom: 0.3,
    });
    // sx = 0.25 * 200 = 50
    // sy = 0.1 * 100 = 10
    // sw = 200 * (1 - 0.25 - 0.15) = 200 * 0.6 = 120
    // sh = 100 * (1 - 0.1 - 0.3) = 100 * 0.6 = 60
    expectRectClose(result, { sx: 50, sy: 10, sw: 120, sh: 60 });
  });

  it('handles 50% crop from left only', () => {
    const result = calculateCropRect(400, 300, {
      left: 0.5,
      top: 0,
      right: 0,
      bottom: 0,
    });
    expect(result).toEqual({ sx: 200, sy: 0, sw: 200, sh: 300 });
  });

  it('handles crop that leaves a very small region', () => {
    const result = calculateCropRect(1000, 1000, {
      left: 0.45,
      top: 0.45,
      right: 0.45,
      bottom: 0.45,
    });
    // sw = 1000 * (1 - 0.45 - 0.45) = 1000 * 0.1 = 100
    // sh = 1000 * (1 - 0.45 - 0.45) = 1000 * 0.1 = 100
    expectRectClose(result, { sx: 450, sy: 450, sw: 100, sh: 100 });
  });
});

// ---------------------------------------------------------------------------
// calculateStretchRect
// ---------------------------------------------------------------------------

describe('calculateStretchRect', () => {
  it('returns full target when fillRect is undefined', () => {
    const result = calculateStretchRect(800, 600);
    expect(result).toEqual({ dx: 0, dy: 0, dw: 800, dh: 600 });
  });

  it('returns full target when fillRect is all zeros', () => {
    const result = calculateStretchRect(800, 600, {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
    });
    expect(result).toEqual({ dx: 0, dy: 0, dw: 800, dh: 600 });
  });

  it('applies uniform insets', () => {
    const result = calculateStretchRect(1000, 500, {
      left: 0.1,
      top: 0.1,
      right: 0.1,
      bottom: 0.1,
    });
    // dx = 0.1 * 1000 = 100
    // dy = 0.1 * 500 = 50
    // dw = 1000 * (1 - 0.1 - 0.1) = 800
    // dh = 500 * (1 - 0.1 - 0.1) = 400
    expectRectClose(result, { dx: 100, dy: 50, dw: 800, dh: 400 });
  });

  it('applies asymmetric insets', () => {
    const result = calculateStretchRect(400, 200, {
      left: 0.25,
      top: 0.0,
      right: 0.25,
      bottom: 0.5,
    });
    // dx = 0.25 * 400 = 100
    // dy = 0
    // dw = 400 * (1 - 0.25 - 0.25) = 200
    // dh = 200 * (1 - 0.0 - 0.5) = 100
    expectRectClose(result, { dx: 100, dy: 0, dw: 200, dh: 100 });
  });

  it('handles insets that leave a small region', () => {
    const result = calculateStretchRect(100, 100, {
      left: 0.4,
      top: 0.4,
      right: 0.4,
      bottom: 0.4,
    });
    // dw = 100 * (1 - 0.4 - 0.4) = 100 * 0.2 = 20
    // dh = 100 * (1 - 0.4 - 0.4) = 100 * 0.2 = 20
    expectRectClose(result, { dx: 40, dy: 40, dw: 20, dh: 20 });
  });
});
