/**
 * Spatial query utilities for PageElement[].
 *
 * All coordinates are in PDF points (1/72"). Y axis follows PDF convention
 * (origin at bottom-left, Y increases upward).
 */

import type { PageElement, TextElement } from './types.js';

// ─── Rect type ──────────────────────────────────────────

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── Core query functions ───────────────────────────────

/**
 * Find all elements whose bounding box overlaps the given rectangle.
 * Uses proper AABB (axis-aligned bounding box) overlap — not point-in-rect.
 */
export function queryElementsInRect(
  elements: PageElement[],
  rect: Rect,
): PageElement[] {
  return elements.filter(el => rectsOverlap(elementToRect(el), rect));
}

/**
 * Find all text elements whose bounding box overlaps the given rectangle.
 */
export function queryTextInRect(
  elements: PageElement[],
  rect: Rect,
): TextElement[] {
  return elements
    .filter((el): el is TextElement => el.type === 'text')
    .filter(el => rectsOverlap(elementToRect(el), rect));
}

/**
 * Find the element at a specific point (for hit testing).
 * Returns the topmost (highest z-index) element, or null.
 * Searches back-to-front since elements are z-ordered.
 */
export function elementAtPoint(
  elements: PageElement[],
  px: number,
  py: number,
): PageElement | null {
  // Iterate in reverse (topmost first)
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (pointInRect(px, py, elementToRect(el))) {
      return el;
    }
  }
  return null;
}

/**
 * Get the combined bounding box of a set of elements.
 * Returns null for empty input.
 */
export function boundingBox(elements: PageElement[]): Rect | null {
  if (elements.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width);
    maxY = Math.max(maxY, el.y + el.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Extract plain text from elements within a rectangle.
 * Joins text runs with spaces, paragraphs with newlines.
 */
export function extractTextInRect(
  elements: PageElement[],
  rect: Rect,
): string {
  const textEls = queryTextInRect(elements, rect);
  const lines: string[] = [];
  for (const el of textEls) {
    for (const para of el.paragraphs) {
      lines.push(para.runs.map(r => r.text).join(''));
    }
  }
  return lines.join('\n');
}

// ─── Geometry helpers ───────────────────────────────────

/** Convert a PageElement's position to a Rect. */
export function elementToRect(el: PageElement): Rect {
  return { x: el.x, y: el.y, width: el.width, height: el.height };
}

/** Test if two axis-aligned rectangles overlap. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  // No overlap if one is entirely to the left/right/above/below the other
  return !(
    a.x + a.width <= b.x ||   // a is left of b
    b.x + b.width <= a.x ||   // b is left of a
    a.y + a.height <= b.y ||  // a is below b
    b.y + b.height <= a.y     // b is below a
  );
}

/** Test if a point is inside a rectangle. */
export function pointInRect(px: number, py: number, rect: Rect): boolean {
  return px >= rect.x && px <= rect.x + rect.width &&
         py >= rect.y && py <= rect.y + rect.height;
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
