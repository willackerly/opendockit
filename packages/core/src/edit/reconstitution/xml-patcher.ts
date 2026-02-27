/**
 * Main XML patcher — orchestrates all patchers for editable elements.
 *
 * This is the primary entry point for the reconstitution engine. It takes
 * an editable element and a raw XML string, applies all dirty edits, and
 * returns the patched XML.
 */

import type { EditableElement, EditableShape } from '../editable-types.js';
import {
  parseXmlDom,
  serializeXmlDom,
  findShapeById,
  findTextBodyElement,
} from './dom-utils.js';
import { patchTransform } from './transform-patcher.js';
import { patchTextBody } from './text-patcher.js';
import { removeShapeFromSlide } from './slide-patcher.js';
import { getShapeIdFromElementId } from '../element-id.js';

/**
 * Apply all dirty edits for a single element to the part's XML.
 *
 * @param element - the editable element with dirty flags
 * @param partXml - raw XML string of the OPC part
 * @returns patched XML string
 */
export function patchElementXml(
  element: EditableElement,
  partXml: string
): string {
  const doc = parseXmlDom(partXml);
  const shapeId = getShapeIdFromElementId(element.id);

  // Handle deletion
  if (element.deleted && element.dirty.deleted) {
    removeShapeFromSlide(doc, shapeId);
    return serializeXmlDom(doc);
  }

  const shapeEl = findShapeById(doc, shapeId);
  if (!shapeEl) return partXml; // Element not found — return unchanged

  // Patch transform (position/size/rotation)
  if (element.dirty.position || element.dirty.size || element.dirty.rotation) {
    patchTransform(shapeEl, element.transform, element.dirty);
  }

  // Patch text
  if (
    element.dirty.text &&
    element.kind === 'shape' &&
    (element as EditableShape).textEdits
  ) {
    const txBody = findTextBodyElement(shapeEl);
    if (txBody) {
      patchTextBody(txBody, (element as EditableShape).textEdits!);
    }
  }

  return serializeXmlDom(doc);
}

/**
 * Apply all dirty elements to a single part's XML.
 *
 * Processes elements sequentially — each patch feeds into the next.
 * This ensures that deletions and modifications don't conflict.
 */
export function patchPartXml(
  elements: EditableElement[],
  partXml: string
): string {
  let xml = partXml;
  for (const el of elements) {
    xml = patchElementXml(el, xml);
  }
  return xml;
}
