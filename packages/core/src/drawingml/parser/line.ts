/**
 * Line parser for DrawingML line elements.
 *
 * Parses `<a:ln>` elements into {@link LineIR} objects, including
 * width, fill/color, dash style, join, cap, and arrow endpoints.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 20.1.8.28 (Line Properties)
 */

import type { XmlElement } from '../../xml/index.js';
import type {
  ThemeIR,
  LineIR,
  LineEnd,
  DashStyle,
  LineCap,
  LineJoin,
  CompoundLine,
} from '../../ir/index.js';
import type { ColorContext } from '../../theme/index.js';
import { resolveColorFromParent } from '../../theme/index.js';
import { parseIntAttr, parseEnumAttr } from '../../xml/index.js';
import { parseFill } from './fill.js';

// ---------------------------------------------------------------------------
// Constants for enum validation
// ---------------------------------------------------------------------------

const DASH_STYLES = [
  'solid',
  'dash',
  'dot',
  'dashDot',
  'lgDash',
  'lgDashDot',
  'lgDashDotDot',
  'sysDash',
  'sysDot',
  'sysDashDot',
  'sysDashDotDot',
] as const;

const LINE_CAPS = ['flat', 'round', 'square'] as const;

const COMPOUND_LINES = ['sng', 'dbl', 'thickThin', 'thinThick', 'tri'] as const;

const LINE_END_TYPES = [
  'none',
  'triangle',
  'stealth',
  'diamond',
  'oval',
  'arrow',
] as const;

const LINE_END_SIZES = ['sm', 'med', 'lg'] as const;

/**
 * Map OOXML compound line abbreviations to IR compound line types.
 */
const COMPOUND_LINE_MAP: Record<string, CompoundLine> = {
  sng: 'single',
  dbl: 'double',
  thickThin: 'thickThin',
  thinThick: 'thinThick',
  tri: 'triple',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a line element (`<a:ln>`).
 *
 * Extracts width, fill/color, dash style, join, cap, compound type,
 * and head/tail arrow endpoints.
 *
 * ```xml
 * <a:ln w="12700" cap="flat" cmpd="sng">
 *   <a:solidFill><a:srgbClr val="000000"/></a:solidFill>
 *   <a:prstDash val="dash"/>
 *   <a:round/>
 *   <a:headEnd type="none"/>
 *   <a:tailEnd type="triangle" w="med" len="med"/>
 * </a:ln>
 * ```
 */
export function parseLine(
  lnElement: XmlElement,
  theme: ThemeIR,
  context?: ColorContext
): LineIR {
  const result: LineIR = {};

  // Width in EMU
  const width = parseIntAttr(lnElement, 'w');
  if (width !== undefined) {
    result.width = width;
  }

  // Line cap
  const cap = parseEnumAttr<LineCap>(lnElement, 'cap', LINE_CAPS);
  if (cap !== undefined) {
    result.cap = cap;
  }

  // Compound line type
  const cmpd = parseEnumAttr(lnElement, 'cmpd', COMPOUND_LINES);
  if (cmpd !== undefined) {
    const mapped = COMPOUND_LINE_MAP[cmpd];
    if (mapped) {
      result.compound = mapped;
    }
  }

  // Line color — resolve from fill child
  // First try to use the fill parser for the line's fill element
  const fill = parseFill(lnElement, theme, context);
  if (fill) {
    if (fill.type === 'solid') {
      result.color = fill.color;
    }
    // For noFill on a line, color stays undefined (invisible line)
  } else {
    // Fall back to direct color resolution from the line element
    const color = resolveColorFromParent(lnElement, theme, context);
    if (color) {
      result.color = color;
    }
  }

  // Dash style
  const prstDash = lnElement.child('a:prstDash');
  if (prstDash) {
    const dashVal = parseEnumAttr<DashStyle>(prstDash, 'val', DASH_STYLES);
    if (dashVal !== undefined) {
      result.dashStyle = dashVal;
    }
  }

  // Line join
  const join = parseLineJoin(lnElement);
  if (join !== undefined) {
    result.join = join;
  }

  // Head and tail end (arrowheads)
  const headEndEl = lnElement.child('a:headEnd');
  if (headEndEl) {
    result.headEnd = parseLineEnd(headEndEl);
  }

  const tailEndEl = lnElement.child('a:tailEnd');
  if (tailEndEl) {
    result.tailEnd = parseLineEnd(tailEndEl);
  }

  return result;
}

/**
 * Parse a line from a parent element that may contain `<a:ln>`.
 *
 * Returns `undefined` if no `a:ln` child is present.
 */
export function parseLineFromParent(
  parentElement: XmlElement,
  theme: ThemeIR,
  context?: ColorContext
): LineIR | undefined {
  const lnEl = parentElement.child('a:ln');
  if (!lnEl) {
    return undefined;
  }
  return parseLine(lnEl, theme, context);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine the line join from child elements.
 *
 * OOXML represents the join as a child element: `<a:round/>`,
 * `<a:bevel/>`, or `<a:miter lim="800000"/>`.
 */
function parseLineJoin(lnElement: XmlElement): LineJoin | undefined {
  if (lnElement.child('a:round')) {
    return 'round';
  }
  if (lnElement.child('a:bevel')) {
    return 'bevel';
  }
  if (lnElement.child('a:miter')) {
    return 'miter';
  }
  return undefined;
}

/**
 * Parse a line end (arrowhead) element.
 *
 * ```xml
 * <a:tailEnd type="triangle" w="med" len="med"/>
 * ```
 */
function parseLineEnd(endEl: XmlElement): LineEnd {
  const type =
    parseEnumAttr(endEl, 'type', LINE_END_TYPES) ?? 'none';
  const width = parseEnumAttr(endEl, 'w', LINE_END_SIZES);
  const length = parseEnumAttr(endEl, 'len', LINE_END_SIZES);

  const lineEnd: LineEnd = { type };
  if (width !== undefined) {
    lineEnd.width = width;
  }
  if (length !== undefined) {
    lineEnd.length = length;
  }
  return lineEnd;
}
