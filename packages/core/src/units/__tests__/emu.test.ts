import { describe, it, expect } from 'vitest';
import {
  EMU_PER_INCH,
  EMU_PER_PT,
  EMU_PER_CM,
  EMU_PER_MM,
  EMU_PER_PX_96DPI,
  EMU_PER_DXA,
  emuToIn,
  emuToPt,
  emuToCm,
  emuToMm,
  emuToPx,
  inToEmu,
  ptToEmu,
  cmToEmu,
  mmToEmu,
  pxToEmu,
} from '../emu.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('EMU constants', () => {
  it('EMU_PER_INCH is 914400', () => {
    expect(EMU_PER_INCH).toBe(914400);
  });

  it('EMU_PER_PT is 12700', () => {
    expect(EMU_PER_PT).toBe(12700);
  });

  it('EMU_PER_CM is 360000', () => {
    expect(EMU_PER_CM).toBe(360000);
  });

  it('EMU_PER_MM is 36000', () => {
    expect(EMU_PER_MM).toBe(36000);
  });

  it('EMU_PER_PX_96DPI is 9525', () => {
    expect(EMU_PER_PX_96DPI).toBe(9525);
  });

  it('EMU_PER_DXA is 635', () => {
    expect(EMU_PER_DXA).toBe(635);
  });

  it('constants are self-consistent: EMU_PER_INCH = EMU_PER_PT * 72', () => {
    expect(EMU_PER_INCH).toBe(EMU_PER_PT * 72);
  });

  it('constants are self-consistent: EMU_PER_CM = EMU_PER_MM * 10', () => {
    expect(EMU_PER_CM).toBe(EMU_PER_MM * 10);
  });

  it('constants are self-consistent: EMU_PER_PX_96DPI = EMU_PER_INCH / 96', () => {
    expect(EMU_PER_PX_96DPI).toBe(EMU_PER_INCH / 96);
  });

  it('constants are self-consistent: EMU_PER_DXA = EMU_PER_PT / 20', () => {
    expect(EMU_PER_DXA).toBe(EMU_PER_PT / 20);
  });
});

// ---------------------------------------------------------------------------
// EMU -> inches
// ---------------------------------------------------------------------------

describe('emuToIn', () => {
  it('converts 914400 EMU to 1 inch', () => {
    expect(emuToIn(914400)).toBe(1);
  });

  it('converts 457200 EMU to 0.5 inch', () => {
    expect(emuToIn(457200)).toBe(0.5);
  });

  it('converts 0 to 0', () => {
    expect(emuToIn(0)).toBe(0);
  });

  it('handles negative values', () => {
    expect(emuToIn(-914400)).toBe(-1);
  });

  it('handles standard slide width: 9144000 EMU = 10 inches', () => {
    expect(emuToIn(9144000)).toBe(10);
  });

  it('handles standard slide height: 6858000 EMU = 7.5 inches', () => {
    expect(emuToIn(6858000)).toBe(7.5);
  });
});

// ---------------------------------------------------------------------------
// EMU -> points
// ---------------------------------------------------------------------------

