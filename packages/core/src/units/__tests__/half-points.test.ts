import { describe, it, expect } from 'vitest';
import {
  halfPointsToPt,
  ptToHalfPoints,
  hundredthsPtToPt,
  ptToHundredthsPt,
  ooxml60kToRadians,
  ooxml60kToDegrees,
  degreesToOoxml60k,
  radiansToOoxml60k,
  ooxmlPercentToFraction,
  fractionToOoxmlPercent,
} from '../half-points.js';

// ---------------------------------------------------------------------------
// Half-points
// ---------------------------------------------------------------------------

describe('halfPointsToPt', () => {
  it('converts 36 half-points to 18 pt', () => {
    expect(halfPointsToPt(36)).toBe(18);
  });

  it('converts 24 half-points to 12 pt', () => {
    expect(halfPointsToPt(24)).toBe(12);
  });

  it('converts 48 half-points to 24 pt', () => {
    expect(halfPointsToPt(48)).toBe(24);
  });

  it('converts 1 half-point to 0.5 pt', () => {
    expect(halfPointsToPt(1)).toBe(0.5);
  });

  it('converts 0 to 0', () => {
    expect(halfPointsToPt(0)).toBe(0);
  });

  it('handles negative values', () => {
    expect(halfPointsToPt(-36)).toBe(-18);
  });
});

describe('ptToHalfPoints', () => {
  it('converts 18 pt to 36 half-points', () => {
    expect(ptToHalfPoints(18)).toBe(36);
  });

  it('converts 12 pt to 24 half-points', () => {
    expect(ptToHalfPoints(12)).toBe(24);
  });

  it('converts 0 to 0', () => {
    expect(ptToHalfPoints(0)).toBe(0);
  });

  it('handles negative values', () => {
    expect(ptToHalfPoints(-18)).toBe(-36);
  });
});

describe('half-points round-trip', () => {
  it('halfPointsToPt -> ptToHalfPoints is identity', () => {
    expect(ptToHalfPoints(halfPointsToPt(36))).toBe(36);
  });

  it('ptToHalfPoints -> halfPointsToPt is identity', () => {
    expect(halfPointsToPt(ptToHalfPoints(18))).toBe(18);
  });
});

// ---------------------------------------------------------------------------
// Hundredths of a point (DrawingML font sizes)
// ---------------------------------------------------------------------------

describe('hundredthsPtToPt', () => {
  it('converts 1800 to 18 pt', () => {
    expect(hundredthsPtToPt(1800)).toBe(18);
  });

  it('converts 2400 to 24 pt', () => {
    expect(hundredthsPtToPt(2400)).toBe(24);
  });

  it('converts 1200 to 12 pt', () => {
    expect(hundredthsPtToPt(1200)).toBe(12);
  });

  it('converts 100 to 1 pt', () => {
    expect(hundredthsPtToPt(100)).toBe(1);
  });

  it('converts 1050 to 10.5 pt', () => {
    expect(hundredthsPtToPt(1050)).toBe(10.5);
  });

  it('converts 0 to 0', () => {
    expect(hundredthsPtToPt(0)).toBe(0);
  });

  it('handles negative values', () => {
    expect(hundredthsPtToPt(-1800)).toBe(-18);
  });
});

describe('ptToHundredthsPt', () => {
  it('converts 18 pt to 1800', () => {
    expect(ptToHundredthsPt(18)).toBe(1800);
  });

  it('converts 24 pt to 2400', () => {
    expect(ptToHundredthsPt(24)).toBe(2400);
  });

  it('converts 1 pt to 100', () => {
    expect(ptToHundredthsPt(1)).toBe(100);
  });

  it('converts 0 to 0', () => {
    expect(ptToHundredthsPt(0)).toBe(0);
  });

  it('handles negative values', () => {
    expect(ptToHundredthsPt(-18)).toBe(-1800);
  });
});

describe('hundredths round-trip', () => {
  it('hundredthsPtToPt -> ptToHundredthsPt is identity', () => {
    expect(ptToHundredthsPt(hundredthsPtToPt(1800))).toBe(1800);
  });

  it('ptToHundredthsPt -> hundredthsPtToPt is identity', () => {
    expect(hundredthsPtToPt(ptToHundredthsPt(18))).toBe(18);
  });
});

// ---------------------------------------------------------------------------
// DrawingML angles (60,000ths of a degree)
// ---------------------------------------------------------------------------

describe('ooxml60kToDegrees', () => {
  it('converts 5400000 to 90 degrees', () => {
    expect(ooxml60kToDegrees(5400000)).toBe(90);
  });

  it('converts 10800000 to 180 degrees', () => {
    expect(ooxml60kToDegrees(10800000)).toBe(180);
  });

  it('converts 21600000 to 360 degrees', () => {
    expect(ooxml60kToDegrees(21600000)).toBe(360);
  });

  it('converts 0 to 0 degrees', () => {
    expect(ooxml60kToDegrees(0)).toBe(0);
  });

  it('converts 2700000 to 45 degrees', () => {
    expect(ooxml60kToDegrees(2700000)).toBe(45);
  });

  it('converts 60000 to 1 degree', () => {
    expect(ooxml60kToDegrees(60000)).toBe(1);
  });

  it('handles negative values', () => {
    expect(ooxml60kToDegrees(-5400000)).toBe(-90);
  });
});

