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
  calibri: "Carlito, 'Segoe UI', Arial, sans-serif",
  'calibri light': "Carlito, 'Segoe UI Light', Arial, sans-serif",
  'segoe ui': 'Selawik, system-ui, sans-serif',
  tahoma: 'Arial, sans-serif',
  'arial narrow': "'Liberation Sans Narrow', 'Arial Narrow', sans-serif",
  'century gothic': "'Gill Sans', sans-serif",
  'franklin gothic': 'Arial, sans-serif',
  'franklin gothic medium': 'Arial, sans-serif',

  // Serif — prefer metric-compatible open fonts first
  cambria: 'Caladea, Georgia, serif',
  'cambria math': 'Caladea, Georgia, serif',
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
  'open sans': "'Open Sans', sans-serif",
  'noto sans symbols': "'Noto Sans Symbols', sans-serif",

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
  'verdana',
  'trebuchet ms',
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
