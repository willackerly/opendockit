import { describe, it, expect } from 'vitest';
import {
  rgbaToString,
  rgbToString,
  rgbaToHex,
  parseHexColor,
  compositeOver,
  withAlpha,
  rgbToHsl,
  hslToRgb,
  applyTint,
  applyShade,
  toGrayscale,
  invertColor,
  clampByte,
  lerpColor,
  scRgbToSrgb,
} from '../color-utils.js';

// ---------------------------------------------------------------------------
// CSS formatting
// ---------------------------------------------------------------------------

describe('rgbaToString', () => {
  it('formats a fully opaque color', () => {
    expect(rgbaToString({ r: 255, g: 0, b: 0, a: 1 })).toBe('rgba(255, 0, 0, 1)');
  });

  it('formats a semi-transparent color', () => {
    expect(rgbaToString({ r: 68, g: 114, b: 196, a: 0.5 })).toBe('rgba(68, 114, 196, 0.5)');
  });

  it('formats black', () => {
    expect(rgbaToString({ r: 0, g: 0, b: 0, a: 1 })).toBe('rgba(0, 0, 0, 1)');
  });
});

describe('rgbToString', () => {
  it('formats ignoring alpha', () => {
    expect(rgbToString({ r: 255, g: 128, b: 0, a: 0.5 })).toBe('rgb(255, 128, 0)');
  });
});

describe('rgbaToHex', () => {
  it('formats red as FF0000', () => {
    expect(rgbaToHex({ r: 255, g: 0, b: 0, a: 1 })).toBe('FF0000');
  });

  it('formats blue as 0000FF', () => {
    expect(rgbaToHex({ r: 0, g: 0, b: 255, a: 1 })).toBe('0000FF');
  });

  it('formats accent1 as 4472C4', () => {
    expect(rgbaToHex({ r: 68, g: 114, b: 196, a: 1 })).toBe('4472C4');
  });
});

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

