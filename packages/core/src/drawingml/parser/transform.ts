/**
 * Transform parser for DrawingML transform elements.
 *
 * Parses `<a:xfrm>` elements into {@link TransformIR} values. Handles both
 * shape transforms and group transforms (with child offset/extent).
 *
 * All coordinate values remain in EMU — renderers handle conversion.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 20.1.7.6 (CT_Transform2D)
 */

import type { XmlElement } from '../../xml/index.js';
import type { TransformIR } from '../../ir/index.js';
import { parseIntAttr, parseBoolAttr, parseAngle } from '../../xml/index.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a transform element (`<a:xfrm>`).
 *
 * ```xml
 * <a:xfrm rot="5400000" flipH="1">
 *   <a:off x="457200" y="274638"/>
 *   <a:ext cx="8229600" cy="1143000"/>
 * </a:xfrm>
 * ```
 */
export function parseTransform(xfrmElement: XmlElement): TransformIR {
  // Position from a:off
  const offEl = xfrmElement.child('a:off');
  const x = offEl ? parseIntAttr(offEl, 'x') ?? 0 : 0;
  const y = offEl ? parseIntAttr(offEl, 'y') ?? 0 : 0;

  // Size from a:ext
  const extEl = xfrmElement.child('a:ext');
  const width = extEl ? parseIntAttr(extEl, 'cx') ?? 0 : 0;
  const height = extEl ? parseIntAttr(extEl, 'cy') ?? 0 : 0;

  // Rotation: 60000ths of a degree -> degrees
  const rotation = parseAngle(xfrmElement, 'rot');

  // Flips
  const flipH = parseBoolAttr(xfrmElement, 'flipH');
  const flipV = parseBoolAttr(xfrmElement, 'flipV');

  const result: TransformIR = {
    position: { x, y },
    size: { width, height },
  };

  if (rotation !== undefined) {
    result.rotation = rotation;
  }
  if (flipH) {
    result.flipH = true;
  }
  if (flipV) {
    result.flipV = true;
  }

  return result;
}

/**
 * Parse transform from a parent element that may contain `<a:xfrm>`.
 *
 * Returns `undefined` if no `<a:xfrm>` child is present.
 */
export function parseTransformFromParent(
  parentElement: XmlElement
): TransformIR | undefined {
  const xfrm = parentElement.child('a:xfrm');
  if (!xfrm) {
    return undefined;
  }
  return parseTransform(xfrm);
}

// ---------------------------------------------------------------------------
// Group transform
// ---------------------------------------------------------------------------

/** Result of parsing a group transform, including child coordinate space. */
export interface GroupTransformResult {
  transform: TransformIR;
  childOffset?: { x: number; y: number };
  childExtent?: { width: number; height: number };
}

/**
 * Parse a group transform element (`<a:xfrm>` within `<p:grpSpPr>`).
 *
 * Group transforms include optional child offset (`<a:chOff>`) and child
 * extent (`<a:chExt>`) that define the child coordinate space.
 *
 * ```xml
 * <a:xfrm>
 *   <a:off x="0" y="0"/>
 *   <a:ext cx="9144000" cy="6858000"/>
 *   <a:chOff x="0" y="0"/>
 *   <a:chExt cx="9144000" cy="6858000"/>
 * </a:xfrm>
 * ```
 *
 * Returns `undefined` if the element is not a valid transform.
 */
export function parseGroupTransform(
  xfrmElement: XmlElement
): GroupTransformResult | undefined {
  const transform = parseTransform(xfrmElement);

  // Child offset from a:chOff
  const chOffEl = xfrmElement.child('a:chOff');
  const childOffset = chOffEl
    ? {
        x: parseIntAttr(chOffEl, 'x') ?? 0,
        y: parseIntAttr(chOffEl, 'y') ?? 0,
      }
    : undefined;

  // Child extent from a:chExt
  const chExtEl = xfrmElement.child('a:chExt');
  const childExtent = chExtEl
    ? {
        width: parseIntAttr(chExtEl, 'cx') ?? 0,
        height: parseIntAttr(chExtEl, 'cy') ?? 0,
      }
    : undefined;

  return {
    transform,
    childOffset,
    childExtent,
  };
}
