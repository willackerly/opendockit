/**
 * Shape tree parser adapter for PPTX.
 *
 * Parses `p:spTree` children into {@link SlideElementIR} arrays using
 * the core DrawingML parsers. This module provides the bridge between
 * PresentationML structure and DrawingML shape parsing.
 *
 * This adapter exists because the core `@opendockit/core/drawingml`
 * sub-path export is not yet wired up. Once it is, this module can
 * be replaced with a direct import of `parseShapeTreeChildren`.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 19.3.1.22 (spTree)
 */

import type { XmlElement, ThemeIR, SlideElementIR, DrawingMLShapeIR } from '@opendockit/core';
import { parseIntAttr } from '@opendockit/core';

/**
 * Parse a shape tree's children into a {@link SlideElementIR} array.
 *
 * Handles p:sp (shape), p:pic (picture), p:grpSp (group), p:cxnSp
 * (connector), and p:graphicFrame (unsupported placeholder).
 *
 * @param containerElement - The `p:spTree` or `p:grpSp` XML element.
 * @param theme - The resolved theme for style lookups.
 * @returns Flat array of slide elements in z-order.
 */
export function parseShapeTreeChildren(
  containerElement: XmlElement,
  theme: ThemeIR
): SlideElementIR[] {
  const elements: SlideElementIR[] = [];

  // Tags that are structural metadata, not slide elements
  const skipTags = new Set(['p:nvGrpSpPr', 'p:grpSpPr', 'p:extLst']);

  for (const child of containerElement.children) {
    if (skipTags.has(child.name)) {
      continue;
    }

    if (child.is('p:sp')) {
      elements.push(parseShape(child, theme));
    } else if (child.is('p:pic')) {
      elements.push(parsePicture(child));
    } else if (child.is('p:grpSp')) {
      elements.push(parseGroup(child, theme));
    } else if (child.is('p:cxnSp')) {
      elements.push(parseConnector(child));
    } else if (child.is('p:graphicFrame')) {
      elements.push({
        kind: 'unsupported',
        elementType: 'p:graphicFrame',
        reason: 'Graphic frame content (table/chart/SmartArt) not yet supported',
      });
    }
  }

  return elements;
}

// ---------------------------------------------------------------------------
// Shape parsing (p:sp)
// ---------------------------------------------------------------------------

function parseShape(spElement: XmlElement, _theme: ThemeIR): DrawingMLShapeIR {
  const nvSpPr = spElement.child('p:nvSpPr');
  const cNvPr = nvSpPr?.child('p:cNvPr');

  const shape: DrawingMLShapeIR = {
    kind: 'shape',
    properties: parseShapePropertiesBasic(spElement),
  };

  const id = cNvPr?.attr('id');
  if (id !== undefined) {
    shape.id = id;
  }

  const name = cNvPr?.attr('name');
  if (name !== undefined) {
    shape.name = name;
  }

  // Placeholder type and index
  const nvPr = nvSpPr?.child('p:nvPr');
  const ph = nvPr?.child('p:ph');
  if (ph) {
    const phType = ph.attr('type');
    if (phType !== undefined) {
      shape.placeholderType = phType;
    }
    const phIdx = parseIntAttr(ph, 'idx');
    if (phIdx !== undefined) {
      shape.placeholderIndex = phIdx;
    }
  }

  return shape;
}

// ---------------------------------------------------------------------------
// Picture parsing (p:pic)
// ---------------------------------------------------------------------------

function parsePicture(picElement: XmlElement): SlideElementIR {
  const nvPicPr = picElement.child('p:nvPicPr');
  const cNvPr = nvPicPr?.child('p:cNvPr');
  const blipFill = picElement.child('p:blipFill');
  const blip = blipFill?.child('a:blip');
  const embed = blip?.attr('r:embed') ?? '';

  return {
    kind: 'picture',
    imagePartUri: embed,
    properties: parseShapePropertiesBasic(picElement),
    nonVisualProperties: {
      name: cNvPr?.attr('name') ?? '',
      description: cNvPr?.attr('descr'),
    },
  };
}

// ---------------------------------------------------------------------------
// Group parsing (p:grpSp)
// ---------------------------------------------------------------------------

