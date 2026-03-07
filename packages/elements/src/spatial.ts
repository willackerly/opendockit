/**
 * Spatial query utilities for PageElement[].
 *
 * All coordinates are in points (1/72"). The Y axis convention matches the
 * originating format — callers are responsible for any needed coordinate transforms.
 */

import type { PageElement, TextElement, ElementBounds } from './types.js';

// ─── Rect type ──────────────────────────────────────────

/** Axis-aligned bounding box in points. */
export type Rect = ElementBounds;

// ─── Core query functions ───────────────────────────────

/**
 * Find all elements whose bounding box overlaps the given rectangle.
 * Uses proper AABB (axis-aligned bounding box) overlap — not point-in-rect.
 */
export function queryElementsInRect(elements: PageElement[], rect: Rect): PageElement[] {
  return elements.filter((el) => rectsOverlap(elementToRect(el), rect));
}

/**
 * Find all text elements whose bounding box overlaps the given rectangle.
 */
export function queryTextInRect(elements: PageElement[], rect: Rect): TextElement[] {
  return elements
    .filter((el): el is TextElement => el.type === 'text')
    .filter((el) => rectsOverlap(elementToRect(el), rect));
}

/**
 * Find the element at a specific point (for hit testing).
 * Returns the topmost (highest z-index) element, or null.
 * Searches back-to-front since elements are z-ordered.
 */
export function hitTest(elements: PageElement[], x: number, y: number): PageElement | null {
  // Iterate in reverse (topmost first)
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (isPointInBounds(x, y, elementToRect(el))) {
      return el;
    }
  }
  return null;
}

/**
 * Alias for hitTest — kept for parity with pdf-signer spatial module naming.
 */
export function elementAtPoint(
  elements: PageElement[],
  px: number,
  py: number,
): PageElement | null {
  return hitTest(elements, px, py);
}

/**
 * Get the bounding box of a single element.
 */
export function getBounds(element: PageElement): ElementBounds {
  return elementToRect(element);
}

/**
 * Get the combined bounding box of a set of elements.
 * Returns null for empty input.
 */
export function boundingBox(elements: PageElement[]): Rect | null {
  if (elements.length === 0) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const el of elements) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width);
    maxY = Math.max(maxY, el.y + el.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Find all elements whose bounding box overlaps the given bounds.
 */
export function getOverlapping(
  elements: PageElement[],
  bounds: ElementBounds,
): PageElement[] {
  return queryElementsInRect(elements, bounds);
}

/**
 * Extract plain text from elements within a rectangle.
 * Joins text runs with spaces (within a paragraph), paragraphs with newlines.
 */
export function extractTextInRect(elements: PageElement[], rect: Rect): string {
  const textEls = queryTextInRect(elements, rect);
  const lines: string[] = [];
  for (const el of textEls) {
    for (const para of el.paragraphs) {
      lines.push(para.runs.map((r) => r.text).join(''));
    }
  }
  return lines.join('\n');
}

// ─── Geometry helpers ───────────────────────────────────

/** Convert a PageElement's position to a Rect. */
export function elementToRect(el: PageElement): Rect {
  return { x: el.x, y: el.y, width: el.width, height: el.height };
}

/** Test if two axis-aligned rectangles overlap (exclusive edges). */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  // No overlap if one is entirely to the left/right/above/below the other
  return !(
    a.x + a.width <= b.x || // a is left of b
    b.x + b.width <= a.x || // b is left of a
    a.y + a.height <= b.y || // a is above b
    b.y + b.height <= a.y // b is above a
  );
}

/** Test if a point is inside a rectangle (inclusive edges). */
export function isPointInBounds(x: number, y: number, bounds: ElementBounds): boolean {
  return (
    x >= bounds.x &&
    x <= bounds.x + bounds.width &&
    y >= bounds.y &&
    y <= bounds.y + bounds.height
  );
}

/**
 * Alias for isPointInBounds — kept for parity with pdf-signer spatial module naming.
 */
export function pointInRect(px: number, py: number, rect: Rect): boolean {
  return isPointInBounds(px, py, rect);
}

/** Compute the intersection rectangle of two rects. Returns null if no overlap. */
export function rectIntersection(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const top = Math.min(a.y + a.height, b.y + b.height);
  if (right <= x || top <= y) return null;
  return { x, y, width: right - x, height: top - y };
}

/** Compute area of a rect. */
export function rectArea(r: Rect): number {
  return r.width * r.height;
}

/** Compute how much of element's area is covered by the query rect (0-1). */
export function overlapFraction(element: PageElement, rect: Rect): number {
  const elRect = elementToRect(element);
  const elArea = rectArea(elRect);
  if (elArea === 0) return 0;
  const inter = rectIntersection(elRect, rect);
  if (!inter) return 0;
  return rectArea(inter) / elArea;
}
