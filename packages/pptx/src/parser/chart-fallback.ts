/**
 * Chart cached image fallback resolver.
 *
 * OOXML chart parts often contain a cached raster image that PowerPoint
 * pre-renders. When full ChartML rendering is not available (Phase 4),
 * this module extracts and displays the cached image so charts show
 * actual content instead of grey "unsupported" boxes.
 *
 * The relationship chain is:
 *   slide part --[REL_CHART]--> chart part --[REL_IMAGE]--> cached image
 *
 * This is an async post-processor that runs after synchronous slide parsing,
 * replacing {@link ChartIR} elements with {@link PictureIR} elements when
 * a cached image is found.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 21.2 (DrawingML - Charts)
 */

import type { SlideElementIR, PictureIR, ChartIR } from '@opendockit/core';
import type { OpcPackage } from '@opendockit/core/opc';
import { REL_IMAGE } from '@opendockit/core/opc';

/**
 * Resolve chart elements to picture elements using cached chart images.
 *
 * Walks the element tree and for each {@link ChartIR} element:
 * 1. Resolves the chart relationship ID to a chart part URI
 * 2. Reads the chart part's relationships to find a cached image
 * 3. Replaces the ChartIR with a {@link PictureIR} positioned at the
 *    same bounds if a cached image is found
 *
 * Elements that are not charts, or charts without cached images, are
 * returned unchanged.
 *
 * @param elements - The slide elements array (may contain ChartIR entries).
 * @param pkg - The opened OPC package for reading relationships and parts.
 * @param slidePartUri - The OPC part URI of the slide (for resolving rIds).
 * @returns A new array with ChartIR entries replaced by PictureIR where possible.
 */
export async function resolveChartFallbacks(
  elements: SlideElementIR[],
  pkg: OpcPackage,
  slidePartUri: string
): Promise<SlideElementIR[]> {
  // Collect chart elements and their indices for batch resolution
  const chartEntries: Array<{ index: number; chart: ChartIR }> = [];
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.kind === 'chart') {
      chartEntries.push({ index: i, chart: el });
    }
  }

  if (chartEntries.length === 0) {
    return elements;
  }

  // Get the slide's relationships to resolve chart rIds
  const slideRels = await pkg.getPartRelationships(slidePartUri);

  // Resolve all charts in parallel
  const resolved = await Promise.all(
    chartEntries.map(async ({ chart }) => {
      return resolveOneChart(chart, slideRels, pkg);
    })
  );

  // Build the result array, replacing charts with resolved pictures
  const result = [...elements];
  for (let i = 0; i < chartEntries.length; i++) {
    const replacement = resolved[i];
    if (replacement) {
      result[chartEntries[i].index] = replacement;
    }
  }

  return result;
}

/**
 * Attempt to resolve a single chart element to a picture element.
 *
 * @returns A PictureIR if a cached image was found, or undefined to keep the ChartIR.
 */
async function resolveOneChart(
  chart: ChartIR,
  slideRels: import('@opendockit/core/opc').RelationshipMap,
  pkg: OpcPackage
): Promise<PictureIR | undefined> {
  // Step 1: Resolve the chart relationship ID to a chart part URI.
  // chartPartUri at this point contains the raw rId (e.g. "rId2").
  const chartRel = slideRels.getById(chart.chartPartUri);
  if (!chartRel || chartRel.targetMode === 'External') {
    return undefined;
  }

  const chartPartUri = chartRel.target; // e.g. "/ppt/charts/chart1.xml"

  // Update the ChartIR's chartPartUri to the resolved absolute path
  // so future full-chart rendering can use it directly.
  chart.chartPartUri = chartPartUri;

  // Step 2: Get the chart part's relationships and look for a cached image.
  let chartRels: import('@opendockit/core/opc').RelationshipMap;
  try {
    chartRels = await pkg.getPartRelationships(chartPartUri);
  } catch {
    // Chart part missing or its rels file is unparseable
    return undefined;
  }

  const imageRels = chartRels.getByType(REL_IMAGE);
  if (imageRels.length === 0) {
    return undefined;
  }

  // Use the first image relationship — this is the cached preview.
  const imageRel = imageRels[0];
  if (imageRel.targetMode === 'External') {
    return undefined;
  }

  const imagePartUri = imageRel.target; // e.g. "/ppt/media/chart1-preview.png"

  // Step 3: Build a PictureIR positioned at the chart's transform bounds.
  return {
    kind: 'picture',
    imagePartUri,
    properties: { ...chart.properties },
    blipFill: {
      stretch: true,
    },
    nonVisualProperties: {
      name: `Chart Fallback (${chart.chartType})`,
      description: `Cached image for chart: ${chartPartUri}`,
    },
  };
}
