# Module: Font System (`@opendockit/core/font`)

**Purpose:** Font name resolution, substitution for cross-platform compatibility, font metrics, and font data loading (WOFF2 for Canvas2D, TTF for PDF embedding).

**Tier:** Fan-out 1 (depends on Units for metrics; theme-independent for substitution table)

**Inputs:** Font names from OOXML, theme font scheme references

**Outputs:**

- `substitution-table.ts` — `getFontSubstitution(fontName: string): string | undefined`
  - Maps Windows fonts to OFL-compatible equivalents (Calibri→Carlito, Arial→Liberation Sans, etc.)
  - Also handles generic font families
- `font-metrics-db.ts` — `FontMetricsDB` class for precomputed per-glyph advance widths and vertical metrics
  - Loaded from `data/metrics-bundle.ts` (42 families, 130 faces, ~750KB)
- `bundled-font-loader.ts` — `loadBundledFont(family): Promise<boolean>` for Canvas2D rendering
  - Loads WOFF2 from `@opendockit/fonts` companion package (optional peer dep)
  - Falls back to false if companion is not installed
- `ttf-loader.ts` — `loadTTF(family, bold, italic): Promise<Uint8Array | null>` for PDF embedding
  - Loads raw TTF bytes from `@opendockit/fonts` companion package
  - Cached: same font requested multiple times returns same Uint8Array
  - Variant fallback cascade: boldItalic → bold → italic → regular → first available
  - `hasTTFBundle(family): boolean` — check if a family has TTF data available
  - `clearTTFCache()` — reset the decoded bytes cache
- `eot-parser.ts` — EOT embedded font extraction from PPTX files
- `font-cdn-loader.ts` — OFL CDN fallback loader
- `google-fonts-loader.ts` — Google Fonts CDN fallback loader
- `index.ts` — barrel export

**Data directories:**

- `data/metrics-bundle.ts` — precomputed advance widths + vertical metrics (42 families, 130 faces)
- WOFF2 and TTF font data moved to `@opendockit/fonts` companion package (optional peer dep)

**Dependencies:**

- `../units/` — for point/pixel conversions in metrics

**Key reference:** `docs/architecture/PPTX_SLIDEKIT.md` "Key Technical Decisions > Font Handling"

**Authoritative metrics source:** The precomputed metrics bundle (`packages/core/src/font/data/metrics-bundle.ts`) is the single authoritative source for font metrics. `@opendockit/render` imports its font metrics from `@opendockit/core` and must not maintain its own copy. Do not duplicate or diverge the metrics bundle in any other package.

**Font loading tiers (highest priority first):**
1. User-supplied fonts — app provides ArrayBuffer/URL
2. PPTX embedded fonts — EOT parser extracts from the file
3. Bundled WOFF2 fonts — 42 families from @opendockit/fonts companion package (Canvas2D)
4. OFL CDN fallback — metrically compatible open fonts
5. Google Fonts CDN fallback — for Google Slides fonts
6. Bundled TTF fonts — raw TrueType for PDF embedding (separate tier, used by pdf-font-embedder)

**Pipeline scripts:**
- `pnpm fonts:download` — download Google Fonts TTFs
- `pnpm fonts:metrics` — regenerate metrics-bundle.ts
- `pnpm fonts:woff2` — regenerate WOFF2 bundles
- `pnpm fonts:ttf` — regenerate TTF bundles for PDF embedding
- `pnpm fonts:bundle` — regenerate all (metrics + WOFF2 + TTF)
- `pnpm fonts:rebuild` — full pipeline (download + bundle)

**Testing:** `__tests__/ttf-loader.test.ts` (TTF loading, caching, variant fallback), `__tests__/font-consistency.test.ts` (substitution→metrics→TTF→WOFF2 pipeline consistency), `__tests__/woff2-integrity.test.ts` (WOFF2 module validation), `__tests__/font-pipeline-contracts.test.ts` (three-way pipeline contracts).
