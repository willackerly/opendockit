/**
 * @opendockit/render — Shared rendering infrastructure.
 *
 * Provides:
 * - Font metrics database for accurate text measurement
 * - Pre-computed metrics bundle for 42 font families
 * - Color utilities (RGB/HSL, parsing, compositing, transforms)
 * - 2D affine matrix math for rendering transforms
 */

// Font metrics
export { FontMetricsDB } from './font-metrics-db.js';
export type { FontFaceMetrics, FontMetricsBundle } from './font-metrics-db.js';

// Metrics bundle data
export { metricsBundle } from './metrics-bundle.js';

// Color utilities
export {
  rgbaToString,
  rgbToString,
  rgbaToHex,
  parseHexColor,
  compositeOver,
  withAlpha,
  rgbToHsl,
  hslToRgb,
  scRgbToSrgb,
  applyTint,
  applyShade,
  toGrayscale,
  invertColor,
  clampByte,
  lerpColor,
} from './color-utils.js';
export type { RgbaColor } from './color-utils.js';

// Matrix math
export {
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
} from './matrix.js';
export type { Matrix2D, Vec2, MatrixDecomposition } from './matrix.js';

// PDF backend
export { PDFBackend, PDFGradient, parseCssColor } from './pdf-backend.js';
export type {
  TextMeasurer,
  RegisteredPdfFont,
  RegisteredPdfImage,
  GradientShadingRecord,
} from './pdf-backend.js';
