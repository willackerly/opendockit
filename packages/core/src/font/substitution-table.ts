/**
 * Font substitution table for cross-platform OOXML rendering.
 *
 * Maps Windows/Office fonts to web-safe equivalents. Values are valid CSS
 * font-family strings (with fallbacks). Lookup is case-insensitive.
 *
 * Reference: Apache POI DrawFontManagerDefault, plus common Office font stacks.
 */

// ---------------------------------------------------------------------------
// Substitution table
// ---------------------------------------------------------------------------

/**
 * Maps Office font names (lowercase) to CSS font-family fallback strings.
 * Only fonts that need substitution are listed — universal fonts like
 * Arial and Times New Roman are omitted.
 */
const SUBSTITUTIONS: Record<string, string> = {
  // Sans-serif — prefer metric-compatible open fonts first
  aptos: "'Noto Sans', sans-serif",
  'aptos display': "'Noto Sans', sans-serif",
  'aptos narrow': "'Noto Sans', sans-serif",
  calibri: "Carlito, 'Segoe UI', Arial, sans-serif",
  'calibri light': "Carlito, 'Segoe UI Light', Arial, sans-serif",
  'segoe ui': 'Selawik, system-ui, sans-serif',
  'segoe ui light': "'Selawik Light', Selawik, system-ui, sans-serif",
  'segoe ui semibold': "'Selawik Semibold', Selawik, system-ui, sans-serif",
  'segoe ui semilight': "'Selawik Semilight', Selawik, system-ui, sans-serif",
  tahoma: 'Arial, sans-serif',
  verdana: "'DejaVu Sans', Arial, sans-serif",
  'trebuchet ms': 'Ubuntu, sans-serif',
  corbel: "'Source Sans Pro', sans-serif",
  candara: 'Raleway, sans-serif',
  'arial narrow': "'Liberation Sans Narrow', 'Arial Narrow', sans-serif",
  'century gothic': "'Gill Sans', sans-serif",
  'franklin gothic': 'Arial, sans-serif',
  'franklin gothic medium': 'Arial, sans-serif',

  // Serif — prefer metric-compatible open fonts first
  cambria: 'Caladea, Georgia, serif',
  'cambria math': 'Caladea, Georgia, serif',
  constantia: "'TeX Gyre Pagella', Georgia, serif",
  'book antiqua': "'TeX Gyre Pagella', 'Palatino Linotype', Palatino, serif",
  garamond: 'Georgia, serif',
  'palatino linotype': "'TeX Gyre Pagella', Palatino, serif",
  'bookman old style': "'TeX Gyre Bonum', 'Bookman Old Style', serif",
  'century schoolbook': "'TeX Gyre Schola', 'Century Schoolbook', serif",

  // Monospace
  consolas: "'Courier New', monospace",
  'lucida console': 'monospace',

  // CJK
  'ms gothic': 'monospace',
  'ms mincho': 'serif',
  'ms pgothic': 'sans-serif',
  'ms pmincho': 'serif',
  meiryo: 'sans-serif',
  'yu gothic': 'sans-serif',
  'yu mincho': 'serif',
  simsun: 'serif',
  simhei: 'sans-serif',
  'microsoft yahei': 'sans-serif',
  mingliu: 'serif',
  pmingliu: 'serif',
  'malgun gothic': 'sans-serif',
  batang: 'serif',
  gulim: 'sans-serif',

  // Google Fonts — pass through with generic fallbacks
  lato: 'Lato, sans-serif',
  'lato light': "'Lato Light', Lato, sans-serif",
  arimo: 'Arimo, Arial, sans-serif',
  comfortaa: 'Comfortaa, cursive',
  'comfortaa light': "'Comfortaa Light', Comfortaa, cursive",
  'open sans': "'Open Sans', sans-serif",
  'open sans extrabold': "'Open Sans ExtraBold', 'Open Sans', sans-serif",
  'noto sans symbols': "'Noto Sans Symbols', sans-serif",
  'courier prime': "'Courier Prime', 'Courier New', monospace",
  'fira code': "'Fira Code', monospace",
  montserrat: 'Montserrat, sans-serif',
  'noto sans': "'Noto Sans', sans-serif",
  'noto serif': "'Noto Serif', serif",
  oswald: 'Oswald, sans-serif',
  'playfair display': "'Playfair Display', serif",
  poppins: 'Poppins, sans-serif',
  raleway: 'Raleway, sans-serif',
  roboto: 'Roboto, sans-serif',
  'roboto mono': "'Roboto Mono', monospace",
  'roboto slab': "'Roboto Slab', serif",
  'roboto slab light': "'Roboto Slab Light', 'Roboto Slab', serif",
  'roboto slab medium': "'Roboto Slab Medium', 'Roboto Slab', serif",
  'roboto slab semibold': "'Roboto Slab SemiBold', 'Roboto Slab', serif",
  'source code pro': "'Source Code Pro', monospace",
  'source sans pro': "'Source Sans Pro', sans-serif",
  tinos: 'Tinos, serif',
  ubuntu: 'Ubuntu, sans-serif',
  play: 'Play, sans-serif',
  barlow: 'Barlow, sans-serif',
  'barlow light': "'Barlow Light', Barlow, sans-serif",
  'barlow medium': "'Barlow Medium', Barlow, sans-serif",

  // Decorative / Other
  impact: "'Arial Black', sans-serif",
  'comic sans ms': 'cursive',
};

