/**
 * IR Re-derivation Engine.
 *
 * Derives a SlideElementIR from an EditableElement. Provides a fast path
 * for clean (unmodified) elements that returns originalIR directly with
 * zero allocation. Only dirty elements get a shallow copy with patched
 * fields.
 */

import type {
  SlideElementIR,
  TransformIR,
  DrawingMLShapeIR,
  ShapePropertiesIR,
  UnsupportedIR,
} from '../ir/index.js';
import type { EditableElement, EditableShape, DirtyFlags } from './editable-types.js';
import { deriveTextBodyIR } from './derive-ir-text.js';

/**
 * Derive a SlideElementIR from an EditableElement.
 *
 * Fast path: if the element is not dirty, returns originalIR directly
 * (zero allocation, zero copy). Only dirty elements get a shallow copy
 * with patched fields.
 *
 * @param editable - The mutable editable element
 * @returns A SlideElementIR suitable for rendering
 */
export function deriveIR(editable: EditableElement): SlideElementIR {
  // Deleted elements should not be rendered — return a minimal UnsupportedIR
  if (editable.deleted) {
    return {
      kind: 'unsupported',
      elementType: 'deleted',
      reason: 'Element was deleted',
    } satisfies UnsupportedIR;
  }

  // FAST PATH: no dirty flags -> return original IR unchanged (zero allocation)
  if (!hasDirtyFields(editable.dirty)) {
    return editable.originalIR;
  }

  // Slow path: create shallow copy with dirty fields patched
  switch (editable.kind) {
    case 'shape':
      return deriveShapeIR(editable);
    default:
      return deriveGenericIR(editable);
  }
}

/**
 * Check if any dirty flags are set.
 */
function hasDirtyFields(dirty: DirtyFlags): boolean {
  return !!(
    dirty.position ||
    dirty.size ||
    dirty.rotation ||
    dirty.text ||
    dirty.fill ||
    dirty.deleted
  );
}

/**
 * Derive IR for a shape element with edits applied.
 */
function deriveShapeIR(editable: EditableShape): DrawingMLShapeIR {
  const orig = editable.originalIR as DrawingMLShapeIR;
  const dirty = editable.dirty;

  // Start with shallow copy
  const ir: DrawingMLShapeIR = { ...orig };

  // Patch properties if transform or fill changed
  if (dirty.position || dirty.size || dirty.rotation || dirty.fill) {
    const origProps = orig.properties;
    const props: ShapePropertiesIR = { ...origProps };

    if (dirty.position || dirty.size || dirty.rotation) {
      props.transform = deriveTransform(editable);
    }

    if (dirty.fill && editable.fillOverride) {
      props.fill = editable.fillOverride;
    }

    ir.properties = props;
  }

  // Patch text body if text changed
  if (dirty.text && editable.textEdits) {
    ir.textBody = deriveTextBodyIR(editable);
  }

  return ir;
}

/**
 * Derive TransformIR from the editable transform.
 */
function deriveTransform(editable: EditableElement): TransformIR {
  const t = editable.transform;
  return {
    position: { x: t.x, y: t.y },
    size: { width: t.width, height: t.height },
    rotation: t.rotation,
    flipH: t.flipH,
    flipV: t.flipV,
  };
}

/**
 * Derive IR for non-shape elements (picture, group, connector, table, etc.)
 * that only have transform changes.
 */
function deriveGenericIR(editable: EditableElement): SlideElementIR {
  const orig = editable.originalIR;
  const dirty = editable.dirty;

  if (dirty.position || dirty.size || dirty.rotation) {
    // All non-unsupported element types have properties.transform
    if ('properties' in orig && orig.properties) {
      const ir = { ...orig };
      ir.properties = { ...orig.properties, transform: deriveTransform(editable) };
      return ir;
    }
  }

  return orig;
}
