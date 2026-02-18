/**
 * Slide renderer — renders a complete PPTX slide to Canvas2D.
 *
 * Orchestrates the rendering pipeline for a single slide:
 * 1. Render background (master → layout → slide cascade)
 * 2. Render master elements (back-most layer)
 * 3. Render layout elements
 * 4. Render slide elements (front-most layer)
 *
 * Element rendering is delegated entirely to the core DrawingML
 * renderers via {@link renderSlideElement}.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 19.3 (PresentationML)
 */

import type { EnrichedSlideData } from '../model/index.js';
import type { RenderContext } from '@opendockit/core/drawingml/renderer';
import { renderSlideElement } from '@opendockit/core/drawingml/renderer';
import { renderBackground } from './background-renderer.js';

/**
 * Render a complete slide to the canvas.
 *
 * Uses the master → layout → slide cascade for backgrounds and
 * renders shape layers in z-order (master → layout → slide).
 *
 * @param data        - The enriched slide data (slide + layout + master).
 * @param rctx        - The shared render context.
 * @param slideWidth  - Slide width in pixels (already scaled for DPI).
 * @param slideHeight - Slide height in pixels (already scaled for DPI).
 */
export function renderSlide(
  data: EnrichedSlideData,
  rctx: RenderContext,
  slideWidth: number,
  slideHeight: number
): void {
  const { slide, layout, master } = data;

  // 1. Background cascade: slide > layout > master
  const effectiveBg = slide.background ?? layout.background ?? master.background;
  renderBackground(effectiveBg, rctx, slideWidth, slideHeight);

  // 2. Master elements (back-most layer)
  for (const element of master.elements) {
    renderSlideElement(element, rctx);
  }

  // 3. Layout elements
  for (const element of layout.elements) {
    renderSlideElement(element, rctx);
  }

  // 4. Slide elements (front-most layer)
  for (const element of slide.elements) {
    renderSlideElement(element, rctx);
  }
}
