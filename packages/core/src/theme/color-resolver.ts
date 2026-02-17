/**
 * Color resolver for OOXML DrawingML colors.
 *
 * Handles all 5 color types (srgbClr, schemeClr, sysClr, hslClr, prstClr)
 * and applies child color transforms (lumMod, lumOff, tint, shade, alpha,
 * satMod, satOff, hueMod, hueOff, comp, inv, gray).
 *
 * Color transforms operate in HSL space for luminance/saturation/hue
 * modifications, while tint/shade operate in linear RGB space
 * (following Apache POI's approach for better accuracy).
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 20.1.2.3 (Color)
 * Oracles: python-pptx dml/color.py, Apache POI DrawPaint.java
 */

import type { XmlElement } from '../xml/index.js';
import type { ThemeIR, ResolvedColor, RgbaColor, ColorSchemeIR } from '../ir/index.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Context for resolving placeholder colors (phClr) in the style matrix. */
export interface ColorContext {
  /** The placeholder color for phClr references (used in style matrix). */
  phClr?: ResolvedColor;
}

/**
 * Resolve any color element to a concrete RGBA value.
 *
 * Accepts any of the 5 OOXML color element types: `a:srgbClr`, `a:schemeClr`,
 * `a:sysClr`, `a:hslClr`, `a:prstClr`. Also handles `a:scRgbClr`.
 *
 * @param colorElement - An XML element representing a color (one of the 5 types)
 * @param theme - The resolved theme (needed for scheme color lookups)
 * @param context - Optional context for phClr resolution
 * @returns A fully resolved color ready for rendering
 */
export function resolveColor(
  colorElement: XmlElement,
  theme: ThemeIR,
  context?: ColorContext
): ResolvedColor {
  // Parse the base color
  let base: ResolvedColor;

  if (colorElement.is('a:srgbClr')) {
    base = parseSrgbClr(colorElement);
  } else if (colorElement.is('a:schemeClr')) {
    base = parseSchemeClr(colorElement, theme, context);
  } else if (colorElement.is('a:sysClr')) {
    base = parseSysClr(colorElement);
  } else if (colorElement.is('a:hslClr')) {
    base = parseHslClr(colorElement);
  } else if (colorElement.is('a:prstClr')) {
    base = parsePrstClr(colorElement);
  } else if (colorElement.is('a:scRgbClr')) {
    base = parseScRgbClr(colorElement);
  } else {
    // Unknown color type, return black as fallback
    base = { r: 0, g: 0, b: 0, a: 1 };
  }

  // Apply child transforms
  return applyTransforms(base, colorElement);
}

/**
 * Resolve a color from a parent element that contains a color child.
 *
 * This is a convenience function for elements like `a:solidFill` that contain
 * one of the 5 color types as a child element.
 *
 * @param parentElement - Parent element containing a color child (e.g., a:solidFill)
 * @param theme - The resolved theme
 * @param context - Optional context for phClr resolution
 * @returns The resolved color, or undefined if no color child is found
 */
