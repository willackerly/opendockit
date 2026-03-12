/**
 * Synthesize OOXML XML from PageElement properties.
 *
 * Generates DrawingML `<a:sp>`, `<a:pic>`, `<a:grpSp>` elements as XML
 * strings. This is the inverse of the PPTX parser — it takes the unified
 * element model and produces valid OOXML for insertion into slides.
 *
 * All output is string-based for speed and zero DOM dependencies.
 *
 * Coordinate conventions:
 * - 1 inch = 914400 EMU
 * - 1 point = 12700 EMU
 * - 1 pixel (96 dpi) = 9525 EMU
 * - Font size: pt × 100 = hundredths of a point (e.g. 12pt = 1200)
 * - Rotation: degrees × 60000 (e.g. 45° = 2700000)
 *
 * Reference: ECMA-376 5th Edition, Part 1
 */

// ═══════════════════════════════════════════════════════════════════════════
// Element Types (mirrored from @opendockit/elements to avoid circular dep)
// ═══════════════════════════════════════════════════════════════════════════

/** RGB color. */
export interface Color {
  r: number;
  g: number;
  b: number;
  a?: number;
}

/** Fill style. */
export interface Fill {
  type: 'solid' | 'linear-gradient' | 'radial-gradient' | 'pattern';
  color?: Color;
  stops?: Array<{ offset: number; color: Color }>;
  angle?: number;
}

/** Stroke / line style. */
export interface Stroke {
  color: Color;
  width: number;
  dashArray?: number[];
  lineCap?: 'butt' | 'round' | 'square';
  lineJoin?: 'miter' | 'round' | 'bevel';
}

