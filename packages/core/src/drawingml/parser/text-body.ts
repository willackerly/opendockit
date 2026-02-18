/**
 * Text body parser for DrawingML text elements.
 *
 * Parses `a:txBody` / `p:txBody` elements into {@link TextBodyIR}, including
 * body properties, paragraphs, and their child runs.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 21.1.2.1.1 (CT_TextBody)
 */

import type { XmlElement } from '../../xml/index.js';
import type {
  ThemeIR,
  TextBodyIR,
  BodyPropertiesIR,
  ListStyleIR,
  ListStyleLevelIR,
} from '../../ir/index.js';
import type { ColorContext } from '../../theme/index.js';
import { parseIntAttr, parseBoolAttr } from '../../xml/index.js';
import { parseParagraph, parseParagraphProperties, parseBulletProperties } from './paragraph.js';
import { parseCharacterProperties } from './run.js';

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
  const bodyProperties = bodyPrEl ? parseBodyProperties(bodyPrEl) : {};

  // Parse list style defaults
  const lstStyleEl = txBodyElement.child('a:lstStyle');
  const listStyle = lstStyleEl ? parseListStyle(lstStyleEl, theme, context) : undefined;

  // Parse all paragraphs
  const paragraphs = txBodyElement
    .allChildren('a:p')
    .map((pEl) => parseParagraph(pEl, theme, context));

  const result: TextBodyIR = {
    paragraphs,
    bodyProperties,
  };

  if (listStyle) {
    result.listStyle = listStyle;
  }

  return result;
}

/**
 * Parse a list style element (`a:lstStyle`).
 *
 * List styles define per-level paragraph, bullet, and default character
 * properties used as defaults for text bodies and placeholder text.
 *
 * ```xml
 * <a:lstStyle>
 *   <a:defPPr>
 *     <a:defRPr sz="1800"/>
 *   </a:defPPr>
 *   <a:lvl1pPr marL="0" indent="0" algn="l">
 *     <a:buChar char="&#x2022;"/>
 *     <a:defRPr sz="2400" b="1"/>
 *   </a:lvl1pPr>
 *   <a:lvl2pPr marL="457200" indent="0" algn="l">
 *     <a:buChar char="-"/>
 *     <a:defRPr sz="2000"/>
 *   </a:lvl2pPr>
 * </a:lstStyle>
 * ```
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 21.1.2.4.12 (CT_TextListStyle)
 */
export function parseListStyle(
  lstStyleEl: XmlElement,
  theme: ThemeIR,
  context?: ColorContext
): ListStyleIR | undefined {
  const levels: Record<number, ListStyleLevelIR> = {};

  // Parse defPPr (default paragraph properties)
  const defPPrEl = lstStyleEl.child('a:defPPr');
  const defPPr = defPPrEl ? parseListStyleLevel(defPPrEl, theme, context) : undefined;

  // Parse lvl1pPr through lvl9pPr → levels[0] through levels[8]
  for (let i = 1; i <= 9; i++) {
    const lvlEl = lstStyleEl.child(`a:lvl${i}pPr`);
    if (lvlEl) {
      levels[i - 1] = parseListStyleLevel(lvlEl, theme, context);
    }
  }

  // If nothing was parsed, return undefined
  const hasLevels = Object.keys(levels).length > 0;
  if (!defPPr && !hasLevels) {
    return undefined;
  }

  const result: ListStyleIR = { levels };
  if (defPPr) {
    result.defPPr = defPPr;
  }

  return result;
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
  const txBody = parentElement.child('p:txBody') ?? parentElement.child('a:txBody');
  if (!txBody) {
    return undefined;
  }
  return parseTextBody(txBody, theme, context);
}

// ---------------------------------------------------------------------------
// List style level
// ---------------------------------------------------------------------------

/**
 * Parse a single list style level element (`a:defPPr` or `a:lvlNpPr`).
 *
 * Each level element has the same structure as `a:pPr` (paragraph properties),
 * plus an optional `a:defRPr` child for default character properties.
 */
function parseListStyleLevel(
  levelEl: XmlElement,
  theme: ThemeIR,
  context?: ColorContext
): ListStyleLevelIR {
  const result: ListStyleLevelIR = {};

  // Parse paragraph properties from the level element attributes/children
  const paragraphProperties = parseParagraphProperties(levelEl);
  if (Object.keys(paragraphProperties).length > 0) {
    result.paragraphProperties = paragraphProperties;
  }

  // Parse bullet properties
  const bulletProperties = parseBulletProperties(levelEl, theme, context);
  if (bulletProperties) {
    result.bulletProperties = bulletProperties;
  }

  // Parse default character properties from a:defRPr child
  const defRPrEl = levelEl.child('a:defRPr');
  if (defRPrEl) {
    const defaultCharacterProperties = parseCharacterProperties(defRPrEl, theme, context);
    if (Object.keys(defaultCharacterProperties).length > 0) {
      result.defaultCharacterProperties = defaultCharacterProperties;
    }
  }

  return result;
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
    const normEl = bodyPrElement.child('a:normAutofit')!;
    // fontScale is in thousandths of a percent (80000 = 80%)
    const fontScaleRaw = parseIntAttr(normEl, 'fontScale');
    if (fontScaleRaw !== undefined) {
      props.fontScale = fontScaleRaw / 1000;
    }
    // lnSpcReduction is in thousandths of a percent (20000 = 20%)
    const lnSpcReductionRaw = parseIntAttr(normEl, 'lnSpcReduction');
    if (lnSpcReductionRaw !== undefined) {
      props.lnSpcReduction = lnSpcReductionRaw / 1000;
    }
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
