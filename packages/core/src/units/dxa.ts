/**
 * DXA (Twentieths of a Point) conversions.
 *
 * DXA is the unit used in WordprocessingML (DOCX) for page margins,
 * indentation, table widths, and many other spacing values. Some
 * SpreadsheetML contexts also use DXA.
 *
 * 1 DXA = 1/20 of a typographic point = 1/1440 of an inch.
 *
 * Reference: ECMA-376, Part 4, 2.18.106 (ST_TwipsMeasure)
 *            Apache POI: org.apache.poi.util.Units.EMU_PER_DXA
 */

import { EMU_PER_DXA, EMU_PER_INCH } from './emu.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 1 typographic point = 20 DXA. */
export const DXA_PER_PT = 20;

/** 1 inch = 1,440 DXA. Derived: 72 points/inch * 20 DXA/point. */
export const DXA_PER_INCH = 1440;

/** 1 cm ~ 567 DXA. Derived: 1440 / 2.54, rounded to the nearest integer. */
export const DXA_PER_CM = 567;

// ---------------------------------------------------------------------------
// DXA -> other units
// ---------------------------------------------------------------------------

/** Convert DXA to typographic points. */
export function dxaToPt(dxa: number): number {
  return dxa / DXA_PER_PT;
}

/**
 * Convert DXA to pixels at a given DPI.
 *
 * @param dxa   - value in twentieths of a point
 * @param dpi   - dots per inch (default 96)
 * @returns raw floating-point pixel value (caller decides rounding)
 */
export function dxaToPx(dxa: number, dpi = 96): number {
  return (dxa * dpi) / DXA_PER_INCH;
}

/** Convert DXA to inches. */
export function dxaToIn(dxa: number): number {
  return dxa / DXA_PER_INCH;
}

/** Convert DXA to centimeters. */
export function dxaToCm(dxa: number): number {
  return dxa / DXA_PER_CM;
}

/** Convert DXA to EMU. */
export function dxaToEmu(dxa: number): number {
  return dxa * EMU_PER_DXA;
}

// ---------------------------------------------------------------------------
// Other units -> DXA
// ---------------------------------------------------------------------------

/** Convert typographic points to DXA. */
export function ptToDxa(pt: number): number {
  return pt * DXA_PER_PT;
}

/** Convert inches to DXA. */
export function inToDxa(inches: number): number {
  return inches * DXA_PER_INCH;
}