/** Text run within a paragraph. */
export interface TextRun {
  text: string;
  fontFamily: string;
  fontSize: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  color: Color;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Paragraph with runs and alignment. */
export interface Paragraph {
  runs: TextRun[];
  align?: 'left' | 'center' | 'right' | 'justify';
}

/** Base element properties shared by all element types. */
interface ElementBase {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  index: string;
  parentId: string | null;
  locked: boolean;
}

/** Text element with paragraphs. */
export interface TextElement extends ElementBase {
  type: 'text';
  paragraphs: Paragraph[];
}

/** Shape element with geometry, fill, and stroke. */
export interface ShapeElement extends ElementBase {
  type: 'shape';
  shapeType: string;
  fill: Fill | null;
  stroke: Stroke | null;
  cornerRadius?: number;
}

/** Image element referencing a binary resource. */
export interface ImageElement extends ElementBase {
  type: 'image';
  imageRef: string;
  mimeType: string;
  objectFit: 'fill' | 'contain' | 'cover' | 'none';
}

/** Path element with SVG path data. */
interface PathElement extends ElementBase {
  type: 'path';
  d: string;
  fill: Fill | null;
  stroke: Stroke | null;
}

/** Group element containing child elements. */
export interface GroupElement extends ElementBase {
  type: 'group';
  childIds: string[];
}

/** Union of all page element types. */
export type PageElement =
  | TextElement
  | ShapeElement
  | ImageElement
  | PathElement
  | GroupElement;

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

/** EMU per point (1 pt = 1/72 inch, 1 inch = 914400 EMU). */
const EMU_PER_PT = 12700;

/** Font size scale: points → hundredths of a point. */
const FONT_SIZE_SCALE = 100;

/** Rotation scale: degrees → 60,000ths of a degree. */
const ROTATION_SCALE = 60000;

// ═══════════════════════════════════════════════════════════════════════════
// Unit Conversion Helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Convert points to EMU (integer, rounded). */
export function ptToEmu(pt: number): number {
  return Math.round(pt * EMU_PER_PT);
}

/** Convert degrees to 60,000ths of a degree (integer, rounded). */
export function degToOoxml(deg: number): number {
  return Math.round(deg * ROTATION_SCALE);
}

/** Convert font size in points to hundredths of a point. */
export function fontSizeToOoxml(pt: number): number {
  return Math.round(pt * FONT_SIZE_SCALE);
}

/** Convert Color {r,g,b} to 6-digit hex string (no '#' prefix). */
export function colorToHex(color: Color): string {
  const r = Math.max(0, Math.min(255, Math.round(color.r)))
    .toString(16)
    .padStart(2, '0');
  const g = Math.max(0, Math.min(255, Math.round(color.g)))
    .toString(16)
    .padStart(2, '0');
  const b = Math.max(0, Math.min(255, Math.round(color.b)))
    .toString(16)
    .padStart(2, '0');
  return `${r}${g}${b}`.toUpperCase();
}

// ═══════════════════════════════════════════════════════════════════════════
// XML Escaping
// ═══════════════════════════════════════════════════════════════════════════

/** Escape text content for XML (ampersand, angle brackets, quotes). */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ═══════════════════════════════════════════════════════════════════════════
// Shape Type → Preset Geometry Mapping
// ═══════════════════════════════════════════════════════════════════════════

/** Map PageElement shapeType to OOXML preset geometry name. */
function shapeTypeToPreset(shapeType: string): string {
  switch (shapeType) {
    case 'rectangle':
      return 'rect';
    case 'ellipse':
      return 'ellipse';
    case 'triangle':
      return 'triangle';
    case 'diamond':
      return 'diamond';
    default:
      // Pass through — might already be an OOXML preset name
      return shapeType || 'rect';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Transform Synthesis
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate transform XML: `<a:xfrm>` with `<a:off>` and `<a:ext>`.
 *
 * All inputs are in points. Output coordinates are EMU.
 *
 * @param x - horizontal offset in points
 * @param y - vertical offset in points
 * @param width - width in points
 * @param height - height in points
 * @param rotation - rotation in degrees (omitted if 0 or undefined)
 */
export function synthesizeTransform(
  x: number,
  y: number,
  width: number,
  height: number,
  rotation?: number
): string {
  const offX = ptToEmu(x);
  const offY = ptToEmu(y);
  const extCx = ptToEmu(width);
  const extCy = ptToEmu(height);

  const rotAttr =
    rotation !== undefined && rotation !== 0
      ? ` rot="${degToOoxml(rotation)}"`
      : '';

  return (
    `<a:xfrm${rotAttr}>` +
    `<a:off x="${offX}" y="${offY}"/>` +
    `<a:ext cx="${extCx}" cy="${extCy}"/>` +
    `</a:xfrm>`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Fill Synthesis
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate fill XML from a Fill object.
 *
 * Supports solid fills, linear/radial gradients, and no-fill.
 * Returns empty string for null/undefined (inherit from parent).
 */
export function synthesizeFill(fill: Fill | null | undefined): string {
  if (fill === null || fill === undefined) {
    return '';
  }

  switch (fill.type) {
    case 'solid': {
      if (!fill.color) return '<a:noFill/>';
      const hex = colorToHex(fill.color);
      const alphaAttr =
        fill.color.a !== undefined && fill.color.a < 1
          ? `<a:alpha val="${Math.round(fill.color.a * 100000)}"/>`
          : '';
      return (
        `<a:solidFill>` +
        `<a:srgbClr val="${hex}"${alphaAttr ? '>' + alphaAttr + '</a:srgbClr>' : '/>'}` +
        `</a:solidFill>`
      );
    }

    case 'linear-gradient': {
      if (!fill.stops || fill.stops.length === 0) return '<a:noFill/>';
      const angle = fill.angle ?? 0;
      // OOXML gradient angle is in 60,000ths of a degree
      const angVal = degToOoxml(angle);
      let gsLst = '<a:gsLst>';
      for (const stop of fill.stops) {
        const pos = Math.round(stop.offset * 100000);
        const hex = colorToHex(stop.color);
        gsLst += `<a:gs pos="${pos}"><a:srgbClr val="${hex}"/></a:gs>`;
      }
      gsLst += '</a:gsLst>';
      return `<a:gradFill>${gsLst}<a:lin ang="${angVal}" scaled="1"/></a:gradFill>`;
    }

    case 'radial-gradient': {
      if (!fill.stops || fill.stops.length === 0) return '<a:noFill/>';
      let gsLst = '<a:gsLst>';
      for (const stop of fill.stops) {
        const pos = Math.round(stop.offset * 100000);
        const hex = colorToHex(stop.color);
        gsLst += `<a:gs pos="${pos}"><a:srgbClr val="${hex}"/></a:gs>`;
      }
      gsLst += '</a:gsLst>';
      return (
        `<a:gradFill>${gsLst}` +
        `<a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path>` +
        `</a:gradFill>`
      );
    }

    case 'pattern':
      // Pattern fills are rarely created from scratch; emit noFill
      return '<a:noFill/>';

    default:
      return '<a:noFill/>';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Line / Stroke Synthesis
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate line/stroke XML: `<a:ln>`.
 *
 * @param stroke - stroke properties (width in points, color as Color)
 * Returns empty string for null/undefined (no explicit line).
 */
export function synthesizeLine(stroke: Stroke | null | undefined): string {
  if (stroke === null || stroke === undefined) {
    return '';
  }

  // Width: points → EMU
  const widthEmu = ptToEmu(stroke.width);
  const hex = colorToHex(stroke.color);

  let attrs = `w="${widthEmu}"`;

  // Cap
  if (stroke.lineCap) {
    const capMap: Record<string, string> = {
      butt: 'flat',
      round: 'rnd',
      square: 'sq',
    };
    const ooxmlCap = capMap[stroke.lineCap] ?? 'flat';
    attrs += ` cap="${ooxmlCap}"`;
  }

  let inner = `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`;

  // Dash
  if (stroke.dashArray && stroke.dashArray.length > 0) {
    // Use custom dash pattern
    inner += '<a:custDash>';
    for (let i = 0; i < stroke.dashArray.length; i += 2) {
      const d = Math.round((stroke.dashArray[i] ?? 0) * 100000);
      const sp = Math.round((stroke.dashArray[i + 1] ?? 0) * 100000);
      inner += `<a:ds d="${d}" sp="${sp}"/>`;
    }
    inner += '</a:custDash>';
  }

  // Join
  if (stroke.lineJoin) {
    switch (stroke.lineJoin) {
      case 'round':
        inner += '<a:round/>';
        break;
      case 'bevel':
        inner += '<a:bevel/>';
        break;
      case 'miter':
        inner += '<a:miter lim="800000"/>';
        break;
    }
  }

  return `<a:ln ${attrs}>${inner}</a:ln>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Text Body Synthesis
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a single text run: `<a:r>` with `<a:rPr>` and `<a:t>`.
 */
function synthesizeRun(run: TextRun): string {
  // Character properties
  const attrs: string[] = [];

  if (run.fontSize) {
    attrs.push(`sz="${fontSizeToOoxml(run.fontSize)}"`);
  }
  if (run.bold) {
    attrs.push('b="1"');
  }
  if (run.italic) {
    attrs.push('i="1"');
  }
  if (run.underline) {
    attrs.push('u="sng"');
  }
  if (run.strikethrough) {
    attrs.push('strike="sngStrike"');
  }

  let rPrContent = '';
  if (run.color) {
    const hex = colorToHex(run.color);
    rPrContent += `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`;
  }
  if (run.fontFamily) {
    const escaped = escapeXml(run.fontFamily);
    rPrContent += `<a:latin typeface="${escaped}"/>`;
  }

  const rPr =
    attrs.length > 0 || rPrContent
      ? `<a:rPr lang="en-US" ${attrs.join(' ')}${rPrContent ? '>' + rPrContent + '</a:rPr>' : '/>'}`
      : '';

  return `<a:r>${rPr}<a:t>${escapeXml(run.text)}</a:t></a:r>`;
}

/**
 * Generate a paragraph: `<a:p>` with optional `<a:pPr>` and runs.
 */
function synthesizeParagraph(paragraph: Paragraph): string {
  let pPr = '';
  if (paragraph.align) {
    const alignMap: Record<string, string> = {
      left: 'l',
      center: 'ctr',
      right: 'r',
      justify: 'just',
    };
    const algn = alignMap[paragraph.align] ?? 'l';
    pPr = `<a:pPr algn="${algn}"/>`;
  }

  const runs = paragraph.runs.map((r) => synthesizeRun(r)).join('');

  return `<a:p>${pPr}${runs}</a:p>`;
}

/**
 * Generate text body XML: `<a:txBody>` with paragraphs and runs.
 *
 * Returns empty string if paragraphs is null/undefined/empty.
 */
export function synthesizeTextBody(
  paragraphs: Paragraph[] | null | undefined
): string {
  if (!paragraphs || paragraphs.length === 0) {
    return '';
  }

  const bodyPr = '<a:bodyPr wrap="square" rtlCol="0"/>';
  const lstStyle = '<a:lstStyle/>';
  const paras = paragraphs.map((p) => synthesizeParagraph(p)).join('');

  return `<a:txBody>${bodyPr}${lstStyle}${paras}</a:txBody>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Shape Synthesis
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate shape properties: `<p:spPr>` with transform, fill, line, geometry.
 */
function synthesizeShapeProperties(element: PageElement): string {
  const xfrm = synthesizeTransform(
    element.x,
    element.y,
    element.width,
    element.height,
    element.rotation || undefined
  );

  let fill = '';
  let line = '';
  let geom = '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';

  if (element.type === 'shape') {
    fill = synthesizeFill(element.fill);
    line = synthesizeLine(element.stroke);
    geom = `<a:prstGeom prst="${shapeTypeToPreset(element.shapeType)}"><a:avLst/></a:prstGeom>`;
  } else if (element.type === 'path') {
    fill = synthesizeFill(element.fill);
    line = synthesizeLine(element.stroke);
  }

  return `<p:spPr>${xfrm}${geom}${fill}${line}</p:spPr>`;
}

/**
 * Generate a complete `<p:sp>` element for a PresentationML slide.
 *
 * @param element - the PageElement to convert
 * @param shapeId - unique numeric shape ID (must be unique within the slide)
 */
export function synthesizeSlideShape(
  element: PageElement,
  shapeId: number
): string {
  const name = `Shape ${shapeId}`;

  // Non-visual properties
  const nvSpPr =
    `<p:nvSpPr>` +
    `<p:cNvPr id="${shapeId}" name="${escapeXml(name)}"/>` +
    `<p:cNvSpPr/>` +
    `<p:nvPr/>` +
    `</p:nvSpPr>`;

  // Shape properties
  const spPr = synthesizeShapeProperties(element);

  // Text body (for text elements and shapes that may have text)
  let txBody = '';
  if (element.type === 'text') {
    txBody = synthesizeTextBody(element.paragraphs);
  }

  // If no text body, emit an empty one (required by the schema for p:sp)
  if (!txBody) {
    txBody =
      '<a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></a:txBody>';
  }

  return `<p:sp>${nvSpPr}${spPr}${txBody}</p:sp>`;
}

/**
 * Generate a `<p:pic>` element for an image.
 *
 * @param element - ImageElement to convert
 * @param shapeId - unique numeric shape ID
 * @param rId - relationship ID for the image (e.g. "rId2")
 */
export function synthesizeSlidePicture(
  element: ImageElement,
  shapeId: number,
  rId: string
): string {
  const name = `Picture ${shapeId}`;

  const nvPicPr =
    `<p:nvPicPr>` +
    `<p:cNvPr id="${shapeId}" name="${escapeXml(name)}"/>` +
    `<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>` +
    `<p:nvPr/>` +
    `</p:nvPicPr>`;

  const blipFill =
    `<p:blipFill>` +
    `<a:blip r:embed="${escapeXml(rId)}"/>` +
    `<a:stretch><a:fillRect/></a:stretch>` +
    `</p:blipFill>`;

  const xfrm = synthesizeTransform(
    element.x,
    element.y,
    element.width,
    element.height,
    element.rotation || undefined
  );

  const spPr =
    `<p:spPr>` +
    xfrm +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `</p:spPr>`;

  return `<p:pic>${nvPicPr}${blipFill}${spPr}</p:pic>`;
}

/**
 * Generate a `<p:grpSp>` element for a group.
 *
 * @param element - GroupElement to convert
 * @param shapeId - unique numeric shape ID
 * @param childrenXml - pre-synthesized XML of child elements
 */
export function synthesizeSlideGroup(
  element: GroupElement,
  shapeId: number,
  childrenXml: string
): string {
  const name = `Group ${shapeId}`;

  const nvGrpSpPr =
    `<p:nvGrpSpPr>` +
    `<p:cNvPr id="${shapeId}" name="${escapeXml(name)}"/>` +
    `<p:cNvGrpSpPr/>` +
    `<p:nvPr/>` +
    `</p:nvGrpSpPr>`;

  const offX = ptToEmu(element.x);
  const offY = ptToEmu(element.y);
  const extCx = ptToEmu(element.width);
  const extCy = ptToEmu(element.height);

  const grpSpPr =
    `<p:grpSpPr>` +
    `<a:xfrm>` +
    `<a:off x="${offX}" y="${offY}"/>` +
    `<a:ext cx="${extCx}" cy="${extCy}"/>` +
    `<a:chOff x="${offX}" y="${offY}"/>` +
    `<a:chExt cx="${extCx}" cy="${extCy}"/>` +
    `</a:xfrm>` +
    `</p:grpSpPr>`;

  return `<p:grpSp>${nvGrpSpPr}${grpSpPr}${childrenXml}</p:grpSp>`;
}

/**
 * Top-level dispatcher: generate PresentationML XML from any PageElement.
 *
 * For image and group elements, use the specialized functions directly
 * to provide rId and children XML. This function handles shape and text
 * elements, and falls back to `<p:sp>` for other types.
 */
export function synthesizeShape(
  element: PageElement,
  shapeId: number = 1
): string {
  return synthesizeSlideShape(element, shapeId);
}
