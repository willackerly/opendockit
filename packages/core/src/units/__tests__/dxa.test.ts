import { describe, it, expect } from 'vitest';
import {
  DXA_PER_PT,
  DXA_PER_INCH,
  DXA_PER_CM,
  dxaToPt,
  dxaToPx,
  dxaToIn,
  dxaToCm,
  dxaToEmu,
  ptToDxa,
  inToDxa,
} from '../dxa.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('DXA constants', () => {
  it('DXA_PER_PT is 20', () => {
    expect(DXA_PER_PT).toBe(20);
  });

  it('DXA_PER_INCH is 1440', () => {
    expect(DXA_PER_INCH).toBe(1440);
  });

  it('DXA_PER_CM is 567', () => {
    expect(DXA_PER_CM).toBe(567);
  });

  it('constants are self-consistent: DXA_PER_INCH = 72 * DXA_PER_PT', () => {
    expect(DXA_PER_INCH).toBe(72 * DXA_PER_PT);
  });
});

// ---------------------------------------------------------------------------
// DXA -> points
// ---------------------------------------------------------------------------

describe('dxaToPt', () => {
  it('converts 20 DXA to 1 point', () => {
    expect(dxaToPt(20)).toBe(1);
  });

  it('converts 1440 DXA to 72 points', () => {
    expect(dxaToPt(1440)).toBe(72);
  });

  it('converts 0 to 0', () => {
    expect(dxaToPt(0)).toBe(0);
  });

  it('handles negative values', () => {
    expect(dxaToPt(-20)).toBe(-1);
  });

  it('converts 360 DXA to 18 points', () => {
    expect(dxaToPt(360)).toBe(18);
  });
});

// ---------------------------------------------------------------------------
// DXA -> pixels
// ---------------------------------------------------------------------------

describe('dxaToPx', () => {
  it('converts 1440 DXA to 96 pixels at default 96 DPI', () => {
    expect(dxaToPx(1440)).toBe(96);
  });

  it('converts 720 DXA to 48 pixels at 96 DPI', () => {
    expect(dxaToPx(720)).toBe(48);
  });

  it('converts 1440 DXA to 72 pixels at 72 DPI', () => {
    expect(dxaToPx(1440, 72)).toBe(72);
  });

  it('converts 1440 DXA to 150 pixels at 150 DPI', () => {
    expect(dxaToPx(1440, 150)).toBe(150);
  });

  it('converts 0 to 0', () => {
    expect(dxaToPx(0)).toBe(0);
  });

  it('handles negative values', () => {
    expect(dxaToPx(-1440)).toBe(-96);
  });
});

// ---------------------------------------------------------------------------
// DXA -> inches
// ---------------------------------------------------------------------------

describe('dxaToIn', () => {
  it('converts 1440 DXA to 1 inch', () => {
    expect(dxaToIn(1440)).toBe(1);
  });

  it('converts 720 DXA to 0.5 inch', () => {
    expect(dxaToIn(720)).toBe(0.5);
  });

  it('converts 0 to 0', () => {
    expect(dxaToIn(0)).toBe(0);
  });

  it('handles negative values', () => {
    expect(dxaToIn(-1440)).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// DXA -> centimeters
// ---------------------------------------------------------------------------

describe('dxaToCm', () => {
  it('converts 567 DXA to 1 cm', () => {
    expect(dxaToCm(567)).toBe(1);
  });

  it('converts 0 to 0', () => {
    expect(dxaToCm(0)).toBe(0);
  });

  it('handles negative values', () => {
    expect(dxaToCm(-567)).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// DXA -> EMU
// ---------------------------------------------------------------------------

describe('dxaToEmu', () => {
  it('converts 1 DXA to 635 EMU', () => {
    expect(dxaToEmu(1)).toBe(635);
  });

  it('converts 20 DXA (1 pt) to 12700 EMU', () => {
    expect(dxaToEmu(20)).toBe(12700);
  });

  it('converts 1440 DXA (1 inch) to 914400 EMU', () => {
    expect(dxaToEmu(1440)).toBe(914400);
  });

  it('converts 0 to 0', () => {
    expect(dxaToEmu(0)).toBe(0);
  });

  it('handles negative values', () => {
    expect(dxaToEmu(-1)).toBe(-635);
  });
});

// ---------------------------------------------------------------------------
// points -> DXA
// ---------------------------------------------------------------------------

describe('ptToDxa', () => {
  it('converts 1 point to 20 DXA', () => {
    expect(ptToDxa(1)).toBe(20);
  });

  it('converts 72 points to 1440 DXA', () => {
    expect(ptToDxa(72)).toBe(1440);
  });

  it('converts 18 points to 360 DXA', () => {
    expect(ptToDxa(18)).toBe(360);
  });

  it('converts 0 to 0', () => {
    expect(ptToDxa(0)).toBe(0);
  });

  it('handles negative values', () => {
    expect(ptToDxa(-1)).toBe(-20);
  });
});

// ---------------------------------------------------------------------------
// inches -> DXA
// ---------------------------------------------------------------------------

describe('inToDxa', () => {
  it('converts 1 inch to 1440 DXA', () => {
    expect(inToDxa(1)).toBe(1440);
  });

  it('converts 0.5 inch to 720 DXA', () => {
    expect(inToDxa(0.5)).toBe(720);
  });

  it('converts 0 to 0', () => {
    expect(inToDxa(0)).toBe(0);
  });

  it('handles negative values', () => {
    expect(inToDxa(-1)).toBe(-1440);
  });
});

// ---------------------------------------------------------------------------
// Round-trip tests
// ---------------------------------------------------------------------------

describe('round-trip conversions', () => {
  it('dxaToPt -> ptToDxa is identity for exact values', () => {
    expect(ptToDxa(dxaToPt(1440))).toBe(1440);
  });

  it('ptToDxa -> dxaToPt is identity', () => {
    expect(dxaToPt(ptToDxa(18))).toBe(18);
  });

  it('dxaToIn -> inToDxa is identity for exact values', () => {
    expect(inToDxa(dxaToIn(1440))).toBe(1440);
  });

  it('inToDxa -> dxaToIn is identity', () => {
    expect(dxaToIn(inToDxa(2.5))).toBe(2.5);
  });
});

// ---------------------------------------------------------------------------
// Real-world DOCX values
// ---------------------------------------------------------------------------

describe('real-world DOCX values', () => {
  it('standard A4 page width: 11906 DXA ~ 8.27 inches', () => {
    expect(dxaToIn(11906)).toBeCloseTo(8.268, 2);
  });

  it('standard A4 page height: 16838 DXA ~ 11.69 inches', () => {
    expect(dxaToIn(16838)).toBeCloseTo(11.693, 2);
  });

  it('standard Letter page width: 12240 DXA = 8.5 inches', () => {
    expect(dxaToIn(12240)).toBe(8.5);
  });

  it('standard Letter page height: 15840 DXA = 11 inches', () => {
    expect(dxaToIn(15840)).toBe(11);
  });

  it('1 inch margin: 1440 DXA', () => {
    expect(inToDxa(1)).toBe(1440);
  });
});