export function resolveColorFromParent(
  parentElement: XmlElement,
  theme: ThemeIR,
  context?: ColorContext
): ResolvedColor | undefined {
  const colorTagNames = [
    'a:srgbClr',
    'a:schemeClr',
    'a:sysClr',
    'a:hslClr',
    'a:prstClr',
    'a:scRgbClr',
  ];

  for (const tagName of colorTagNames) {
    const colorEl = parentElement.child(tagName);
    if (colorEl) {
      return resolveColor(colorEl, theme, context);
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Base color parsers (one per color type)
// ---------------------------------------------------------------------------

/** Parse `a:srgbClr val="4472C4"` */
function parseSrgbClr(el: XmlElement): ResolvedColor {
  const hex = el.attr('val') ?? '000000';
  return parseHexColor(hex);
}

/** Parse `a:schemeClr val="accent1"` — looks up in theme color scheme. */
function parseSchemeClr(el: XmlElement, theme: ThemeIR, context?: ColorContext): ResolvedColor {
  const schemeKey = el.attr('val') ?? '';

  // phClr (placeholder color) is resolved from context
  if (schemeKey === 'phClr') {
    if (context?.phClr) {
      return { ...context.phClr, schemeKey: 'phClr' };
    }
    // No context color available, return black
    return { r: 0, g: 0, b: 0, a: 1, schemeKey: 'phClr' };
  }

  // Resolve aliases: tx1 -> dk1, tx2 -> dk2, bg1 -> lt1, bg2 -> lt2
  const resolvedKey = resolveSchemeAlias(schemeKey);

  // Look up in color scheme
  const schemeColor = theme.colorScheme[resolvedKey as keyof ColorSchemeIR];
  if (schemeColor) {
    return { ...schemeColor, schemeKey: resolvedKey };
  }

  // Unknown scheme key, return black
  return { r: 0, g: 0, b: 0, a: 1, schemeKey: resolvedKey };
}

/** Parse `a:sysClr val="windowText" lastClr="000000"` */
function parseSysClr(el: XmlElement): ResolvedColor {
  const lastClr = el.attr('lastClr');
  if (lastClr) {
    return parseHexColor(lastClr);
  }
  // Fall back to system color name lookup
  const val = el.attr('val') ?? '';
  return getSystemColor(val);
}

/** Parse `a:hslClr hue="0" sat="0" lum="0"` */
function parseHslClr(el: XmlElement): ResolvedColor {
  // hue is in 60000ths of a degree (0-21600000)
  const hueRaw = parseInt(el.attr('hue') ?? '0', 10);
  // sat and lum are in 1/1000ths of a percent (0-100000)
  const satRaw = parseInt(el.attr('sat') ?? '0', 10);
  const lumRaw = parseInt(el.attr('lum') ?? '0', 10);

  const h = hueRaw / 60000; // degrees
  const s = satRaw / 100000; // 0-1
  const l = lumRaw / 100000; // 0-1

  const [r, g, b] = hslToRgb(h, s, l);
  return { r, g, b, a: 1 };
}

/** Parse `a:prstClr val="black"` */
function parsePrstClr(el: XmlElement): ResolvedColor {
  const name = el.attr('val') ?? '';
  return getPresetColor(name);
}

/** Parse `a:scRgbClr r="0" g="0" b="0"` — scRGB percentages. */
function parseScRgbClr(el: XmlElement): ResolvedColor {
  // r, g, b are in 1/1000ths of a percent (0-100000)
  const rPct = parseInt(el.attr('r') ?? '0', 10) / 100000;
  const gPct = parseInt(el.attr('g') ?? '0', 10) / 100000;
  const bPct = parseInt(el.attr('b') ?? '0', 10) / 100000;

  // scRGB to sRGB conversion (gamma correction)
  const r = Math.round(scRgbToSrgb(rPct) * 255);
  const g = Math.round(scRgbToSrgb(gPct) * 255);
  const b = Math.round(scRgbToSrgb(bPct) * 255);

  return { r: clamp(r), g: clamp(g), b: clamp(b), a: 1 };
}

// ---------------------------------------------------------------------------
// Color transforms
// ---------------------------------------------------------------------------

/**
 * Apply child transform elements to a base color.
 *
 * Following POI's approach:
 * 1. Apply tint/shade in linear RGB space
 * 2. Apply hue/sat/lum modifications in HSL space
 * 3. Apply alpha
 *
 * The transforms are applied in the order they appear as children.
 * However, we collect all values first and apply in the correct order
 * because OOXML specifies certain ordering semantics.
 */
function applyTransforms(base: ResolvedColor, colorElement: XmlElement): ResolvedColor {
  const children = colorElement.children;
  if (children.length === 0) {
    return base;
  }

  let r = base.r;
  let g = base.g;
  let b = base.b;
  let a = base.a;

  // Collect transform values from child elements
  let tintVal: number | undefined;
  let shadeVal: number | undefined;
  let alphaVal: number | undefined;
  let alphaMod: number | undefined;
  let alphaOff: number | undefined;
  let lumMod: number | undefined;
  let lumOff: number | undefined;
  let satMod: number | undefined;
  let satOff: number | undefined;
  let hueMod: number | undefined;
  let hueOff: number | undefined;
  let satVal: number | undefined;
  let lumVal: number | undefined;
  let hueVal: number | undefined;
  let doComp = false;
  let doInv = false;
  let doGray = false;

  for (const child of children) {
    const name = child.name;
    const val = child.attr('val');
    const num = val !== undefined ? parseInt(val, 10) : undefined;

    switch (name) {
      case 'a:tint':
        tintVal = num;
        break;
      case 'a:shade':
        shadeVal = num;
        break;
      case 'a:alpha':
        alphaVal = num;
        break;
      case 'a:alphaMod':
        alphaMod = num;
        break;
      case 'a:alphaOff':
        alphaOff = num;
        break;
      case 'a:lumMod':
        lumMod = num;
        break;
      case 'a:lumOff':
        lumOff = num;
        break;
      case 'a:satMod':
        satMod = num;
        break;
      case 'a:satOff':
        satOff = num;
        break;
      case 'a:hueMod':
        hueMod = num;
        break;
      case 'a:hueOff':
        hueOff = num;
        break;
      case 'a:sat':
        satVal = num;
        break;
      case 'a:lum':
        lumVal = num;
        break;
      case 'a:hue':
        hueVal = num;
        break;
      case 'a:comp':
        doComp = true;
        break;
      case 'a:inv':
        doInv = true;
        break;
      case 'a:gray':
        doGray = true;
        break;
    }
  }

  // 1. Apply tint/shade in linear RGB space (following POI)
  if (shadeVal !== undefined) {
    const shadePct = shadeVal / 100000;
    r = clamp(Math.round(r * shadePct));
    g = clamp(Math.round(g * shadePct));
    b = clamp(Math.round(b * shadePct));
  }

  if (tintVal !== undefined) {
    const tintPct = tintVal / 100000;
    r = clamp(Math.round(255 - (255 - r) * tintPct));
    g = clamp(Math.round(255 - (255 - g) * tintPct));
    b = clamp(Math.round(255 - (255 - b) * tintPct));
  }

  // 2. Apply complementary/inverse/gray
  if (doComp) {
    // Convert to HSL, rotate hue 180 degrees, convert back
    const [h, s, l] = rgbToHsl(r, g, b);
    const newH = (h + 180) % 360;
    [r, g, b] = hslToRgb(newH, s, l);
  }

  if (doInv) {
    r = 255 - r;
    g = 255 - g;
    b = 255 - b;
  }

  if (doGray) {
    // ITU-R BT.601 luma
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    r = gray;
    g = gray;
    b = gray;
  }

  // 3. Apply HSL modifications
  let [h, s, l] = rgbToHsl(r, g, b);

  // Absolute hue/sat/lum values (set, not modify)
  if (hueVal !== undefined) {
    h = hueVal / 60000;
  }
  if (satVal !== undefined) {
    s = satVal / 100000;
  }
  if (lumVal !== undefined) {
    l = lumVal / 100000;
  }

  // Modulation and offset: value = value * mod + off
  // Following POI: hsl values are in [0..360] for hue and [0..100] for sat/lum
  // We work with hue in degrees and sat/lum as fractions [0..1]
  if (hueMod !== undefined) {
    h = h * (hueMod / 100000);
  }
  if (hueOff !== undefined) {
    h = h + hueOff / 60000;
  }

  if (satMod !== undefined) {
    s = s * (satMod / 100000);
  }
  if (satOff !== undefined) {
    s = s + satOff / 100000;
  }

  if (lumMod !== undefined) {
    l = l * (lumMod / 100000);
  }
  if (lumOff !== undefined) {
    l = l + lumOff / 100000;
  }

  // Clamp HSL values
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));

  [r, g, b] = hslToRgb(h, s, l);

  // 4. Apply alpha
  if (alphaVal !== undefined) {
    a = alphaVal / 100000;
  }
  if (alphaMod !== undefined) {
    a = a * (alphaMod / 100000);
  }
  if (alphaOff !== undefined) {
    a = a + alphaOff / 100000;
  }
  a = Math.max(0, Math.min(1, a));

  return { r, g, b, a, schemeKey: base.schemeKey };
}

// ---------------------------------------------------------------------------
// Scheme color alias resolution
// ---------------------------------------------------------------------------

/** Map scheme color aliases to canonical slot names. */
function resolveSchemeAlias(key: string): string {
  switch (key) {
    case 'tx1':
      return 'dk1';
    case 'tx2':
      return 'dk2';
    case 'bg1':
      return 'lt1';
    case 'bg2':
      return 'lt2';
    default:
      return key;
  }
}

// ---------------------------------------------------------------------------
// System color lookup
// ---------------------------------------------------------------------------

/** Map system color names to fallback RGB values. */
function getSystemColor(name: string): ResolvedColor {
  // Common Windows system colors with typical default values
  const systemColors: Record<string, RgbaColor> = {
    windowText: { r: 0, g: 0, b: 0, a: 1 },
    window: { r: 255, g: 255, b: 255, a: 1 },
    buttonFace: { r: 240, g: 240, b: 240, a: 1 },
    buttonHighlight: { r: 255, g: 255, b: 255, a: 1 },
    buttonShadow: { r: 160, g: 160, b: 160, a: 1 },
    buttonText: { r: 0, g: 0, b: 0, a: 1 },
    captionText: { r: 0, g: 0, b: 0, a: 1 },
    grayText: { r: 128, g: 128, b: 128, a: 1 },
    highlight: { r: 0, g: 120, b: 215, a: 1 },
    highlightText: { r: 255, g: 255, b: 255, a: 1 },
    inactiveCaptionText: { r: 0, g: 0, b: 0, a: 1 },
    menuText: { r: 0, g: 0, b: 0, a: 1 },
    scrollBar: { r: 200, g: 200, b: 200, a: 1 },
    '3dDkShadow': { r: 105, g: 105, b: 105, a: 1 },
    '3dLight': { r: 227, g: 227, b: 227, a: 1 },
    infoText: { r: 0, g: 0, b: 0, a: 1 },
    infoBk: { r: 255, g: 255, b: 225, a: 1 },
  };

  const color = systemColors[name];
  if (color) {
    return { ...color };
  }
  // Fallback to black
  return { r: 0, g: 0, b: 0, a: 1 };
}

// ---------------------------------------------------------------------------
// HSL <-> RGB conversion
// ---------------------------------------------------------------------------

/**
 * Convert RGB (0-255) to HSL.
 * Returns [hue (0-360), saturation (0-1), lightness (0-1)].
 *
 * Implementation matches Apache POI's RGB2HSL.
 */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rN = r / 255;
  const gN = g / 255;
  const bN = b / 255;

  const min = Math.min(rN, gN, bN);
  const max = Math.max(rN, gN, bN);

  // Hue
  let h = 0;
  if (max !== min) {
    if (max === rN) {
      h = ((60 * (gN - bN)) / (max - min) + 360) % 360;
    } else if (max === gN) {
      h = (60 * (bN - rN)) / (max - min) + 120;
    } else {
      h = (60 * (rN - gN)) / (max - min) + 240;
    }
  }

  // Lightness
  const l = (max + min) / 2;

  // Saturation
  let s = 0;
  if (max !== min) {
    if (l <= 0.5) {
      s = (max - min) / (max + min);
    } else {
      s = (max - min) / (2 - max - min);
    }
  }

  return [h, s, l];
}

