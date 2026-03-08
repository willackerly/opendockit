/**
 * Styles parser — extracts paragraph style definitions from `word/styles.xml`.
 *
 * OOXML styles form an inheritance tree: each style can reference a parent
 * via `<w:basedOn>`. This parser builds a flat {@link StyleMap} and resolves
 * the inheritance chain so each style contains its effective properties.
 *
 * Reference: ECMA-376, Part 1, Section 17.7 (Styles).
 */

import type { XmlElement } from '@opendockit/core';
import { dxaToPt, halfPointsToPt } from '@opendockit/core';
import type {
  StyleMap,
  ParagraphStyleIR,
  ParagraphAlignment,
  RunIR,
} from '../model/document-ir.js';

/** Valid OOXML alignment values. */
const ALIGNMENT_MAP: Record<string, ParagraphAlignment> = {
  left: 'left',
  start: 'left',
  center: 'center',
  right: 'right',
  end: 'right',
  both: 'justify',
  distribute: 'justify',
};

/**
 * Parse the `word/styles.xml` root element into a {@link StyleMap}.
 *
 * Extracts paragraph styles (`<w:style w:type="paragraph">`) and resolves
 * style inheritance chains.
 *
 * @param stylesEl - The root `<w:styles>` element.
 * @returns A map from style ID to resolved style definition.
 */
export function parseStyles(stylesEl: XmlElement): StyleMap {
  const styles: StyleMap = new Map();

  // First pass: extract raw style definitions
  for (const styleEl of stylesEl.allChildren('w:style')) {
    const type = styleEl.attr('w:type');
    if (type !== 'paragraph') continue;

    const styleId = styleEl.attr('w:styleId');
    if (styleId === undefined) continue;

    const style = parseStyleElement(styleEl);
    styles.set(styleId, style);
  }

  // Second pass: resolve inheritance
  resolveStyleInheritance(styles);

  return styles;
}

/**
 * Parse document defaults from `<w:docDefaults>` within `<w:styles>`.
 *
 * @returns A style representing the default paragraph/run formatting,
 *          or `undefined` if no defaults are defined.
 */
