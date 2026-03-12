/**
 * Standalone color math functions shared across the monorepo.
 *
 * Provides RGB/HSL conversions, hex parsing, scRGB conversion, alpha
 * compositing, CSS string formatting, and color transforms.
 *
 * These utilities operate only on plain color values — they are independent
 * of any XML parsing or theme resolution.
 *
 * Color math follows Apache POI's approach for OOXML parity:
 *   - tint/shade operate in linear RGB space
 *   - hue/sat/lum modifications operate in HSL space
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 20.1.2.3 (Color)
 */

import type { RgbaColor } from '../ir/common.js';

// ---------------------------------------------------------------------------
// CSS formatting
// ---------------------------------------------------------------------------

/**
 * Format an RGBA color as a CSS `rgba()` string.
 *
 * @example
 * rgbaToString({ r: 255, g: 0, b: 0, a: 0.5 }) // 'rgba(255, 0, 0, 0.5)'
 */
export function rgbaToString(color: RgbaColor): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
}

/**
 * Format an RGBA color as a CSS `rgb()` string (alpha ignored).
 *
 * @example
 * rgbToString({ r: 255, g: 0, b: 0, a: 1 }) // 'rgb(255, 0, 0)'
 */
export function rgbToString(color: RgbaColor): string {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

/**
 * Format an RGBA color as a 6-character hex string (alpha ignored).
 *
 * @example
 * rgbaToHex({ r: 255, g: 0, b: 0, a: 1 }) // 'FF0000'
 */
export function rgbaToHex(color: RgbaColor): string {
  return (
    color.r.toString(16).padStart(2, '0').toUpperCase() +
    color.g.toString(16).padStart(2, '0').toUpperCase() +
    color.b.toString(16).padStart(2, '0').toUpperCase()
  );
}

/**
 * Format a color as a CSS `rgba()` string.
 *
 * This is an alias for {@link rgbaToString} provided for convenience —
 * it accepts any object with r/g/b/a fields (including ResolvedColor).
 *
 * @example
 * colorToRgba({ r: 255, g: 0, b: 0, a: 0.5 }) // 'rgba(255, 0, 0, 0.5)'
 */
export function colorToRgba(color: { r: number; g: number; b: number; a: number }): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a 6-character hex color string to an RgbaColor.
 *
 * Accepts strings with or without leading '#'. Defaults missing digits to '0'.
 *
 * @example
 * parseHexColor('FF0000')  // { r: 255, g: 0, b: 0, a: 1 }
 * parseHexColor('#4472C4') // { r: 68, g: 114, b: 196, a: 1 }
 */
export function parseHexColor(hex: string): RgbaColor {
  const cleaned = hex.replace('#', '').padStart(6, '0');
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  return { r: clampByte(r), g: clampByte(g), b: clampByte(b), a: 1 };
}

// ---------------------------------------------------------------------------
// Alpha compositing
// ---------------------------------------------------------------------------

/**
 * Composite a foreground color over a background color (Porter-Duff SRC_OVER).
 *
 * @param fg - Foreground color (RGBA)
 * @param bg - Background color (RGBA)
 * @returns Composited RGBA color
 */
export function compositeOver(fg: RgbaColor, bg: RgbaColor): RgbaColor {
  const a = fg.a + bg.a * (1 - fg.a);
  if (a === 0) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  const r = (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a;
  const g = (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a;
  const b = (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a;
  return {
    r: clampByte(Math.round(r)),
    g: clampByte(Math.round(g)),
    b: clampByte(Math.round(b)),
    a,
  };
}

/**
 * Multiply a color's alpha by a factor.
 *
 * @param color - Input color
 * @param factor - Alpha multiplier (0-1)
 * @returns Color with scaled alpha, clamped to [0, 1]
 */
export function withAlpha(color: RgbaColor, factor: number): RgbaColor {
  return { ...color, a: Math.max(0, Math.min(1, color.a * factor)) };
}

// ---------------------------------------------------------------------------
// HSL <-> RGB conversions
// ---------------------------------------------------------------------------

/**
 * Convert RGB (0-255) to HSL.
 *
 * Returns `[hue (0-360), saturation (0-1), lightness (0-1)]`.
 *
 * Implementation matches Apache POI's RGB2HSL for OOXML parity.
 */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rN = r / 255;
  const gN = g / 255;
  const bN = b / 255;

  const min = Math.min(rN, gN, bN);
  const max = Math.max(rN, gN, bN);

  // Hue
  let h = 0;
  if (max !== min) {
    if (max === rN) {
      h = ((60 * (gN - bN)) / (max - min) + 360) % 360;
    } else if (max === gN) {
      h = (60 * (bN - rN)) / (max - min) + 120;
    } else {
      h = (60 * (rN - gN)) / (max - min) + 240;
    }
  }

  // Lightness
  const l = (max + min) / 2;

  // Saturation
  let s = 0;
  if (max !== min) {
    if (l <= 0.5) {
      s = (max - min) / (max + min);
    } else {
      s = (max - min) / (2 - max - min);
    }
  }

  return [h, s, l];
}

/**
 * Convert HSL to RGB (0-255).
 *
 * h: 0-360, s: 0-1, l: 0-1.
 *
 * Implementation matches Apache POI's HSL2RGB for OOXML parity.
 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  h = ((h % 360) + 360) % 360;

  const hN = h / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - s * l;
  const p = 2 * l - q;

  const r = Math.max(0, Math.min(1, hue2rgb(p, q, hN + 1 / 3)));
  const g = Math.max(0, Math.min(1, hue2rgb(p, q, hN)));
  const b = Math.max(0, Math.min(1, hue2rgb(p, q, hN - 1 / 3)));

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/** Internal helper for HSL-to-RGB conversion (matches POI's HUE2RGB). */
export function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;

  if (6 * t < 1) return p + (q - p) * 6 * t;
  if (2 * t < 1) return q;
  if (3 * t < 2) return p + (q - p) * 6 * (2 / 3 - t);
  return p;
}

// ---------------------------------------------------------------------------
// scRGB conversion
// ---------------------------------------------------------------------------

/**
 * Convert a single scRGB component to sRGB (apply gamma correction).
 *
 * scRGB uses linear light values; sRGB uses perceptual (gamma-corrected) values.
 */
export function scRgbToSrgb(val: number): number {
  if (val <= 0.0031308) {
    return val * 12.92;
  }
  return 1.055 * Math.pow(val, 1 / 2.4) - 0.055;
}

// ---------------------------------------------------------------------------
// Color transforms
// ---------------------------------------------------------------------------

/**
 * Apply a tint to a color (move towards white).
 *
 * A tint of 1.0 returns the original color; 0.0 returns white.
 *
 * Formula: `255 - (255 - channel) * tintFraction`
 *
 * @param color - Input color
 * @param tintFraction - Tint fraction in [0, 1]
 */
export function applyTint(color: RgbaColor, tintFraction: number): RgbaColor {
  return {
    r: clampByte(Math.round(255 - (255 - color.r) * tintFraction)),
    g: clampByte(Math.round(255 - (255 - color.g) * tintFraction)),
    b: clampByte(Math.round(255 - (255 - color.b) * tintFraction)),
    a: color.a,
  };
}

/**
 * Apply a shade to a color (move towards black).
 *
 * A shade of 1.0 returns the original color; 0.0 returns black.
 *
 * Formula: `channel * shadeFraction`
 *
 * @param color - Input color
 * @param shadeFraction - Shade fraction in [0, 1]
 */
export function applyShade(color: RgbaColor, shadeFraction: number): RgbaColor {
  return {
    r: clampByte(Math.round(color.r * shadeFraction)),
    g: clampByte(Math.round(color.g * shadeFraction)),
    b: clampByte(Math.round(color.b * shadeFraction)),
    a: color.a,
  };
}

/**
 * Desaturate a color using ITU-R BT.601 luma coefficients.
 *
 * The resulting color has equal R, G, B channels (grayscale).
 */
export function toGrayscale(color: RgbaColor): RgbaColor {
  const gray = clampByte(Math.round(0.299 * color.r + 0.587 * color.g + 0.114 * color.b));
  return { r: gray, g: gray, b: gray, a: color.a };
}

/**
 * Invert a color (complement each channel).
 *
 * Formula: `255 - channel`
 */
export function invertColor(color: RgbaColor): RgbaColor {
  return {
    r: 255 - color.r,
    g: 255 - color.g,
    b: 255 - color.b,
    a: color.a,
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Clamp a value to the 0-255 byte range, rounding to an integer.
 */
export function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/**
 * Linearly interpolate between two colors.
 *
 * @param a - Start color
 * @param b - End color
 * @param t - Interpolation factor (0 = a, 1 = b)
 */
export function lerpColor(a: RgbaColor, b: RgbaColor, t: number): RgbaColor {
  return {
    r: clampByte(a.r + (b.r - a.r) * t),
    g: clampByte(a.g + (b.g - a.g) * t),
    b: clampByte(a.b + (b.b - a.b) * t),
    a: Math.max(0, Math.min(1, a.a + (b.a - a.a) * t)),
  };
}
