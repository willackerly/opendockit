/**
 * EMU (English Metric Units) conversions.
 *
 * EMU is the fundamental coordinate unit in OOXML. All spatial values in
 * DrawingML, PresentationML, and SpreadsheetML are expressed in EMU.
 *
 * Reference: ECMA-376, Part 1, 20.1.2.1 (ST_Coordinate)
 *            Apache POI: org.apache.poi.util.Units
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 1 inch = 914,400 EMU. */
export const EMU_PER_INCH = 914400;

/** 1 typographic point (1/72 inch) = 12,700 EMU. */
export const EMU_PER_PT = 12700;

/** 1 centimeter = 360,000 EMU. */
export const EMU_PER_CM = 360000;

/** 1 millimeter = 36,000 EMU. */
export const EMU_PER_MM = 36000;

/** 1 pixel at 96 DPI = 9,525 EMU. Derived: 914400 / 96 = 9525. */
export const EMU_PER_PX_96DPI = 9525;

/** 1 DXA (twentieth of a point) = 635 EMU. Derived: 12700 / 20 = 635. */
export const EMU_PER_DXA = 635;

// ---------------------------------------------------------------------------
// EMU -> other units
// ---------------------------------------------------------------------------

/** Convert EMU to inches. */
export function emuToIn(emu: number): number {
  return emu / EMU_PER_INCH;
}

/** Convert EMU to typographic points (1/72 inch). */
export function emuToPt(emu: number): number {
  return emu / EMU_PER_PT;
}

/** Convert EMU to centimeters. */
export function emuToCm(emu: number): number {
  return emu / EMU_PER_CM;
}

/** Convert EMU to millimeters. */
export function emuToMm(emu: number): number {
  return emu / EMU_PER_MM;
}

/**
 * Convert EMU to pixels at a given DPI.
 *
 * @param emu   - value in English Metric Units
 * @param dpi   - dots per inch (default 96, standard screen resolution)
 * @returns raw floating-point pixel value (caller decides rounding)
 */
export function emuToPx(emu: number, dpi = 96): number {
  return (emu * dpi) / EMU_PER_INCH;
}

// ---------------------------------------------------------------------------
// Other units -> EMU
// ---------------------------------------------------------------------------

/** Convert inches to EMU. */
export function inToEmu(inches: number): number {
  return inches * EMU_PER_INCH;
}

/** Convert typographic points (1/72 inch) to EMU. */
export function ptToEmu(points: number): number {
  return points * EMU_PER_PT;
}

/** Convert centimeters to EMU. */
export function cmToEmu(cm: number): number {
  return cm * EMU_PER_CM;
}

/** Convert millimeters to EMU. */
export function mmToEmu(mm: number): number {
  return mm * EMU_PER_MM;
}

/**
 * Convert pixels to EMU at a given DPI.
 *
 * @param px    - pixel value
 * @param dpi   - dots per inch (default 96, standard screen resolution)
 * @returns value in EMU
 */
export function pxToEmu(px: number, dpi = 96): number {
  return (px * EMU_PER_INCH) / dpi;
}
