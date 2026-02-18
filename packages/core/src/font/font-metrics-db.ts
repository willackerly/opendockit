/**
 * FontMetricsDB — precomputed font metrics for accurate text layout.
 *
 * Provides per-character advance width lookup using metrics extracted from
 * real font files. This allows accurate line-breaking and auto-fit
 * calculations even when the actual font is not available for Canvas
 * measurement (e.g., Calibri on non-Windows systems).
 *
 * Font metrics are dimensional data (advance widths, ascender/descender)
 * and are not copyrightable creative expression. This approach is used
 * by Apache POI, pdf.js, and many other open-source projects.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Metrics for a single font face (family + style combination). */
export interface FontFaceMetrics {
  /** Font family name (e.g., 'Calibri'). */
  family: string;
  /** Style variant. */
  style: 'regular' | 'bold' | 'italic' | 'boldItalic';
  /** Font design units per em (typically 1000 or 2048). */
  unitsPerEm: number;
  /** Typographic ascender in font units. */
  ascender: number;
  /** Typographic descender in font units (typically negative). */
  descender: number;
  /** Cap height in font units. */
  capHeight: number;
  /**
   * Normalized line height: (ascender + |descender| + lineGap) / unitsPerEm.
   * Follows the pdf.js pattern for accurate vertical positioning.
   */
  lineHeight?: number;
  /**
   * Normalized line gap: hhea.lineGap / unitsPerEm.
   * Used with lineHeight to compute first-line height:
   *   firstLineHeight = (lineHeight - lineGap) * fontSize
   */
  lineGap?: number;
  /**
   * Per-codepoint advance widths in font units.
   * Keys are Unicode codepoints as decimal strings.
   */
  widths: Record<string, number>;
  /** Default advance width for unmapped codepoints. */
  defaultWidth: number;
}

/** A bundle of font metrics for multiple families. */
export interface FontMetricsBundle {
  /** Bundle format version. */
  version: number;
  /** Font metrics keyed by lowercase family name. */
  fonts: Record<string, FontFaceMetrics[]>;
}

// ---------------------------------------------------------------------------
// FontMetricsDB
// ---------------------------------------------------------------------------

type StyleKey = 'regular' | 'bold' | 'italic' | 'boldItalic';

/**
 * Runtime database for precomputed font metrics.
 *
 * Provides text measurement using advance widths from real fonts,
 * bypassing Canvas2D measurement entirely for known fonts. Falls
 * back to `undefined` for unknown fonts so the caller can use
 * Canvas measurement as a fallback.
 */
export class FontMetricsDB {
  /** family (lowercase) → style → FontFaceMetrics */
  private _fonts = new Map<string, Map<StyleKey, FontFaceMetrics>>();

  /** Load an entire metrics bundle. */
  loadBundle(bundle: FontMetricsBundle): void {
    for (const [family, faces] of Object.entries(bundle.fonts)) {
      const key = family.toLowerCase();
      let styleMap = this._fonts.get(key);
      if (!styleMap) {
        styleMap = new Map();
        this._fonts.set(key, styleMap);
      }
      for (const face of faces) {
        styleMap.set(face.style, face);
      }
    }
  }

  /** Load metrics for a single font face. */
  loadFontMetrics(metrics: FontFaceMetrics): void {
    const key = metrics.family.toLowerCase();
    let styleMap = this._fonts.get(key);
    if (!styleMap) {
      styleMap = new Map();
      this._fonts.set(key, styleMap);
    }
    styleMap.set(metrics.style, metrics);
  }

  /** Check whether metrics exist for a given font family. */
  hasMetrics(family: string): boolean {
    return this._fonts.has(family.toLowerCase());
  }

  /**
   * Measure text width in pixels using precomputed metrics.
   *
   * Returns `undefined` if no metrics are available for the font,
   * signaling the caller should fall back to Canvas measurement.
   */
  measureText(
    text: string,
    family: string,
    fontSizePx: number,
    bold: boolean,
    italic: boolean
  ): number | undefined {
    const face = this._resolveFace(family, bold, italic);
    if (!face) return undefined;

    let totalWidth = 0;
    for (let i = 0; i < text.length; i++) {
      const cp = text.codePointAt(i)!;
      const w = face.widths[cp] ?? face.defaultWidth;
      totalWidth += w;
      // Skip low surrogate for astral codepoints
      if (cp > 0xffff) i++;
    }

    return (totalWidth / face.unitsPerEm) * fontSizePx;
  }

  /**
   * Get vertical metrics (ascender, descender, capHeight, lineHeight, lineGap) in pixels.
   *
   * lineHeight and lineGap follow the pdf.js pattern:
   *   lineHeight = (ascender + |descender| + lineGap) / unitsPerEm — pre-normalized in the bundle
   *   lineGap = hhea.lineGap / unitsPerEm — pre-normalized in the bundle
   *   firstLineHeight = (lineHeight - lineGap) * fontSize
   *
   * Returns `undefined` if no metrics are available for the font.
   */
  getVerticalMetrics(
    family: string,
    fontSizePx: number,
    bold: boolean,
    italic: boolean
  ):
    | {
        ascender: number;
        descender: number;
        capHeight: number;
        lineHeight?: number;
        lineGap?: number;
      }
    | undefined {
    const face = this._resolveFace(family, bold, italic);
    if (!face) return undefined;

    const scale = fontSizePx / face.unitsPerEm;
    const result: {
      ascender: number;
      descender: number;
      capHeight: number;
      lineHeight?: number;
      lineGap?: number;
    } = {
      ascender: face.ascender * scale,
      descender: face.descender * scale,
      capHeight: face.capHeight * scale,
    };

    // lineHeight and lineGap are already normalized to em units in the bundle,
    // so multiply by fontSizePx directly (not by scale).
    if (face.lineHeight != null) {
      result.lineHeight = face.lineHeight * fontSizePx;
    }
    if (face.lineGap != null) {
      result.lineGap = face.lineGap * fontSizePx;
    }

    return result;
  }

  /**
   * Resolve the best matching face for the given style.
   *
   * Cascade: exact match → partial match → regular → any.
   */
  private _resolveFace(
    family: string,
    bold: boolean,
    italic: boolean
  ): FontFaceMetrics | undefined {
    const styleMap = this._fonts.get(family.toLowerCase());
    if (!styleMap) return undefined;

    // Exact match
    const targetStyle: StyleKey =
      bold && italic ? 'boldItalic' : bold ? 'bold' : italic ? 'italic' : 'regular';
    const exact = styleMap.get(targetStyle);
    if (exact) return exact;

    // Partial match: prefer bold over regular for boldItalic, etc.
    if (targetStyle === 'boldItalic') {
      return styleMap.get('bold') ?? styleMap.get('italic') ?? styleMap.get('regular');
    }

    // Fall back to regular
    return styleMap.get('regular') ?? styleMap.values().next().value;
  }
}