describe('parseHexColor', () => {
  it('parses 6-char hex', () => {
    const c = parseHexColor('FF0000');
    expect(c).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  it('parses with leading hash', () => {
    const c = parseHexColor('#4472C4');
    expect(c).toEqual({ r: 68, g: 114, b: 196, a: 1 });
  });

  it('parses lowercase hex', () => {
    const c = parseHexColor('ff8800');
    expect(c).toEqual({ r: 255, g: 136, b: 0, a: 1 });
  });

  it('parses black', () => {
    const c = parseHexColor('000000');
    expect(c).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  it('parses white', () => {
    const c = parseHexColor('FFFFFF');
    expect(c).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  });

  it('round-trips with rgbaToHex', () => {
    const hex = '4472C4';
    const color = parseHexColor(hex);
    expect(rgbaToHex(color)).toBe(hex);
  });
});

// ---------------------------------------------------------------------------
// Alpha compositing
// ---------------------------------------------------------------------------

describe('compositeOver', () => {
  it('fully opaque fg covers bg completely', () => {
    const fg = { r: 255, g: 0, b: 0, a: 1 };
    const bg = { r: 0, g: 0, b: 255, a: 1 };
    const result = compositeOver(fg, bg);
    expect(result.r).toBe(255);
    expect(result.g).toBe(0);
    expect(result.b).toBe(0);
    expect(result.a).toBe(1);
  });

  it('fully transparent fg shows bg', () => {
    const fg = { r: 255, g: 0, b: 0, a: 0 };
    const bg = { r: 0, g: 0, b: 255, a: 1 };
    const result = compositeOver(fg, bg);
    expect(result.r).toBe(0);
    expect(result.g).toBe(0);
    expect(result.b).toBe(255);
    expect(result.a).toBe(1);
  });

  it('50% transparent fg blends with bg', () => {
    const fg = { r: 255, g: 0, b: 0, a: 0.5 };
    const bg = { r: 255, g: 0, b: 0, a: 1 };
    const result = compositeOver(fg, bg);
    // Blending same-color channels — result should be the same color
    expect(result.r).toBe(255);
    expect(result.a).toBeCloseTo(1);
  });
});

describe('withAlpha', () => {
  it('scales alpha', () => {
    const c = { r: 255, g: 0, b: 0, a: 1 };
    expect(withAlpha(c, 0.5).a).toBeCloseTo(0.5);
  });

  it('clamps to [0, 1]', () => {
    const c = { r: 255, g: 0, b: 0, a: 0.8 };
    expect(withAlpha(c, 2).a).toBe(1);
    expect(withAlpha(c, -1).a).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// HSL conversions
// ---------------------------------------------------------------------------

describe('rgbToHsl', () => {
  it('converts red to HSL', () => {
    const [h, s, l] = rgbToHsl(255, 0, 0);
    expect(h).toBeCloseTo(0);
    expect(s).toBeCloseTo(1);
    expect(l).toBeCloseTo(0.5);
  });

  it('converts black to HSL', () => {
    const [h, s, l] = rgbToHsl(0, 0, 0);
    expect(l).toBeCloseTo(0);
    expect(s).toBeCloseTo(0);
    expect(h).toBe(0);
  });

  it('converts white to HSL', () => {
    const [_h, s, l] = rgbToHsl(255, 255, 255);
    expect(l).toBeCloseTo(1);
    expect(s).toBeCloseTo(0);
  });

  it('converts green to HSL', () => {
    const [h, s, l] = rgbToHsl(0, 255, 0);
    expect(h).toBeCloseTo(120);
    expect(s).toBeCloseTo(1);
    expect(l).toBeCloseTo(0.5);
  });

  it('converts blue to HSL', () => {
    const [h, s, l] = rgbToHsl(0, 0, 255);
    expect(h).toBeCloseTo(240);
    expect(s).toBeCloseTo(1);
    expect(l).toBeCloseTo(0.5);
  });
});

describe('hslToRgb', () => {
  it('converts red from HSL', () => {
    const [r, g, b] = hslToRgb(0, 1, 0.5);
    expect(r).toBe(255);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });

  it('converts black from HSL', () => {
    const [r, g, b] = hslToRgb(0, 0, 0);
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });

  it('converts white from HSL', () => {
    const [r, g, b] = hslToRgb(0, 0, 1);
    expect(r).toBe(255);
    expect(g).toBe(255);
    expect(b).toBe(255);
  });

  it('converts green from HSL (hue=120)', () => {
    const [r, g, b] = hslToRgb(120, 1, 0.5);
    expect(r).toBe(0);
    expect(g).toBe(255);
    expect(b).toBe(0);
  });

  it('round-trips with rgbToHsl', () => {
    // accent1 = #4472C4
    const [h, s, l] = rgbToHsl(68, 114, 196);
    const [r, g, b] = hslToRgb(h, s, l);
    expect(r).toBeCloseTo(68, -1);
    expect(g).toBeCloseTo(114, -1);
    expect(b).toBeCloseTo(196, -1);
  });
});

// ---------------------------------------------------------------------------
// Color transforms
// ---------------------------------------------------------------------------

describe('applyTint', () => {
  it('tint 1.0 returns original', () => {
    const c = { r: 255, g: 0, b: 0, a: 1 };
    const result = applyTint(c, 1);
    expect(result.r).toBe(255);
    expect(result.g).toBe(0);
    expect(result.b).toBe(0);
  });

  it('tint 0.0 returns white', () => {
    const c = { r: 255, g: 0, b: 0, a: 1 };
    const result = applyTint(c, 0);
    expect(result.r).toBe(255);
    expect(result.g).toBe(255);
    expect(result.b).toBe(255);
  });

  it('tint 0.5 on black returns medium gray', () => {
    const c = { r: 0, g: 0, b: 0, a: 1 };
    const result = applyTint(c, 0.5);
    // 255 - (255 - 0) * 0.5 = 128
    expect(result.r).toBeCloseTo(128, -1);
    expect(result.g).toBeCloseTo(128, -1);
    expect(result.b).toBeCloseTo(128, -1);
  });
});

describe('applyShade', () => {
  it('shade 1.0 returns original', () => {
    const c = { r: 255, g: 255, b: 255, a: 1 };
    const result = applyShade(c, 1);
    expect(result.r).toBe(255);
    expect(result.g).toBe(255);
    expect(result.b).toBe(255);
  });

  it('shade 0.0 returns black', () => {
    const c = { r: 255, g: 255, b: 255, a: 1 };
    const result = applyShade(c, 0);
    expect(result.r).toBe(0);
    expect(result.g).toBe(0);
    expect(result.b).toBe(0);
  });

  it('shade 0.5 on white returns medium gray', () => {
    const c = { r: 255, g: 255, b: 255, a: 1 };
    const result = applyShade(c, 0.5);
    expect(result.r).toBeCloseTo(128, -1);
  });
});

describe('toGrayscale', () => {
  it('converts red to grayscale', () => {
    const c = { r: 255, g: 0, b: 0, a: 1 };
    const result = toGrayscale(c);
    // BT.601: 0.299 * 255 ≈ 76
    expect(result.r).toBe(result.g);
    expect(result.g).toBe(result.b);
    expect(result.r).toBeCloseTo(76, -1);
  });

  it('white stays white', () => {
    const c = { r: 255, g: 255, b: 255, a: 1 };
    const result = toGrayscale(c);
    expect(result.r).toBe(255);
    expect(result.g).toBe(255);
    expect(result.b).toBe(255);
  });

  it('black stays black', () => {
    const c = { r: 0, g: 0, b: 0, a: 1 };
    const result = toGrayscale(c);
    expect(result.r).toBe(0);
  });
});

describe('invertColor', () => {
  it('inverts black to white', () => {
    const c = { r: 0, g: 0, b: 0, a: 1 };
    const result = invertColor(c);
    expect(result.r).toBe(255);
    expect(result.g).toBe(255);
    expect(result.b).toBe(255);
  });

  it('inverts red to cyan', () => {
    const c = { r: 255, g: 0, b: 0, a: 1 };
    const result = invertColor(c);
    expect(result.r).toBe(0);
    expect(result.g).toBe(255);
    expect(result.b).toBe(255);
  });

  it('double invert returns original', () => {
    const c = { r: 68, g: 114, b: 196, a: 1 };
    expect(invertColor(invertColor(c))).toEqual(c);
  });
});

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

describe('clampByte', () => {
  it('clamps values below 0 to 0', () => {
    expect(clampByte(-1)).toBe(0);
    expect(clampByte(-100)).toBe(0);
  });

  it('clamps values above 255 to 255', () => {
    expect(clampByte(256)).toBe(255);
    expect(clampByte(1000)).toBe(255);
  });

  it('rounds fractional values', () => {
    expect(clampByte(128.4)).toBe(128);
    expect(clampByte(128.6)).toBe(129);
  });

  it('passes through values in range', () => {
    expect(clampByte(0)).toBe(0);
    expect(clampByte(128)).toBe(128);
    expect(clampByte(255)).toBe(255);
  });
});

describe('lerpColor', () => {
  it('t=0 returns first color', () => {
    const a = { r: 0, g: 0, b: 0, a: 1 };
    const b = { r: 255, g: 255, b: 255, a: 1 };
    const result = lerpColor(a, b, 0);
    expect(result).toEqual(a);
  });

  it('t=1 returns second color', () => {
    const a = { r: 0, g: 0, b: 0, a: 1 };
    const b = { r: 255, g: 255, b: 255, a: 1 };
    const result = lerpColor(a, b, 1);
    expect(result).toEqual(b);
  });

  it('t=0.5 returns midpoint', () => {
    const a = { r: 0, g: 0, b: 0, a: 1 };
    const b = { r: 255, g: 255, b: 255, a: 1 };
    const result = lerpColor(a, b, 0.5);
    expect(result.r).toBeCloseTo(128, -1);
  });
});

describe('scRgbToSrgb', () => {
  it('converts 0 to 0', () => {
    expect(scRgbToSrgb(0)).toBe(0);
  });

  it('converts 1 to approximately 1', () => {
    expect(scRgbToSrgb(1)).toBeCloseTo(1, 3);
  });

  it('uses linear formula for small values', () => {
    expect(scRgbToSrgb(0.001)).toBeCloseTo(0.001 * 12.92, 6);
  });
});
