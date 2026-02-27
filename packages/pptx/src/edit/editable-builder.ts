/**
 * Editable builder — constructs an EditablePresentation from parsed PPTX data.
 *
 * Takes parsed slide IRs and the raw OPC package, extracts the original
 * XML for each slide part, and builds the mutable model with element
 * transforms and dirty tracking.
 */

import type { SlideElementIR, DrawingMLShapeIR, PictureIR, GroupIR } from '@opendockit/core';
import type {
  EditableElement,
  EditableShape,
  EditablePicture,
  EditableGroup,
  EditableConnector,
  EditableTable,
  EditableGeneric,
  EditableTransform,
  EditableSlide,
} from '@opendockit/core';
import { EditablePresentation, makeElementId } from '@opendockit/core';
import type { OpcPackage } from '@opendockit/core/opc';
import type { SlideIR } from '../model/index.js';

/**
 * Build an EditablePresentation from parsed slide data and raw OPC parts.
 *
 * @param slides - Array of parsed slide IRs with their part URIs.
 * @param pkg - The opened OPC package (for reading raw XML).
 * @returns A mutable EditablePresentation ready for editing.
 */
export async function buildEditablePresentation(
  slides: Array<{ ir: SlideIR; partUri: string }>,
  pkg: OpcPackage
): Promise<EditablePresentation> {
  const editableSlides: EditableSlide[] = [];
  const originalPartXml = new Map<string, string>();

  for (let i = 0; i < slides.length; i++) {
    const { ir, partUri } = slides[i];
    const xml = await pkg.getPartText(partUri);
    originalPartXml.set(partUri, xml);

    const elements = ir.elements.map((el) => buildEditableElement(el, partUri));

    editableSlides.push({
      index: i,
      partUri,
      elements,
    });
  }

  return new EditablePresentation(editableSlides, originalPartXml);
}

/**
 * Convert a read-only SlideElementIR into a mutable EditableElement.
 */
function buildEditableElement(ir: SlideElementIR, partUri: string): EditableElement {
  const shapeId = getShapeId(ir);
  const id = makeElementId(partUri, shapeId);
  const transform = extractTransform(ir);

  const base = {
    id,
    originalIR: Object.freeze(ir) as Readonly<SlideElementIR>,
    originalPartUri: partUri,
    dirty: {},
    transform,
    deleted: false,
  };

  switch (ir.kind) {
    case 'shape':
      return { ...base, kind: 'shape' as const } as EditableShape;
    case 'picture':
      return { ...base, kind: 'picture' as const } as EditablePicture;
    case 'group': {
      const groupIR = ir as GroupIR;
      const children = (groupIR.children ?? []).map((child: SlideElementIR) =>
        buildEditableElement(child, partUri)
      );
      return { ...base, kind: 'group' as const, children } as EditableGroup;
    }
    case 'connector':
      return { ...base, kind: 'connector' as const } as EditableConnector;
    case 'table':
      return { ...base, kind: 'table' as const } as EditableTable;
    default:
      return { ...base, kind: ir.kind } as EditableGeneric;
  }
}

/**
 * Extract a stable shape ID from an IR element.
 *
 * Shape types use these identifiers:
 * - DrawingMLShapeIR: `id` field (from cNvPr), then `name`
 * - PictureIR: `nonVisualProperties.name`
 * - Others: fall back to kind + random suffix
 */
function getShapeId(ir: SlideElementIR): string {
  switch (ir.kind) {
    case 'shape': {
      const shape = ir as DrawingMLShapeIR;
      if (shape.id != null) return String(shape.id);
      if (shape.name != null) return shape.name;
      break;
    }
    case 'picture': {
      const pic = ir as PictureIR;
      if (pic.nonVisualProperties?.name) return pic.nonVisualProperties.name;
      break;
    }
  }

  // For types without explicit IDs, generate a deterministic-ish ID
  // from their kind and position (if available)
  const props =
    'properties' in ir
      ? (ir as { properties: { transform?: { position?: { x: number; y: number } } } }).properties
      : undefined;
  const t = props?.transform;
  if (t?.position) {
    return `${ir.kind}-${t.position.x}-${t.position.y}`;
  }

  return `${ir.kind}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Extract mutable transform from an IR element's properties.
 */
function extractTransform(ir: SlideElementIR): EditableTransform {
  if ('properties' in ir) {
    const props = (
      ir as {
        properties: {
          transform?: {
            position?: { x: number; y: number };
            size?: { width: number; height: number };
            rotation?: number;
            flipH?: boolean;
            flipV?: boolean;
          };
        };
      }
    ).properties;
    const t = props?.transform;
    if (t) {
      return {
        x: t.position?.x ?? 0,
        y: t.position?.y ?? 0,
        width: t.size?.width ?? 0,
        height: t.size?.height ?? 0,
        rotation: t.rotation,
        flipH: t.flipH,
        flipV: t.flipV,
      };
    }
  }
  return { x: 0, y: 0, width: 0, height: 0 };
}
