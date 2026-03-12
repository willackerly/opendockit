/**
 * PDF Slide Renderer — translates PPTX slide IR into PDF content stream operators.
 *
 * Since the existing Canvas2D renderers are tightly coupled to CanvasRenderingContext2D
 * (there is no RenderBackend abstraction yet), this module directly translates
 * SlideElementIR objects into PDF operator sequences via ContentStreamBuilder.
 *
 * This implementation handles:
 * - Solid fill backgrounds
 * - Gradient fill backgrounds (linear/radial via PDF shading objects)
 * - Shape rectangles with solid fills
 * - Gradient fills on shapes (linear/radial via PDF shading with clip path)
 * - Picture fill backgrounds (image XObjects)
 * - Picture fills on shapes (image XObjects with clip path)
 * - Text rendering with standard PDF fonts (Helvetica, Times-Roman, Courier)
 * - Shape outlines
 * - Group transforms
 *
 * Future work:
 * - Effects (shadows, glow, reflection)
 * - Connector rendering
 * - Table text rendering
 */

import { ContentStreamBuilder } from '@opendockit/pdf-signer';
import type {
  SlideElementIR,
  DrawingMLShapeIR,
  FillIR,
  GradientFillIR,
  GradientStopIR,
  PictureFillIR,
  ResolvedColor,
  TransformIR,
  GroupIR,
  PictureIR,
  TableIR,
  TextBodyIR,
  ParagraphIR,
  ThemeIR,
} from '@opendockit/core';
import type { BackgroundIR, EnrichedSlideData } from '../model/index.js';
import { emuToPt } from '@opendockit/core';
import type { EmbeddedFontResult } from './pdf-font-embedder.js';
import { getStandardFontName } from './pdf-font-embedder.js';

// ---------------------------------------------------------------------------
// Shading request — collected during rendering, materialized by the exporter
// ---------------------------------------------------------------------------

/** A gradient color stop in PDF color space (0-1 components). */
export interface PdfGradientStop {
  position: number;
  r: number;
  g: number;
  b: number;
}

/**
 * A request to create a PDF shading object.
 *
 * Collected during rendering and fulfilled by the exporter, which creates
 * the actual shading dictionary and wires it into the page resources.
 */
export interface ShadingRequest {
  /** Unique name for this shading (e.g. "Sh1", "Sh2"). */
  name: string;
  /** Shading type: 2 = axial (linear), 3 = radial. */
  type: 2 | 3;
  /** Coordinate array: [x0, y0, x1, y1] for axial, [x0, y0, r0, x1, y1, r1] for radial. */
  coords: number[];
  /** Color stops (position 0-1, RGB 0-1). */
  stops: PdfGradientStop[];
}

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
// Shading collector
// ---------------------------------------------------------------------------

/**
 * Collects shading requests during slide rendering.
 *
 * Each gradient fill encountered during rendering creates a ShadingRequest
 * that the exporter later materializes into PDF shading dictionary objects.
 */
export class ShadingCollector {
  private _requests: ShadingRequest[] = [];
  private _counter = 0;

  /**
   * Record a linear gradient shading request.
   *
   * @param x0 - Start X in PDF points
   * @param y0 - Start Y in PDF points
   * @param x1 - End X in PDF points
   * @param y1 - End Y in PDF points
   * @param stops - Gradient stops from the IR
   * @returns The shading name (e.g. "Sh1")
   */
  addLinearGradient(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    stops: GradientStopIR[]
  ): string {
    const name = `Sh${++this._counter}`;
    this._requests.push({
      name,
      type: 2,
      coords: [x0, y0, x1, y1],
      stops: stops.map((s) => ({
        position: s.position,
        ...toPdfRgb(s.color),
      })),
    });
    return name;
  }

  /**
   * Record a radial gradient shading request.
   *
   * @param cx0 - Inner circle center X
   * @param cy0 - Inner circle center Y
   * @param r0 - Inner circle radius
   * @param cx1 - Outer circle center X
   * @param cy1 - Outer circle center Y
   * @param r1 - Outer circle radius
   * @param stops - Gradient stops from the IR
   * @returns The shading name (e.g. "Sh2")
   */
  addRadialGradient(
    cx0: number,
    cy0: number,
    r0: number,
    cx1: number,
    cy1: number,
    r1: number,
    stops: GradientStopIR[]
  ): string {
    const name = `Sh${++this._counter}`;
    this._requests.push({
      name,
      type: 3,
      coords: [cx0, cy0, r0, cx1, cy1, r1],
      stops: stops.map((s) => ({
        position: s.position,
        ...toPdfRgb(s.color),
      })),
    });
    return name;
  }

