/**
 * PPTX→Elements bridge.
 *
 * Converts PPTX SlideElementIR objects into the unified PageElement model
 * from @opendockit/elements. This enables the format-agnostic interaction
 * layer to work with PPTX elements using the same APIs as PDF elements.
 *
 * Conversion notes:
 * - Coordinates: EMU → points (1 pt = 12,700 EMU)
 * - Rotation: TransformIR stores degrees; PptxSource.rot stores 60,000ths of a degree
 * - Source: original EMU values are preserved losslessly in PptxSource for write-back
 * - Direction: one-way only (PPTX IR → PageElement). Reverse mapping (for saving)
 *   is out of scope for this bridge — it belongs in Wave 3.
 */

import type {
  SlideElementIR,
  TransformIR,
  DrawingMLShapeIR,
  PictureIR,
  GroupIR,
  TableIR,
  ConnectorIR,
  TextBodyIR,
  ParagraphIR,
} from '@opendockit/core';
import type {
  PageElement,
  TextElement,
  ShapeElement,
  ImageElement,
  GroupElement,
  PptxSource,
  Paragraph,
  Fill,
  Stroke,
  Color,
} from '@opendockit/elements';

// ─── EMU conversion ──────────────────────────────────────────────────────────

/** 1 typographic point = 12,700 EMU. */
const EMU_PER_PT = 12700;

/** Convert EMU integer to typographic points. */
function emuToPt(emu: number): number {
  return emu / EMU_PER_PT;
}

/** Convert rotation degrees to OOXML 60,000ths-of-a-degree. */
function degreesToOoxml60k(degrees: number): number {
  return Math.round(degrees * 60000);
}

// ─── Fractional index helper ─────────────────────────────────────────────────

/**
 * Generate a simple fractional index string from a numeric index.
 * Format: "a<4-digit-hex>" — stable, sortable, z-order preserving.
 */
function indexFromPosition(position: number): string {
  const hex = position.toString(16).padStart(4, '0');
  return `a${hex}`;
}

// ─── Source bag builder ──────────────────────────────────────────────────────

function buildPptxSource(
  transform: TransformIR,
  passthrough: Record<string, unknown>,
): PptxSource {
  return {
    format: 'pptx',
    offX: transform.position.x,
    offY: transform.position.y,
    extCx: transform.size.width,
    extCy: transform.size.height,
    rot: degreesToOoxml60k(transform.rotation ?? 0),
    passthrough,
  };
}

// ─── Color conversion ────────────────────────────────────────────────────────

/**
 * Convert a ResolvedColor (r/g/b in 0-255, a in 0-1) to the elements Color type.
 * ResolvedColor is already in 0-255 for RGB channels.
 */
function resolvedColorToColor(rc: { r: number; g: number; b: number; a?: number }): Color {
  return {
    r: Math.round(rc.r),
    g: Math.round(rc.g),
    b: Math.round(rc.b),
    a: rc.a,
  };
}

// ─── Text conversion helpers ─────────────────────────────────────────────────

function convertParagraph(para: ParagraphIR): Paragraph {
  const runs = para.runs
    .filter((r): r is Extract<typeof r, { kind: 'run' }> => r.kind === 'run')
    .map((run) => {
      const fontSize =
        run.properties.fontSize !== undefined ? run.properties.fontSize / 100 : 12;

      const color: Color = run.properties.color
        ? resolvedColorToColor(run.properties.color)
        : { r: 0, g: 0, b: 0 };

      return {
        text: run.text,
        fontFamily: run.properties.fontFamily ?? run.properties.latin ?? 'sans-serif',
        fontSize,
        bold: run.properties.bold,
        italic: run.properties.italic,
        underline: run.properties.underline !== undefined && run.properties.underline !== 'none',
        strikethrough:
          run.properties.strikethrough !== undefined &&
          run.properties.strikethrough !== 'none',
        color,
        // Position fields — not available from IR alone; set to 0 (layout engine fills these)
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      };
    });

  const align = para.properties.alignment;
  return {
    runs,
    align: align === 'justify' || align === 'distributed' ? 'justify' : align,
  };
}

