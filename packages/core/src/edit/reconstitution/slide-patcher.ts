/**
 * Slide patcher — element deletion from slide XML.
 *
 * Removes an entire `<p:sp>` (or `<p:pic>`, `<p:cxnSp>`, etc.) node
 * from the slide XML DOM.
 */

import { findShapeById } from './dom-utils.js';

/**
 * Remove a shape element from the slide DOM by its OOXML shape ID.
 *
 * @param doc - parsed slide XML DOM
 * @param shapeId - the `id` attribute value from `<p:cNvPr>`
 * @returns true if the element was found and removed
 */
export function removeShapeFromSlide(
  doc: Document,
  shapeId: string
): boolean {
  const shapeEl = findShapeById(doc, shapeId);
  if (!shapeEl || !shapeEl.parentNode) return false;
  shapeEl.parentNode.removeChild(shapeEl);
  return true;
}
