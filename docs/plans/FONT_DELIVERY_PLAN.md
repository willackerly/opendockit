# Font Delivery Redesign Plan

**Created:** 2026-03-11
**Status:** Draft
**Goal:** Migrate from "everything bundled in core" (~18MB) to "metrics-only core + dynamic font fetching + optional offline companion package."

---

## Table of Contents

1. [Motivation](#motivation)
2. [Design Goals](#design-goals)
3. [Current State](#current-state)
4. [Target Architecture](#target-architecture)
5. [Package Architecture](#package-architecture)
6. [Font Resolution Flow](#font-resolution-flow)
7. [API Surface](#api-surface)
8. [Companion Package Design](#companion-package-design)
9. [CDN Integration](#cdn-integration)
10. [PDF Export Subsetting](#pdf-export-subsetting)
11. [Metrics Expansion](#metrics-expansion)
12. [Migration Path](#migration-path)
13. [Open Issues](#open-issues)
14. [Testing Strategy](#testing-strategy)
15. [Size Budget](#size-budget)

---

## Motivation

`@opendockit/core` currently ships ~18MB of font data as base64-encoded TypeScript modules. This causes:

- **Slow installs**: 18MB of font binaries inflate `node_modules` and CI cache.
- **Bundle bloat**: Even with code-splitting, bundlers must process 18MB of TS modules.
- **npm package size**: Dominates the published tarball; most apps only use 3-5 families.
- **Redundancy**: WOFF2 (5.2MB) and TTF (12MB) encode the same 42 families in different formats. Most apps need only one format (WOFF2 for browser, TTF for PDF export).

The metrics bundle (750KB) provides accurate text layout without any font binaries. Font binaries are only needed for glyph rendering (Canvas2D / CSS) and PDF embedding. This separation is the key insight: **layout and rendering have different data requirements**, and most of the weight comes from rendering data that can be loaded on demand.

---

## Design Goals

| # | Goal | Rationale |
|---|------|-----------|
| 1 | **Offline-first** | Full rendering capability without network. This is a core tenet. The companion font package enables complete offline rendering. |
| 2 | **Minimal default bundle** | `@opendockit/core` ships only metrics (~750KB). No font binaries in the core package. |
| 3 | **Companion font package** | `@opendockit/fonts` -- individual font files (WOFF2 + TTF) organized per-family, installable as a peer dependency for offline rendering. Apps can also self-host these files. |
| 4 | **Dynamic on-demand fetching** | For apps that prefer CDN delivery, fonts are fetched from Fontsource CDN or Google Fonts API as needed. Zero-config. |
| 5 | **App-level control** | `prefetchFonts()` API, `registerFont()` for licensed fonts, configurable font base URL, offline mode flag. |
| 6 | **Maximum font coverage** | 42 bundled families + 1700+ via Google Fonts CDN + unlimited via app-supplied fonts. |
| 7 | **PDF export subsetting** | Lazy-load harfbuzzjs WASM (~1.5MB) only when PDF export is triggered. Subset fonts to used glyphs only. |

---

## Current State

### What exists today

| Component | Location | Size | Purpose |
|-----------|----------|------|---------|
| Metrics bundle | `packages/core/src/font/data/metrics-bundle.ts` | 750KB | Per-glyph advance widths + vertical metrics for 42 families, 130 faces. Enables accurate text layout without font binaries. |
| WOFF2 bundle | `packages/core/src/font/data/woff2/*.ts` | 5.2MB | 42 families as base64 in TS modules. For Canvas2D rendering via FontFace API. |
| TTF bundle | `packages/core/src/font/data/ttf/*.ts` | 12MB | Same 42 families as base64 in TS modules. For PDF embedding. |
| Substitution table | `packages/core/src/font/substitution-table.ts` | ~5KB | Maps Office fonts to metric-compatible OFL alternatives (Calibri->Carlito, Cambria->Caladea, Arial->Liberation Sans, etc.) |
| Bundled font loader | `packages/core/src/font/bundled-font-loader.ts` | ~4KB | Dynamic-imports WOFF2 modules, decodes base64, registers via FontFace API |
| Font metrics DB | `packages/core/src/font/font-metrics-db.ts` | ~8KB | Text measurement using precomputed metrics |
| WOFF2 manifest | `packages/core/src/font/data/woff2/manifest.ts` | ~6KB | Family -> module path + variants mapping |
| TTF manifest | `packages/core/src/font/data/ttf/manifest.ts` | ~6KB | Same structure for TTF |

### Current loading priority (5-tier)

```
1. User-supplied fonts (registerFont)
2. Document-embedded fonts (EOT/WOFF2 extracted from PPTX/DOCX)
3. Bundled WOFF2 (base64 in @opendockit/core)
4. OFL CDN — Fontsource / jsDelivr
5. Google Fonts CDN
```

### Pain points

- Tiers 3-5 all live inside `@opendockit/core`, making the package 18MB+.
- No way to install fonts separately from core.
- TTF bundle is only needed for PDF export but ships to every consumer.
- No prefetch or preload hints -- fonts load reactively as text is rendered.

---

## Target Architecture

```
                    ┌─────────────────────────────────────┐
                    │          @opendockit/core            │
                    │                                     │
                    │  metrics-bundle.ts (750KB)           │
                    │  substitution-table.ts               │
                    │  font-metrics-db.ts                  │
                    │  font-resolver.ts  ◄── NEW           │
                    │  font-cache.ts     ◄── NEW           │
                    │  types.ts          ◄── NEW           │
                    └───────────┬─────────────────────────┘
                                │
              ┌─────────────────┼─────────────────────┐
              │                 │                     │
              ▼                 ▼                     ▼
   ┌──────────────────┐ ┌──────────────┐ ┌───────────────────┐
   │ @opendockit/fonts │ │ CDN Fetcher  │ │ App-supplied fonts│
   │ (companion pkg)  │ │ (Fontsource/ │ │ (registerFont)    │
   │                  │ │  Google)     │ │                   │
   │ woff2/ (per-fam) │ │ Built into   │ │ Licensed fonts,   │
   │ ttf/  (per-fam)  │ │ core, zero-  │ │ custom fonts      │
   │ manifest.json    │ │ config       │ │                   │
   └──────────────────┘ └──────────────┘ └───────────────────┘
```

---

## Package Architecture

### `@opendockit/core` (ships to npm)

```
packages/core/src/font/
├── data/
│   ├── metrics-bundle.ts          # 750KB — ships in core (KEEP)
│   └── metrics-extended.ts        # optional, additional families
├── font-metrics-db.ts             # text measurement (KEEP)
├── substitution-table.ts          # cross-platform mapping (KEEP)
├── font-resolver.ts               # NEW: orchestrates font resolution
├── font-cache.ts                  # NEW: in-memory + CacheStorage font cache
├── cdn-fetcher.ts                 # NEW: Fontsource + Google Fonts CDN logic
├── types.ts                       # NEW: FontSource, FontConfig, FontResolution
├── bundled-font-loader.ts         # DEPRECATED → adapter for companion package
└── data/woff2/                    # REMOVE (move to @opendockit/fonts)
└── data/ttf/                      # REMOVE (move to @opendockit/fonts)
```

### `@opendockit/fonts` (companion package)

```
packages/fonts/
├── woff2/
│   ├── carlito/
│   │   ├── latin-400-normal.woff2
│   │   ├── latin-400-italic.woff2
│   │   ├── latin-700-normal.woff2
│   │   └── latin-700-italic.woff2
│   ├── caladea/
│   │   └── ...
│   ├── liberation-sans/
│   │   └── ...
│   ├── liberation-serif/
│   │   └── ...
│   ├── liberation-mono/
│   │   └── ...
│   └── ... (42+ families)
├── ttf/
│   ├── carlito.ttf
│   ├── caladea.ttf
│   ├── liberation-sans.ttf
│   └── ... (full TTF for PDF embedding)
├── manifest.json                  # family -> file mapping with sizes, subsets, weights
├── index.ts                       # barrel export, registerOfflineFonts()
├── per-family entry points:
│   ├── carlito.ts                 # import { register } from '@opendockit/fonts/carlito'
│   ├── liberation-sans.ts
│   └── ...
└── package.json
```

### manifest.json schema

```json
{
  "version": 1,
  "families": {
    "carlito": {
      "displayName": "Carlito",
      "substituteFor": "Calibri",
      "license": "OFL-1.1",
      "woff2": {
        "latin-400-normal": { "file": "woff2/carlito/latin-400-normal.woff2", "size": 23456 },
        "latin-400-italic": { "file": "woff2/carlito/latin-400-italic.woff2", "size": 25012 },
        "latin-700-normal": { "file": "woff2/carlito/latin-700-normal.woff2", "size": 24100 },
        "latin-700-italic": { "file": "woff2/carlito/latin-700-italic.woff2", "size": 25800 }
      },
      "ttf": {
        "regular":    { "file": "ttf/carlito.ttf",     "size": 185000 },
        "bold":       { "file": "ttf/carlito-bold.ttf", "size": 190000 },
        "italic":     { "file": "ttf/carlito-italic.ttf", "size": 188000 },
        "boldItalic": { "file": "ttf/carlito-bold-italic.ttf", "size": 192000 }
      },
      "weights": [400, 700],
      "styles": ["normal", "italic"],
      "subsets": ["latin", "latin-ext", "cyrillic"]
    }
  }
}
```

---

## Font Resolution Flow

When a document is loaded:

```
1. PARSE           Document XML parsed → font families discovered
                   e.g., ["Calibri", "Arial", "Cambria Math"]
                          │
2. SUBSTITUTE      Substitution table maps Office → OFL names
                   "Calibri" → "Carlito", "Arial" → "Liberation Sans"
                          │
3. METRICS         Instant layout from metrics-bundle.ts (no network)
                   Text positions, line breaks, word wrapping computed
                   ★ Layout is complete at this point — no binary needed
                          │
4. RESOLVE         Font binary resolution (priority order):
                   a. User-supplied fonts (registerFont())
                   b. Document-embedded fonts (EOT/WOFF2 in PPTX/DOCX)
                   c. @opendockit/fonts companion package (if installed)
                   d. App-configured fontBaseURL (self-hosted)
                   e. In-memory / CacheStorage cache
                   f. Fontsource CDN (jsDelivr)
                   g. Google Fonts CSS API
                   h. System font fallback (CSS font-family stack)
                          │
5. REGISTER        FontFace API registration in browser
                   ★ No layout shift — metrics already matched
                   ★ Only glyph rendering improves (correct shapes)
                          │
6. RENDER          Canvas2D renders with registered fonts
```

### Key property: no layout shift

Because the metrics bundle covers all 42 substitution families, text layout is computed identically regardless of whether font binaries arrive. When the binary loads, only the glyph shapes change (e.g., from a system fallback to the correct OFL substitute). Text positions, line breaks, and spacing remain stable.

---

## API Surface

### FontConfig (passed to SlideKit.load / DocKit.load)

```typescript
interface FontConfig {
  /**
   * Base URL for companion package or self-hosted font files.
   * FontResolver appends manifest-relative paths to this URL.
   *
   * Examples:
   *   '/fonts/'                              — self-hosted in public dir
   *   'https://cdn.example.com/fonts/'       — CDN-hosted
   *   undefined                              — auto-detect companion package
   */
  fontBaseURL?: string;

  /**
   * Eagerly fetch and register these families before rendering begins.
   * Useful to avoid initial render with system fallback glyphs.
   */
  prefetchFonts?: string[];

  /**
   * Directly register font binaries. Use for licensed fonts (e.g., Calibri)
   * or custom brand fonts not available via CDN.
   */
  fonts?: Array<{
    family: string;
    src: ArrayBuffer | string; // binary data or URL
    weight?: number;           // default: 400
    style?: 'normal' | 'italic'; // default: 'normal'
    format?: 'woff2' | 'truetype'; // auto-detected if omitted
  }>;

  /**
   * Network policy for font resolution.
   *
   * 'online'         — fetch from CDN if not locally available (default)
   * 'offline'        — never fetch; use only local/companion/user-supplied
   * 'prefer-offline' — use local sources first, CDN only as last resort
   */
  networkMode?: 'online' | 'offline' | 'prefer-offline';

  /**
   * Custom resolver for enterprise font servers or proprietary CDNs.
   * Return a URL string or null to fall through to default resolution.
   */
  resolveFontURL?: (
    family: string,
    weight: number,
    style: string
  ) => string | null;

  /**
   * Whether to use CacheStorage API for persistent font caching.
   * Avoids re-downloading fonts across page loads.
   * Default: true (when available)
   */
  persistCache?: boolean;

  /**
   * Cache name for CacheStorage. Default: 'opendockit-fonts-v1'.
   */
  cacheName?: string;
}
```

### FontResolver (internal, in @opendockit/core)

```typescript
class FontResolver {
  constructor(config: FontConfig);

  /**
   * Resolve a font family to a binary for browser rendering.
   * Returns ArrayBuffer of WOFF2 data, or null if unavailable.
   * Results are cached in memory and optionally in CacheStorage.
   */
  async resolveWOFF2(
    family: string,
    weight: number,
    style: string
  ): Promise<ArrayBuffer | null>;

  /**
   * Resolve a font family to TTF binary for PDF embedding.
   * Only loads from companion package or user-supplied — never CDN
   * (CDN serves WOFF2 only).
   */
  async resolveTTF(
    family: string,
    weight: number,
    style: string
  ): Promise<ArrayBuffer | null>;

  /**
   * Prefetch and register multiple families. Returns when all are loaded
   * or have failed. Failures are silent (system fallback will be used).
   */
  async prefetch(families: string[]): Promise<void>;

  /**
   * Register a user-supplied font binary directly.
   */
  registerFont(
    family: string,
    src: ArrayBuffer,
    weight?: number,
    style?: string
  ): void;

  /**
   * Check if a family can be resolved without network.
   */
  isAvailableOffline(family: string): boolean;

  /**
   * Get resolution status for diagnostics.
   */
  getStatus(): Map<string, FontResolutionStatus>;
}

interface FontResolutionStatus {
  family: string;
  resolved: boolean;
  source: 'user' | 'embedded' | 'companion' | 'base-url' | 'cache' | 'cdn' | 'system' | 'none';
  format: 'woff2' | 'truetype' | null;
  loadTimeMs: number;
}
```

### Companion package public API

```typescript
// @opendockit/fonts/index.ts

/**
 * Register all 42 bundled families for offline rendering.
 * Loads WOFF2 files and registers via FontFace API.
 */
export async function registerOfflineFonts(): Promise<void>;

/**
 * Register specific families only (reduces memory usage).
 */
export async function registerOfflineFonts(
  families: string[]
): Promise<void>;

/**
 * Get the companion package manifest.
 * Used by FontResolver to discover available local fonts.
 */
export function getManifest(): FontManifest;

/**
 * Get the base path to font files in the companion package.
 * Used by FontResolver when fontBaseURL is not configured.
 */
export function getBasePath(): string;
```

### Usage examples

**Minimal (CDN, zero config):**

```typescript
import { SlideKit } from '@opendockit/pptx';

// Fonts fetched from Fontsource CDN on demand
const kit = await SlideKit.load(pptxBuffer);
```

**Offline-capable (companion package):**

```typescript
import { SlideKit } from '@opendockit/pptx';
import { registerOfflineFonts } from '@opendockit/fonts';

// Register all 42 families for fully offline rendering
await registerOfflineFonts();

const kit = await SlideKit.load(pptxBuffer, {
  networkMode: 'offline',
});
```

**Selective offline (specific families only):**

```typescript
import { registerOfflineFonts } from '@opendockit/fonts';

// Only load the families this app uses
await registerOfflineFonts(['Carlito', 'Liberation Sans', 'Caladea']);
```

**Self-hosted fonts:**

```bash
# Copy font files to your public directory
cp -r node_modules/@opendockit/fonts/woff2/ public/fonts/woff2/
cp node_modules/@opendockit/fonts/manifest.json public/fonts/
```

```typescript
const kit = await SlideKit.load(pptxBuffer, {
  fontBaseURL: '/fonts/',
});
```

**Licensed fonts (e.g., actual Calibri):**

```typescript
const calibriBuffer = await fetch('/licensed/calibri.ttf').then(r => r.arrayBuffer());

const kit = await SlideKit.load(pptxBuffer, {
  fonts: [
    { family: 'Calibri', src: calibriBuffer, weight: 400, style: 'normal' },
    { family: 'Calibri', src: calibriBoldBuffer, weight: 700, style: 'normal' },
  ],
});
```

**Enterprise font server:**

```typescript
const kit = await SlideKit.load(pptxBuffer, {
  resolveFontURL: (family, weight, style) => {
    return `https://fonts.corp.example.com/v1/${family}/${weight}-${style}.woff2`;
  },
});
```

---

## Companion Package Design (`@opendockit/fonts`)

### Requirements

| Requirement | Detail |
|-------------|--------|
| Contains actual font binaries | WOFF2 for browser rendering, TTF for PDF export |
| Organized per-family | Each family in its own directory for tree-shaking |
| Manifest-driven | `manifest.json` maps family names to file paths, weights, styles, subsets |
| Dual usage pattern | `import` (bundler) and file-serving (static hosting) |
| Per-family entry points | `@opendockit/fonts/carlito` for selective imports |
| Total size | ~17MB (WOFF2 + TTF combined) but tree-shakeable to only used families |
| License | All included fonts are OFL-1.1 or Apache-2.0 |

### Included families (42 initial)

| Office Font | OFL Substitute | Included |
|-------------|----------------|----------|
| Calibri | Carlito | Yes |
| Calibri Light | Carlito (weight 300) | Yes |
| Cambria | Caladea | Yes |
| Arial | Liberation Sans | Yes |
| Arial Narrow | Liberation Sans Narrow | Yes |
| Times New Roman | Liberation Serif | Yes |
| Courier New | Liberation Mono | Yes |
| Georgia | Gelasio | Yes |
| Segoe UI | Selawik | Yes |
| Segoe UI Light | Selawik Light | Yes |
| Segoe UI Semibold | Selawik Semibold | Yes |
| Segoe UI Semilight | Selawik Semilight | Yes |
| Palatino Linotype | TeX Gyre Pagella | Yes |
| Book Antiqua | TeX Gyre Bonum | Yes |
| Century Schoolbook | TeX Gyre Schola | Yes |
| — | Tinos | Yes |
| — | Arimo | Yes |
| — | Courier Prime | Yes |
| — | Roboto (+ Slab, Mono) | Yes |
| — | Open Sans | Yes |
| — | Noto Sans / Serif / Symbols | Yes |
| — | Lato / Montserrat / Poppins | Yes |
| — | Barlow / Raleway / Oswald | Yes |
| — | Play / Playfair Display / Ubuntu | Yes |
| — | Comfortaa / Fira Code / Source Sans Pro / Source Code Pro | Yes |

### package.json exports map

```json
{
  "name": "@opendockit/fonts",
  "exports": {
    ".": "./dist/index.js",
    "./manifest.json": "./manifest.json",
    "./carlito": "./dist/carlito.js",
    "./caladea": "./dist/caladea.js",
    "./liberation-sans": "./dist/liberation-sans.js",
    "./woff2/*": "./woff2/*",
    "./ttf/*": "./ttf/*"
  },
  "peerDependencies": {
    "@opendockit/core": "^0.x"
  },
  "files": [
    "dist/",
    "woff2/",
    "ttf/",
    "manifest.json"
  ]
}
```

### Build pipeline

The existing font pipeline (`scripts/bundle-woff2-fonts.py`, `scripts/bundle-ttf-fonts.py`) currently produces base64-encoded TypeScript modules. It will be modified to produce:

1. **Raw WOFF2 files** -- per-family, per-weight, per-subset, placed in `packages/fonts/woff2/`
2. **Raw TTF files** -- per-family, full character set, placed in `packages/fonts/ttf/`
3. **manifest.json** -- generated from the font inventory with file sizes and metadata
4. **Per-family entry points** -- TypeScript modules that import and register a single family

The scripts already download TTFs from Google Fonts and extract WOFF2 subsets. The main change is writing raw files instead of base64-encoding into TypeScript.

---

## CDN Integration

### Fontsource CDN (primary)

Fontsource serves Google Fonts via jsDelivr with predictable URL patterns:

```
https://cdn.jsdelivr.net/fontsource/fonts/{id}@latest/{subset}-{weight}-{style}.woff2
```

Examples:
```
https://cdn.jsdelivr.net/fontsource/fonts/carlito@latest/latin-400-normal.woff2
https://cdn.jsdelivr.net/fontsource/fonts/liberation-sans@latest/latin-400-normal.woff2
https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-700-italic.woff2
```

Advantages:
- Predictable URL pattern (no CSS parsing needed)
- Direct WOFF2 file access (no indirection)
- jsDelivr is a widely-cached global CDN
- Covers 1700+ Google Fonts families

### Google Fonts (fallback)

```
https://fonts.googleapis.com/css2?family={Family}:ital,wght@{ital},{weight}&display=swap
```

Examples:
```
https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap
https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,400;0,700;1,400&display=swap
```

Google Fonts requires parsing the CSS response to extract WOFF2 URLs (they vary by user-agent). Used only as a fallback when Fontsource fails.

### CDN fetcher implementation

```typescript
// packages/core/src/font/cdn-fetcher.ts

class CDNFetcher {
  /**
   * Attempt to fetch a font from Fontsource CDN.
   * Returns WOFF2 ArrayBuffer or null.
   */
  async fetchFromFontsource(
    fontsourceId: string,
    subset: string,
    weight: number,
    style: string
  ): Promise<ArrayBuffer | null>;

  /**
   * Attempt to fetch a font from Google Fonts.
   * Parses CSS response, extracts WOFF2 URL, fetches binary.
   * Returns WOFF2 ArrayBuffer or null.
   */
  async fetchFromGoogleFonts(
    family: string,
    weight: number,
    style: string
  ): Promise<ArrayBuffer | null>;
}
```

### Substitution table extension

The substitution table will be extended with Fontsource IDs to enable CDN resolution:

```typescript
// Current
{ office: 'Calibri', substitute: 'Carlito' }

// Extended
{
  office: 'Calibri',
  substitute: 'Carlito',
  fontsourceId: 'carlito',       // for CDN URL construction
  googleFontsFamily: 'Carlito',  // for Google Fonts API
  subsets: ['latin', 'latin-ext', 'cyrillic'],
}
```

---

## PDF Export Subsetting

PDF embedding requires TTF binaries, not WOFF2. Full TTF files for 42 families total ~12MB. For PDF export, we should subset fonts to only the glyphs used in the document.

### Strategy

```
Document text content
        │
        ▼
Collect used codepoints per font family
        │
        ▼
Load full TTF (from companion package or cache)
        │
        ▼
Subset via harfbuzzjs WASM (~1.5MB, loaded on demand)
        │
        ▼
Embed subsetted TTF in PDF (typically 5-50KB per font)
```

### harfbuzzjs integration

```typescript
// Only loaded when PDF export is triggered
let hbModule: HarfBuzzModule | null = null;

async function getHarfBuzz(): Promise<HarfBuzzModule> {
  if (!hbModule) {
    // Dynamic import — bundlers can code-split this
    const { default: init } = await import('harfbuzzjs/hb.js');
    hbModule = await init();
  }
  return hbModule;
}

async function subsetFont(
  ttfBuffer: ArrayBuffer,
  codepoints: Set<number>
): Promise<ArrayBuffer> {
  const hb = await getHarfBuzz();
  const blob = hb.createBlob(ttfBuffer);
  const face = hb.createFace(blob);
  const subset = hb.createSubset(face);
  for (const cp of codepoints) {
    subset.addCodepoint(cp);
  }
  return subset.encode();
}
```

### When TTF is needed vs WOFF2

| Use Case | Format | Source |
|----------|--------|--------|
| Browser Canvas2D rendering | WOFF2 | Companion, CDN, or user-supplied |
| CSS font-face registration | WOFF2 | Same |
| PDF embedding | TTF (subsetted) | Companion or user-supplied only |
| Node.js server-side rendering | TTF | Companion or user-supplied only |

TTF files are never fetched from CDN (Fontsource/Google serve WOFF2 only). For PDF export, the companion package or user-supplied TTF is required.

---

## Metrics Expansion

### Current coverage

The metrics bundle covers 42 families / 130 faces. This enables accurate layout for documents using common Office fonts and popular Google Fonts.

### Expansion targets

| Category | Families | Estimated Size | Priority |
|----------|----------|----------------|----------|
| Current 42 families | 42 / 130 faces | 750KB | Shipped |
| Office 2007-2019 fonts | +8 families | +150KB | High |
| Office 2024 (Aptos family) | +4 faces | +40KB | High |
| Google Slides defaults | +15 families | +200KB | Medium |
| Common web fonts (Inter, Fira, Source families) | +20 families | +300KB | Medium |
| Extended CJK metrics | +5 families | +500KB | Low |
| **Total expanded** | **~100 families** | **~2MB** | — |

### Implementation

Metrics are extracted from freely available TTF files by `scripts/extract-font-metrics.mjs`. The script reads font tables (cmap, hmtx, head, OS/2) and emits per-glyph advance widths normalized to 1000 UPM.

For expansion:
1. Add font URLs to the download manifest in `scripts/font-sources.json`.
2. Run `pnpm fonts:download` to fetch TTFs.
3. Run `pnpm fonts:metrics` to regenerate `metrics-bundle.ts`.
4. Optionally split into `metrics-bundle.ts` (core 42) + `metrics-extended.ts` (additional families) to keep core size stable.

### Aptos handling

Aptos is the Office 2024 default font. There is no OFL substitute. Strategy:

- **Metrics**: Extract from the freely downloadable Aptos TTF (Microsoft distributes it for free). Include in metrics bundle for accurate layout.
- **Binary**: Cannot be bundled (proprietary license). Must be user-supplied via `registerFont()`.
- **Fallback rendering**: System font stack falls through to Calibri/Carlito substitute, which is metrically similar enough for most content.

---

## Migration Path

### Phase 1: Create `@opendockit/fonts` companion package

**Scope:** New package with font files, manifest, and registration API.

- [ ] Create `packages/fonts/` package scaffold with `package.json`, `tsconfig.json`.
- [ ] Modify `scripts/bundle-woff2-fonts.py` to output raw WOFF2 files instead of base64 TS.
- [ ] Modify `scripts/bundle-ttf-fonts.py` to output raw TTF files.
- [ ] Generate `manifest.json` from font inventory.
- [ ] Implement `registerOfflineFonts()` in `packages/fonts/index.ts`.
- [ ] Create per-family entry points.
- [ ] Add tests: manifest integrity, registration, file existence.
- [ ] Wire into pnpm workspace.

**Breaking changes:** None. Core still has its bundled fonts.

### Phase 2: Add `FontResolver` to `@opendockit/core`

**Scope:** New resolution pipeline alongside existing bundled-font-loader.

- [ ] Implement `FontResolver` class with priority chain.
- [ ] Implement `CDNFetcher` for Fontsource + Google Fonts.
- [ ] Implement `FontCache` (in-memory + CacheStorage).
- [ ] Define `FontConfig` types.
- [ ] Extend substitution table with Fontsource IDs and subset info.
- [ ] Auto-detect companion package presence (try `import('@opendockit/fonts')`).
- [ ] Add `FontConfig` option to `SlideKit.load()` / `DocKit.load()`.
- [ ] Add tests: resolution priority, CDN fetch mocking, cache behavior, offline mode.

**Breaking changes:** None. New code path, old one still works.

### Phase 3: Remove base64 bundles from `@opendockit/core`

**Scope:** Delete WOFF2/TTF TS modules from core. Add companion as optional peer dependency.

- [ ] Remove `packages/core/src/font/data/woff2/*.ts` (except manifest).
- [ ] Remove `packages/core/src/font/data/ttf/*.ts` (except manifest).
- [ ] Update `bundled-font-loader.ts` to delegate to `FontResolver`.
- [ ] Add `@opendockit/fonts` as optional `peerDependency` in core's `package.json`.
- [ ] Update documentation and migration guide.
- [ ] Run full test suite; fix any regressions.

**Breaking changes:** YES. Apps relying on bundled fonts must either:
1. Install `@opendockit/fonts` (one command: `pnpm add @opendockit/fonts`), or
2. Have network access for CDN fetching, or
3. Supply fonts via `registerFont()`.

Provide a codemod or clear migration guide.

### Phase 4: CDN fallback polish

**Scope:** Ensure zero-config CDN experience is solid.

- [ ] Handle CDN failures gracefully (timeout, retry, fallback to Google Fonts).
- [ ] Implement CacheStorage persistence for cross-session caching.
- [ ] Add loading progress events (`onFontProgress` callback).
- [ ] Add Service Worker recipe for offline-capable PWAs.
- [ ] Test with various bundlers (Vite, webpack, esbuild, Rollup).
- [ ] Test in constrained network environments.

**Breaking changes:** None.

### Phase 5: harfbuzzjs PDF subsetting

**Scope:** Font subsetting for PDF export.

- [ ] Add `harfbuzzjs` as optional dependency (lazy-loaded).
- [ ] Implement `subsetFont()` utility.
- [ ] Integrate with PDF export pipeline.
- [ ] Collect codepoints from document content per font family.
- [ ] Embed subsetted TTF instead of full TTF in PDF output.
- [ ] Add tests: subsetting correctness, glyph coverage, PDF validity.

**Breaking changes:** None. PDF export improves (smaller files).

### Phase summary

| Phase | Package Size Impact | Breaking | Effort |
|-------|-------------------|----------|--------|
| 1 | No change (new pkg) | No | 2-3 days |
| 2 | No change (new code path) | No | 3-4 days |
| 3 | **Core: 18MB -> 750KB** | Yes | 1-2 days |
| 4 | No change | No | 2-3 days |
| 5 | No change | No | 2-3 days |

---

## Open Issues

### 1. Aptos (Office 2024 default)

No OFL substitute exists. Aptos was released by Microsoft as a free download but under a proprietary license that prohibits redistribution. Strategy:
- Include Aptos **metrics** in the metrics bundle (metrics are non-copyrightable dimensional data).
- Font binary must be user-supplied via `registerFont()`.
- Document the workaround clearly in API docs.

### 2. CJK fonts

CJK fonts (Noto Sans CJK, etc.) are 5-20MB each. Strategies:
- **Unicode-range subsetting**: Google Fonts already splits CJK into ~100 subset files (~100KB each). Fontsource mirrors this. Fetch only the subsets containing codepoints used in the document.
- **On-demand loading**: Parse document text, identify CJK codepoint ranges, fetch only needed subsets.
- **Never bundle**: CJK fonts should never be in the companion package. Always CDN or user-supplied.
- **Metrics**: Precompute metrics for Noto Sans CJK (common OOXML CJK fallback). Include in `metrics-extended.ts`.

### 3. Variable fonts

Some modern fonts ship as a single variable font file (all weights/styles in one binary). Benefits:
- Smaller total size for families with many weights.
- Continuous weight/width interpolation.

Trade-offs:
- Variable WOFF2 files are larger than individual static subsets.
- Browser support is excellent but subsetting tools need variable-aware logic.

Recommendation: Support variable fonts as an alternative source in the resolver. Do not require them.

### 4. Service Worker caching

For offline-capable PWAs that use CDN font delivery:

```javascript
// sw.js — recommended caching recipe
const FONT_CACHE = 'opendockit-fonts-v1';
const FONT_ORIGINS = [
  'https://cdn.jsdelivr.net',
  'https://fonts.gstatic.com',
];

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (FONT_ORIGINS.some(o => url.origin === o) && url.pathname.includes('.woff2')) {
    event.respondWith(
      caches.open(FONT_CACHE).then(cache =>
        cache.match(event.request).then(cached =>
          cached || fetch(event.request).then(response => {
            cache.put(event.request, response.clone());
            return response;
          })
        )
      )
    );
  }
});
```

Document this recipe in the usage guide. Optionally provide a helper function that generates the Service Worker cache config.

### 5. Kerning data

The metrics bundle does not include kerning pairs. For document rendering (as opposed to typesetting), this is usually acceptable because:
- OOXML stores explicit text positions and spacing.
- Kerning is applied at authoring time, not rendering time.
- The visual difference is negligible for presentation/document rendering.

If kerning becomes needed (e.g., for DOCX reflow), the metrics bundle can be extended with GPOS/kern table data. This would increase the bundle size by ~200-400KB.

---

## Testing Strategy

### Unit tests

| Component | Tests |
|-----------|-------|
| FontResolver priority chain | Mock each source, verify resolution order |
| CDNFetcher | Mock fetch, verify URL construction, error handling |
| FontCache | Verify in-memory and CacheStorage behavior |
| Companion package manifest | Validate all entries have valid file paths |
| registerOfflineFonts | Verify FontFace registration in jsdom/happy-dom |
| Substitution table (extended) | Verify Fontsource ID mapping correctness |

### Integration tests

| Scenario | Validation |
|----------|------------|
| Offline rendering with companion package | Render PPTX with `networkMode: 'offline'`, verify no network requests |
| CDN fallback | Mock companion package absence, verify CDN fetch and cache |
| User-supplied font priority | Register font via API, verify it takes precedence over companion/CDN |
| Self-hosted font base URL | Verify resolver constructs correct URLs from `fontBaseURL` |
| PDF export subsetting | Verify subsetted TTF contains exactly the needed glyphs |
| Cache persistence | Fetch font, reload, verify cache hit (no network) |

### Visual regression

Existing visual regression tests remain valid. Font delivery changes should produce pixel-identical output as long as the same font binaries are used.

---

## Size Budget

| Component | Current | After Migration |
|-----------|---------|-----------------|
| `@opendockit/core` npm tarball | ~18MB | **~800KB** |
| `@opendockit/fonts` npm tarball | N/A | ~17MB (optional) |
| Browser bundle (app using core only, CDN fonts) | ~18MB | **~800KB + on-demand** |
| Browser bundle (app with companion package, all families) | ~18MB | ~18MB (same, but optional) |
| Browser bundle (app with companion, 5 families) | ~18MB | **~3MB** (tree-shaken) |
| PDF export (with subsetting) | 12MB TTF loaded | **~1.5MB WASM + subsets** |

The key win: **apps that use CDN delivery go from 18MB mandatory to 800KB mandatory + on-demand font loading.** Apps that need offline rendering install the companion package and can tree-shake to only the families they use.