function hasVisibleText(textBody: TextBodyIR): boolean {
  for (const para of textBody.paragraphs) {
    for (const run of para.runs) {
      if (run.kind === 'run' && run.text.trim().length > 0) {
        return true;
      }
    }
  }
  return false;
}

// ─── Fill / Stroke extraction ────────────────────────────────────────────────

function extractFill(properties: DrawingMLShapeIR['properties']): Fill | null {
  const fill = properties.fill;
  if (!fill || fill.type === 'none') return null;
  if (fill.type === 'solid') {
    return {
      type: 'solid',
      color: resolvedColorToColor(fill.color),
    };
  }
  if (fill.type === 'gradient') {
    const stops = fill.stops.map((s) => ({
      offset: s.position,
      color: resolvedColorToColor(s.color),
    }));
    return {
      type: fill.kind === 'radial' ? 'radial-gradient' : 'linear-gradient',
      stops,
      angle: fill.angle,
    };
  }
  // pattern, picture fills — represented as opaque shape (no fill mapping)
  return null;
}

function extractStroke(properties: DrawingMLShapeIR['properties']): Stroke | null {
  const line = properties.line;
  if (!line || line.color === undefined) return null;
  return {
    color: resolvedColorToColor(line.color),
    width: line.width !== undefined ? emuToPt(line.width) : 1,
  };
}

// ─── Shape geometry detection ────────────────────────────────────────────────

function extractShapeType(shape: DrawingMLShapeIR): string {
  const geom = shape.properties.geometry;
  if (!geom) return 'rectangle';
  if (geom.kind === 'preset') {
    const name = geom.name;
    if (name === 'ellipse' || name === 'oval') return 'ellipse';
    if (name === 'triangle' || name === 'rightTriangle' || name === 'isoscelesTri')
      return 'triangle';
    if (name === 'diamond') return 'diamond';
    if (name === 'rect' || name === 'rectangle') return 'rectangle';
    return name; // pass through custom preset names
  }
  return 'custom';
}

// ─── Element converters ──────────────────────────────────────────────────────

function convertShape(
  element: DrawingMLShapeIR,
  index: number,
  parentId: string | null,
): PageElement {
  const transform = element.properties.transform;
  if (!transform) {
    // Shapes without transforms are unsupported — return a zero-size shape
    return {
      id: element.id ?? `shape-${index}`,
      type: 'shape',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      rotation: 0,
      opacity: 1,
      index: indexFromPosition(index),
      parentId,
      locked: false,
      shapeType: 'rectangle',
      fill: null,
      stroke: null,
      source: { format: 'pptx', offX: 0, offY: 0, extCx: 0, extCy: 0, rot: 0 },
    } satisfies ShapeElement;
  }

  const x = emuToPt(transform.position.x);
  const y = emuToPt(transform.position.y);
  const width = emuToPt(transform.size.width);
  const height = emuToPt(transform.size.height);
  const rotation = transform.rotation ?? 0;
  const source = buildPptxSource(transform, {
    kind: element.kind,
    id: element.id,
    name: element.name,
    placeholderType: element.placeholderType,
  });

  // If shape has a non-empty text body, prefer TextElement for richer interaction
  if (element.textBody && hasVisibleText(element.textBody)) {
    const paragraphs = element.textBody.paragraphs.map(convertParagraph);
    return {
      id: element.id ?? `shape-${index}`,
      type: 'text',
      x,
      y,
      width,
      height,
      rotation,
      opacity: 1,
      index: indexFromPosition(index),
      parentId,
      locked: false,
      paragraphs,
      source,
    } satisfies TextElement;
  }

  // Pure visual shape (no text, or only empty text)
  return {
    id: element.id ?? `shape-${index}`,
    type: 'shape',
    x,
    y,
    width,
    height,
    rotation,
    opacity: 1,
    index: indexFromPosition(index),
    parentId,
    locked: false,
    shapeType: extractShapeType(element),
    fill: extractFill(element.properties),
    stroke: extractStroke(element.properties),
    source,
  } satisfies ShapeElement;
}

