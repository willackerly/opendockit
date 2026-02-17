/**
 * Theme Intermediate Representation types.
 *
 * Represents a resolved OOXML theme (a:theme) — color scheme, font scheme,
 * and format scheme. These types are consumed by the color resolver, font
 * resolver, and format scheme lookup during rendering.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 20.1.6 (Theme)
 */

import type { RgbaColor } from './common.js';
import type { EffectIR, FillIR, LineIR } from './drawingml-ir.js';

// ---------------------------------------------------------------------------
// Color Scheme
// ---------------------------------------------------------------------------

/**
 * The 12 named colors defined in a theme's color scheme.
 *
 * Slot names match the OOXML spec (a:dk1, a:lt1, etc.). These are the
 * raw colors before any tint/shade/saturation transforms.
 */
export interface ColorSchemeIR {
  /** Dark 1 (typically used for body text on light backgrounds). */
  dk1: RgbaColor;
  /** Light 1 (typically used for backgrounds). */
  lt1: RgbaColor;
  /** Dark 2. */
  dk2: RgbaColor;
  /** Light 2. */
  lt2: RgbaColor;
  /** Accent 1. */
  accent1: RgbaColor;
  /** Accent 2. */
  accent2: RgbaColor;
  /** Accent 3. */
  accent3: RgbaColor;
  /** Accent 4. */
  accent4: RgbaColor;
  /** Accent 5. */
  accent5: RgbaColor;
  /** Accent 6. */
  accent6: RgbaColor;
  /** Hyperlink color. */
  hlink: RgbaColor;
  /** Followed hyperlink color. */
  folHlink: RgbaColor;
}

// ---------------------------------------------------------------------------
// Font Scheme
// ---------------------------------------------------------------------------

/**
 * Major and minor font definitions from the theme.
 *
 * "Major" fonts are typically used for headings; "minor" for body text.
 * Each has a Latin typeface (required) and optional East Asian / Complex
 * Script typefaces.
 */
export interface FontSchemeIR {
  majorLatin: string;
  majorEastAsia?: string;
  majorComplexScript?: string;
  minorLatin: string;
  minorEastAsia?: string;
  minorComplexScript?: string;
}

// ---------------------------------------------------------------------------
// Format Scheme
// ---------------------------------------------------------------------------

/**
 * The format scheme defines three intensity levels of fills, lines,
 * effects, and background fills.
 *
 * Index 0 = subtle, 1 = moderate, 2 = intense.
 * Each array must contain exactly 3 entries.
 */
export interface FormatSchemeIR {
  /** Three fill styles (subtle, moderate, intense). */
  fillStyles: [FillIR, FillIR, FillIR];
  /** Three line styles (subtle, moderate, intense). */
  lineStyles: [LineIR, LineIR, LineIR];
  /** Three effect style arrays (subtle, moderate, intense). */
  effectStyles: [EffectIR[], EffectIR[], EffectIR[]];
  /** Three background fill styles (subtle, moderate, intense). */
  bgFillStyles: [FillIR, FillIR, FillIR];
}

// ---------------------------------------------------------------------------
// Theme (aggregate)
// ---------------------------------------------------------------------------

/** A fully-resolved OOXML theme. */
export interface ThemeIR {
  /** Theme name, e.g. "Office Theme". */
  name: string;
  colorScheme: ColorSchemeIR;
  fontScheme: FontSchemeIR;
  formatScheme: FormatSchemeIR;
}
