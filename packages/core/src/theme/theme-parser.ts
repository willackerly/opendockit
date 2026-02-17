/**
 * Parse theme1.xml into ThemeIR.
 *
 * Handles the three sub-schemes:
 * - Color scheme (12 named color slots)
 * - Font scheme (major/minor Latin, East Asian, Complex Script)
 * - Format scheme (fill styles, line styles, effect styles, bg fill styles)
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 20.1.6 (Theme)
 */

import type { XmlElement } from '../xml/index.js';
import type {
  ThemeIR,
  ColorSchemeIR,
  FontSchemeIR,
  FormatSchemeIR,
  FillIR,
  LineIR,
  EffectIR,
  RgbaColor,
} from '../ir/index.js';
import type { ResolvedColor } from '../ir/index.js';
import { resolveColorFromParent } from './color-resolver.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a theme XML root element (`a:theme`) into a ThemeIR.
 *
 * @param themeElement - The root `a:theme` element from theme1.xml
 * @returns A fully-parsed ThemeIR structure
 */
export function parseTheme(themeElement: XmlElement): ThemeIR {
  const name = themeElement.attr('name') ?? '';

  const themeElements = themeElement.child('a:themeElements');
  if (!themeElements) {
    return {
      name,
      colorScheme: defaultColorScheme(),
      fontScheme: defaultFontScheme(),
      formatScheme: defaultFormatScheme(),
    };
  }

  const colorScheme = parseColorScheme(themeElements.child('a:clrScheme'));
  const fontScheme = parseFontScheme(themeElements.child('a:fontScheme'));

  // Build a minimal theme for the format scheme parser (it needs color lookups)
  const partialTheme: ThemeIR = {
    name,
    colorScheme,
    fontScheme,
    formatScheme: defaultFormatScheme(),
  };

  const formatScheme = parseFormatScheme(themeElements.child('a:fmtScheme'), partialTheme);

  return {
    name,
    colorScheme,
    fontScheme,
    formatScheme,
  };
}

// ---------------------------------------------------------------------------
// Color Scheme parsing
// ---------------------------------------------------------------------------

/** The 12 color slots in a theme color scheme, in document order. */
const COLOR_SCHEME_SLOTS = [
  'a:dk1',
  'a:lt1',
  'a:dk2',
  'a:lt2',
  'a:accent1',
  'a:accent2',
  'a:accent3',
  'a:accent4',
  'a:accent5',
  'a:accent6',
  'a:hlink',
  'a:folHlink',
] as const;

/** Map from element tag name to ColorSchemeIR key. */
const SLOT_TO_KEY: Record<string, keyof ColorSchemeIR> = {
  'a:dk1': 'dk1',
  'a:lt1': 'lt1',
  'a:dk2': 'dk2',
  'a:lt2': 'lt2',
  'a:accent1': 'accent1',
  'a:accent2': 'accent2',
  'a:accent3': 'accent3',
  'a:accent4': 'accent4',
  'a:accent5': 'accent5',
  'a:accent6': 'accent6',
  'a:hlink': 'hlink',
  'a:folHlink': 'folHlink',
};

function parseColorScheme(clrSchemeEl: XmlElement | undefined): ColorSchemeIR {
  if (!clrSchemeEl) {
    return defaultColorScheme();
  }

  const scheme = defaultColorScheme();

  for (const slotTag of COLOR_SCHEME_SLOTS) {
    const slotEl = clrSchemeEl.child(slotTag);
    if (!slotEl) continue;

    const key = SLOT_TO_KEY[slotTag];
    const color = parseSlotColor(slotEl);
    if (color) {
      scheme[key] = color;
    }
  }

  return scheme;
}

/**
 * Parse the color from a color scheme slot element.
 *
 * Each slot (e.g., a:dk1) contains either a:srgbClr or a:sysClr.
 */
