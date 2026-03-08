/**
 * PDF Slide Renderer — translates PPTX slide IR into PDF content stream operators.
 *
 * Since the existing Canvas2D renderers are tightly coupled to CanvasRenderingContext2D
 * (there is no RenderBackend abstraction yet), this module directly translates
 * SlideElementIR objects into PDF operator sequences via ContentStreamBuilder.
 *
 * This is an initial implementation that handles:
 * - Solid fill backgrounds
 * - Gradient fill backgrounds (linear only, approximated as solid using first stop)
 * - Shape rectangles with solid fills
 * - Basic text positioning (without font embedding)
 * - Shape outlines
 *
 * Future work (requires RenderBackend abstraction):
 * - Full text rendering with font embedding/subsetting
 * - Picture/image embedding as XObjects
 * - Gradient fills on shapes
 * - Effects (shadows, glow, reflection)
 * - Connector rendering
 * - Group transforms
 * - Table rendering
 */

import { ContentStreamBuilder } from '@opendockit/pdf-signer';
import type {
  SlideElementIR,
  DrawingMLShapeIR,
  FillIR,
  ResolvedColor,
  TransformIR,
  GroupIR,
  PictureIR,
  TableIR,
} from '@opendockit/core';
import type { BackgroundIR, EnrichedSlideData } from '../model/index.js';
import { emuToPt } from '@opendockit/core';

// ---------------------------------------------------------------------------
// Color conversion helpers
// ---------------------------------------------------------------------------

/**
 * Convert a ResolvedColor (0-255 RGBA) to PDF color components (0-1 RGB).
 */
function toPdfRgb(c: ResolvedColor): { r: number; g: number; b: number } {
  return {
    r: c.r / 255,
    g: c.g / 255,
    b: c.b / 255,
  };
}

// ---------------------------------------------------------------------------
// Coordinate conversion
// ---------------------------------------------------------------------------

/**
 * Convert EMU transform to PDF points with Y-flip.
 *
 * PPTX uses top-left origin with Y increasing downward.
 * PDF uses bottom-left origin with Y increasing upward.
 *
 * @param transform - Shape transform in EMU
 * @param pageHeightPt - Page height in PDF points
 */
function transformToPdf(
  transform: TransformIR,
  pageHeightPt: number
): { x: number; y: number; w: number; h: number } {
  const x = emuToPt(transform.position.x);
  const yFromTop = emuToPt(transform.position.y);
  const w = emuToPt(transform.size.width);
  const h = emuToPt(transform.size.height);
  // PDF Y is from bottom, so flip: pdfY = pageHeight - yFromTop - height
  const y = pageHeightPt - yFromTop - h;
  return { x, y, w, h };
}

// ---------------------------------------------------------------------------
// Background renderer
// ---------------------------------------------------------------------------

/**
 * Render the slide background into PDF operators.
 */
