/**
 * Unit conversion utilities for OOXML coordinate systems.
 *
 * Re-exports all conversion functions and constants from:
 * - {@link ./emu} — EMU (English Metric Units)
 * - {@link ./dxa} — DXA (Twentieths of a Point)
 * - {@link ./half-points} — Half-points, hundredths, angles, percentages
 */

export {
  // Constants
  EMU_PER_INCH,
  EMU_PER_PT,
  EMU_PER_CM,
  EMU_PER_MM,
  EMU_PER_PX_96DPI,
  EMU_PER_DXA,
  // EMU -> other
  emuToIn,
  emuToPt,
  emuToCm,
  emuToMm,
  emuToPx,
  // Other -> EMU
  inToEmu,
  ptToEmu,
  cmToEmu,
  mmToEmu,
  pxToEmu,
} from './emu.js';

export {
  // Constants
  DXA_PER_PT,
  DXA_PER_INCH,
  DXA_PER_CM,
  // DXA -> other
  dxaToPt,
  dxaToPx,
  dxaToIn,
  dxaToCm,
  dxaToEmu,
  // Other -> DXA
  ptToDxa,
  inToDxa,
} from './dxa.js';

export {
  // Half-points
  halfPointsToPt,
  ptToHalfPoints,
  // Hundredths of a point
  hundredthsPtToPt,
  ptToHundredthsPt,
  // DrawingML angles
  ooxml60kToRadians,
  ooxml60kToDegrees,
  degreesToOoxml60k,
  radiansToOoxml60k,
  // DrawingML percentages
  ooxmlPercentToFraction,
  fractionToOoxmlPercent,
} from './half-points.js';