describe('emuToPt', () => {
  it('converts 12700 EMU to 1 point', () => {
    expect(emuToPt(12700)).toBe(1);
  });

  it('converts 914400 EMU to 72 points', () => {
    expect(emuToPt(914400)).toBe(72);
  });

  it('converts 0 to 0', () => {
    expect(emuToPt(0)).toBe(0);
  });

  it('handles negative values', () => {
    expect(emuToPt(-12700)).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// EMU -> centimeters
// ---------------------------------------------------------------------------

describe('emuToCm', () => {
  it('converts 360000 EMU to 1 cm', () => {
    expect(emuToCm(360000)).toBe(1);
  });

  it('converts 0 to 0', () => {
    expect(emuToCm(0)).toBe(0);
  });

  it('handles negative values', () => {
    expect(emuToCm(-360000)).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// EMU -> millimeters
// ---------------------------------------------------------------------------

describe('emuToMm', () => {
  it('converts 36000 EMU to 1 mm', () => {
    expect(emuToMm(36000)).toBe(1);
  });

  it('converts 360000 EMU to 10 mm', () => {
    expect(emuToMm(360000)).toBe(10);
  });

  it('converts 0 to 0', () => {
    expect(emuToMm(0)).toBe(0);
  });

  it('handles negative values', () => {
    expect(emuToMm(-36000)).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// EMU -> pixels
// ---------------------------------------------------------------------------

describe('emuToPx', () => {
  it('converts 914400 EMU to 96 pixels at default 96 DPI', () => {
    expect(emuToPx(914400)).toBe(96);
  });

  it('converts 9525 EMU to 1 pixel at 96 DPI', () => {
    expect(emuToPx(9525)).toBe(1);
  });

  it('converts 914400 EMU to 72 pixels at 72 DPI', () => {
    expect(emuToPx(914400, 72)).toBe(72);
  });

  it('converts 914400 EMU to 150 pixels at 150 DPI', () => {
    expect(emuToPx(914400, 150)).toBe(150);
  });

  it('standard slide width: 9144000 EMU = 960 px at 96 DPI', () => {
    expect(emuToPx(9144000)).toBe(960);
  });

  it('standard slide height: 6858000 EMU = 720 px at 96 DPI', () => {
    expect(emuToPx(6858000)).toBe(720);
  });

  it('converts 0 to 0', () => {
    expect(emuToPx(0)).toBe(0);
  });

  it('handles negative values', () => {
    expect(emuToPx(-9525)).toBe(-1);
  });

  it('returns raw float (does not round)', () => {
    // 1 EMU at 96 DPI = 96/914400 ~ 0.000104987...
    const result = emuToPx(1);
    expect(result).toBeCloseTo(96 / 914400, 10);
    expect(Number.isInteger(result)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// inches -> EMU
// ---------------------------------------------------------------------------

describe('inToEmu', () => {
  it('converts 1 inch to 914400 EMU', () => {
    expect(inToEmu(1)).toBe(914400);
  });

  it('converts 0.5 inch to 457200 EMU', () => {
    expect(inToEmu(0.5)).toBe(457200);
  });

  it('converts 10 inches to 9144000 EMU (standard slide width)', () => {
    expect(inToEmu(10)).toBe(9144000);
  });

  it('converts 7.5 inches to 6858000 EMU (standard slide height)', () => {
    expect(inToEmu(7.5)).toBe(6858000);
  });

  it('converts 0 to 0', () => {
    expect(inToEmu(0)).toBe(0);
  });

  it('handles negative values', () => {
    expect(inToEmu(-1)).toBe(-914400);
  });
});

// ---------------------------------------------------------------------------
// points -> EMU
// ---------------------------------------------------------------------------

describe('ptToEmu', () => {
  it('converts 1 point to 12700 EMU', () => {
    expect(ptToEmu(1)).toBe(12700);
  });

  it('converts 72 points to 914400 EMU', () => {
    expect(ptToEmu(72)).toBe(914400);
  });

  it('converts 0 to 0', () => {
    expect(ptToEmu(0)).toBe(0);
  });

  it('handles negative values', () => {
    expect(ptToEmu(-1)).toBe(-12700);
  });
});

// ---------------------------------------------------------------------------
// centimeters -> EMU
// ---------------------------------------------------------------------------

describe('cmToEmu', () => {
  it('converts 1 cm to 360000 EMU', () => {
    expect(cmToEmu(1)).toBe(360000);
  });

  it('converts 0 to 0', () => {
    expect(cmToEmu(0)).toBe(0);
  });

  it('handles negative values', () => {
    expect(cmToEmu(-1)).toBe(-360000);
  });
});

// ---------------------------------------------------------------------------
// millimeters -> EMU
// ---------------------------------------------------------------------------

describe('mmToEmu', () => {
  it('converts 1 mm to 36000 EMU', () => {
    expect(mmToEmu(1)).toBe(36000);
  });

  it('converts 10 mm to 360000 EMU', () => {
    expect(mmToEmu(10)).toBe(360000);
  });

  it('converts 0 to 0', () => {
    expect(mmToEmu(0)).toBe(0);
  });

  it('handles negative values', () => {
    expect(mmToEmu(-1)).toBe(-36000);
  });
});

// ---------------------------------------------------------------------------
// pixels -> EMU
// ---------------------------------------------------------------------------

describe('pxToEmu', () => {
  it('converts 1 pixel to 9525 EMU at default 96 DPI', () => {
    expect(pxToEmu(1)).toBe(9525);
  });

  it('converts 96 pixels to 914400 EMU at 96 DPI', () => {
    expect(pxToEmu(96)).toBe(914400);
  });

  it('converts 72 pixels to 914400 EMU at 72 DPI', () => {
    expect(pxToEmu(72, 72)).toBe(914400);
  });

  it('converts 150 pixels to 914400 EMU at 150 DPI', () => {
    expect(pxToEmu(150, 150)).toBe(914400);
  });

  it('converts 0 to 0', () => {
    expect(pxToEmu(0)).toBe(0);
  });

  it('handles negative values', () => {
    expect(pxToEmu(-1)).toBe(-9525);
  });
});

// ---------------------------------------------------------------------------
// Round-trip tests
// ---------------------------------------------------------------------------

describe('round-trip conversions', () => {
  it('emuToIn -> inToEmu is identity for exact values', () => {
    expect(inToEmu(emuToIn(914400))).toBe(914400);
  });

  it('emuToPt -> ptToEmu is identity for exact values', () => {
    expect(ptToEmu(emuToPt(12700))).toBe(12700);
  });

  it('emuToCm -> cmToEmu is identity for exact values', () => {
    expect(cmToEmu(emuToCm(360000))).toBe(360000);
  });

  it('emuToMm -> mmToEmu is identity for exact values', () => {
    expect(mmToEmu(emuToMm(36000))).toBe(36000);
  });

  it('emuToPx -> pxToEmu is identity for exact values at 96 DPI', () => {
    expect(pxToEmu(emuToPx(9525))).toBe(9525);
  });

  it('inToEmu -> emuToIn is identity', () => {
    expect(emuToIn(inToEmu(2.5))).toBe(2.5);
  });

  it('ptToEmu -> emuToPt is identity', () => {
    expect(emuToPt(ptToEmu(18))).toBe(18);
  });

  it('cmToEmu -> emuToCm is identity', () => {
    expect(emuToCm(cmToEmu(3.5))).toBe(3.5);
  });

  it('mmToEmu -> emuToMm is identity', () => {
    expect(emuToMm(mmToEmu(25.4))).toBeCloseTo(25.4, 10);
  });

  it('pxToEmu -> emuToPx round-trip at 72 DPI', () => {
    expect(emuToPx(pxToEmu(100, 72), 72)).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Very large values
// ---------------------------------------------------------------------------

describe('large values', () => {
  it('handles very large EMU values (A0 poster width ~841mm)', () => {
    const a0WidthMm = 841;
    const emu = mmToEmu(a0WidthMm);
    expect(emu).toBe(30276000);
    expect(emuToMm(emu)).toBe(841);
  });

  it('handles 100 inches in EMU', () => {
    expect(inToEmu(100)).toBe(91440000);
    expect(emuToIn(91440000)).toBe(100);
  });
});