  /** Get all collected shading requests. */
  getRequests(): ShadingRequest[] {
    return this._requests;
  }
}

// ---------------------------------------------------------------------------
// Gradient geometry helpers
// ---------------------------------------------------------------------------

/**
 * Compute the axial shading coordinates for a linear gradient.
 *
 * PPTX linear gradients are specified by an angle (degrees).
 * PDF Type 2 (axial) shading needs start/end points in the fill area.
 *
 * @param angle - Gradient angle in degrees (0 = left-to-right, 90 = top-to-bottom)
 * @param x - Fill area left
 * @param y - Fill area bottom (PDF coordinates)
 * @param w - Fill area width
 * @param h - Fill area height
 * @returns [x0, y0, x1, y1] in PDF coordinates
 */
function linearGradientCoords(
  angle: number,
  x: number,
  y: number,
  w: number,
  h: number
): [number, number, number, number] {
  // PPTX angle: 0° = left-to-right, 90° = top-to-bottom
  // Convert to radians for coordinate computation
  const rad = ((angle % 360) * Math.PI) / 180;

  // Center of the fill area
  const cx = x + w / 2;
  const cy = y + h / 2;

  // Direction vector (PPTX: 0° → right, rotates clockwise)
  // In PDF coords (Y up): 0° → right (+x), 90° → down (-y)
  const dx = Math.cos(rad);
  const dy = -Math.sin(rad);

  // Project to fill the entire bounding box
  // The gradient line must span the diagonal projection
  const halfDist = (Math.abs(dx) * w + Math.abs(dy) * h) / 2;

  const x0 = cx - dx * halfDist;
  const y0 = cy - dy * halfDist;
  const x1 = cx + dx * halfDist;
  const y1 = cy + dy * halfDist;

  return [x0, y0, x1, y1];
}

/**
 * Compute radial gradient coordinates for a path/radial gradient.
 *
 * Maps an OOXML radial/path gradient to a PDF Type 3 radial shading.
 *
 * @param x - Fill area left
 * @param y - Fill area bottom (PDF coordinates)
 * @param w - Fill area width
 * @param h - Fill area height
 * @returns [cx0, cy0, r0, cx1, cy1, r1]
 */
function radialGradientCoords(
  x: number,
  y: number,
  w: number,
  h: number
): [number, number, number, number, number, number] {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.max(w, h) / 2;
  return [cx, cy, 0, cx, cy, r];
}

// ---------------------------------------------------------------------------
// Font lookup context
// ---------------------------------------------------------------------------

/**
 * Context for looking up embedded fonts during rendering.
 *
 * Maps (family, bold, italic) to an EmbeddedFontResult for content stream
 * text operators. Also carries the theme for resolving +mj-lt/+mn-lt
 * font references in text runs.
 */
export interface FontLookupContext {
  /** Look up the EmbeddedFontResult for a given family/bold/italic combination. */
  lookup(family: string, bold: boolean, italic: boolean): EmbeddedFontResult | undefined;
  /** The presentation theme (for resolving theme font refs). */
  theme?: ThemeIR;
}

/**
 * Build a FontLookupContext from embedded fonts.
 *
 * Creates a fast lookup map keyed by `${family.toLowerCase()}|${bold}|${italic}`.
 * Falls back to matching by family-only (ignoring style) if an exact match
 * is not found.
 */
export function buildFontLookup(
  embeddedFonts: EmbeddedFontResult[],
  theme?: ThemeIR
): FontLookupContext {
  const exactMap = new Map<string, EmbeddedFontResult>();
  const familyMap = new Map<string, EmbeddedFontResult>();

  for (const ef of embeddedFonts) {
    const key = `${ef.fontKey.family.toLowerCase()}|${ef.fontKey.bold}|${ef.fontKey.italic}`;
    exactMap.set(key, ef);
    // Store first occurrence per family for fallback
    const familyKey = ef.fontKey.family.toLowerCase();
    if (!familyMap.has(familyKey)) {
      familyMap.set(familyKey, ef);
    }
  }

  return {
    lookup(family: string, bold: boolean, italic: boolean): EmbeddedFontResult | undefined {
      const key = `${family.toLowerCase()}|${bold}|${italic}`;
      return exactMap.get(key) ?? familyMap.get(family.toLowerCase());
    },
    theme,
  };
}

