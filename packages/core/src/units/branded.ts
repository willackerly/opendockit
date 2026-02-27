/**
 * Branded unit types for compile-time unit safety.
 *
 * These types use TypeScript's structural typing escape hatch ("branding")
 * to prevent accidental mixing of EMU, point, and pixel values. At runtime
 * they are plain numbers — zero overhead.
 *
 * Existing code using `number` continues to work because branded types
 * extend `number`. New edit-layer code uses branded types explicitly for
 * safety at the mutable-model boundary.
 *
 * Pattern shared with pdfbox-ts (branded `Points` type).
 */

// ---------------------------------------------------------------------------
// Brand symbols (never exported — only used for type-level discrimination)
// ---------------------------------------------------------------------------

declare const EMU_BRAND: unique symbol;
declare const HUNDREDTHS_PT_BRAND: unique symbol;
declare const PIXELS_BRAND: unique symbol;

// ---------------------------------------------------------------------------
// Branded types
// ---------------------------------------------------------------------------

/**
 * English Metric Units — the fundamental OOXML coordinate unit.
 *
 * 1 inch = 914,400 EMU. All spatial values in DrawingML, PresentationML,
 * and the mutable edit model are stored as EMU integers.
 */
export type EMU = number & { readonly [EMU_BRAND]: true };

/**
 * Hundredths of a typographic point — used for DrawingML font sizes
 * and character spacing.
 *
 * Example: 1800 = 18pt, 1200 = 12pt.
 */
export type HundredthsPt = number & { readonly [HUNDREDTHS_PT_BRAND]: true };

/**
 * Pixels at a specific DPI (typically 96). Derived from EMU for display
 * only — never stored in the edit model or written to XML.
 */
export type Pixels = number & { readonly [PIXELS_BRAND]: true };

// ---------------------------------------------------------------------------
// Factory functions (the only way to create branded values)
// ---------------------------------------------------------------------------

/** Brand a number as EMU. */
export const emu = (n: number): EMU => n as EMU;

/** Brand a number as HundredthsPt. */
export const hundredthsPt = (n: number): HundredthsPt => n as HundredthsPt;

/** Brand a number as Pixels. */
export const pixels = (n: number): Pixels => n as Pixels;

// ---------------------------------------------------------------------------
// Type guards (for runtime validation at system boundaries)
// ---------------------------------------------------------------------------

/**
 * Check that a value is a finite integer suitable for EMU.
 * EMU values in OOXML are always integers.
 */
export function isValidEmu(n: number): n is EMU {
  return Number.isFinite(n) && Number.isInteger(n);
}

/**
 * Brand a number as EMU after validating it is a finite integer.
 * Throws if the value is not a valid EMU.
 */
export function emuChecked(n: number): EMU {
  if (!isValidEmu(n)) {
    throw new RangeError(`Invalid EMU value: ${n} (must be a finite integer)`);
  }
  return n;
}
