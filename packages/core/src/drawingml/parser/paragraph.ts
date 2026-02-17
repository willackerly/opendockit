/**
 * Paragraph parser for DrawingML text elements.
 *
 * Parses `a:p` elements into {@link ParagraphIR}, including paragraph
 * properties, bullet properties, and child runs/line breaks.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 21.1.2.2.6 (CT_TextParagraph)
 */

import type { XmlElement } from '../../xml/index.js';
import type {
  ThemeIR,
  ParagraphIR,
  ParagraphPropertiesIR,
  BulletPropertiesIR,
  SpacingIR,
  RunIR,
  LineBreakIR,
} from '../../ir/index.js';
import type { ColorContext } from '../../theme/index.js';
import { resolveColorFromParent } from '../../theme/index.js';
import { parseIntAttr, parseBoolAttr } from '../../xml/index.js';
import { parseRun, parseLineBreak } from './run.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a paragraph element (`a:p`).
 *
 * Iterates child elements in document order, collecting runs (`a:r`) and
 * line breaks (`a:br`). Skips `a:pPr` (processed separately) and
 * `a:endParaRPr` (end-of-paragraph marker not needed in IR).
 *
 * ```xml
 * <a:p>
 *   <a:pPr algn="ctr"/>
 *   <a:r><a:rPr b="1"/><a:t>Bold text</a:t></a:r>
 *   <a:br/>
 *   <a:r><a:t>More text</a:t></a:r>
 *   <a:endParaRPr lang="en-US"/>
 * </a:p>
 * ```
 */
export function parseParagraph(
  pElement: XmlElement,
  theme: ThemeIR,
  context?: ColorContext
): ParagraphIR {
  // Parse paragraph properties
  const pPrEl = pElement.child('a:pPr');
  const properties = pPrEl
    ? parseParagraphProperties(pPrEl)
    : {};

  // Parse bullet properties
  const bulletProperties = pPrEl
    ? parseBulletProperties(pPrEl, theme, context)
    : undefined;

  // Collect runs and line breaks in document order
  const runs: (RunIR | LineBreakIR)[] = [];
  for (const child of pElement.children) {
    if (child.is('a:r')) {
      runs.push(parseRun(child, theme, context));
    } else if (child.is('a:br')) {
      runs.push(parseLineBreak(child, theme, context));
    }
    // Skip a:pPr, a:endParaRPr, and any other elements
  }

  return {
    runs,
    properties,
    bulletProperties,
  };
}

// ---------------------------------------------------------------------------
// Paragraph properties
// ---------------------------------------------------------------------------

/**
 * Parse paragraph properties (`a:pPr`).
 *
 * ```xml
 * <a:pPr algn="ctr" lvl="0" indent="0" marL="0" rtl="0">
 *   <a:lnSpc><a:spcPct val="100000"/></a:lnSpc>
 *   <a:spcBef><a:spcPts val="0"/></a:spcBef>
 *   <a:spcAft><a:spcPts val="0"/></a:spcAft>
 * </a:pPr>
 * ```
 */
function parseParagraphProperties(pPrElement: XmlElement): ParagraphPropertiesIR {
  const props: ParagraphPropertiesIR = {};

  // Alignment
  const algn = pPrElement.attr('algn');
  if (algn !== undefined) {
    props.alignment = parseAlignment(algn);
  }

  // Level (0-based outline level)
  const lvl = parseIntAttr(pPrElement, 'lvl');
  if (lvl !== undefined) {
    props.level = lvl;
  }

  // First-line indent in EMU
  const indent = parseIntAttr(pPrElement, 'indent');
  if (indent !== undefined) {
    props.indent = indent;
  }

  // Left margin in EMU
  const marL = parseIntAttr(pPrElement, 'marL');
  if (marL !== undefined) {
    props.marginLeft = marL;
  }

  // Right-to-left
  const rtlRaw = pPrElement.attr('rtl');
  if (rtlRaw !== undefined) {
    props.rtl = parseBoolAttr(pPrElement, 'rtl');
  }

  // Line spacing
  const lnSpc = pPrElement.child('a:lnSpc');
  if (lnSpc) {
    const spacing = parseSpacing(lnSpc);
    if (spacing) {
      props.lineSpacing = spacing;
    }
  }

  // Space before
  const spcBef = pPrElement.child('a:spcBef');
  if (spcBef) {
    const spacing = parseSpacing(spcBef);
    if (spacing) {
      props.spaceBefore = spacing;
    }
  }

  // Space after
  const spcAft = pPrElement.child('a:spcAft');
  if (spcAft) {
    const spacing = parseSpacing(spcAft);
    if (spacing) {
      props.spaceAfter = spacing;
    }
  }

  return props;
}

