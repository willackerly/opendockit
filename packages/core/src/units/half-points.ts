/**
 * Half-point, hundredths-of-a-point, angle, and percentage conversions.
 *
 * OOXML uses several non-obvious fractional units:
 * - Half-points for font sizes in DOCX (e.g., 36 half-points = 18 pt)
 * - Hundredths of a point for DrawingML font sizes (e.g., 1800 = 18 pt)
 * - 60,000ths of a degree for DrawingML angles (e.g., 5400000 = 90 degrees)
 * - 1/1000ths of a percent for DrawingML percentages (e.g., 100000 = 100%)
 *
 * Reference: ECMA-376, Part 1, 20.1.10.* (DrawingML simple types)
 */

// ---------------------------------------------------------------------------
// Half-points (WordprocessingML font sizes)
// ---------------------------------------------------------------------------

/** Convert half-points to typographic points. DOCX uses half-points for sz. */
export function halfPointsToPt(halfPts: number): number {
  return halfPts / 2;
}

/** Convert typographic points to half-points. */
export function ptToHalfPoints(pt: number): number {
  return pt * 2;
}

// ---------------------------------------------------------------------------
// Hundredths of a point (DrawingML font sizes)
// ---------------------------------------------------------------------------

/**
 * Convert hundredths of a point to typographic points.
 * DrawingML uses hundredths of a point for font sizes (e.g., 1800 = 18 pt).
 */
export function hundredthsPtToPt(hundredths: number): number {
  return hundredths / 100;
}

/** Convert typographic points to hundredths of a point. */
export function ptToHundredthsPt(pt: number): number {
  return pt * 100;
}

// ---------------------------------------------------------------------------
// DrawingML angles (60,000ths of a degree)
// ---------------------------------------------------------------------------

/**
 * Convert DrawingML angle units (60,000ths of a degree) to radians.
 *
 * DrawingML uses 60,000ths of a degree as its angle unit. For example,
 * 5,400,000 = 90 degrees = pi/2 radians.
 *
 * Reference: ECMA-376, Part 1, 20.1.10.3 (ST_Angle)
 */
export function ooxml60kToRadians(val: number): number {
  return (val / 60000) * (Math.PI / 180);
}

/**
 * Convert DrawingML angle units (60,000ths of a degree) to degrees.
 *
 * Example: 5,400,000 -> 90 degrees.
 */
export function ooxml60kToDegrees(val: number): number {
  return val / 60000;
}

/** Convert degrees to DrawingML angle units (60,000ths of a degree). */
export function degreesToOoxml60k(degrees: number): number {
  return degrees * 60000;
}

/** Convert radians to DrawingML angle units (60,000ths of a degree). */
export function radiansToOoxml60k(radians: number): number {
  return (radians * 180 * 60000) / Math.PI;
}

// ---------------------------------------------------------------------------
// DrawingML percentages (1/1000ths of a percent)
// ---------------------------------------------------------------------------

/**
 * Convert DrawingML percentage units (1/1000ths of a percent) to a
 * decimal fraction. For example, 100,000 -> 1.0, 50,000 -> 0.5.
 *
 * Reference: ECMA-376, Part 1, 20.1.10.41 (ST_Percentage)
 */
export function ooxmlPercentToFraction(val: number): number {
  return val / 100000;
}

/**
 * Convert a decimal fraction to DrawingML percentage units
 * (1/1000ths of a percent). For example, 1.0 -> 100,000, 0.5 -> 50,000.
 */
export function fractionToOoxmlPercent(fraction: number): number {
  return fraction * 100000;
}