function parseGroup(grpSpElement: XmlElement, theme: ThemeIR): SlideElementIR {
  const grpSpPr = grpSpElement.child('p:grpSpPr');
  const xfrm = grpSpPr?.child('a:xfrm');

  const offEl = xfrm?.child('a:off');
  const extEl = xfrm?.child('a:ext');
  const chOffEl = xfrm?.child('a:chOff');
  const chExtEl = xfrm?.child('a:chExt');

  const children = parseShapeTreeChildren(grpSpElement, theme);

  return {
    kind: 'group',
    properties: {
      transform: {
        position: {
          x: parseInt(offEl?.attr('x') ?? '0', 10),
          y: parseInt(offEl?.attr('y') ?? '0', 10),
        },
        size: {
          width: parseInt(extEl?.attr('cx') ?? '0', 10),
          height: parseInt(extEl?.attr('cy') ?? '0', 10),
        },
      },
      effects: [],
    },
    childOffset: {
      x: parseInt(chOffEl?.attr('x') ?? '0', 10),
      y: parseInt(chOffEl?.attr('y') ?? '0', 10),
    },
    childExtent: {
      width: parseInt(chExtEl?.attr('cx') ?? '0', 10),
      height: parseInt(chExtEl?.attr('cy') ?? '0', 10),
    },
    children,
  };
}

// ---------------------------------------------------------------------------
// Connector parsing (p:cxnSp)
// ---------------------------------------------------------------------------

function parseConnector(cxnSpElement: XmlElement): SlideElementIR {
  const connector: import('@opendockit/core').ConnectorIR = {
    kind: 'connector',
    properties: parseShapePropertiesBasic(cxnSpElement),
  };

  // Extract connection endpoint references from non-visual connector properties.
  // Structure: p:cxnSp / p:nvCxnSpPr / p:cNvCxnSpPr / { a:stCxn, a:endCxn }
  const nvCxnSpPr = cxnSpElement.child('p:nvCxnSpPr');
  const cNvCxnSpPr = nvCxnSpPr?.child('p:cNvCxnSpPr');

  if (cNvCxnSpPr) {
    const stCxn = cNvCxnSpPr.child('a:stCxn');
    if (stCxn) {
      const stId = stCxn.attr('id');
      const stIdx = parseIntAttr(stCxn, 'idx');
      if (stId !== undefined && stIdx !== undefined) {
        connector.startConnection = {
          shapeId: stId,
          connectionSiteIndex: stIdx,
        };
      }
    }

    const endCxn = cNvCxnSpPr.child('a:endCxn');
    if (endCxn) {
      const endId = endCxn.attr('id');
      const endIdx = parseIntAttr(endCxn, 'idx');
      if (endId !== undefined && endIdx !== undefined) {
        connector.endConnection = {
          shapeId: endId,
          connectionSiteIndex: endIdx,
        };
      }
    }
  }

  return connector;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Parse basic shape properties (transform only) from an element.
 *
 * This is a simplified version that extracts just the transform.
 * Full property parsing (fill, line, effects, geometry) is handled
 * by the core DrawingML parsers when the drawingml sub-path export
 * is available.
 */
function parseShapePropertiesBasic(
  parentElement: XmlElement
): import('@opendockit/core').ShapePropertiesIR {
  const spPr = parentElement.child('p:spPr') ?? parentElement.child('p:grpSpPr');

  const xfrm = spPr?.child('a:xfrm');
  const offEl = xfrm?.child('a:off');
  const extEl = xfrm?.child('a:ext');

  const prstGeom = spPr?.child('a:prstGeom');
  const geometryName = prstGeom?.attr('prst');

  return {
    transform: xfrm
      ? {
          position: {
            x: parseInt(offEl?.attr('x') ?? '0', 10),
            y: parseInt(offEl?.attr('y') ?? '0', 10),
          },
          size: {
            width: parseInt(extEl?.attr('cx') ?? '0', 10),
            height: parseInt(extEl?.attr('cy') ?? '0', 10),
          },
          rotation: xfrm.attr('rot') ? parseInt(xfrm.attr('rot')!, 10) / 60000 : undefined,
          flipH: xfrm.attr('flipH') === '1' || xfrm.attr('flipH') === 'true',
          flipV: xfrm.attr('flipV') === '1' || xfrm.attr('flipV') === 'true',
        }
      : undefined,
    effects: [],
    geometry: geometryName ? { kind: 'preset', name: geometryName } : undefined,
  };
}