// ---------------------------------------------------------------------------
// Bullet properties
// ---------------------------------------------------------------------------

/**
 * Parse bullet properties from a paragraph properties element.
 *
 * Looks for `a:buNone`, `a:buChar`, `a:buAutoNum`, or `a:buBlip` children
 * to determine bullet type. Also parses optional `a:buFont`, `a:buSzPct`,
 * and `a:buClr` for bullet formatting.
 */
function parseBulletProperties(
  pPrElement: XmlElement,
  theme: ThemeIR,
  context?: ColorContext
): BulletPropertiesIR | undefined {
  // Determine bullet type
  const buNone = pPrElement.child('a:buNone');
  const buChar = pPrElement.child('a:buChar');
  const buAutoNum = pPrElement.child('a:buAutoNum');
  const buBlip = pPrElement.child('a:buBlip');

  // If no bullet element is present, return undefined (inherit)
  if (!buNone && !buChar && !buAutoNum && !buBlip) {
    return undefined;
  }

  const bullet: BulletPropertiesIR = { type: 'none' };

  if (buNone) {
    bullet.type = 'none';
  } else if (buChar) {
    bullet.type = 'char';
    bullet.char = buChar.attr('char');
  } else if (buAutoNum) {
    bullet.type = 'autoNum';
    bullet.autoNumType = buAutoNum.attr('type');
    const startAt = parseIntAttr(buAutoNum, 'startAt');
    if (startAt !== undefined) {
      bullet.startAt = startAt;
    }
  } else if (buBlip) {
    bullet.type = 'picture';
  }

  // Bullet font
  const buFont = pPrElement.child('a:buFont');
  if (buFont) {
    const typeface = buFont.attr('typeface');
    if (typeface) {
      bullet.font = typeface;
    }
  }

  // Bullet size as percentage
  const buSzPct = pPrElement.child('a:buSzPct');
  if (buSzPct) {
    const val = parseIntAttr(buSzPct, 'val');
    if (val !== undefined) {
      bullet.sizePercent = val / 100_000;
    }
  }

  // Bullet color
  const buClr = pPrElement.child('a:buClr');
  if (buClr) {
    const color = resolveColorFromParent(buClr, theme, context);
    if (color) {
      bullet.color = color;
    }
  }

  return bullet;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Map OOXML alignment attribute values to alignment strings. */
function parseAlignment(raw: string): ParagraphPropertiesIR['alignment'] {
  switch (raw) {
    case 'l':
      return 'left';
    case 'ctr':
      return 'center';
    case 'r':
      return 'right';
    case 'just':
      return 'justify';
    case 'dist':
      return 'distributed';
    default:
      return undefined;
  }
}

/**
 * Parse a spacing element (`a:lnSpc`, `a:spcBef`, or `a:spcAft`).
 *
 * Each can contain either:
 * - `<a:spcPct val="100000"/>` — percentage of font size (100000 = 100%)
 * - `<a:spcPts val="1200"/>` — hundredths of a point (1200 = 12pt)
 */
function parseSpacing(spacingElement: XmlElement): SpacingIR | undefined {
  // Percentage spacing
  const spcPct = spacingElement.child('a:spcPct');
  if (spcPct) {
    const val = parseIntAttr(spcPct, 'val');
    if (val !== undefined) {
      return { value: val / 1000, unit: 'pct' };
    }
  }

  // Point spacing
  const spcPts = spacingElement.child('a:spcPts');
  if (spcPts) {
    const val = parseIntAttr(spcPts, 'val');
    if (val !== undefined) {
      return { value: val / 100, unit: 'pt' };
    }
  }

  return undefined;
}
