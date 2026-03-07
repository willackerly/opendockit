/**
 * Branded unit types for compile-time unit safety.
 *
 * These types use TypeScript's structural typing escape hatch ("branding")
 * to prevent accidental mixing of Points and Pixels values. At runtime
 * they are plain numbers — zero overhead.
 *
 * Existing code using `number` continues to work because branded types
 * extend `number`. New code can adopt branded types gradually for safety
 * at API boundaries.
 *
 * Pattern shared with OpenDocKit (branded `EMU`, `HundredthsPt`, `Pixels`).
 */

// ---------------------------------------------------------------------------
// Brand symbols (never exported — only used for type-level discrimination)
// ---------------------------------------------------------------------------

declare const POINTS_BRAND: unique symbol;
declare const PIXELS_BRAND: unique symbol;

// ---------------------------------------------------------------------------
// Branded types
// ---------------------------------------------------------------------------

/**
 * Typographic points — the standard PDF coordinate unit.
 *
 * 1 inch = 72 points. All spatial values in PDF page space (page size,
 * annotation rectangles, font sizes, line widths) are in points.
 */
export type Points = number & { readonly [POINTS_BRAND]: true };

/**
 * Pixels at a specific DPI (typically 72 or 96). Derived from Points for
 * display rendering — never stored in PDF structures.
 */
export type Pixels = number & { readonly [PIXELS_BRAND]: true };

// ---------------------------------------------------------------------------
// Factory functions (the only way to create branded values)
// ---------------------------------------------------------------------------

/** Brand a number as Points. */
export const points = (n: number): Points => n as Points;

/** Brand a number as Pixels. */
export const pixels = (n: number): Pixels => n as Pixels;

// ---------------------------------------------------------------------------
// Validation (for runtime checks at system boundaries)
// ---------------------------------------------------------------------------

/**
 * Check that a value is a finite number suitable for Points.
 * Returns `true` if `n` is finite (not NaN, not +/-Infinity).
 */
export function isValidPoints(n: number): n is Points {
  return Number.isFinite(n);
}

/**
 * Brand a number as Points after validating it is finite.
 * Throws if the value is NaN or Infinity.
 */
export function pointsChecked(n: number): Points {
  if (!isValidPoints(n)) {
    throw new RangeError(
      `Invalid Points value: ${n} (must be a finite number)`
    );
  }
  return n;
}

/**
 * Check that a value is a finite number suitable for Pixels.
 * Returns `true` if `n` is finite (not NaN, not +/-Infinity).
 */
export function isValidPixels(n: number): n is Pixels {
  return Number.isFinite(n);
}

/**
 * Brand a number as Pixels after validating it is finite.
 * Throws if the value is NaN or Infinity.
 */
export function pixelsChecked(n: number): Pixels {
  if (!isValidPixels(n)) {
    throw new RangeError(
      `Invalid Pixels value: ${n} (must be a finite number)`
    );
  }
  return n;
}