function parseSlotColor(slotEl: XmlElement): RgbaColor | undefined {
  // Look for the color child (srgbClr or sysClr)
  const srgb = slotEl.child('a:srgbClr');
  if (srgb) {
    const hex = srgb.attr('val') ?? '000000';
    return parseHexColor(hex);
  }

  const sys = slotEl.child('a:sysClr');
  if (sys) {
    const lastClr = sys.attr('lastClr');
    if (lastClr) {
      return parseHexColor(lastClr);
    }
    // Fallback to black for system colors without lastClr
    return { r: 0, g: 0, b: 0, a: 1 };
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Font Scheme parsing
// ---------------------------------------------------------------------------

function parseFontScheme(fontSchemeEl: XmlElement | undefined): FontSchemeIR {
  if (!fontSchemeEl) {
    return defaultFontScheme();
  }

  const majorFont = fontSchemeEl.child('a:majorFont');
  const minorFont = fontSchemeEl.child('a:minorFont');

  return {
    majorLatin: extractTypeface(majorFont, 'a:latin') ?? 'Calibri Light',
    majorEastAsia: extractTypeface(majorFont, 'a:ea') || undefined,
    majorComplexScript: extractTypeface(majorFont, 'a:cs') || undefined,
    minorLatin: extractTypeface(minorFont, 'a:latin') ?? 'Calibri',
    minorEastAsia: extractTypeface(minorFont, 'a:ea') || undefined,
    minorComplexScript: extractTypeface(minorFont, 'a:cs') || undefined,
  };
}

/** Extract the typeface attribute from a font element (a:latin, a:ea, a:cs). */
function extractTypeface(fontGroupEl: XmlElement | undefined, tagName: string): string | undefined {
  if (!fontGroupEl) return undefined;
  const el = fontGroupEl.child(tagName);
  if (!el) return undefined;
  return el.attr('typeface') || undefined;
}

// ---------------------------------------------------------------------------
// Format Scheme parsing
// ---------------------------------------------------------------------------

function parseFormatScheme(fmtSchemeEl: XmlElement | undefined, theme: ThemeIR): FormatSchemeIR {
  if (!fmtSchemeEl) {
    return defaultFormatScheme();
  }

  const fillStyles = parseFillStyleList(fmtSchemeEl.child('a:fillStyleLst'), theme);
  const lineStyles = parseLineStyleList(fmtSchemeEl.child('a:lnStyleLst'), theme);
  const effectStyles = parseEffectStyleList(fmtSchemeEl.child('a:effectStyleLst'), theme);
  const bgFillStyles = parseFillStyleList(fmtSchemeEl.child('a:bgFillStyleLst'), theme);

  return {
    fillStyles: ensureTriple(fillStyles, noFill),
    lineStyles: ensureTriple(lineStyles, defaultLine),
    effectStyles: ensureTriple(effectStyles, () => [] as EffectIR[]),
    bgFillStyles: ensureTriple(bgFillStyles, noFill),
  };
}

function parseFillStyleList(el: XmlElement | undefined, theme: ThemeIR): FillIR[] {
  if (!el) return [];

  const fills: FillIR[] = [];
  for (const child of el.children) {
    fills.push(parseFillElement(child, theme));
  }
  return fills;
}

function parseLineStyleList(el: XmlElement | undefined, theme: ThemeIR): LineIR[] {
  if (!el) return [];

  const lines: LineIR[] = [];
  for (const child of el.allChildren('a:ln')) {
    lines.push(parseLineElement(child, theme));
  }
  return lines;
}

function parseEffectStyleList(el: XmlElement | undefined, _theme: ThemeIR): EffectIR[][] {
  if (!el) return [];

  const effects: EffectIR[][] = [];
  for (const _child of el.allChildren('a:effectStyle')) {
    // Effects are complex — for now, return empty arrays
    effects.push([]);
  }
  return effects;
}

/**
 * Parse a fill element (a:solidFill, a:gradFill, a:noFill, etc.)
 * into a FillIR.
 */
function parseFillElement(el: XmlElement, theme: ThemeIR): FillIR {
  if (el.is('a:solidFill')) {
    const color = resolveColorFromParent(el, theme);
    return {
      type: 'solid',
      color: color ?? { r: 0, g: 0, b: 0, a: 1 },
    };
  }

  if (el.is('a:noFill')) {
    return { type: 'none' };
  }

  if (el.is('a:gradFill')) {
    return parseGradientFill(el, theme);
  }

  if (el.is('a:pattFill')) {
    return parsePatternFill(el, theme);
  }

  // Unknown fill type — treat as none
  return { type: 'none' };
}

function parseGradientFill(el: XmlElement, theme: ThemeIR): FillIR {
  const gsLst = el.child('a:gsLst');
  const stops: { position: number; color: ResolvedColor }[] = [];

  if (gsLst) {
    for (const gs of gsLst.allChildren('a:gs')) {
      const posRaw = gs.attr('pos');
      const position = posRaw ? parseInt(posRaw, 10) / 100000 : 0;
      const color = resolveColorFromParent(gs, theme) ?? {
        r: 0,
        g: 0,
        b: 0,
        a: 1,
      };
      stops.push({ position, color });
    }
  }

  // Determine gradient kind and angle
  const lin = el.child('a:lin');
  const path = el.child('a:path');

  if (lin) {
    const angRaw = lin.attr('ang');
    const angle = angRaw ? parseInt(angRaw, 10) / 60000 : 0;
    return {
      type: 'gradient',
      kind: 'linear',
      angle,
      stops,
    };
  }

  if (path) {
    const pathType = path.attr('path');
    return {
      type: 'gradient',
      kind: pathType === 'circle' ? 'radial' : 'path',
      stops,
    };
  }

  // Default to linear
  return {
    type: 'gradient',
    kind: 'linear',
    angle: 0,
    stops,
  };
}

function parsePatternFill(el: XmlElement, theme: ThemeIR): FillIR {
  const preset = el.attr('prst') ?? 'pct5';
  const fgClr = el.child('a:fgClr');
  const bgClr = el.child('a:bgClr');

  const foreground = fgClr
    ? (resolveColorFromParent(fgClr, theme) ?? { r: 0, g: 0, b: 0, a: 1 })
    : { r: 0, g: 0, b: 0, a: 1 };

  const background = bgClr
    ? (resolveColorFromParent(bgClr, theme) ?? {
        r: 255,
        g: 255,
        b: 255,
        a: 1,
      })
    : { r: 255, g: 255, b: 255, a: 1 };

  return { type: 'pattern', preset, foreground, background };
}

/**
 * Parse a line element (a:ln) into a LineIR.
 */
function parseLineElement(el: XmlElement, theme: ThemeIR): LineIR {
  const widthRaw = el.attr('w');
  const width = widthRaw ? parseInt(widthRaw, 10) : undefined;

  const cap = (el.attr('cap') as LineIR['cap']) ?? undefined;
  const compound = (el.attr('cmpd') as LineIR['compound']) ?? undefined;

  // Get line color from solidFill child
  const solidFill = el.child('a:solidFill');
  let color: ResolvedColor | undefined;
  if (solidFill) {
    color = resolveColorFromParent(solidFill, theme);
  }

  // Dash style
  const prstDash = el.child('a:prstDash');
  const dashStyle = prstDash
    ? ((prstDash.attr('val') as LineIR['dashStyle']) ?? undefined)
    : undefined;

  // Join
  let join: LineIR['join'];
  if (el.child('a:round')) join = 'round';
  else if (el.child('a:bevel')) join = 'bevel';
  else if (el.child('a:miter')) join = 'miter';

  return {
    color,
    width,
    dashStyle,
    compound,
    cap,
    join,
  };
}

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------

function defaultColorScheme(): ColorSchemeIR {
  return {
    dk1: { r: 0, g: 0, b: 0, a: 1 },
    lt1: { r: 255, g: 255, b: 255, a: 1 },
    dk2: { r: 68, g: 84, b: 106, a: 1 },
    lt2: { r: 231, g: 230, b: 230, a: 1 },
    accent1: { r: 68, g: 114, b: 196, a: 1 },
    accent2: { r: 237, g: 125, b: 49, a: 1 },
    accent3: { r: 165, g: 165, b: 165, a: 1 },
    accent4: { r: 255, g: 192, b: 0, a: 1 },
    accent5: { r: 91, g: 155, b: 213, a: 1 },
    accent6: { r: 112, g: 173, b: 71, a: 1 },
    hlink: { r: 5, g: 99, b: 193, a: 1 },
    folHlink: { r: 149, g: 79, b: 114, a: 1 },
  };
}

function defaultFontScheme(): FontSchemeIR {
  return {
    majorLatin: 'Calibri Light',
    minorLatin: 'Calibri',
  };
}

function defaultFormatScheme(): FormatSchemeIR {
  return {
    fillStyles: [noFill(), noFill(), noFill()],
    lineStyles: [defaultLine(), defaultLine(), defaultLine()],
    effectStyles: [[], [], []],
    bgFillStyles: [noFill(), noFill(), noFill()],
  };
}

function noFill(): FillIR {
  return { type: 'none' };
}

function defaultLine(): LineIR {
  return {};
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/** Parse a 6-character hex color string to RgbaColor. */
function parseHexColor(hex: string): RgbaColor {
  const cleaned = hex.replace('#', '').padStart(6, '0');
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  return {
    r: Math.max(0, Math.min(255, r)),
    g: Math.max(0, Math.min(255, g)),
    b: Math.max(0, Math.min(255, b)),
    a: 1,
  };
}

/** Ensure an array has exactly 3 elements, padding with defaults. */
function ensureTriple<T>(arr: T[], defaultFn: () => T): [T, T, T] {
  return [arr[0] ?? defaultFn(), arr[1] ?? defaultFn(), arr[2] ?? defaultFn()];
}