function convertPicture(
  element: PictureIR,
  index: number,
  parentId: string | null,
): ImageElement {
  const transform = element.properties.transform;
  const x = transform ? emuToPt(transform.position.x) : 0;
  const y = transform ? emuToPt(transform.position.y) : 0;
  const width = transform ? emuToPt(transform.size.width) : 0;
  const height = transform ? emuToPt(transform.size.height) : 0;
  const rotation = transform?.rotation ?? 0;

  const source: PptxSource = transform
    ? buildPptxSource(transform, {
        kind: element.kind,
        imagePartUri: element.imagePartUri,
        name: element.nonVisualProperties.name,
      })
    : {
        format: 'pptx',
        offX: 0,
        offY: 0,
        extCx: 0,
        extCy: 0,
        rot: 0,
        passthrough: {
          kind: element.kind,
          imagePartUri: element.imagePartUri,
        },
      };

  return {
    id: element.nonVisualProperties.name ?? `picture-${index}`,
    type: 'image',
    x,
    y,
    width,
    height,
    rotation,
    opacity: 1,
    index: indexFromPosition(index),
    parentId,
    locked: false,
    imageRef: element.imagePartUri,
    mimeType: 'image/*',
    objectFit: element.blipFill?.stretch === false ? 'contain' : 'fill',
    source,
  };
}

function convertGroup(
  element: GroupIR,
  index: number,
  parentId: string | null,
): GroupElement {
  const transform = element.properties.transform;
  const x = transform ? emuToPt(transform.position.x) : 0;
  const y = transform ? emuToPt(transform.position.y) : 0;
  const width = transform ? emuToPt(transform.size.width) : 0;
  const height = transform ? emuToPt(transform.size.height) : 0;
  const rotation = transform?.rotation ?? 0;

  const groupId = `group-${index}`;
  const source: PptxSource = transform
    ? buildPptxSource(transform, {
        kind: element.kind,
        childOffset: element.childOffset,
        childExtent: element.childExtent,
      })
    : {
        format: 'pptx',
        offX: 0,
        offY: 0,
        extCx: 0,
        extCy: 0,
        rot: 0,
        passthrough: { kind: element.kind },
      };

  // Build child IDs from recursive child conversion
  const childIds = element.children.map((child, childIndex) => {
    return getElementId(child, childIndex);
  });

  return {
    id: groupId,
    type: 'group',
    x,
    y,
    width,
    height,
    rotation,
    opacity: 1,
    index: indexFromPosition(index),
    parentId,
    locked: false,
    childIds,
    source,
  };
}

function convertTable(element: TableIR, index: number, parentId: string | null): ShapeElement {
  const transform = element.properties.transform;
  const x = transform ? emuToPt(transform.position.x) : 0;
  const y = transform ? emuToPt(transform.position.y) : 0;
  const width = transform ? emuToPt(transform.size.width) : 0;
  const height = transform ? emuToPt(transform.size.height) : 0;
  const rotation = transform?.rotation ?? 0;

  const source: PptxSource = transform
    ? buildPptxSource(transform, {
        kind: element.kind,
        tableStyle: element.tableStyle,
        rowCount: element.rows.length,
      })
    : {
        format: 'pptx',
        offX: 0,
        offY: 0,
        extCx: 0,
        extCy: 0,
        rot: 0,
        passthrough: { kind: element.kind },
      };

  return {
    id: `table-${index}`,
    type: 'shape',
    x,
    y,
    width,
    height,
    rotation,
    opacity: 1,
    index: indexFromPosition(index),
    parentId,
    locked: false,
    shapeType: 'rectangle',
    fill: null,
    stroke: null,
    source,
  };
}

