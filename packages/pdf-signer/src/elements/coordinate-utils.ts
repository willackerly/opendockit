/**
 * Coordinate conversion between viewport pixels and PDF page points.
 *
 * Inverts the NativeRenderer transform (src/render/NativeRenderer.ts:123):
 *   context.transform(scale, 0, 0, -scale, -mediaBox[0]*scale, mediaBox[3]*scale)
 *
 * For standard pages (mediaBox origin at 0,0):
 *   viewportX = pageX * scale
 *   viewportY = (pageHeight - pageY) * scale
 */

import type { Viewport } from './interaction-types.js';
import type { Rect } from './spatial.js';

/** Convert viewport pixel coordinates to PDF page points. */
export function viewportToPage(
  vp: Viewport,
  vx: number,
  vy: number,
): { x: number; y: number } {
  return {
    x: vx / vp.scale,
    y: vp.pageHeight - vy / vp.scale,
  };
}

/** Convert PDF page points to viewport pixel coordinates. */
export function pageToViewport(
  vp: Viewport,
  px: number,
  py: number,
): { x: number; y: number } {
  return {
    x: px * vp.scale,
    y: (vp.pageHeight - py) * vp.scale,
  };
}

/**
 * Convert a page-coordinate rect to viewport pixels.
 * PDF rect (x,y) = bottom-left; viewport rect (x,y) = top-left.
 */
export function pageRectToViewport(vp: Viewport, rect: Rect): Rect {
  const tl = pageToViewport(vp, rect.x, rect.y + rect.height);
  return {
    x: tl.x,
    y: tl.y,
    width: rect.width * vp.scale,
    height: rect.height * vp.scale,
  };
}

/**
 * Convert a viewport-pixel rect to page coordinates.
 * Viewport rect (x,y) = top-left; PDF rect (x,y) = bottom-left.
 */
export function viewportRectToPage(vp: Viewport, rect: Rect): Rect {
  const bl = viewportToPage(vp, rect.x, rect.y + rect.height);
  return {
    x: bl.x,
    y: bl.y,
    width: rect.width / vp.scale,
    height: rect.height / vp.scale,
  };
}
