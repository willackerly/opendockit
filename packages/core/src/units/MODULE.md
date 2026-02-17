# Module: Unit Conversions (`@opendockit/core/units`)

**Purpose:** Convert between OOXML coordinate systems. Pure math, zero dependencies.

**Tier:** Spine (must be implemented first — blocks geometry engine and renderers)

**Inputs:** Numeric values in OOXML units

**Outputs:**

- `emu.ts` — EMU (English Metric Units) conversions:
  - `emuToPx(emu: number, dpi?: number): number` — default 96 DPI
  - `emuToPt(emu: number): number`
  - `emuToIn(emu: number): number`
  - `emuToCm(emu: number): number`
  - `pxToEmu(px: number, dpi?: number): number`
  - Constants: `EMU_PER_INCH = 914400`, `EMU_PER_PT = 12700`, `EMU_PER_CM = 360000`
- `dxa.ts` — DXA (twentieths of a point) conversions:
  - `dxaToPt(dxa: number): number`
  - `dxaToPx(dxa: number, dpi?: number): number`
  - `ptToDxa(pt: number): number`
- `half-points.ts` — Half-point conversions (used for font sizes):
  - `halfPointsToPt(hp: number): number`
  - `hundredthsPtToPt(hp: number): number` — DrawingML uses hundredths of a point (e.g., 1800 = 18pt)
  - `ptToHundredthsPt(pt: number): number`
- `index.ts` — barrel export

**Dependencies:** None

**Key reference:** `docs/architecture/PPTX_SLIDEKIT.md` "Key Technical Decisions > EMU"

**Constants:**

- 1 inch = 914400 EMU
- 1 point = 12700 EMU
- 1 cm = 360000 EMU
- 1 DXA = 1/20 point
- DrawingML font sizes: hundredths of a point (1800 = 18pt)
- DrawingML angles: 60000ths of a degree (5400000 = 90°)

**Testing:** Exhaustive — every conversion function with known values, round-trip tests, edge cases (0, negative, very large).