function convertConnector(
  element: ConnectorIR,
  index: number,
  parentId: string | null,
): ShapeElement {
  const transform = element.properties.transform;
  const x = transform ? emuToPt(transform.position.x) : 0;
  const y = transform ? emuToPt(transform.position.y) : 0;
  const width = transform ? emuToPt(transform.size.width) : 0;
  const height = transform ? emuToPt(transform.size.height) : 0;
  const rotation = transform?.rotation ?? 0;

  const source: PptxSource = transform
    ? buildPptxSource(transform, {
        kind: element.kind,
        startConnection: element.startConnection,
        endConnection: element.endConnection,
      })
    : {
        format: 'pptx',
        offX: 0,
        offY: 0,
        extCx: 0,
        extCy: 0,
        rot: 0,
        passthrough: { kind: element.kind },
      };

  return {
    id: `connector-${index}`,
    type: 'shape',
    x,
    y,
    width,
    height,
    rotation,
    opacity: 1,
    index: indexFromPosition(index),
    parentId,
    locked: false,
    shapeType: 'connector',
    fill: null,
    stroke: extractStroke(element.properties),
    source,
  };
}

// ─── ID extraction helper ────────────────────────────────────────────────────

/**
 * Get a stable ID for an element to populate GroupElement.childIds.
 * Mirrors the logic in each converter so IDs are consistent.
 */
function getElementId(element: SlideElementIR, index: number): string {
  switch (element.kind) {
    case 'shape':
      return element.id ?? `shape-${index}`;
    case 'picture':
      return element.nonVisualProperties.name ?? `picture-${index}`;
    case 'group':
      return `group-${index}`;
    case 'table':
      return `table-${index}`;
    case 'connector':
      return `connector-${index}`;
    case 'chart':
      return `chart-${index}`;
    case 'unsupported':
      return `unsupported-${index}`;
  }
}

// ─── Main converter ──────────────────────────────────────────────────────────

function convertElement(
  element: SlideElementIR,
  index: number,
  parentId: string | null = null,
): PageElement | null {
  switch (element.kind) {
    case 'shape':
      return convertShape(element, index, parentId);
    case 'picture':
      return convertPicture(element, index, parentId);
    case 'group':
      return convertGroup(element, index, parentId);
    case 'table':
      return convertTable(element, index, parentId);
    case 'connector':
      return convertConnector(element, index, parentId);
    case 'chart':
    case 'unsupported':
      // Charts and unsupported elements are skipped (no meaningful element model)
      return null;
  }
}

/**
 * Recursively flatten a group and its children into the flat elements array.
 * GroupElement uses childIds; the actual child elements appear in the flat list.
 */
function flattenGroup(
  group: GroupIR,
  groupIndex: number,
  parentId: string | null,
  out: PageElement[],
): void {
  const groupElement = convertGroup(group, groupIndex, parentId);
  out.push(groupElement);

  group.children.forEach((child, childIndex) => {
    if (child.kind === 'group') {
      flattenGroup(child, childIndex, groupElement.id, out);
    } else {
      const converted = convertElement(child, childIndex, groupElement.id);
      if (converted !== null) {
        out.push(converted);
      }
    }
  });
}

/**
 * Convert a PPTX slide's element IR to a flat list of unified PageElements.
 *
 * The result is z-ordered (back to front, matching IR order). Group elements
 * appear before their children in the flat list so that the interaction layer
 * can reconstruct the hierarchy via `childIds`.
 *
 * @param elements   - The slide's SlideElementIR array (from SlideIR.elements)
 * @param slideWidth  - Slide width in EMU (used for context; not currently needed for conversion)
 * @param slideHeight - Slide height in EMU
 */
export function slideElementsToPageElements(
  elements: SlideElementIR[],
  _slideWidth: number,
  _slideHeight: number,
): PageElement[] {
  const out: PageElement[] = [];

  elements.forEach((element, index) => {
    if (element.kind === 'group') {
      flattenGroup(element, index, null, out);
    } else {
      const converted = convertElement(element, index, null);
      if (converted !== null) {
        out.push(converted);
      }
    }
  });

  return out;
}
