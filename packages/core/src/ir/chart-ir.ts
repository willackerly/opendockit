/**
 * Chart Intermediate Representation — stub.
 *
 * Chart rendering is Phase 4. For now we only define the discriminated
 * union member so that {@link SlideElementIR} can reference it. The full
 * chart IR (series, axes, legends, etc.) will be added when ChartML
 * parsing is implemented.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 21.2 (DrawingML - Charts)
 */

import type { ShapePropertiesIR } from './drawingml-ir.js';

/** Stub chart element — enough to be a SlideElementIR union member. */
export interface ChartIR {
  kind: 'chart';
  /** High-level chart type, e.g. "bar", "pie", "line", "scatter". */
  chartType: string;
  /** Visual properties of the chart's bounding shape. */
  properties: ShapePropertiesIR;
  /** OPC part URI of the chart XML. */
  chartPartUri: string;
}