/**
 * Fonts that are considered universally available and need no substitution.
 * Stored lowercase for case-insensitive matching.
 */
const WEB_SAFE_FONTS = new Set([
  'arial',
  'arial black',
  'helvetica',
  'times new roman',
  'times',
  'georgia',
  'courier new',
  'courier',
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
]);

/**
 * Fonts where no useful visual substitution exists. These are symbol/dingbat
 * fonts whose glyphs have no standard Unicode representation.
 */
const NO_SUBSTITUTION_FONTS = new Set(['wingdings', 'symbol', 'webdings']);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get a web-safe substitute for a Windows/Office font.
 * Returns undefined if no substitution is needed (font is already web-safe)
 * or no useful substitution exists.
 */
export function getFontSubstitution(fontName: string): string | undefined {
  const key = fontName.toLowerCase().trim();
  return SUBSTITUTIONS[key];
}

/**
 * Get the best available font name: returns the original if it is web-safe,
 * a substitution if one exists, or a generic fallback.
 */
export function resolveFontName(fontName: string): string {
  const key = fontName.toLowerCase().trim();

  // Already web-safe — use as-is
  if (WEB_SAFE_FONTS.has(key)) {
    return fontName;
  }

  // Has a known substitution
  const sub = SUBSTITUTIONS[key];
  if (sub !== undefined) {
    return sub;
  }

  // Symbol fonts — no useful mapping, return original
  if (NO_SUBSTITUTION_FONTS.has(key)) {
    return fontName;
  }

  // Unknown font — return original with generic fallback
  return `'${fontName}', sans-serif`;
}

// ---------------------------------------------------------------------------
// Extended substitution registry for FontResolver CDN resolution
// ---------------------------------------------------------------------------

/**
 * Extended substitution entry with CDN metadata.
 * Used by FontResolver for dynamic font fetching from Fontsource/Google CDN.
 */
export interface SubstitutionEntry {
  /** OFL substitute font family name. */
  substitute: string;
  /** Fontsource CDN identifier (lowercase, hyphenated). */
  fontsourceId: string;
  /** Original Office font this substitutes for (if applicable). */
  officeFont?: string;
  /** Available subsets. */
  subsets: string[];
  /** Available weights. */
  weights: number[];
}

/**
 * Registry mapping font family names (lowercase) to CDN resolution metadata.
 *
 * Covers all families in the WOFF2 manifest plus Office font mappings.
 * The existing SUBSTITUTIONS object and resolveFontName()/getFontSubstitution()
 * functions are NOT modified — this is a parallel data structure used only
 * by the new FontResolver.
 */