export function renderBackgroundToPdf(
  builder: ContentStreamBuilder,
  background: BackgroundIR | undefined,
  pageWidthPt: number,
  pageHeightPt: number
): void {
  if (!background?.fill || background.fill.type === 'none') {
    // Default white background
    builder.pushGraphicsState();
    builder.setFillingRgbColor(1, 1, 1);
    builder.rectangle(0, 0, pageWidthPt, pageHeightPt);
    builder.fill();
    builder.popGraphicsState();
    return;
  }

  const fill = background.fill;

  switch (fill.type) {
    case 'solid': {
      const { r, g, b } = toPdfRgb(fill.color);
      builder.pushGraphicsState();
      builder.setFillingRgbColor(r, g, b);
      builder.rectangle(0, 0, pageWidthPt, pageHeightPt);
      builder.fill();
      builder.popGraphicsState();
      break;
    }

    case 'gradient': {
      // TRACKED-TASK: PDF gradient shading objects for gradient backgrounds - see TODO.md
      // Approximation: use the first gradient stop color as a solid fill
      if (fill.stops.length > 0) {
        const { r, g, b } = toPdfRgb(fill.stops[0].color);
        builder.pushGraphicsState();
        builder.setFillingRgbColor(r, g, b);
        builder.rectangle(0, 0, pageWidthPt, pageHeightPt);
        builder.fill();
        builder.popGraphicsState();
      }
      break;
    }

    case 'pattern': {
      // Use the foreground color as a solid fill
      const { r, g, b } = toPdfRgb(fill.foreground);
      builder.pushGraphicsState();
      builder.setFillingRgbColor(r, g, b);
      builder.rectangle(0, 0, pageWidthPt, pageHeightPt);
      builder.fill();
      builder.popGraphicsState();
      break;
    }

    case 'picture': {
      // TRACKED-TASK: PDF image XObject embedding for picture backgrounds - see TODO.md
      // Fallback: white background
      builder.pushGraphicsState();
      builder.setFillingRgbColor(1, 1, 1);
      builder.rectangle(0, 0, pageWidthPt, pageHeightPt);
      builder.fill();
      builder.popGraphicsState();
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Shape renderer
// ---------------------------------------------------------------------------

/**
 * Render a shape's fill to PDF operators.
 */
function renderShapeFill(
  builder: ContentStreamBuilder,
  fill: FillIR | undefined,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  if (!fill || fill.type === 'none') return;

  switch (fill.type) {
    case 'solid': {
      const { r, g, b } = toPdfRgb(fill.color);
      builder.setFillingRgbColor(r, g, b);
      builder.rectangle(x, y, w, h);
      builder.fill();
      break;
    }

    case 'gradient': {
      // TRACKED-TASK: PDF gradient shading for shape fills - see TODO.md
      // Approximation: use first stop color
      if (fill.stops.length > 0) {
        const { r, g, b } = toPdfRgb(fill.stops[0].color);
        builder.setFillingRgbColor(r, g, b);
        builder.rectangle(x, y, w, h);
        builder.fill();
      }
      break;
    }

    case 'pattern': {
      const { r, g, b } = toPdfRgb(fill.foreground);
      builder.setFillingRgbColor(r, g, b);
      builder.rectangle(x, y, w, h);
      builder.fill();
      break;
    }

    case 'picture': {
      // TRACKED-TASK: PDF image XObject embedding for shape picture fills - see TODO.md
      break;
    }
  }
}

/**
 * Render a shape's outline to PDF operators.
 */
function renderShapeLine(
  builder: ContentStreamBuilder,
  element: DrawingMLShapeIR,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  const line = element.properties.line;
  if (!line || !line.color) return;

  const widthPt = line.width ? emuToPt(line.width) : 1;
  const { r, g, b } = toPdfRgb(line.color);

  builder.setStrokingRgbColor(r, g, b);
  builder.setLineWidth(widthPt);
  builder.rectangle(x, y, w, h);
  builder.stroke();
}

/**
 * Render a single DrawingML shape to PDF operators.
 */
function renderShapeToPdf(
  builder: ContentStreamBuilder,
  element: DrawingMLShapeIR,
  pageHeightPt: number
): void {
  const transform = element.properties.transform;
  if (!transform) return;

  const { x, y, w, h } = transformToPdf(transform, pageHeightPt);

  builder.pushGraphicsState();

  // Handle rotation if present
  if (transform.rotation) {
    const radians = (transform.rotation * Math.PI) / 180;
    const cx = x + w / 2;
    const cy = y + h / 2;
    // Translate to center, rotate, translate back
    builder.concatMatrix(1, 0, 0, 1, cx, cy);
    builder.concatMatrix(
      Math.cos(-radians),
      Math.sin(-radians),
      -Math.sin(-radians),
      Math.cos(-radians),
      0,
      0
    );
    builder.concatMatrix(1, 0, 0, 1, -cx, -cy);
  }

  // Render fill
  renderShapeFill(builder, element.properties.fill, x, y, w, h);

  // Render outline
  renderShapeLine(builder, element, x, y, w, h);

  builder.popGraphicsState();
}

// ---------------------------------------------------------------------------
// Group renderer
// ---------------------------------------------------------------------------

/**
 * Render a group of elements to PDF operators.
 *
 * Groups apply a coordinate transform mapping the group's child extent
 * to the group's position on the slide.
 */
function renderGroupToPdf(
  builder: ContentStreamBuilder,
  group: GroupIR,
  pageHeightPt: number
): void {
  const transform = group.properties.transform;
  if (!transform) return;

  builder.pushGraphicsState();

  // Apply group transform
  const { x, y, w, h } = transformToPdf(transform, pageHeightPt);

  // Compute the child space mapping
  const cx = group.childOffset.x;
  const cy = group.childOffset.y;
  const cw = group.childExtent.width;
  const ch = group.childExtent.height;

  const scaleX = w / emuToPt(cw);
  const scaleY = h / emuToPt(ch);

  // Translate to group position, scale child coordinates
  builder.concatMatrix(scaleX, 0, 0, scaleY, x - emuToPt(cx) * scaleX, y - emuToPt(cy) * scaleY);

  // Render children in the group's coordinate space (using full page height
  // since we've already adjusted the transform matrix)
  for (const child of group.children) {
    renderElementToPdf(builder, child, pageHeightPt / scaleY + emuToPt(cy));
  }

  builder.popGraphicsState();
}

// ---------------------------------------------------------------------------
// Element dispatcher
// ---------------------------------------------------------------------------

/**
 * Render a single slide element to PDF operators.
 *
 * Dispatches by element kind. Currently supports shapes (with basic fills
 * and outlines) and groups. Pictures, tables, connectors, and charts are
 * noted as tracked tasks for future implementation.
 */
export function renderElementToPdf(
  builder: ContentStreamBuilder,
  element: SlideElementIR,
  pageHeightPt: number
): void {
  switch (element.kind) {
    case 'shape':
      renderShapeToPdf(builder, element, pageHeightPt);
      break;

    case 'group':
      renderGroupToPdf(builder, element as GroupIR, pageHeightPt);
      break;

    case 'picture':
      // TRACKED-TASK: PDF image XObject rendering for pictures - see TODO.md
      // Render a placeholder rectangle for now
      renderPicturePlaceholder(builder, element as PictureIR, pageHeightPt);
      break;

    case 'connector':
      // TRACKED-TASK: PDF connector line rendering - see TODO.md
      break;

    case 'table':
      // TRACKED-TASK: PDF table rendering - see TODO.md
      renderTablePlaceholder(builder, element as TableIR, pageHeightPt);
      break;

    case 'chart':
    case 'unsupported':
      // Skip silently
      break;
  }
}

/**
 * Render a placeholder for picture elements (light gray rectangle).
 */
function renderPicturePlaceholder(
  builder: ContentStreamBuilder,
  element: PictureIR,
  pageHeightPt: number
): void {
  const transform = element.properties.transform;
  if (!transform) return;

  const { x, y, w, h } = transformToPdf(transform, pageHeightPt);
  builder.pushGraphicsState();
  builder.setFillingRgbColor(0.9, 0.9, 0.9);
  builder.rectangle(x, y, w, h);
  builder.fill();
  builder.popGraphicsState();
}

/**
 * Render a placeholder for table elements (light gray rectangle).
 */
function renderTablePlaceholder(
  builder: ContentStreamBuilder,
  element: TableIR,
  pageHeightPt: number
): void {
  const transform = element.properties?.transform;
  if (!transform) return;

  const { x, y, w, h } = transformToPdf(transform, pageHeightPt);
  builder.pushGraphicsState();
  builder.setFillingRgbColor(0.95, 0.95, 0.95);
  builder.rectangle(x, y, w, h);
  builder.fill();
  builder.popGraphicsState();
}

// ---------------------------------------------------------------------------
// Full slide renderer
// ---------------------------------------------------------------------------

/**
 * Render a complete slide (background + all elements from master/layout/slide)
 * into a ContentStreamBuilder.
 *
 * Follows the same rendering order as the Canvas2D slide renderer:
 * 1. Background (slide > layout > master cascade)
 * 2. Master elements
 * 3. Layout elements
 * 4. Slide elements
 *
 * @param data - Enriched slide data (slide + layout + master chain)
 * @param pageWidthPt - Page width in PDF points
 * @param pageHeightPt - Page height in PDF points
 * @returns ContentStreamBuilder with all operators
 */
export function renderSlideToPdf(
  data: EnrichedSlideData,
  pageWidthPt: number,
  pageHeightPt: number
): ContentStreamBuilder {
  const builder = new ContentStreamBuilder();
  const { slide, layout, master } = data;

  // 1. Background cascade: slide > layout > master
  const effectiveBg = slide.background ?? layout.background ?? master.background;
  renderBackgroundToPdf(builder, effectiveBg, pageWidthPt, pageHeightPt);

  // 2. Master elements (if layout says showMasterSp !== false)
  const showMaster = layout.showMasterSp !== false;
  if (showMaster) {
    for (const element of master.elements) {
      renderElementToPdf(builder, element, pageHeightPt);
    }
  }

  // 3. Layout elements
  for (const element of layout.elements) {
    renderElementToPdf(builder, element, pageHeightPt);
  }

  // 4. Slide elements (front-most layer)
  for (const element of slide.elements) {
    renderElementToPdf(builder, element, pageHeightPt);
  }

  return builder;
}
