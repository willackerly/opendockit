/**
 * Style reference parser for DrawingML shape styles.
 *
 * Parses `p:style` (or `a:style`) elements that reference entries in the
 * theme's format scheme. These style references provide default fill, line,
 * effect, and font styling when inline properties are absent.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 20.1.4.2.9 (Shape Style)
 */

import type { XmlElement } from '../../xml/index.js';
import type { ThemeIR, StyleReferenceIR } from '../../ir/index.js';
import { parseIntAttr } from '../../xml/index.js';
import { resolveColorFromParent } from '../../theme/index.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse style references from a parent element containing `p:style` or `a:style`.
 *
 * Style references point to entries in the theme's format scheme (fill styles,
 * line styles, effect styles) and font scheme (major/minor fonts). Each
 * reference also carries a color context (typically a scheme color) that
 * serves as the placeholder color when resolving style matrix entries.
 *
 * ```xml
 * <p:style>
 *   <a:lnRef idx="2">
 *     <a:schemeClr val="accent1"/>
 *   </a:lnRef>
 *   <a:fillRef idx="1">
 *     <a:schemeClr val="accent1"/>
 *   </a:fillRef>
 *   <a:effectRef idx="0">
 *     <a:schemeClr val="accent1"/>
 *   </a:effectRef>
 *   <a:fontRef idx="minor">
 *     <a:schemeClr val="dk1"/>
 *   </a:fontRef>
 * </p:style>
 * ```
 *
 * @param parentElement - The shape element containing the style child
 * @param theme - The resolved theme for color lookups
 * @returns Parsed style references, or undefined if no style element exists
 */
export function parseStyleReference(
  parentElement: XmlElement,
  theme: ThemeIR
): StyleReferenceIR | undefined {
  const styleEl = parentElement.child('p:style') ?? parentElement.child('a:style');
  if (!styleEl) {
    return undefined;
  }

  const result: StyleReferenceIR = {};
  let hasAny = false;

  // Parse fillRef
  const fillRefEl = styleEl.child('a:fillRef');
  if (fillRefEl) {
    const idx = parseIntAttr(fillRefEl, 'idx');
    if (idx !== undefined) {
      const color = resolveColorFromParent(fillRefEl, theme);
      result.fillRef = { idx };
      if (color) {
        result.fillRef.color = color;
      }
      hasAny = true;
    }
  }

  // Parse lnRef
  const lnRefEl = styleEl.child('a:lnRef');
  if (lnRefEl) {
    const idx = parseIntAttr(lnRefEl, 'idx');
    if (idx !== undefined) {
      const color = resolveColorFromParent(lnRefEl, theme);
      result.lnRef = { idx };
      if (color) {
        result.lnRef.color = color;
      }
      hasAny = true;
    }
  }

  // Parse effectRef
  const effectRefEl = styleEl.child('a:effectRef');
  if (effectRefEl) {
    const idx = parseIntAttr(effectRefEl, 'idx');
    if (idx !== undefined) {
      const color = resolveColorFromParent(effectRefEl, theme);
      result.effectRef = { idx };
      if (color) {
        result.effectRef.color = color;
      }
      hasAny = true;
    }
  }

  // Parse fontRef
  const fontRefEl = styleEl.child('a:fontRef');
  if (fontRefEl) {
    const idxAttr = fontRefEl.attr('idx');
    if (idxAttr === 'major' || idxAttr === 'minor') {
      const color = resolveColorFromParent(fontRefEl, theme);
      result.fontRef = { idx: idxAttr };
      if (color) {
        result.fontRef.color = color;
      }
      hasAny = true;
    }
  }

  return hasAny ? result : undefined;
}
