/**
 * Shape tree parser adapter for PPTX.
 *
 * Delegates to the core DrawingML `parseShapeTreeChildren` for shapes,
 * pictures, groups, and connectors. Extends the core with PPTX-specific
 * handling of `p:graphicFrame` elements (tables, charts, SmartArt).
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 19.3.1.22 (spTree)
 */

import type { XmlElement, ThemeIR, SlideElementIR, TableIR, ChartIR } from '@opendockit/core';
import {
  parseShapeTreeChildren as coreParseShapeTreeChildren,
  parseTable,
  parseTransform,
} from '@opendockit/core/drawingml';

/** URI identifying a DrawingML table inside a graphic frame. */
const TABLE_URI = 'http://schemas.openxmlformats.org/drawingml/2006/table';

/** URI identifying a DrawingML chart inside a graphic frame. */
const CHART_URI = 'http://schemas.openxmlformats.org/drawingml/2006/chart';

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
 * Currently supports tables (`a:tbl`) and charts (`c:chart`).
 * Returns `undefined` for unsupported content types (SmartArt, OLE objects).
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

  if (uri === CHART_URI) {
    return parseChartFrame(gfElement, graphicData);
  }

  // Other graphic frame types (SmartArt, OLE objects, etc.) remain unsupported
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

/**
 * Parse a graphic frame containing a chart.
 *
 * Extracts the chart relationship ID from `c:chart @r:id` and the
 * transform from `p:xfrm`. The relationship ID is stored in
 * `chartPartUri` and will be resolved asynchronously by
 * {@link resolveChartFallbacks} to follow the chain:
 * slide → chart part → cached image.
 *
 * ```xml
 * <p:graphicFrame>
 *   <p:xfrm>
 *     <a:off x="914400" y="914400"/>
 *     <a:ext cx="7315200" cy="4572000"/>
 *   </p:xfrm>
 *   <a:graphic>
 *     <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
 *       <c:chart xmlns:c="..." r:id="rId2"/>
 *     </a:graphicData>
 *   </a:graphic>
 * </p:graphicFrame>
 * ```
 */
function parseChartFrame(gfElement: XmlElement, graphicData: XmlElement): ChartIR | undefined {
  // Find the c:chart element — may be prefixed or unprefixed
  const chartEl =
    graphicData.child('c:chart') ?? graphicData.children.find((c) => c.name.endsWith(':chart'));
  if (!chartEl) return undefined;

  const rId = chartEl.attr('r:id');
  if (!rId) return undefined;

  // Extract transform from p:xfrm (graphic frame level)
  const xfrmEl = gfElement.child('p:xfrm');
  const transform = xfrmEl ? parseTransform(xfrmEl) : undefined;

  return {
    kind: 'chart',
    chartType: 'unknown', // Determined later if full ChartML parsing is implemented
    properties: {
      transform,
      effects: [],
    },
    chartPartUri: rId, // Raw relationship ID — resolved async by resolveChartFallbacks
  };
}