/**
 * Convert HSL to RGB (0-255).
 * h: 0-360, s: 0-1, l: 0-1.
 *
 * Implementation matches Apache POI's HSL2RGB.
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  // Clamp
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  h = ((h % 360) + 360) % 360;

  // Normalize hue to 0-1
  const hN = h / 360;

  const q = l < 0.5 ? l * (1 + s) : l + s - s * l;
  const p = 2 * l - q;

  let r = Math.max(0, Math.min(1, hue2rgb(p, q, hN + 1 / 3)));
  let g = Math.max(0, Math.min(1, hue2rgb(p, q, hN)));
  let b = Math.max(0, Math.min(1, hue2rgb(p, q, hN - 1 / 3)));

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/** Helper for HSL-to-RGB conversion. Matches POI's HUE2RGB. */
function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;

  if (6 * t < 1) return p + (q - p) * 6 * t;
  if (2 * t < 1) return q;
  if (3 * t < 2) return p + (q - p) * 6 * (2 / 3 - t);
  return p;
}

// ---------------------------------------------------------------------------
// scRGB conversion
// ---------------------------------------------------------------------------

/** Convert a single scRGB component to sRGB (apply gamma). */
function scRgbToSrgb(val: number): number {
  if (val <= 0.0031308) {
    return val * 12.92;
  }
  return 1.055 * Math.pow(val, 1 / 2.4) - 0.055;
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/** Parse a 6-character hex color string to RgbaColor. */
function parseHexColor(hex: string): ResolvedColor {
  // Normalize: remove any leading '#', pad to 6 chars
  const cleaned = hex.replace('#', '').padStart(6, '0');
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  return { r: clamp(r), g: clamp(g), b: clamp(b), a: 1 };
}

/** Clamp a value to the 0-255 range. */
function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

// ---------------------------------------------------------------------------
// Preset color lookup table
// ---------------------------------------------------------------------------

/**
 * Get a preset color by name.
 *
 * OOXML defines ~150 preset colors matching CSS/X11 color names.
 * Reference: ECMA-376, Part 1, 20.1.10.47 (ST_PresetColorVal)
 */
function getPresetColor(name: string): ResolvedColor {
  const color = PRESET_COLORS[name];
  if (color) {
    return { ...color, a: 1 };
  }
  // Fallback to black for unknown preset names
  return { r: 0, g: 0, b: 0, a: 1 };
}

/** Shorthand for creating an RGB entry. */
function rgb(r: number, g: number, b: number): RgbaColor {
  return { r, g, b, a: 1 };
}

/**
 * Preset color table.
 * Keys are OOXML preset color names (ST_PresetColorVal).
 * Values match CSS/X11 definitions.
 */
const PRESET_COLORS: Record<string, RgbaColor> = {
  // Grays
  black: rgb(0, 0, 0),
  white: rgb(255, 255, 255),
  gray: rgb(128, 128, 128),
  grey: rgb(128, 128, 128),
  darkGray: rgb(169, 169, 169),
  darkGrey: rgb(169, 169, 169),
  dimGray: rgb(105, 105, 105),
  dimGrey: rgb(105, 105, 105),
  lightGray: rgb(211, 211, 211),
  lightGrey: rgb(211, 211, 211),
  ltGray: rgb(211, 211, 211),
  dkGray: rgb(169, 169, 169),
  silver: rgb(192, 192, 192),
  gainsboro: rgb(220, 220, 220),
  lightSlateGray: rgb(119, 136, 153),
  lightSlateGrey: rgb(119, 136, 153),
  slateGray: rgb(112, 128, 144),
  slateGrey: rgb(112, 128, 144),
  darkSlateGray: rgb(47, 79, 79),
  darkSlateGrey: rgb(47, 79, 79),

  // Reds
  red: rgb(255, 0, 0),
  darkRed: rgb(139, 0, 0),
  crimson: rgb(220, 20, 60),
  firebrick: rgb(178, 34, 34),
  indianRed: rgb(205, 92, 92),
  lightCoral: rgb(240, 128, 128),
  salmon: rgb(250, 128, 114),
  darkSalmon: rgb(233, 150, 122),
  lightSalmon: rgb(255, 160, 122),

  // Pinks
  pink: rgb(255, 192, 203),
  lightPink: rgb(255, 182, 193),
  hotPink: rgb(255, 105, 180),
  deepPink: rgb(255, 20, 147),
  medPurple: rgb(147, 112, 219),
  mediumVioletRed: rgb(199, 21, 133),
  paleVioletRed: rgb(219, 112, 147),

  // Oranges
  orange: rgb(255, 165, 0),
  orangeRed: rgb(255, 69, 0),
  darkOrange: rgb(255, 140, 0),
  coral: rgb(255, 127, 80),
  tomato: rgb(255, 99, 71),

  // Yellows
  yellow: rgb(255, 255, 0),
  gold: rgb(255, 215, 0),
  lightYellow: rgb(255, 255, 224),
  lemonChiffon: rgb(255, 250, 205),
  lightGoldenrodYellow: rgb(250, 250, 210),
  papayaWhip: rgb(255, 239, 213),
  moccasin: rgb(255, 228, 181),
  peachPuff: rgb(255, 218, 185),
  paleGoldenrod: rgb(238, 232, 170),
  khaki: rgb(240, 230, 140),
  darkKhaki: rgb(189, 183, 107),

  // Greens
  green: rgb(0, 128, 0),
  lime: rgb(0, 255, 0),
  limeGreen: rgb(50, 205, 50),
  lawnGreen: rgb(124, 252, 0),
  chartreuse: rgb(127, 255, 0),
  greenYellow: rgb(173, 255, 47),
  springGreen: rgb(0, 255, 127),
  medSpringGreen: rgb(0, 250, 154),
  mediumSpringGreen: rgb(0, 250, 154),
  lightGreen: rgb(144, 238, 144),
  paleGreen: rgb(152, 251, 152),
  darkSeaGreen: rgb(143, 188, 143),
  mediumSeaGreen: rgb(60, 179, 113),
  seaGreen: rgb(46, 139, 87),
  forestGreen: rgb(34, 139, 34),
  darkGreen: rgb(0, 100, 0),
  yellowGreen: rgb(154, 205, 50),
  oliveDrab: rgb(107, 142, 35),
  olive: rgb(128, 128, 0),
  darkOliveGreen: rgb(85, 107, 47),
  mediumAquamarine: rgb(102, 205, 170),
  darkCyan: rgb(0, 139, 139),
  teal: rgb(0, 128, 128),

  // Blues / Cyans
  blue: rgb(0, 0, 255),
  cyan: rgb(0, 255, 255),
  aqua: rgb(0, 255, 255),
  lightCyan: rgb(224, 255, 255),
  paleTurquoise: rgb(175, 238, 238),
  aquamarine: rgb(127, 255, 212),
  turquoise: rgb(64, 224, 208),
  mediumTurquoise: rgb(72, 209, 204),
  darkTurquoise: rgb(0, 206, 209),
  cadetBlue: rgb(95, 158, 160),
  steelBlue: rgb(70, 130, 180),
  lightSteelBlue: rgb(176, 196, 222),
  powderBlue: rgb(176, 224, 230),
  lightBlue: rgb(173, 216, 230),
  skyBlue: rgb(135, 206, 235),
  lightSkyBlue: rgb(135, 206, 250),
  deepSkyBlue: rgb(0, 191, 255),
  dodgerBlue: rgb(30, 144, 255),
  cornflowerBlue: rgb(100, 149, 237),
  mediumSlateBlue: rgb(123, 104, 238),
  royalBlue: rgb(65, 105, 225),
  medBlue: rgb(0, 0, 205),
  mediumBlue: rgb(0, 0, 205),
  darkBlue: rgb(0, 0, 139),
  navy: rgb(0, 0, 128),
  midnightBlue: rgb(25, 25, 112),

  // Purples / Violets
  purple: rgb(128, 0, 128),
  lavender: rgb(230, 230, 250),
  thistle: rgb(216, 191, 216),
  plum: rgb(221, 160, 221),
  violet: rgb(238, 130, 238),
  orchid: rgb(218, 112, 214),
  magenta: rgb(255, 0, 255),
  fuchsia: rgb(255, 0, 255),
  mediumOrchid: rgb(186, 85, 211),
  mediumPurple: rgb(147, 112, 219),
  blueViolet: rgb(138, 43, 226),
  darkViolet: rgb(148, 0, 211),
  darkOrchid: rgb(153, 50, 204),
  darkMagenta: rgb(139, 0, 139),
  indigo: rgb(75, 0, 130),
  slateBlue: rgb(106, 90, 205),
  darkSlateBlue: rgb(72, 61, 139),

  // Browns
  brown: rgb(165, 42, 42),
  cornsilk: rgb(255, 248, 220),
  blanchedAlmond: rgb(255, 235, 205),
  bisque: rgb(255, 228, 196),
  navajoWhite: rgb(255, 222, 173),
  wheat: rgb(245, 222, 179),
  burlyWood: rgb(222, 184, 135),
  tan: rgb(210, 180, 140),
  rosyBrown: rgb(188, 143, 143),
  sandyBrown: rgb(244, 164, 96),
  goldenrod: rgb(218, 165, 32),
  darkGoldenrod: rgb(184, 134, 11),
  peru: rgb(205, 133, 63),
  chocolate: rgb(210, 105, 30),
  saddleBrown: rgb(139, 69, 19),
  sienna: rgb(160, 82, 45),
  maroon: rgb(128, 0, 0),

  // Whites / off-whites
  snow: rgb(255, 250, 250),
  honeydew: rgb(240, 255, 240),
  mintCream: rgb(245, 255, 250),
  azure: rgb(240, 255, 255),
  aliceBlue: rgb(240, 248, 255),
  ghostWhite: rgb(248, 248, 255),
  whiteSmoke: rgb(245, 245, 245),
  seashell: rgb(255, 245, 238),
  beige: rgb(245, 245, 220),
  oldLace: rgb(253, 245, 230),
  floralWhite: rgb(255, 250, 240),
  ivory: rgb(255, 255, 240),
  antiqueWhite: rgb(250, 235, 215),
  linen: rgb(250, 240, 230),
  lavenderBlush: rgb(255, 240, 245),
  mistyRose: rgb(255, 228, 225),
};
