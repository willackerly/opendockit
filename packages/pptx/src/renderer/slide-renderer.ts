/**
 * Slide renderer — renders a complete PPTX slide to Canvas2D.
 *
 * Orchestrates the rendering pipeline for a single slide:
 * 1. Render background (master → layout → slide cascade)
 * 2. Render master elements (filtered: skip placeholders replaced by layout/slide)
 * 3. Render layout elements (filtered: skip placeholders replaced by slide)
 * 4. Render slide elements (front-most layer)
 *
 * Element rendering is delegated entirely to the core DrawingML
 * renderers via {@link renderSlideElement}.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 19.3 (PresentationML)
 */

import type { EnrichedSlideData } from '../model/index.js';
import type { SlideElementIR } from '@opendockit/core';
import type { RenderContext } from '@opendockit/core/drawingml/renderer';
import { renderSlideElement } from '@opendockit/core/drawingml/renderer';
import { renderBackground } from './background-renderer.js';

// ---------------------------------------------------------------------------
// Placeholder filtering
// ---------------------------------------------------------------------------

/**
 * Get a placeholder matching key for an element.
 *
 * Returns undefined for non-placeholder elements (decorative shapes, pictures,
 * groups, etc.) which should always render from any layer.
 *
 * Placeholder matching follows ECMA-376 rules:
 * - Match by type (e.g., "title", "body", "sldNum")
 * - Match by index when type is not available
 * - Index 4294967295 (0xFFFFFFFF) is a "no index" sentinel — match by type only
 */
function getPlaceholderKey(element: SlideElementIR): string | undefined {
  if (element.kind !== 'shape') return undefined;
  const { placeholderType, placeholderIndex } = element;
  if (!placeholderType && placeholderIndex === undefined) return undefined;

  // Primary match by type
  if (placeholderType) return `type:${placeholderType}`;

  // Sentinel index = no meaningful index
  if (placeholderIndex === 4294967295) return undefined;

  // Fallback to index-based matching
  if (placeholderIndex !== undefined) return `idx:${placeholderIndex}`;

  return undefined;
}

/**
 * Collect all placeholder keys from a list of elements.
 */
function collectPlaceholderKeys(elements: SlideElementIR[]): Set<string> {
  const keys = new Set<string>();
  for (const el of elements) {
    const key = getPlaceholderKey(el);
    if (key) keys.add(key);
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render a complete slide to the canvas.
 *
 * Uses the master → layout → slide cascade for backgrounds and
 * renders shape layers in z-order (master → layout → slide).
 * Placeholders from lower layers are suppressed when a higher layer
 * provides content for the same placeholder slot.
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

  // Collect placeholder keys for filtering
  const slidePlaceholders = collectPlaceholderKeys(slide.elements);
  const layoutPlaceholders = collectPlaceholderKeys(layout.elements);

  // 2. Master elements — skip placeholders claimed by layout or slide
  for (const element of master.elements) {
    const key = getPlaceholderKey(element);
    if (key && (layoutPlaceholders.has(key) || slidePlaceholders.has(key))) continue;
    renderSlideElement(element, rctx);
  }

  // 3. Layout elements — skip placeholders claimed by slide
  for (const element of layout.elements) {
    const key = getPlaceholderKey(element);
    if (key && slidePlaceholders.has(key)) continue;
    renderSlideElement(element, rctx);
  }

  // 4. Slide elements (front-most layer — always rendered)
  for (const element of slide.elements) {
    renderSlideElement(element, rctx);
  }
}
