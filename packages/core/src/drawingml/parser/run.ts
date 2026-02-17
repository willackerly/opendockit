/**
 * Run and character properties parser for DrawingML text elements.
 *
 * Parses `a:r` (run), `a:br` (line break), and `a:rPr` (character properties)
 * elements into their corresponding IR types.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 21.1.2.3.9 (CT_TextCharacterProperties)
 */

import type { XmlElement } from '../../xml/index.js';
import type { ThemeIR, RunIR, LineBreakIR, CharacterPropertiesIR } from '../../ir/index.js';
import type { ColorContext } from '../../theme/index.js';
import { resolveColorFromParent } from '../../theme/index.js';
import { resolveThemeFont, isThemeFontRef } from '../../theme/index.js';
import { parseIntAttr, parseBoolAttr } from '../../xml/index.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a run element (`a:r`).
 *
 * ```xml
 * <a:r>
 *   <a:rPr lang="en-US" sz="1800" b="1"/>
 *   <a:t>Hello World</a:t>
 * </a:r>
 * ```
 */
export function parseRun(rElement: XmlElement, theme: ThemeIR, context?: ColorContext): RunIR {
  const rPrEl = rElement.child('a:rPr');
  const properties = rPrEl ? parseCharacterProperties(rPrEl, theme, context) : {};

  const tEl = rElement.child('a:t');
  const text = tEl ? tEl.text() : '';

  return {
    kind: 'run',
    text,
    properties,
  };
}

/**
 * Parse character properties (`a:rPr`).
 *
 * ```xml
 * <a:rPr lang="en-US" sz="1800" b="1" i="0" u="sng" strike="sngStrike"
 *        baseline="30000" spc="100">
 *   <a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>
 *   <a:latin typeface="Calibri"/>
 *   <a:ea typeface=""/>
 *   <a:cs typeface=""/>
 * </a:rPr>
 * ```
 */
export function parseCharacterProperties(
  rPrElement: XmlElement,
  theme: ThemeIR,
  context?: ColorContext
): CharacterPropertiesIR {
  const props: CharacterPropertiesIR = {};

  // Font size — hundredths of a point (e.g., 1800 = 18pt)
  const sz = parseIntAttr(rPrElement, 'sz');
  if (sz !== undefined) {
    props.fontSize = sz;
  }

  // Bold
  const bRaw = rPrElement.attr('b');
  if (bRaw !== undefined) {
    props.bold = parseBoolAttr(rPrElement, 'b');
  }

  // Italic
  const iRaw = rPrElement.attr('i');
  if (iRaw !== undefined) {
    props.italic = parseBoolAttr(rPrElement, 'i');
  }

  // Underline
  const uRaw = rPrElement.attr('u');
  if (uRaw !== undefined) {
    props.underline = parseUnderlineStyle(uRaw);
  }

  // Strikethrough
  const strikeRaw = rPrElement.attr('strike');
  if (strikeRaw !== undefined) {
    props.strikethrough = parseStrikethrough(strikeRaw);
  }

  // Baseline (superscript/subscript) — in 1/1000 percent
  const baseline = parseIntAttr(rPrElement, 'baseline');
  if (baseline !== undefined) {
    props.baseline = baseline / 1000;
  }

  // Letter spacing — hundredths of a point
  const spc = parseIntAttr(rPrElement, 'spc');
  if (spc !== undefined) {
    props.spacing = spc;
  }

  // Color from solidFill child
  const solidFill = rPrElement.child('a:solidFill');
  if (solidFill) {
    const color = resolveColorFromParent(solidFill, theme, context);
    if (color) {
      props.color = color;
    }
  }

  // Highlight color
  const highlight = rPrElement.child('a:highlight');
  if (highlight) {
    const highlightColor = resolveColorFromParent(highlight, theme, context);
    if (highlightColor) {
      props.highlight = highlightColor;
    }
  }

  // Font references (latin, ea, cs)
  const latinEl = rPrElement.child('a:latin');
  if (latinEl) {
    const typeface = latinEl.attr('typeface');
    if (typeface) {
      props.latin = typeface;
    }
  }

  const eaEl = rPrElement.child('a:ea');
  if (eaEl) {
    const typeface = eaEl.attr('typeface');
    if (typeface) {
      props.eastAsian = typeface;
    }
  }

  const csEl = rPrElement.child('a:cs');
  if (csEl) {
    const typeface = csEl.attr('typeface');
    if (typeface) {
      props.complexScript = typeface;
    }
  }

  // Resolve fontFamily from latin typeface, resolving theme font refs
  if (props.latin) {
    if (isThemeFontRef(props.latin)) {
      const resolved = resolveThemeFont(props.latin, theme);
      if (resolved) {
        props.fontFamily = resolved;
      }
    } else {
      props.fontFamily = props.latin;
    }
  }

  return props;
}

/**
 * Parse a line break element (`a:br`).
 *
 * ```xml
 * <a:br>
 *   <a:rPr lang="en-US" sz="1800"/>
 * </a:br>
 * ```
 */
export function parseLineBreak(
  brElement: XmlElement,
  theme: ThemeIR,
  context?: ColorContext
): LineBreakIR {
  const rPrEl = brElement.child('a:rPr');
  const properties = rPrEl ? parseCharacterProperties(rPrEl, theme, context) : {};

  return {
    kind: 'lineBreak',
    properties,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Map OOXML underline attribute values to UnderlineStyle. */
function parseUnderlineStyle(raw: string): CharacterPropertiesIR['underline'] {
  const map: Record<string, CharacterPropertiesIR['underline']> = {
    none: 'none',
    sng: 'single',
    dbl: 'double',
    heavy: 'heavy',
    dotted: 'dotted',
    dottedHeavy: 'dottedHeavy',
    dash: 'dash',
    dashHeavy: 'dashHeavy',
    dashLong: 'dashLong',
    dashLongHeavy: 'dashLongHeavy',
    dotDash: 'dotDash',
    dotDashHeavy: 'dotDashHeavy',
    dotDotDash: 'dotDotDash',
    dotDotDashHeavy: 'dotDotDashHeavy',
    wavy: 'wavy',
    wavyHeavy: 'wavyHeavy',
    wavyDbl: 'wavyDouble',
  };
  return map[raw] ?? 'none';
}

/** Map OOXML strike attribute values to strikethrough style. */
function parseStrikethrough(raw: string): CharacterPropertiesIR['strikethrough'] {
  switch (raw) {
    case 'sngStrike':
      return 'single';
    case 'dblStrike':
      return 'double';
    case 'noStrike':
    default:
      return 'none';
  }
}
