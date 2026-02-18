/**
 * Group and shape tree parser for DrawingML.
 *
 * Parses `p:grpSp` (group shapes) and dispatches shape tree children
 * into typed {@link SlideElementIR} values. Handles recursion for nested
 * groups.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 19.3.1.22 (grpSp)
 */

import type { XmlElement } from '../../xml/index.js';
import type {
  ThemeIR,
  GroupIR,
  SlideElementIR,
  DrawingMLShapeIR,
  ConnectorIR,
  UnsupportedIR,
  ConnectionReference,
} from '../../ir/index.js';
import type { ColorContext } from '../../theme/index.js';
import { parseIntAttr } from '../../xml/index.js';
import { parseShapePropertiesFromParent } from './shape-properties.js';
import { parseTextBodyFromParent } from './text-body.js';
import { parsePicture } from './picture.js';
import { parseGroupTransform } from './transform.js';
import { parseStyleReference } from './style-reference.js';
import { parseHyperlink } from './run.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a group shape element (`p:grpSp`).
 *
 * Extracts the group transform (including child coordinate space),
 * group shape properties, and recursively parses child elements.
 *
 * ```xml
 * <p:grpSp>
 *   <p:nvGrpSpPr>
 *     <p:cNvPr id="2" name="Group 1"/>
 *     <p:cNvGrpSpPr/>
 *     <p:nvPr/>
 *   </p:nvGrpSpPr>
 *   <p:grpSpPr>
 *     <a:xfrm>
 *       <a:off x="0" y="0"/>
 *       <a:ext cx="9144000" cy="6858000"/>
 *       <a:chOff x="0" y="0"/>
 *       <a:chExt cx="9144000" cy="6858000"/>
 *     </a:xfrm>
 *   </p:grpSpPr>
 *   <p:sp>...</p:sp>
 *   <p:pic>...</p:pic>
 * </p:grpSp>
 * ```
 */
export function parseGroup(
  grpSpElement: XmlElement,
  theme: ThemeIR,
  context?: ColorContext
): GroupIR {
  // Parse group shape properties (p:grpSpPr contains a:xfrm with child coords)
  const grpSpPr = grpSpElement.child('p:grpSpPr');

  // Parse group transform to get child coordinate space
  const xfrmEl = grpSpPr?.child('a:xfrm');
  const groupTransform = xfrmEl ? parseGroupTransform(xfrmEl) : undefined;

  // Build properties from the group shape properties element
  const properties = parseShapePropertiesFromParent(grpSpElement, theme, context);

  // Override transform if group transform was parsed
  if (groupTransform) {
    properties.transform = groupTransform.transform;
  }

  const childOffset = groupTransform?.childOffset ?? { x: 0, y: 0 };
  const childExtent = groupTransform?.childExtent ?? { width: 0, height: 0 };

  // Recursively parse children
  const children = parseShapeTreeChildren(grpSpElement, theme, context);

  return {
    kind: 'group',
    properties,
    childOffset,
    childExtent,
    children,
  };
}

/**
 * Parse a shape tree's children into a {@link SlideElementIR} array.
 *
 * Handles:
 * - `p:sp` — shape ({@link DrawingMLShapeIR})
 * - `p:pic` — picture ({@link PictureIR})
 * - `p:grpSp` — group (recursive, {@link GroupIR})
 * - `p:cxnSp` — connector ({@link ConnectorIR})
 * - `p:graphicFrame` — table/chart (currently unsupported)
 * - Other — {@link UnsupportedIR} with element name and reason
 *
 * Skips non-visual property containers (`p:nvGrpSpPr`, `p:grpSpPr`,
 * `p:nvSpPr`, etc.) that are not slide elements.
 */
export function parseShapeTreeChildren(
  containerElement: XmlElement,
  theme: ThemeIR,
  context?: ColorContext
): SlideElementIR[] {
  const elements: SlideElementIR[] = [];

  // Tags that are structural metadata, not slide elements
  const skipTags = new Set(['p:nvGrpSpPr', 'p:grpSpPr', 'p:extLst']);

  for (const child of containerElement.children) {
    if (skipTags.has(child.name)) {
      continue;
    }

    if (child.is('p:sp')) {
      elements.push(parseShape(child, theme, context));
    } else if (child.is('p:pic')) {
      elements.push(parsePicture(child, theme, context));
    } else if (child.is('p:grpSp')) {
      elements.push(parseGroup(child, theme, context));
    } else if (child.is('p:cxnSp')) {
      elements.push(parseConnector(child, theme, context));
    } else if (child.is('p:graphicFrame')) {
      elements.push(parseGraphicFrameAsUnsupported(child));
    }
    // Silently skip unknown metadata elements
  }

  return elements;
}

