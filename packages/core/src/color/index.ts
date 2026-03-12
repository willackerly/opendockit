/**
 * Color math — barrel export.
 *
 * Re-exports all shared color utilities: conversions, parsing, compositing,
 * CSS formatting, and color transforms.
 */

export {
  // CSS formatting
  rgbaToString,
  rgbToString,
  rgbaToHex,
  colorToRgba,
  // Parsing
  parseHexColor,
  // Alpha compositing
  compositeOver,
  withAlpha,
  // HSL <-> RGB
  rgbToHsl,
  hslToRgb,
  hue2rgb,
  // scRGB
  scRgbToSrgb,
  // Color transforms
  applyTint,
  applyShade,
  toGrayscale,
  invertColor,
  // Utilities
  clampByte,
  lerpColor,
} from './color-math.js';
