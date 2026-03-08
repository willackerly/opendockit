/**
 * Element clipboard utilities — copy elements between formats.
 *
 * Provides a format-neutral clipboard representation that works for both PDF
 * and PPTX elements. Source bags are stripped on copy so that paste targets
 * do not inherit stale format-specific write-back data. New IDs are assigned
 * on paste to avoid collisions with existing document elements.
 *
 * Visual properties (position, size, fill, stroke, opacity, rotation) are
 * preserved exactly.
 */

import type { PageElement, TextElement, ShapeElement, ImageElement, PathElement, GroupElement } from './types.js';

// ─── Public types ───────────────────────────────────────

/** A format-neutral clipboard payload. */
export interface ClipboardData {
  /** The copied elements, in z-order (back to front), source bags stripped. */
  elements: PageElement[];
  /** The format the elements originated from. */
  sourceFormat: 'pptx' | 'pdf';
  /** The zero-based page/slide index the elements came from. */
  sourcePage: number;
}

// ─── Public API ─────────────────────────────────────────

/**
 * Serialize elements for clipboard transfer.
 *
 * Strips `source` bags so that the clipboard representation is truly
 * format-neutral. The caller supplies `sourceFormat` and `sourcePage` for
 * provenance tracking (useful for UI feedback like "Pasted from slide 3").
 *
 * @param elements     Elements to copy (will be deep-cloned).
 * @param sourceFormat Format the elements came from.
 * @param sourcePage   Zero-based page/slide index.
 */
export function serializeToClipboard(
  elements: PageElement[],
  sourceFormat: string,
  sourcePage: number,
): ClipboardData {
  const format = normalizeFormat(sourceFormat);
  return {
    elements: elements.map(stripSource),
    sourceFormat: format,
    sourcePage,
  };
}

/**
 * Deserialize clipboard data for pasting into a target document.
 *
 * Assigns new unique IDs to all pasted elements so they don't collide with
 * existing document elements. The `targetFormat` parameter is accepted for
 * API symmetry and future use but does not currently alter the output.
 *
 * @param data         Clipboard data produced by {@link serializeToClipboard}.
 * @param _targetFormat Format of the paste target (reserved for future use).
 * @returns            Elements with fresh IDs, ready to insert into a document.
 */
export function deserializeFromClipboard(data: ClipboardData, _targetFormat: string): PageElement[] {
  const idMap = new Map<string, string>();

  // First pass: assign new IDs for all elements
  for (const el of data.elements) {
    idMap.set(el.id, generateId());
  }

  // Second pass: clone with new IDs and updated child references
  return data.elements.map((el) => remapIds(el, idMap));
}

// ─── Internal helpers ────────────────────────────────────

function normalizeFormat(format: string): 'pptx' | 'pdf' {
  const lower = format.toLowerCase();
  if (lower === 'pptx') return 'pptx';
  if (lower === 'pdf') return 'pdf';
  // Default to pptx for unknown formats
  return 'pptx';
}

/**
 * Deep-clone a PageElement and remove its `source` bag.
 * This makes the clipboard data truly format-neutral.
 */
function stripSource(el: PageElement): PageElement {
  switch (el.type) {
    case 'text':
      return stripTextElement(el);
    case 'shape':
      return stripShapeElement(el);
    case 'image':
      return stripImageElement(el);
    case 'path':
      return stripPathElement(el);
    case 'group':
      return stripGroupElement(el);
  }
}

function stripTextElement(el: TextElement): TextElement {
  return {
    id: el.id,
    type: 'text',
    x: el.x,
    y: el.y,
    width: el.width,
    height: el.height,
    rotation: el.rotation,
    opacity: el.opacity,
    index: el.index,
    parentId: el.parentId,
    locked: el.locked,
    paragraphs: el.paragraphs.map((para) => ({
      align: para.align,
      runs: para.runs.map((run) => ({ ...run })),
    })),
    // source intentionally omitted
  };
}

function stripShapeElement(el: ShapeElement): ShapeElement {
  return {
    id: el.id,
    type: 'shape',
    x: el.x,
    y: el.y,
    width: el.width,
    height: el.height,
    rotation: el.rotation,
    opacity: el.opacity,
    index: el.index,
    parentId: el.parentId,
    locked: el.locked,
    shapeType: el.shapeType,
    fill: el.fill ? { ...el.fill, stops: el.fill.stops ? [...el.fill.stops.map((s) => ({ ...s, color: { ...s.color } }))] : undefined, color: el.fill.color ? { ...el.fill.color } : undefined } : null,
    stroke: el.stroke ? { ...el.stroke, dashArray: el.stroke.dashArray ? [...el.stroke.dashArray] : undefined, color: { ...el.stroke.color } } : null,
    cornerRadius: el.cornerRadius,
    // source intentionally omitted
  };
}

function stripImageElement(el: ImageElement): ImageElement {
  return {
    id: el.id,
    type: 'image',
    x: el.x,
    y: el.y,
    width: el.width,
    height: el.height,
    rotation: el.rotation,
    opacity: el.opacity,
    index: el.index,
    parentId: el.parentId,
    locked: el.locked,
    imageRef: el.imageRef,
    mimeType: el.mimeType,
    objectFit: el.objectFit,
    // source intentionally omitted
  };
}

function stripPathElement(el: PathElement): PathElement {
  return {
    id: el.id,
    type: 'path',
    x: el.x,
    y: el.y,
    width: el.width,
    height: el.height,
    rotation: el.rotation,
    opacity: el.opacity,
    index: el.index,
    parentId: el.parentId,
    locked: el.locked,
    d: el.d,
    fill: el.fill ? { ...el.fill, stops: el.fill.stops ? [...el.fill.stops.map((s) => ({ ...s, color: { ...s.color } }))] : undefined, color: el.fill.color ? { ...el.fill.color } : undefined } : null,
    stroke: el.stroke ? { ...el.stroke, dashArray: el.stroke.dashArray ? [...el.stroke.dashArray] : undefined, color: { ...el.stroke.color } } : null,
    // source intentionally omitted
  };
}

function stripGroupElement(el: GroupElement): GroupElement {
  return {
    id: el.id,
    type: 'group',
    x: el.x,
    y: el.y,
    width: el.width,
    height: el.height,
    rotation: el.rotation,
    opacity: el.opacity,
    index: el.index,
    parentId: el.parentId,
    locked: el.locked,
    childIds: [...el.childIds],
    // source intentionally omitted
  };
}

/**
 * Clone an element with its ID replaced via `idMap`, and update any
 * parentId / childIds references that also appear in the map.
 */
function remapIds(el: PageElement, idMap: Map<string, string>): PageElement {
  const newId = idMap.get(el.id) ?? generateId();
  const newParentId = el.parentId !== null ? (idMap.get(el.parentId) ?? el.parentId) : null;

  const base = {
    ...el,
    id: newId,
    parentId: newParentId,
  };

  if (el.type === 'group') {
    return {
      ...base,
      type: 'group',
      childIds: el.childIds.map((cid) => idMap.get(cid) ?? cid),
    } as GroupElement;
  }

  return base as PageElement;
}

/** Generate a simple random ID string. */
function generateId(): string {
  // 8 hex chars (32 bits of entropy) — sufficient for clipboard round-trips
  return Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, '0');
}