export function parseDocDefaults(stylesEl: XmlElement): ParagraphStyleIR | undefined {
  const docDefaults = stylesEl.child('w:docDefaults');
  if (docDefaults === undefined) return undefined;

  const style: ParagraphStyleIR = { name: 'Default' };

  // Default run properties: <w:rPrDefault><w:rPr>...</w:rPr></w:rPrDefault>
  const rPrDefault = docDefaults.child('w:rPrDefault');
  if (rPrDefault !== undefined) {
    const rPr = rPrDefault.child('w:rPr');
    if (rPr !== undefined) {
      style.runProperties = parseStyleRunProperties(rPr);
    }
  }

  // Default paragraph properties: <w:pPrDefault><w:pPr>...</w:pPr></w:pPrDefault>
  const pPrDefault = docDefaults.child('w:pPrDefault');
  if (pPrDefault !== undefined) {
    const pPr = pPrDefault.child('w:pPr');
    if (pPr !== undefined) {
      applyParagraphProperties(pPr, style);
    }
  }

  return style;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Parse a single `<w:style>` element. */
function parseStyleElement(styleEl: XmlElement): ParagraphStyleIR {
  const nameEl = styleEl.child('w:name');
  const name = nameEl?.attr('w:val') ?? 'Unknown';

  const basedOnEl = styleEl.child('w:basedOn');
  const basedOn = basedOnEl?.attr('w:val');

  const style: ParagraphStyleIR = { name };
  if (basedOn !== undefined) {
    style.basedOn = basedOn;
  }

  // Paragraph properties: <w:pPr>
  const pPr = styleEl.child('w:pPr');
  if (pPr !== undefined) {
    applyParagraphProperties(pPr, style);
  }

  // Run properties: <w:rPr>
  const rPr = styleEl.child('w:rPr');
  if (rPr !== undefined) {
    style.runProperties = parseStyleRunProperties(rPr);
  }

  return style;
}

/** Apply paragraph formatting from a `<w:pPr>` element to a style. */
function applyParagraphProperties(pPr: XmlElement, style: ParagraphStyleIR): void {
  const jc = pPr.child('w:jc');
  if (jc !== undefined) {
    const jcVal = jc.attr('w:val');
    if (jcVal !== undefined && jcVal in ALIGNMENT_MAP) {
      style.alignment = ALIGNMENT_MAP[jcVal];
    }
  }

  const spacing = pPr.child('w:spacing');
  if (spacing !== undefined) {
    const beforeVal = spacing.attr('w:before');
    if (beforeVal !== undefined) {
      const dxa = parseInt(beforeVal, 10);
      if (!Number.isNaN(dxa)) style.spacingBefore = dxaToPt(dxa);
    }

    const afterVal = spacing.attr('w:after');
    if (afterVal !== undefined) {
      const dxa = parseInt(afterVal, 10);
      if (!Number.isNaN(dxa)) style.spacingAfter = dxaToPt(dxa);
    }

    const lineVal = spacing.attr('w:line');
    const lineRule = spacing.attr('w:lineRule');
    if (lineVal !== undefined) {
      const lineNum = parseInt(lineVal, 10);
      if (!Number.isNaN(lineNum)) {
        if (lineRule === 'auto' || lineRule === undefined) {
          style.lineSpacing = lineNum / 240;
        } else {
          style.lineSpacing = dxaToPt(lineNum);
        }
      }
    }
  }
}

/** Parse run properties from a style's `<w:rPr>` element. */
function parseStyleRunProperties(rPr: XmlElement): Partial<RunIR> {
  const result: Partial<RunIR> = {};

  const bEl = rPr.child('w:b');
  if (bEl !== undefined) {
    const val = bEl.attr('w:val');
    result.bold = val === undefined || (val !== '0' && val !== 'false');
  }

  const iEl = rPr.child('w:i');
  if (iEl !== undefined) {
    const val = iEl.attr('w:val');
    result.italic = val === undefined || (val !== '0' && val !== 'false');
  }

  const szEl = rPr.child('w:sz');
  if (szEl !== undefined) {
    const szVal = szEl.attr('w:val');
    if (szVal !== undefined) {
      const halfPts = parseInt(szVal, 10);
      if (!Number.isNaN(halfPts)) {
        result.fontSize = halfPointsToPt(halfPts);
      }
    }
  }

  const rFonts = rPr.child('w:rFonts');
  if (rFonts !== undefined) {
    const fontName =
      rFonts.attr('w:ascii') ??
      rFonts.attr('w:hAnsi') ??
      rFonts.attr('w:cs') ??
      rFonts.attr('w:eastAsia');
    if (fontName !== undefined) {
      result.fontFamily = fontName;
    }
  }

  const colorEl = rPr.child('w:color');
  if (colorEl !== undefined) {
    const colorVal = colorEl.attr('w:val');
    if (colorVal !== undefined && colorVal !== 'auto') {
      result.color = colorVal;
    }
  }

  return result;
}

/**
 * Resolve style inheritance chains in-place.
 *
 * For each style with a `basedOn` reference, merge the parent's properties
 * as defaults (the child's explicit properties take precedence).
 */
function resolveStyleInheritance(styles: StyleMap): void {
  const resolved = new Set<string>();

  function resolve(styleId: string): ParagraphStyleIR | undefined {
    if (resolved.has(styleId)) return styles.get(styleId);

    const style = styles.get(styleId);
    if (style === undefined) return undefined;

    // Prevent infinite loops
    resolved.add(styleId);

    if (style.basedOn !== undefined) {
      const parent = resolve(style.basedOn);
      if (parent !== undefined) {
        mergeParentStyle(style, parent);
      }
    }

    return style;
  }

  for (const styleId of styles.keys()) {
    resolve(styleId);
  }
}

/** Merge parent style properties into child as defaults. */
function mergeParentStyle(child: ParagraphStyleIR, parent: ParagraphStyleIR): void {
  if (child.alignment === undefined && parent.alignment !== undefined) {
    child.alignment = parent.alignment;
  }
  if (child.spacingBefore === undefined && parent.spacingBefore !== undefined) {
    child.spacingBefore = parent.spacingBefore;
  }
  if (child.spacingAfter === undefined && parent.spacingAfter !== undefined) {
    child.spacingAfter = parent.spacingAfter;
  }
  if (child.lineSpacing === undefined && parent.lineSpacing !== undefined) {
    child.lineSpacing = parent.lineSpacing;
  }

  // Merge run properties
  if (parent.runProperties !== undefined) {
    if (child.runProperties === undefined) {
      child.runProperties = { ...parent.runProperties };
    } else {
      child.runProperties = { ...parent.runProperties, ...child.runProperties };
    }
  }
}