/**
 * Resolve OOXML theme font placeholders to actual font names.
 */
function resolveThemeFont(
  fontFamily: string | undefined,
  theme: ThemeIR | undefined
): string | undefined {
  if (!fontFamily) return undefined;
  if (!theme) return fontFamily;

  if (fontFamily === '+mj-lt' || fontFamily === '+mj-ea' || fontFamily === '+mj-cs') {
    return theme.fontScheme.majorLatin;
  }
  if (fontFamily === '+mn-lt' || fontFamily === '+mn-ea' || fontFamily === '+mn-cs') {
    return theme.fontScheme.minorLatin;
  }

  return fontFamily;
}

// ---------------------------------------------------------------------------
// Background renderer
// ---------------------------------------------------------------------------

/**
 * Render the slide background into PDF operators.
 *
 * Supports solid, gradient (via shading objects), pattern (approximated), and
 * picture (via image XObjects) fills.
 *
 * @param builder - PDF content stream builder
 * @param background - The background fill to render
 * @param pageWidthPt - Page width in PDF points
 * @param pageHeightPt - Page height in PDF points
 * @param shadingCollector - Optional shading collector for gradient fills
 * @param imageResourceNames - Optional map of image part URI -> PDF resource name
 */
export function renderBackgroundToPdf(
  builder: ContentStreamBuilder,
  background: BackgroundIR | undefined,
  pageWidthPt: number,
  pageHeightPt: number,
  shadingCollector?: ShadingCollector,
  imageResourceNames?: Map<string, string>
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
      renderGradientFill(builder, fill, 0, 0, pageWidthPt, pageHeightPt, shadingCollector);
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
      renderPictureFill(builder, fill, 0, 0, pageWidthPt, pageHeightPt, imageResourceNames);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Gradient fill renderer (shared by background + shapes)
// ---------------------------------------------------------------------------

/**
 * Render a gradient fill into PDF operators.
 *
 * Uses the `sh` (paint shading) operator with a clip path. The shading
 * dictionary is created by the exporter from the ShadingRequest.
 *
 * If no shading collector is available, falls back to a solid fill using
 * the first stop color.
 */
function renderGradientFill(
  builder: ContentStreamBuilder,
  fill: GradientFillIR,
  x: number,
  y: number,
  w: number,
  h: number,
  shadingCollector?: ShadingCollector
): void {
  if (fill.stops.length === 0) return;

  // Fallback to solid when no shading collector
  if (!shadingCollector || fill.stops.length < 2) {
    const { r, g, b } = toPdfRgb(fill.stops[0].color);
    builder.pushGraphicsState();
    builder.setFillingRgbColor(r, g, b);
    builder.rectangle(x, y, w, h);
    builder.fill();
    builder.popGraphicsState();
    return;
  }

  let shadingName: string;

  if (fill.kind === 'radial' || fill.kind === 'path') {
    const [cx0, cy0, r0, cx1, cy1, r1] = radialGradientCoords(x, y, w, h);
    shadingName = shadingCollector.addRadialGradient(cx0, cy0, r0, cx1, cy1, r1, fill.stops);
  } else {
    // Linear gradient (default)
    const angle = fill.angle ?? 0;
    const [x0, y0, x1, y1] = linearGradientCoords(angle, x, y, w, h);
    shadingName = shadingCollector.addLinearGradient(x0, y0, x1, y1, fill.stops);
  }

  // Clip to the fill area and paint the shading
  builder.pushGraphicsState();
  builder.rectangle(x, y, w, h);
  builder.clip();
  builder.endPath();
  // Paint the shading: /ShName sh
  builder.raw(`/${shadingName} sh`);
  builder.popGraphicsState();
}

// ---------------------------------------------------------------------------
// Picture fill renderer (shared by background + shapes)
// ---------------------------------------------------------------------------

/**
 * Render a picture fill into PDF operators.
 *
 * Clips to the fill area and renders the image XObject. Falls back to a
 * white fill if the image is not available.
 */
function renderPictureFill(
  builder: ContentStreamBuilder,
  fill: PictureFillIR,
  x: number,
  y: number,
  w: number,
  h: number,
  imageResourceNames?: Map<string, string>
): void {
  const resourceName = imageResourceNames?.get(fill.imagePartUri);

  if (resourceName) {
    builder.pushGraphicsState();
    // Clip to the fill area
    builder.rectangle(x, y, w, h);
    builder.clip();
    builder.endPath();
    // Scale and position the image (PDF images are 1x1 by default)
    builder.concatMatrix(w, 0, 0, h, x, y);
    builder.drawXObject(resourceName);
    builder.popGraphicsState();
  } else {
    // Fallback: white fill
    builder.pushGraphicsState();
    builder.setFillingRgbColor(1, 1, 1);
    builder.rectangle(x, y, w, h);
    builder.fill();
    builder.popGraphicsState();
  }
}

// ---------------------------------------------------------------------------
// Shape renderer
// ---------------------------------------------------------------------------

/**
 * Render a shape's fill to PDF operators.
 *
 * Supports solid, gradient (via shading), pattern (approximated), and
 * picture (via image XObject) fills.
 */
function renderShapeFill(
  builder: ContentStreamBuilder,
  fill: FillIR | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
  shadingCollector?: ShadingCollector,
  imageResourceNames?: Map<string, string>
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
      renderGradientFill(builder, fill, x, y, w, h, shadingCollector);
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
      renderPictureFill(builder, fill, x, y, w, h, imageResourceNames);
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

// ---------------------------------------------------------------------------
// Text rendering
// ---------------------------------------------------------------------------

/** Default text insets in EMU (OOXML defaults: 0.25 inch left/right, 0.05 inch top/bottom). */
const DEFAULT_LEFT_INSET = 91440; // 0.1" in EMU
const DEFAULT_RIGHT_INSET = 91440;
const DEFAULT_TOP_INSET = 45720; // 0.05" in EMU

/** Default font size in hundredths of a point. */
const DEFAULT_FONT_SIZE_HPT = 1800; // 18pt

/**
 * Render text body content into PDF operators.
 *
 * Lays out paragraphs top-to-bottom within the shape's text box,
 * applying insets and paragraph alignment. Each text run is rendered
 * using the appropriate PDF standard font from the font lookup.
 *
 * The text is clipped to the shape bounds to prevent overflow.
 */
function renderTextBodyToPdf(
  builder: ContentStreamBuilder,
  textBody: TextBodyIR,
  x: number,
  y: number,
  w: number,
  h: number,
  _pageHeightPt: number,
  fontCtx: FontLookupContext | undefined
): void {
  if (!fontCtx) return;
  if (textBody.paragraphs.length === 0) return;

  const bp = textBody.bodyProperties;

  // Calculate text box insets (EMU -> pt)
  const leftInset = emuToPt(bp.leftInset ?? DEFAULT_LEFT_INSET);
  const rightInset = emuToPt(bp.rightInset ?? DEFAULT_RIGHT_INSET);
  const topInset = emuToPt(bp.topInset ?? DEFAULT_TOP_INSET);
  // Available text area
  const textX = x + leftInset;
  const textW = w - leftInset - rightInset;
  const textAreaTop = y + h - topInset; // PDF Y: top of text area

  if (textW <= 0) return;

  // Clip to shape bounds
  builder.pushGraphicsState();
  builder.rectangle(x, y, w, h);
  builder.clip();
  builder.endPath();

  // Current Y position (starts at top of text area, moves down)
  let cursorY = textAreaTop;

  for (const para of textBody.paragraphs) {
    const paraResult = renderParagraphToPdf(builder, para, textX, cursorY, textW, fontCtx);
    cursorY -= paraResult.heightPt;
  }

  builder.popGraphicsState();
}

/** Result of rendering a paragraph (used for Y-cursor advancement). */
interface ParagraphRenderResult {
  /** Total height consumed by this paragraph in PDF points. */
  heightPt: number;
}

/**
 * Render a single paragraph into PDF operators.
 *
 * Processes runs sequentially, wrapping text to the next line when it
 * exceeds the available width. Applies paragraph alignment (left/center/right).
 */
function renderParagraphToPdf(
  builder: ContentStreamBuilder,
  para: ParagraphIR,
  textX: number,
  topY: number,
  textW: number,
  fontCtx: FontLookupContext
): ParagraphRenderResult {
  const alignment = para.properties?.alignment ?? 'left';

  // Collect all text runs with their font info
  const runInfos: Array<{
    text: string;
    fontSizePt: number;
    resourceName: string;
    encodeText: (text: string) => string;
    measureWidth: (text: string, sizePt: number) => number;
    color?: { r: number; g: number; b: number };
    bold: boolean;
    italic: boolean;
  }> = [];

  for (const run of para.runs) {
    if (run.kind !== 'run' || !run.text) continue;

    const props = run.properties;
    const fontSizeHpt = props?.fontSize ?? DEFAULT_FONT_SIZE_HPT;
    const fontSizePt = fontSizeHpt / 100;
    const bold = !!props?.bold;
    const italic = !!props?.italic;

    // Resolve font family (with theme ref resolution)
    const rawFamily = props?.fontFamily ?? props?.latin;
    const family = resolveThemeFont(rawFamily, fontCtx.theme) ?? 'Helvetica';

    // Look up the embedded font
    const ef = fontCtx.lookup(family, bold, italic);
    if (!ef) {
      // No embedded font found — use Helvetica fallback with standard font name
      const standardName = getStandardFontName(family, bold, italic);
      // We don't have a registered font for this — skip the text
      // This shouldn't happen if font collection is correct
      void standardName;
      continue;
    }

    const color = props?.color
      ? { r: props.color.r / 255, g: props.color.g / 255, b: props.color.b / 255 }
      : undefined;

    runInfos.push({
      text: run.text,
      fontSizePt,
      resourceName: ef.registeredFont.resourceName,
      encodeText: ef.registeredFont.encodeText,
      measureWidth: ef.registeredFont.measureWidth,
      color,
      bold,
      italic,
    });
  }

  // If no renderable runs, still consume space for empty paragraph
  if (runInfos.length === 0) {
    const endParaSize = (para.endParaProperties?.fontSize ?? DEFAULT_FONT_SIZE_HPT) / 100;
    const lineHeight = endParaSize * 1.2;
    return { heightPt: lineHeight };
  }

  // Simple single-line layout (no word wrap for now)
  // Calculate total width for alignment
  let totalWidth = 0;
  for (const ri of runInfos) {
    totalWidth += ri.measureWidth(ri.text, ri.fontSizePt);
  }

  // Determine the dominant font size for line height
  let maxFontSize = 0;
  for (const ri of runInfos) {
    if (ri.fontSizePt > maxFontSize) maxFontSize = ri.fontSizePt;
  }
  const lineHeight = maxFontSize * 1.2;

  // Calculate X offset based on alignment
  let offsetX = 0;
  if (alignment === 'center') {
    offsetX = (textW - totalWidth) / 2;
  } else if (alignment === 'right') {
    offsetX = textW - totalWidth;
  }

  // Baseline Y position (PDF Y: top - ascent)
  const baselineY = topY - maxFontSize;

  // Render each run
  let runX = textX + Math.max(0, offsetX);

  builder.beginText();

  for (const ri of runInfos) {
    // Set font
    builder.setFontAndSize(ri.resourceName, ri.fontSizePt);

    // Set text color
    if (ri.color) {
      builder.setFillingRgbColor(ri.color.r, ri.color.g, ri.color.b);
    } else {
      // Default black text
      builder.setFillingRgbColor(0, 0, 0);
    }

    // Position this run
    builder.setTextMatrix(1, 0, 0, 1, runX, baselineY);

    // Encode and show text
    const hex = ri.encodeText(ri.text);
    builder.showText(hex);

    // Advance X cursor
    runX += ri.measureWidth(ri.text, ri.fontSizePt);
  }

  builder.endText();

  return { heightPt: lineHeight };
}

/**
 * Render a single DrawingML shape to PDF operators.
 */
function renderShapeToPdf(
  builder: ContentStreamBuilder,
  element: DrawingMLShapeIR,
  pageHeightPt: number,
  fontCtx?: FontLookupContext,
  shadingCollector?: ShadingCollector,
  imageResourceNames?: Map<string, string>
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
  renderShapeFill(builder, element.properties.fill, x, y, w, h, shadingCollector, imageResourceNames);

  // Render outline
  renderShapeLine(builder, element, x, y, w, h);

  // Render text content
  if (element.textBody) {
    renderTextBodyToPdf(builder, element.textBody, x, y, w, h, pageHeightPt, fontCtx);
  }

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
  pageHeightPt: number,
  fontCtx?: FontLookupContext,
  imageResourceNames?: Map<string, string>,
  shadingCollector?: ShadingCollector
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
    renderElementToPdf(
      builder,
      child,
      pageHeightPt / scaleY + emuToPt(cy),
      fontCtx,
      imageResourceNames,
      shadingCollector
    );
  }

  builder.popGraphicsState();
}

// ---------------------------------------------------------------------------
// Element dispatcher
// ---------------------------------------------------------------------------

/**
 * Render a single slide element to PDF operators.
 *
 * Dispatches by element kind. Supports shapes (fills, outlines, text),
 * groups (with transform), pictures (with embedded images), and
 * placeholders for tables.
 * Connectors, charts, and unsupported elements are skipped.
 *
 * @param builder - PDF content stream builder
 * @param element - The slide element to render
 * @param pageHeightPt - Page height in PDF points (for Y-flip)
 * @param fontCtx - Font lookup context for text rendering
 * @param imageResourceNames - Map of image part URI -> PDF resource name (e.g. "Im1")
 * @param shadingCollector - Optional shading collector for gradient fills
 */
export function renderElementToPdf(
  builder: ContentStreamBuilder,
  element: SlideElementIR,
  pageHeightPt: number,
  fontCtx?: FontLookupContext,
  imageResourceNames?: Map<string, string>,
  shadingCollector?: ShadingCollector
): void {
  switch (element.kind) {
    case 'shape':
      renderShapeToPdf(builder, element, pageHeightPt, fontCtx, shadingCollector, imageResourceNames);
      break;

    case 'group':
      renderGroupToPdf(builder, element as GroupIR, pageHeightPt, fontCtx, imageResourceNames, shadingCollector);
      break;

    case 'picture':
      renderPictureToPdf(builder, element as PictureIR, pageHeightPt, imageResourceNames);
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
 * Render a picture element to PDF operators.
 *
 * If the image has a registered resource name, emits `Do` operator
 * to render the XObject. Otherwise falls back to a gray placeholder.
 */
function renderPictureToPdf(
  builder: ContentStreamBuilder,
  element: PictureIR,
  pageHeightPt: number,
  imageResourceNames?: Map<string, string>
): void {
  const transform = element.properties.transform;
  if (!transform) return;

  const { x, y, w, h } = transformToPdf(transform, pageHeightPt);
  const resourceName = imageResourceNames?.get(element.imagePartUri);

  if (resourceName) {
    // Render the actual image XObject
    builder.pushGraphicsState();
    // Position and scale the image:
    // PDF images are 1x1 unit by default; we need to scale to the destination size
    // and translate to the correct position.
    builder.concatMatrix(w, 0, 0, h, x, y);
    builder.drawXObject(resourceName);
    builder.popGraphicsState();
  } else {
    // Fallback: gray placeholder
    builder.pushGraphicsState();
    builder.setFillingRgbColor(0.9, 0.9, 0.9);
    builder.rectangle(x, y, w, h);
    builder.fill();
    builder.popGraphicsState();
  }
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
 * @param fontCtx - Optional font lookup context for text rendering
 * @param imageResourceNames - Optional map of image part URI -> PDF resource name
 * @returns Object with ContentStreamBuilder and ShadingCollector
 */
export function renderSlideToPdf(
  data: EnrichedSlideData,
  pageWidthPt: number,
  pageHeightPt: number,
  fontCtx?: FontLookupContext,
  imageResourceNames?: Map<string, string>
): SlideRenderResult {
  const builder = new ContentStreamBuilder();
  const shadingCollector = new ShadingCollector();
  const { slide, layout, master } = data;

  // 1. Background cascade: slide > layout > master
  const effectiveBg = slide.background ?? layout.background ?? master.background;
  renderBackgroundToPdf(builder, effectiveBg, pageWidthPt, pageHeightPt, shadingCollector, imageResourceNames);

  // 2. Master elements (if layout says showMasterSp !== false)
  const showMaster = layout.showMasterSp !== false;
  if (showMaster) {
    for (const element of master.elements) {
      renderElementToPdf(builder, element, pageHeightPt, fontCtx, imageResourceNames, shadingCollector);
    }
  }

  // 3. Layout elements
  for (const element of layout.elements) {
    renderElementToPdf(builder, element, pageHeightPt, fontCtx, imageResourceNames, shadingCollector);
  }

  // 4. Slide elements (front-most layer)
  for (const element of slide.elements) {
    renderElementToPdf(builder, element, pageHeightPt, fontCtx, imageResourceNames, shadingCollector);
  }

  return { builder, shadingRequests: shadingCollector.getRequests() };
}

/** Result of rendering a slide, including content stream and shading requests. */
export interface SlideRenderResult {
  /** The content stream builder with all operators. */
  builder: ContentStreamBuilder;
  /** Shading requests that need to be materialized as PDF objects. */
  shadingRequests: ShadingRequest[];
}
