/**
 * Slide renderer — renders a complete PPTX slide to Canvas2D.
 *
 * Orchestrates the rendering pipeline for a single slide:
 * 1. Render background (solid, gradient, or white fallback)
 * 2. Render all slide elements in z-order (document order)
 *
 * Element rendering is delegated entirely to the core DrawingML
 * renderers via {@link renderSlideElement}.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 19.3 (PresentationML)
 */

import type { SlideIR } from '../model/index.js';
import type { RenderContext } from '@opendockit/core/drawingml/renderer';
import { renderSlideElement } from '@opendockit/core/drawingml/renderer';
import { renderBackground } from './background-renderer.js';

/**
 * Render a complete slide to the canvas.
 *
 * Renders the background first, then all elements in z-order
 * (document order = back-to-front).
 *
 * @param slide       - The parsed slide IR.
 * @param rctx        - The shared render context.
 * @param slideWidth  - Slide width in pixels (already scaled for DPI).
 * @param slideHeight - Slide height in pixels (already scaled for DPI).
 */
export function renderSlide(
  slide: SlideIR,
  rctx: RenderContext,
  slideWidth: number,
  slideHeight: number
): void {
  // 1. Background
  renderBackground(slide.background, rctx, slideWidth, slideHeight);

  // 2. Elements in z-order (document order = first element is furthest back)
  for (const element of slide.elements) {
    renderSlideElement(element, rctx);
  }
}
