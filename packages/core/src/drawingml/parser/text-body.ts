/**
 * Text body parser for DrawingML text elements.
 *
 * Parses `a:txBody` / `p:txBody` elements into {@link TextBodyIR}, including
 * body properties, paragraphs, and their child runs.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 21.1.2.1.1 (CT_TextBody)
 */

import type { XmlElement } from '../../xml/index.js';
import type { ThemeIR, TextBodyIR, BodyPropertiesIR } from '../../ir/index.js';
import type { ColorContext } from '../../theme/index.js';
import { parseIntAttr, parseBoolAttr } from '../../xml/index.js';
import { parseParagraph } from './paragraph.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a text body element (`a:txBody` / `p:txBody`).
 *
 * ```xml
 * <a:txBody>
 *   <a:bodyPr wrap="square" anchor="ctr"/>
 *   <a:lstStyle/>
 *   <a:p>...</a:p>
 * </a:txBody>
 * ```
 */
export function parseTextBody(
  txBodyElement: XmlElement,
  theme: ThemeIR,
  context?: ColorContext
): TextBodyIR {
  // Parse body properties
  const bodyPrEl = txBodyElement.child('a:bodyPr');
  const bodyProperties = bodyPrEl
    ? parseBodyProperties(bodyPrEl)
    : {};

  // Parse all paragraphs
  const paragraphs = txBodyElement
    .allChildren('a:p')
    .map((pEl) => parseParagraph(pEl, theme, context));

  return {
    paragraphs,
    bodyProperties,
  };
}

/**
 * Parse a text body from a parent element that may contain `p:txBody` or `a:txBody`.
 *
 * Returns `undefined` if no text body child is present.
 */
export function parseTextBodyFromParent(
  parentElement: XmlElement,
  theme: ThemeIR,
  context?: ColorContext
): TextBodyIR | undefined {
  const txBody =
    parentElement.child('p:txBody') ?? parentElement.child('a:txBody');
  if (!txBody) {
    return undefined;
  }
  return parseTextBody(txBody, theme, context);
}

// ---------------------------------------------------------------------------
// Body properties
// ---------------------------------------------------------------------------

/**
 * Parse body properties (`a:bodyPr`).
 *
 * ```xml
 * <a:bodyPr wrap="square" anchor="ctr" anchorCtr="0"
 *           lIns="91440" tIns="45720" rIns="91440" bIns="45720"
 *           numCol="1" spcCol="0" rtlCol="0" rot="0">
 *   <a:spAutoFit/>
 * </a:bodyPr>
 * ```
 */
function parseBodyProperties(bodyPrElement: XmlElement): BodyPropertiesIR {
  const props: BodyPropertiesIR = {};

  // Text wrapping mode
  const wrap = bodyPrElement.attr('wrap');
  if (wrap === 'square' || wrap === 'none') {
    props.wrap = wrap;
  }

  // Vertical alignment
  const anchor = bodyPrElement.attr('anchor');
  if (anchor !== undefined) {
    props.verticalAlign = parseVerticalAlign(anchor);
  }

  // Anchor center
  const anchorCtrRaw = bodyPrElement.attr('anchorCtr');
  if (anchorCtrRaw !== undefined) {
    props.anchorCtr = parseBoolAttr(bodyPrElement, 'anchorCtr');
  }

  // Insets in EMU
  const lIns = parseIntAttr(bodyPrElement, 'lIns');
  if (lIns !== undefined) {
    props.leftInset = lIns;
  }

  const tIns = parseIntAttr(bodyPrElement, 'tIns');
  if (tIns !== undefined) {
    props.topInset = tIns;
  }

  const rIns = parseIntAttr(bodyPrElement, 'rIns');
  if (rIns !== undefined) {
    props.rightInset = rIns;
  }

  const bIns = parseIntAttr(bodyPrElement, 'bIns');
  if (bIns !== undefined) {
    props.bottomInset = bIns;
  }

  // Columns
  const numCol = parseIntAttr(bodyPrElement, 'numCol');
  if (numCol !== undefined) {
    props.columns = numCol;
  }

  const spcCol = parseIntAttr(bodyPrElement, 'spcCol');
  if (spcCol !== undefined) {
    props.columnSpacing = spcCol;
  }

  // Rotation in 60000ths of a degree
  const rot = parseIntAttr(bodyPrElement, 'rot');
  if (rot !== undefined) {
    props.rotation = rot / 60_000;
  }

  // Auto-fit behavior
  if (bodyPrElement.child('a:spAutoFit')) {
    props.autoFit = 'spAutoFit';
  } else if (bodyPrElement.child('a:noAutofit')) {
    props.autoFit = 'none';
  } else if (bodyPrElement.child('a:normAutofit')) {
    props.autoFit = 'shrink';
  }

  return props;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Map OOXML anchor attribute values to vertical alignment strings. */
function parseVerticalAlign(raw: string): BodyPropertiesIR['verticalAlign'] {
  switch (raw) {
    case 't':
      return 'top';
    case 'ctr':
      return 'middle';
    case 'b':
      return 'bottom';
    case 'dist':
      return 'distributed';
    default:
      return undefined;
  }
}
