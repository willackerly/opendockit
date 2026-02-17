# Module: Font System (`@opendockit/core/font`)

**Purpose:** Font name resolution, substitution for cross-platform compatibility, and basic font metrics.

**Tier:** Fan-out 1 (depends on Units for metrics; theme-independent for substitution table)

**Inputs:** Font names from OOXML, theme font scheme references

**Outputs:**

- `substitution-table.ts` — `getFontSubstitution(fontName: string): string | undefined`
  - Maps Windows fonts to web-safe equivalents:
  - Calibri → Arial, Cambria → Georgia, Calibri Light → Arial
  - Consolas → monospace, Segoe UI → system-ui
  - Meiryo → sans-serif, MS Gothic → monospace
  - Also handles generic font families
- `font-metrics.ts` — `estimateTextWidth(text: string, fontSize: number, fontFamily: string): number`
  - Uses Canvas2D `measureText()` when available, fallback estimation otherwise
  - `getLineHeight(fontSize: number, lineSpacing?: number): number`
- `font-loader.ts` — `isFontAvailable(fontName: string): Promise<boolean>`
  - Uses `document.fonts.check()` API
  - `loadFont(fontName: string, data: ArrayBuffer): Promise<void>` — for embedded fonts
- `index.ts` — barrel export

**Dependencies:**

- `../units/` — for point/pixel conversions in metrics

**Key reference:** `docs/architecture/PPTX_SLIDEKIT.md` "Key Technical Decisions > Font Handling"

**Testing:** Test substitution table completeness. Test metrics estimation against known widths. Font loading tests may need browser environment or mocks.
