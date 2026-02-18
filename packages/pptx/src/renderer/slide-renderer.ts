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
import type { SlideElementIR, ListStyleIR, ListStyleLevelIR } from '@opendockit/core';
import type { RenderContext } from '@opendockit/core/drawingml/renderer';
import { renderSlideElement } from '@opendockit/core/drawingml/renderer';
import { renderBackground } from './background-renderer.js';

// ---------------------------------------------------------------------------
// Text style inheritance helpers
// ---------------------------------------------------------------------------

/**
 * Map a placeholder type to the corresponding master txStyles category.
 *
 * ECMA-376 ss 19.3.1.29 (p:txStyles):
 * - titleStyle applies to title / center-title / subtitle placeholders
 * - bodyStyle applies to body / object / table / chart / media / clipArt placeholders
 * - otherStyle applies to everything else (slide number, date, footer, generic shapes)
 */
function getTextStyleCategory(
  placeholderType: string | undefined
): 'titleStyle' | 'bodyStyle' | 'otherStyle' {
  switch (placeholderType) {
    case 'title':
    case 'ctrTitle':
    case 'subTitle':
      return 'titleStyle';
    case 'body':
    case 'obj':
    case 'tbl':
    case 'chart':
    case 'media':
    case 'clipArt':
      return 'bodyStyle';
    default:
      return 'otherStyle';
  }
}

/**
 * Merge two ListStyleLevelIR objects — higher-priority properties override lower.
 */
function mergeListStyleLevel(
  higher: ListStyleLevelIR | undefined,
  lower: ListStyleLevelIR | undefined
): ListStyleLevelIR | undefined {
  if (!higher && !lower) return undefined;
  return {
    defaultCharacterProperties: {
      ...lower?.defaultCharacterProperties,
      ...higher?.defaultCharacterProperties,
    },
    paragraphProperties: {
      ...lower?.paragraphProperties,
      ...higher?.paragraphProperties,
    },
    bulletProperties: higher?.bulletProperties ?? lower?.bulletProperties,
  };
}

/**
 * Merge two ListStyleIR objects — higher-priority levels override lower.
 *
 * Used to combine a shape's own lstStyle (from its text body) with the
 * master txStyles category so that explicit shape-level overrides win
 * while master defaults fill in the gaps.
 */
function mergeListStyles(
  higher: ListStyleIR | undefined,
  lower: ListStyleIR | undefined
): ListStyleIR | undefined {
  if (!higher && !lower) return undefined;
  if (!higher) return lower;
  if (!lower) return higher;

  const levels: Record<number, ListStyleLevelIR> = {};
  const allKeys = new Set([
    ...Object.keys(lower.levels).map(Number),
    ...Object.keys(higher.levels).map(Number),
  ]);
  for (const key of allKeys) {
    const merged = mergeListStyleLevel(higher.levels[key], lower.levels[key]);
    if (merged) levels[key] = merged;
  }

  return {
    defPPr: mergeListStyleLevel(higher.defPPr, lower.defPPr),
    levels,
  };
}

/**
 * Build merged text defaults for a slide element.
 *
 * Resolution order (highest → lowest priority):
 * 1. Shape's own lstStyle (from a:lstStyle in the text body)
 * 2. Master txStyles category (titleStyle / bodyStyle / otherStyle)
 *
 * Returns undefined for non-shape elements or when no defaults exist.
 */
function buildTextDefaults(
  element: SlideElementIR,
  data: EnrichedSlideData
): ListStyleIR | undefined {
  if (element.kind !== 'shape') return undefined;
  const { master } = data;

  // Determine which master txStyle category applies
  const category = getTextStyleCategory(element.placeholderType);
  const masterStyle = master.txStyles?.[category];

  // The shape's own lstStyle (from its text body) takes priority over master txStyles
  const shapeLstStyle = element.textBody?.listStyle;

  return mergeListStyles(shapeLstStyle, masterStyle);
}

/**
 * Render a slide element with inherited text defaults set on the context.
 *
 * Temporarily sets rctx.textDefaults from the element's merged list style
 * chain, renders the element, then restores the previous value.
 */
function renderElementWithDefaults(
  element: SlideElementIR,
  data: EnrichedSlideData,
  rctx: RenderContext
): void {
  const prevDefaults = rctx.textDefaults;
  rctx.textDefaults = buildTextDefaults(element, data);
  renderSlideElement(element, rctx);
  rctx.textDefaults = prevDefaults;
}

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

  // 2. Master elements — skip if layout says showMasterSp=false
  const showMaster = layout.showMasterSp !== false; // default true
  if (showMaster) {
    for (const element of master.elements) {
      const key = getPlaceholderKey(element);
      if (key && (layoutPlaceholders.has(key) || slidePlaceholders.has(key))) continue;
      renderElementWithDefaults(element, data, rctx);
    }
  }

  // 3. Layout elements — skip placeholders claimed by slide
  for (const element of layout.elements) {
    const key = getPlaceholderKey(element);
    if (key && slidePlaceholders.has(key)) continue;
    renderElementWithDefaults(element, data, rctx);
  }

  // 4. Slide elements (front-most layer — always rendered)
  for (const element of slide.elements) {
    renderElementWithDefaults(element, data, rctx);
  }
}
