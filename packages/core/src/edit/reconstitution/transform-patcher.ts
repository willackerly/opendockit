/**
 * Transform patcher — patches `<a:xfrm>` position/size/rotation attributes.
 *
 * Only modifies attributes for dirty fields. EMU integers are written
 * directly to XML attributes — no float conversion.
 */

import type { EditableTransform, DirtyFlags } from '../editable-types.js';
import { findTransformElement } from './dom-utils.js';

/**
 * Patch the transform (position, size, rotation, flip) of a shape element.
 * Only modifies attributes for dirty fields.
 */
export function patchTransform(
  shapeEl: Element,
  transform: EditableTransform,
  dirty: DirtyFlags
): void {
  const xfrm = findTransformElement(shapeEl);
  if (!xfrm) return;

  if (dirty.position) {
    const off = findChildByLocalName(xfrm, 'off');
    if (off) {
      off.setAttribute('x', String(transform.x));
      off.setAttribute('y', String(transform.y));
    }
  }

  if (dirty.size) {
    const ext = findChildByLocalName(xfrm, 'ext');
    if (ext) {
      ext.setAttribute('cx', String(transform.width));
      ext.setAttribute('cy', String(transform.height));
    }
  }

  if (dirty.rotation) {
    if (transform.rotation !== undefined && transform.rotation !== 0) {
      // OOXML rotation is in 60,000ths of a degree
      xfrm.setAttribute('rot', String(Math.round(transform.rotation * 60000)));
    } else {
      xfrm.removeAttribute('rot');
    }
  }
}

/**
 * Find the first direct child element with the given local name.
 * Uses getElementsByTagName on xfrm but filters to only direct children
 * to avoid matching nested elements in group shapes.
 */
function findChildByLocalName(
  parent: Element,
  localName: string
): Element | null {
  const children = parent.childNodes;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.nodeType === 1 && (child as Element).localName === localName) {
      return child as Element;
    }
  }
  return null;
}