describe('degreesToOoxml60k', () => {
  it('converts 90 degrees to 5400000', () => {
    expect(degreesToOoxml60k(90)).toBe(5400000);
  });

  it('converts 180 degrees to 10800000', () => {
    expect(degreesToOoxml60k(180)).toBe(10800000);
  });

  it('converts 360 degrees to 21600000', () => {
    expect(degreesToOoxml60k(360)).toBe(21600000);
  });

  it('converts 0 degrees to 0', () => {
    expect(degreesToOoxml60k(0)).toBe(0);
  });

  it('converts 1 degree to 60000', () => {
    expect(degreesToOoxml60k(1)).toBe(60000);
  });

  it('handles negative values', () => {
    expect(degreesToOoxml60k(-90)).toBe(-5400000);
  });
});

describe('ooxml60kToRadians', () => {
  it('converts 5400000 to pi/2 radians', () => {
    expect(ooxml60kToRadians(5400000)).toBeCloseTo(Math.PI / 2, 10);
  });

  it('converts 10800000 to pi radians', () => {
    expect(ooxml60kToRadians(10800000)).toBeCloseTo(Math.PI, 10);
  });

  it('converts 21600000 to 2*pi radians', () => {
    expect(ooxml60kToRadians(21600000)).toBeCloseTo(2 * Math.PI, 10);
  });

  it('converts 0 to 0 radians', () => {
    expect(ooxml60kToRadians(0)).toBe(0);
  });

  it('converts 2700000 to pi/4 radians', () => {
    expect(ooxml60kToRadians(2700000)).toBeCloseTo(Math.PI / 4, 10);
  });

  it('handles negative values', () => {
    expect(ooxml60kToRadians(-5400000)).toBeCloseTo(-Math.PI / 2, 10);
  });
});

describe('radiansToOoxml60k', () => {
  it('converts pi/2 to 5400000', () => {
    expect(radiansToOoxml60k(Math.PI / 2)).toBeCloseTo(5400000, 5);
  });

  it('converts pi to 10800000', () => {
    expect(radiansToOoxml60k(Math.PI)).toBeCloseTo(10800000, 5);
  });

  it('converts 2*pi to 21600000', () => {
    expect(radiansToOoxml60k(2 * Math.PI)).toBeCloseTo(21600000, 5);
  });

  it('converts 0 to 0', () => {
    expect(radiansToOoxml60k(0)).toBe(0);
  });

  it('handles negative values', () => {
    expect(radiansToOoxml60k(-Math.PI / 2)).toBeCloseTo(-5400000, 5);
  });
});

describe('angle round-trips', () => {
  it('degreesToOoxml60k -> ooxml60kToDegrees is identity', () => {
    expect(ooxml60kToDegrees(degreesToOoxml60k(45))).toBe(45);
  });

  it('ooxml60kToDegrees -> degreesToOoxml60k is identity', () => {
    expect(degreesToOoxml60k(ooxml60kToDegrees(2700000))).toBe(2700000);
  });

  it('radiansToOoxml60k -> ooxml60kToRadians is approximately identity', () => {
    const rad = Math.PI / 3;
    expect(ooxml60kToRadians(radiansToOoxml60k(rad))).toBeCloseTo(rad, 10);
  });

  it('ooxml60kToRadians -> radiansToOoxml60k is approximately identity', () => {
    const val = 3600000; // 60 degrees
    expect(radiansToOoxml60k(ooxml60kToRadians(val))).toBeCloseTo(val, 5);
  });
});

// ---------------------------------------------------------------------------
// DrawingML percentages (1/1000ths of a percent)
// ---------------------------------------------------------------------------

describe('ooxmlPercentToFraction', () => {
  it('converts 100000 to 1.0', () => {
    expect(ooxmlPercentToFraction(100000)).toBe(1.0);
  });

  it('converts 50000 to 0.5', () => {
    expect(ooxmlPercentToFraction(50000)).toBe(0.5);
  });

  it('converts 0 to 0.0', () => {
    expect(ooxmlPercentToFraction(0)).toBe(0.0);
  });

  it('converts 200000 to 2.0 (values > 100% are valid)', () => {
    expect(ooxmlPercentToFraction(200000)).toBe(2.0);
  });

  it('converts 33333 to approximately 0.33333', () => {
    expect(ooxmlPercentToFraction(33333)).toBeCloseTo(0.33333, 5);
  });

  it('converts 1000 to 0.01 (1%)', () => {
    expect(ooxmlPercentToFraction(1000)).toBe(0.01);
  });

  it('handles negative values', () => {
    expect(ooxmlPercentToFraction(-50000)).toBe(-0.5);
  });
});

describe('fractionToOoxmlPercent', () => {
  it('converts 1.0 to 100000', () => {
    expect(fractionToOoxmlPercent(1.0)).toBe(100000);
  });

  it('converts 0.5 to 50000', () => {
    expect(fractionToOoxmlPercent(0.5)).toBe(50000);
  });

  it('converts 0.0 to 0', () => {
    expect(fractionToOoxmlPercent(0.0)).toBe(0);
  });

  it('converts 2.0 to 200000', () => {
    expect(fractionToOoxmlPercent(2.0)).toBe(200000);
  });

  it('handles negative values', () => {
    expect(fractionToOoxmlPercent(-0.5)).toBe(-50000);
  });
});

describe('percentage round-trips', () => {
  it('ooxmlPercentToFraction -> fractionToOoxmlPercent is identity', () => {
    expect(fractionToOoxmlPercent(ooxmlPercentToFraction(75000))).toBe(75000);
  });

  it('fractionToOoxmlPercent -> ooxmlPercentToFraction is identity', () => {
    expect(ooxmlPercentToFraction(fractionToOoxmlPercent(0.75))).toBe(0.75);
  });
});
