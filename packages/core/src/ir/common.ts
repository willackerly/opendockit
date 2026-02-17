/**
 * Common types used across all IR definitions.
 *
 * These foundational types (colors, coordinates, dimensions) are imported
 * by every other IR module. Keep this file free of circular dependencies.
 */

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

/** RGBA color with components in the range 0-255 for r/g/b and 0-1 for alpha. */
export interface RgbaColor {
  /** Red channel (0-255). */
  r: number;
  /** Green channel (0-255). */
  g: number;
  /** Blue channel (0-255). */
  b: number;
  /** Alpha channel (0-1, where 1 is fully opaque). */
  a: number;
}

/**
 * A fully-resolved color ready for rendering.
 *
 * Extends {@link RgbaColor} with an optional `schemeKey` for provenance
 * tracking. When a color originates from a theme scheme (e.g. "accent1"),
 * the key is preserved so that downstream consumers can re-resolve against
 * a different theme if needed.
 */
export interface ResolvedColor extends RgbaColor {
  /** Theme scheme key that produced this color, e.g. "accent1", "dk1". */
  schemeKey?: string;
}

// ---------------------------------------------------------------------------
// Coordinates & Dimensions
// ---------------------------------------------------------------------------

/** A point in 2D space. All values in EMU (English Metric Units). */
export interface Point {
  x: number;
  y: number;
}

/** A width/height pair. All values in EMU. */
export interface Size {
  width: number;
  height: number;
}

/**
 * Axis-aligned bounding box.
 *
 * Origin is top-left. All values in EMU.
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