export const SUBSTITUTION_REGISTRY: Record<string, SubstitutionEntry> = {
  // ── Office fonts → OFL metric-compatible substitutes ──────────────────

  calibri: {
    substitute: 'Carlito',
    fontsourceId: 'carlito',
    officeFont: 'Calibri',
    subsets: ['latin', 'latin-ext', 'cyrillic'],
    weights: [400, 700],
  },
  'calibri light': {
    substitute: 'Carlito',
    fontsourceId: 'carlito',
    officeFont: 'Calibri Light',
    subsets: ['latin', 'latin-ext', 'cyrillic'],
    weights: [400],
  },
  cambria: {
    substitute: 'Caladea',
    fontsourceId: 'caladea',
    officeFont: 'Cambria',
    subsets: ['latin', 'latin-ext', 'cyrillic'],
    weights: [400, 700],
  },
  arial: {
    substitute: 'Liberation Sans',
    fontsourceId: 'liberation-sans',
    officeFont: 'Arial',
    subsets: ['latin', 'latin-ext', 'cyrillic', 'greek'],
    weights: [400, 700],
  },
  'arial narrow': {
    substitute: 'Liberation Sans Narrow',
    fontsourceId: 'liberation-sans-narrow',
    officeFont: 'Arial Narrow',
    subsets: ['latin', 'latin-ext'],
    weights: [400, 700],
  },
  'times new roman': {
    substitute: 'Liberation Serif',
    fontsourceId: 'liberation-serif',
    officeFont: 'Times New Roman',
    subsets: ['latin', 'latin-ext', 'cyrillic', 'greek'],
    weights: [400, 700],
  },
  'courier new': {
    substitute: 'Liberation Mono',
    fontsourceId: 'liberation-mono',
    officeFont: 'Courier New',
    subsets: ['latin', 'latin-ext', 'cyrillic', 'greek'],
    weights: [400, 700],
  },
  georgia: {
    substitute: 'Gelasio',
    fontsourceId: 'gelasio',
    officeFont: 'Georgia',
    subsets: ['latin', 'latin-ext'],
    weights: [400, 700],
  },
  'segoe ui': {
    substitute: 'Selawik',
    fontsourceId: 'selawik',
    officeFont: 'Segoe UI',
    subsets: ['latin', 'latin-ext'],
    weights: [400, 700],
  },
  'segoe ui light': {
    substitute: 'Selawik Light',
    fontsourceId: 'selawik',
    officeFont: 'Segoe UI Light',
    subsets: ['latin', 'latin-ext'],
    weights: [400],
  },
  'segoe ui semibold': {
    substitute: 'Selawik Semibold',
    fontsourceId: 'selawik',
    officeFont: 'Segoe UI Semibold',
    subsets: ['latin', 'latin-ext'],
    weights: [400],
  },
  'segoe ui semilight': {
    substitute: 'Selawik Semilight',
    fontsourceId: 'selawik',
    officeFont: 'Segoe UI Semilight',
    subsets: ['latin', 'latin-ext'],
    weights: [400],
  },
  'palatino linotype': {
    substitute: 'TeX Gyre Pagella',
    fontsourceId: 'tex-gyre-pagella',
    officeFont: 'Palatino Linotype',
    subsets: ['latin', 'latin-ext'],
    weights: [400, 700],
  },
  'bookman old style': {
    substitute: 'TeX Gyre Bonum',
    fontsourceId: 'tex-gyre-bonum',
    officeFont: 'Bookman Old Style',
    subsets: ['latin', 'latin-ext'],
    weights: [400, 700],
  },
  'century schoolbook': {
    substitute: 'TeX Gyre Schola',
    fontsourceId: 'tex-gyre-schola',
    officeFont: 'Century Schoolbook',
    subsets: ['latin', 'latin-ext'],
    weights: [400, 700],
  },

  // ── OFL substitute families (standalone) ──────────────────────────────

  carlito: {
    substitute: 'Carlito',
    fontsourceId: 'carlito',
    subsets: ['latin', 'latin-ext', 'cyrillic'],
    weights: [400, 700],
  },
  caladea: {
    substitute: 'Caladea',
    fontsourceId: 'caladea',
    subsets: ['latin', 'latin-ext', 'cyrillic'],
    weights: [400, 700],
  },
  gelasio: {
    substitute: 'Gelasio',
    fontsourceId: 'gelasio',
    subsets: ['latin', 'latin-ext'],
    weights: [400, 700],
  },
  selawik: {
    substitute: 'Selawik',
    fontsourceId: 'selawik',
    subsets: ['latin', 'latin-ext'],
    weights: [400, 700],
  },
  'selawik light': {
    substitute: 'Selawik Light',
    fontsourceId: 'selawik',
    subsets: ['latin', 'latin-ext'],
    weights: [400],
  },
  'selawik semibold': {
    substitute: 'Selawik Semibold',
    fontsourceId: 'selawik',
    subsets: ['latin', 'latin-ext'],
    weights: [400],
  },
  'selawik semilight': {
    substitute: 'Selawik Semilight',
    fontsourceId: 'selawik',
    subsets: ['latin', 'latin-ext'],
    weights: [400],
  },
  'liberation sans': {
    substitute: 'Liberation Sans',
    fontsourceId: 'liberation-sans',
    subsets: ['latin', 'latin-ext', 'cyrillic', 'greek'],
    weights: [400, 700],
  },
  'liberation sans narrow': {
    substitute: 'Liberation Sans Narrow',
    fontsourceId: 'liberation-sans-narrow',
    subsets: ['latin', 'latin-ext'],
    weights: [400, 700],
  },
  'liberation serif': {
    substitute: 'Liberation Serif',
    fontsourceId: 'liberation-serif',
    subsets: ['latin', 'latin-ext', 'cyrillic', 'greek'],
    weights: [400, 700],
  },
  'liberation mono': {
    substitute: 'Liberation Mono',
    fontsourceId: 'liberation-mono',
    subsets: ['latin', 'latin-ext', 'cyrillic', 'greek'],
    weights: [400, 700],
  },
  'tex gyre pagella': {
    substitute: 'TeX Gyre Pagella',
    fontsourceId: 'tex-gyre-pagella',
    subsets: ['latin', 'latin-ext'],
    weights: [400, 700],
  },
  'tex gyre bonum': {
    substitute: 'TeX Gyre Bonum',
    fontsourceId: 'tex-gyre-bonum',
    subsets: ['latin', 'latin-ext'],
    weights: [400, 700],
  },
  'tex gyre schola': {
    substitute: 'TeX Gyre Schola',
    fontsourceId: 'tex-gyre-schola',
    subsets: ['latin', 'latin-ext'],
    weights: [400, 700],
  },

  // ── Google Fonts families ─────────────────────────────────────────────

  arimo: {
    substitute: 'Arimo',
    fontsourceId: 'arimo',
    subsets: ['latin', 'latin-ext', 'cyrillic', 'greek', 'vietnamese'],
    weights: [400, 700],
  },
  tinos: {
    substitute: 'Tinos',
    fontsourceId: 'tinos',
    subsets: ['latin', 'latin-ext', 'cyrillic', 'greek', 'vietnamese'],
    weights: [400, 700],
  },
  roboto: {
    substitute: 'Roboto',
    fontsourceId: 'roboto',
    subsets: ['latin', 'latin-ext', 'cyrillic', 'greek', 'vietnamese'],
    weights: [400, 700],
  },
  'roboto mono': {
    substitute: 'Roboto Mono',
    fontsourceId: 'roboto-mono',
    subsets: ['latin', 'latin-ext', 'cyrillic', 'greek', 'vietnamese'],
    weights: [400, 700],
  },
  'roboto slab': {
    substitute: 'Roboto Slab',
    fontsourceId: 'roboto-slab',
    subsets: ['latin', 'latin-ext', 'cyrillic', 'greek', 'vietnamese'],
    weights: [400, 700],
  },
  'roboto slab light': {
    substitute: 'Roboto Slab Light',
    fontsourceId: 'roboto-slab',
    subsets: ['latin', 'latin-ext', 'cyrillic', 'greek', 'vietnamese'],
    weights: [300],
  },
  'roboto slab medium': {
    substitute: 'Roboto Slab Medium',
    fontsourceId: 'roboto-slab',
    subsets: ['latin', 'latin-ext', 'cyrillic', 'greek', 'vietnamese'],
    weights: [500],
  },
  'roboto slab semibold': {
    substitute: 'Roboto Slab SemiBold',
    fontsourceId: 'roboto-slab',
    subsets: ['latin', 'latin-ext', 'cyrillic', 'greek', 'vietnamese'],
    weights: [600],
  },
  'open sans': {
    substitute: 'Open Sans',
    fontsourceId: 'open-sans',
    subsets: ['latin', 'latin-ext', 'cyrillic', 'greek', 'vietnamese'],
    weights: [400, 700],
  },
  'open sans extrabold': {
    substitute: 'Open Sans ExtraBold',
    fontsourceId: 'open-sans',
    subsets: ['latin', 'latin-ext', 'cyrillic', 'greek', 'vietnamese'],
    weights: [800],
  },
  lato: {
    substitute: 'Lato',
    fontsourceId: 'lato',
    subsets: ['latin', 'latin-ext'],
    weights: [400, 700],
  },
  'lato light': {
    substitute: 'Lato Light',
    fontsourceId: 'lato',
    subsets: ['latin', 'latin-ext'],
    weights: [300],
  },
  montserrat: {
    substitute: 'Montserrat',
    fontsourceId: 'montserrat',
    subsets: ['latin', 'latin-ext', 'cyrillic', 'vietnamese'],
    weights: [400, 700],
  },
  poppins: {
    substitute: 'Poppins',
    fontsourceId: 'poppins',
    subsets: ['latin', 'latin-ext'],
    weights: [400, 700],
  },
  'noto sans': {
    substitute: 'Noto Sans',
    fontsourceId: 'noto-sans',
    subsets: ['latin', 'latin-ext', 'cyrillic', 'greek', 'vietnamese'],
    weights: [400, 700],
  },
  'noto sans symbols': {
    substitute: 'Noto Sans Symbols',
    fontsourceId: 'noto-sans-symbols',
    subsets: ['latin'],
    weights: [400, 700],
  },
  'noto serif': {
    substitute: 'Noto Serif',
    fontsourceId: 'noto-serif',
    subsets: ['latin', 'latin-ext', 'cyrillic', 'greek', 'vietnamese'],
    weights: [400, 700],
  },
  oswald: {
    substitute: 'Oswald',
    fontsourceId: 'oswald',
    subsets: ['latin', 'latin-ext', 'cyrillic', 'vietnamese'],
    weights: [400, 700],
  },
  'playfair display': {
    substitute: 'Playfair Display',
    fontsourceId: 'playfair-display',
    subsets: ['latin', 'latin-ext', 'cyrillic', 'vietnamese'],
    weights: [400, 700],
  },
  raleway: {
    substitute: 'Raleway',
    fontsourceId: 'raleway',
    subsets: ['latin', 'latin-ext', 'cyrillic', 'vietnamese'],
    weights: [400, 700],
  },
  'source code pro': {
    substitute: 'Source Code Pro',
    fontsourceId: 'source-code-pro',
    subsets: ['latin', 'latin-ext', 'cyrillic', 'greek', 'vietnamese'],
    weights: [400, 700],
  },
  'source sans pro': {
    substitute: 'Source Sans Pro',
    fontsourceId: 'source-sans-3',
    subsets: ['latin', 'latin-ext', 'cyrillic', 'greek', 'vietnamese'],
    weights: [400, 700],
  },
  ubuntu: {
    substitute: 'Ubuntu',
    fontsourceId: 'ubuntu',
    subsets: ['latin', 'latin-ext', 'cyrillic', 'greek'],
    weights: [400, 700],
  },
  play: {
    substitute: 'Play',
    fontsourceId: 'play',
    subsets: ['latin', 'latin-ext', 'cyrillic'],
    weights: [400, 700],
  },
  barlow: {
    substitute: 'Barlow',
    fontsourceId: 'barlow',
    subsets: ['latin', 'latin-ext', 'vietnamese'],
    weights: [400, 700],
  },
  'barlow light': {
    substitute: 'Barlow Light',
    fontsourceId: 'barlow',
    subsets: ['latin', 'latin-ext', 'vietnamese'],
    weights: [300],
  },
  'barlow medium': {
    substitute: 'Barlow Medium',
    fontsourceId: 'barlow',
    subsets: ['latin', 'latin-ext', 'vietnamese'],
    weights: [500],
  },
  comfortaa: {
    substitute: 'Comfortaa',
    fontsourceId: 'comfortaa',
    subsets: ['latin', 'latin-ext', 'cyrillic'],
    weights: [400, 700],
  },
  'comfortaa light': {
    substitute: 'Comfortaa Light',
    fontsourceId: 'comfortaa',
    subsets: ['latin', 'latin-ext', 'cyrillic'],
    weights: [300],
  },
  'courier prime': {
    substitute: 'Courier Prime',
    fontsourceId: 'courier-prime',
    subsets: ['latin', 'latin-ext'],
    weights: [400, 700],
  },
  'fira code': {
    substitute: 'Fira Code',
    fontsourceId: 'fira-code',
    subsets: ['latin', 'latin-ext', 'cyrillic'],
    weights: [400, 700],
  },
};