// ---------------------------------------------------------------------------
// Shape parsing (p:sp)
// ---------------------------------------------------------------------------

/**
 * Parse a standard shape element (`p:sp`) into {@link DrawingMLShapeIR}.
 *
 * ```xml
 * <p:sp>
 *   <p:nvSpPr>
 *     <p:cNvPr id="3" name="Title 1"/>
 *     <p:cNvSpPr/>
 *     <p:nvPr>
 *       <p:ph type="title"/>
 *     </p:nvPr>
 *   </p:nvSpPr>
 *   <p:spPr>...</p:spPr>
 *   <p:txBody>...</p:txBody>
 * </p:sp>
 * ```
 */
function parseShape(
  spElement: XmlElement,
  theme: ThemeIR,
  context?: ColorContext
): DrawingMLShapeIR {
  const nvSpPr = spElement.child('p:nvSpPr');
  const cNvPr = nvSpPr?.child('p:cNvPr');

  const properties = parseShapePropertiesFromParent(spElement, theme, context);
  const textBody = parseTextBodyFromParent(spElement, theme, context);
  const style = parseStyleReference(spElement, theme);

  const shape: DrawingMLShapeIR = {
    kind: 'shape',
    properties,
  };

  // Style references (p:style)
  if (style !== undefined) {
    shape.style = style;
  }

  // Non-visual properties
  const id = cNvPr?.attr('id');
  if (id !== undefined) {
    shape.id = id;
  }

  const name = cNvPr?.attr('name');
  if (name !== undefined) {
    shape.name = name;
  }

  // Text body
  if (textBody !== undefined) {
    shape.textBody = textBody;
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

  // Shape-level hyperlink from p:cNvPr/a:hlinkClick
  if (cNvPr) {
    const hyperlink = parseHyperlink(cNvPr);
    if (hyperlink) {
      shape.hyperlink = hyperlink;
    }
  }

  return shape;
}

// ---------------------------------------------------------------------------
// Connector parsing (p:cxnSp)
// ---------------------------------------------------------------------------

/**
 * Parse a connector shape element (`p:cxnSp`) into {@link ConnectorIR}.
 *
 * ```xml
 * <p:cxnSp>
 *   <p:nvCxnSpPr>
 *     <p:cNvPr id="5" name="Connector 4"/>
 *     <p:cNvCxnSpPr>
 *       <a:stCxn id="3" idx="2"/>
 *       <a:endCxn id="4" idx="0"/>
 *     </p:cNvCxnSpPr>
 *     <p:nvPr/>
 *   </p:nvCxnSpPr>
 *   <p:spPr>...</p:spPr>
 * </p:cxnSp>
 * ```
 */
function parseConnector(
  cxnSpElement: XmlElement,
  theme: ThemeIR,
  context?: ColorContext
): ConnectorIR {
  const properties = parseShapePropertiesFromParent(cxnSpElement, theme, context);

  // Parse connection references
  const nvCxnSpPr = cxnSpElement.child('p:nvCxnSpPr');
  const cNvCxnSpPr = nvCxnSpPr?.child('p:cNvCxnSpPr');

  let startConnection: ConnectionReference | undefined;
  let endConnection: ConnectionReference | undefined;

  const stCxn = cNvCxnSpPr?.child('a:stCxn');
  if (stCxn) {
    const shapeId = stCxn.attr('id');
    const idx = parseIntAttr(stCxn, 'idx');
    if (shapeId !== undefined && idx !== undefined) {
      startConnection = { shapeId, connectionSiteIndex: idx };
    }
  }

  const endCxn = cNvCxnSpPr?.child('a:endCxn');
  if (endCxn) {
    const shapeId = endCxn.attr('id');
    const idx = parseIntAttr(endCxn, 'idx');
    if (shapeId !== undefined && idx !== undefined) {
      endConnection = { shapeId, connectionSiteIndex: idx };
    }
  }

  const connector: ConnectorIR = {
    kind: 'connector',
    properties,
  };

  if (startConnection) {
    connector.startConnection = startConnection;
  }
  if (endConnection) {
    connector.endConnection = endConnection;
  }

  return connector;
}

// ---------------------------------------------------------------------------
// Graphic frame (unsupported placeholder)
// ---------------------------------------------------------------------------

/**
 * Parse a graphic frame as an unsupported element.
 *
 * Graphic frames host tables, charts, SmartArt, etc. Full parsing will be
 * added per-element-type as those modules are built.
 */
function parseGraphicFrameAsUnsupported(_el: XmlElement): UnsupportedIR {
  return {
    kind: 'unsupported',
    elementType: 'p:graphicFrame',
    reason: 'Graphic frame content (table/chart/SmartArt) not yet supported',
  };
}
