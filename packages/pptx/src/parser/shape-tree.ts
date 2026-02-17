/**
 * Shape tree parser adapter for PPTX.
 *
 * Delegates to the core DrawingML `parseShapeTreeChildren` for shapes,
 * pictures, groups, and connectors. Extends the core with PPTX-specific
 * handling of `p:graphicFrame` elements (tables, charts, SmartArt).
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 19.3.1.22 (spTree)
 */

import type { XmlElement, ThemeIR, SlideElementIR, TableIR } from '@opendockit/core';
import {
  parseShapeTreeChildren as coreParseShapeTreeChildren,
  parseTable,
  parseTransform,
} from '@opendockit/core/drawingml';

/** URI identifying a DrawingML table inside a graphic frame. */
const TABLE_URI = 'http://schemas.openxmlformats.org/drawingml/2006/table';

/**
 * Parse a shape tree's children into a {@link SlideElementIR} array.
 *
 * Delegates to the core DrawingML parser for standard elements (p:sp,
 * p:pic, p:grpSp, p:cxnSp) and adds PPTX-specific handling for
 * `p:graphicFrame` elements containing tables.
 *
 * @param containerElement - The `p:spTree` or `p:grpSp` XML element.
 * @param theme - The resolved theme for style lookups.
 * @returns Flat array of slide elements in z-order.
 */
export function parseShapeTreeChildren(
  containerElement: XmlElement,
  theme: ThemeIR
): SlideElementIR[] {
  // Delegate to core for standard DrawingML elements. The core
  // parser handles p:sp, p:pic, p:grpSp, p:cxnSp and marks
  // p:graphicFrame as unsupported. We post-process to upgrade
  // graphic frames that contain tables.
  const elements = coreParseShapeTreeChildren(containerElement, theme);

  // Re-scan for p:graphicFrame children and replace the unsupported
  // placeholders with parsed tables where possible.
  const graphicFrames = containerElement.children.filter((c) => c.is('p:graphicFrame'));

  if (graphicFrames.length === 0) {
    return elements;
  }

  // Build a map of graphicFrame index -> parsed element to replace
  // the unsupported entries emitted by the core parser.
  let gfIdx = 0;
  return elements.map((el) => {
    if (el.kind !== 'unsupported' || el.elementType !== 'p:graphicFrame') {
      return el;
    }
    // Match this unsupported entry with the corresponding graphicFrame
    const gfElement = graphicFrames[gfIdx++];
    if (!gfElement) {
      return el;
    }
    return parseGraphicFrame(gfElement, theme) ?? el;
  });
}

// ---------------------------------------------------------------------------
// Graphic frame parsing (p:graphicFrame)
// ---------------------------------------------------------------------------

/**
 * Attempt to parse a `p:graphicFrame` element.
 *
 * Currently supports tables (`a:tbl`). Returns `undefined` for
 * unsupported content types (charts, SmartArt, OLE objects).
 *
 * ```xml
 * <p:graphicFrame>
 *   <p:nvGraphicFramePr>...</p:nvGraphicFramePr>
 *   <p:xfrm>
 *     <a:off x="..." y="..."/>
 *     <a:ext cx="..." cy="..."/>
 *   </p:xfrm>
 *   <a:graphic>
 *     <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
 *       <a:tbl>...</a:tbl>
 *     </a:graphicData>
 *   </a:graphic>
 * </p:graphicFrame>
 * ```
 */
function parseGraphicFrame(gfElement: XmlElement, theme: ThemeIR): SlideElementIR | undefined {
  const graphic = gfElement.child('a:graphic');
  const graphicData = graphic?.child('a:graphicData');
  if (!graphicData) return undefined;

  const uri = graphicData.attr('uri');

  if (uri === TABLE_URI) {
    return parseTableFrame(gfElement, graphicData, theme);
  }

  // Other graphic frame types (chart, SmartArt, etc.) remain unsupported
  return undefined;
}

/**
 * Parse a graphic frame containing a table.
 *
 * Combines the transform from `p:xfrm` with the table parsed from
 * `a:tbl` to produce a fully positioned {@link TableIR}.
 */
function parseTableFrame(
  gfElement: XmlElement,
  graphicData: XmlElement,
  theme: ThemeIR
): TableIR | undefined {
  const tbl = graphicData.child('a:tbl');
  if (!tbl) return undefined;

  const table = parseTable(tbl, theme);

  // Extract transform from p:xfrm (graphic frame level)
  const xfrmEl = gfElement.child('p:xfrm');
  if (xfrmEl) {
    table.properties.transform = parseTransform(xfrmEl);
  }

  return table;
}
