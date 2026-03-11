# Module: Font System (`@opendockit/core/font`)

**Purpose:** Font name resolution, substitution for cross-platform compatibility, font metrics, font data loading, and unified font resolution pipeline.

**Tier:** Fan-out 1 (depends on Units for metrics; theme-independent for substitution table)

**Inputs:** Font names from OOXML, theme font scheme references

**Outputs:**

- `substitution-table.ts` — `getFontSubstitution(fontName: string): string | undefined`
  - Maps Windows fonts to OFL-compatible equivalents (Calibri→Carlito, Arial→Liberation Sans, etc.)
  - `SUBSTITUTION_REGISTRY` — 58-entry registry with Fontsource CDN IDs for each substitute
  - Also handles generic font families
- `font-metrics-db.ts` — `FontMetricsDB` class for precomputed per-glyph advance widths and vertical metrics
  - Loaded from `data/metrics-bundle.ts` (42 families, 130 faces, ~750KB)
- `font-resolver.ts` — `FontResolver` class — unified 8-source resolution pipeline
  - Sources: memory cache → companion → base URL → CacheStorage → custom → Fontsource CDN → Google Fonts → system
  - `resolve(family, weight?, style?)`, `prefetch(families)`, `isAvailableOffline(family)`, `getStatus(family)`
- `font-config.ts` — `FontConfig` types for opt-in FontResolver wiring
- `cdn-fetcher.ts` — `fetchFromFontsource()`, `fetchFromGoogleFonts()` CDN integration
- `font-cache.ts` — `FontCache` class — two-level cache (in-memory Map + browser CacheStorage)
- `bundled-font-loader.ts` — `loadBundledFont(family): Promise<boolean>` for Canvas2D rendering
  - Delegates to `@opendockit/fonts` companion package via dynamic import
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
- `companion-types.d.ts` — ambient types for optional `@opendockit/fonts` dynamic import
- `index.ts` — barrel export

**Data directories:**

- `data/metrics-bundle.ts` — precomputed advance widths + vertical metrics (42 families, 130 faces, ~750KB)
- WOFF2 and TTF font binaries in `@opendockit/fonts` companion package (optional)

**Dependencies:**

- `../units/` — for point/pixel conversions in metrics

**Key references:**
- `docs/architecture/PPTX_SLIDEKIT.md` "Key Technical Decisions > Font Handling"
- `docs/plans/FONT_DELIVERY_PLAN.md` — architecture and API design
- `docs/plans/FONT_DELIVERY_EXECUTION.md` — step-by-step implementation plan

**Authoritative metrics source:** The precomputed metrics bundle (`packages/core/src/font/data/metrics-bundle.ts`) is the single authoritative source for font metrics. `@opendockit/render` imports its font metrics from `@opendockit/core` and must not maintain its own copy. Do not duplicate or diverge the metrics bundle in any other package.

**Font loading — default cascade (highest priority first):**
1. User-supplied fonts — app provides ArrayBuffer/URL
2. PPTX embedded fonts — EOT parser extracts from the file
3. Companion WOFF2 — `@opendockit/fonts` companion package (Canvas2D)
4. OFL CDN fallback — metrically compatible open fonts
5. Google Fonts CDN fallback — for Google Slides fonts

**Font loading — opt-in FontResolver (via `fontConfig` on SlideKit):**
1. Memory cache (already resolved this session)
2. Companion package (`@opendockit/fonts`)
3. Base URL (self-hosted font files)
4. CacheStorage (persistent browser cache)
5. Custom resolver (app-provided callback)
6. Fontsource CDN (jsDelivr, predictable URLs)
7. Google Fonts CSS API (fallback)
8. System font fallback

**Pipeline scripts:**
- `pnpm fonts:download` — download Google Fonts TTFs to `fonts/`
- `pnpm fonts:metrics` — regenerate metrics-bundle.ts from `fonts/`
- `pnpm fonts:woff2` — regenerate WOFF2 bundles
- `pnpm fonts:bundle` — regenerate metrics + WOFF2
- `pnpm fonts:rebuild` — full pipeline (download + metrics + WOFF2)
- `python3 scripts/generate-font-package.py` — populate companion package with WOFF2/TTF + manifest

**Testing:** `__tests__/font-resolver.test.ts` (21 tests — 8-source resolution, dedup, offline detection), `__tests__/cdn-fetcher.test.ts` (8 tests), `__tests__/font-cache.test.ts` (8 tests), `__tests__/ttf-loader.test.ts` (TTF loading, caching, variant fallback), `__tests__/font-consistency.test.ts` (substitution→metrics pipeline consistency), `__tests__/font-pipeline-contracts.test.ts` (three-way pipeline contracts).
