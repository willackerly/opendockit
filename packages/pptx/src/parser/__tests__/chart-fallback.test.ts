import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SlideElementIR, ChartIR, PictureIR, ThemeIR } from '@opendockit/core';
import { parseXml } from '@opendockit/core';
import type { OpcPackage, RelationshipMap, Relationship } from '@opendockit/core/opc';
import { OpcPackageReader } from '@opendockit/core/opc';
import { resolveChartFallbacks } from '../chart-fallback.js';
import { parseSlide } from '../slide.js';

// ---------------------------------------------------------------------------
// Helper: mock OPC package
// ---------------------------------------------------------------------------

/**
 * Create a mock OPC package that returns configurable relationships.
 *
 * @param partRels - Map of part URI to its relationship entries.
 */
function mockPackage(partRels: Record<string, Relationship[]> = {}): OpcPackage {
  return {
    getPart: vi.fn(),
    getPartText: vi.fn(),
    getPartXml: vi.fn(),
    getPartRelationships: vi.fn(async (uri: string): Promise<RelationshipMap> => {
      const rels = partRels[uri] ?? [];
      return {
        getById: (id: string) => rels.find((r) => r.id === id),
        getByType: (type: string) => rels.filter((r) => r.type === type),
        all: () => rels,
      };
    }),
    getRootRelationships: vi.fn(),
    getContentTypes: vi.fn(),
    listParts: vi.fn(),
    resolveRelTarget: vi.fn(),
  } as unknown as OpcPackage;
}

/** Create a minimal ChartIR element. */
function chartElement(rId: string, x = 0, y = 0, cx = 5000000, cy = 3000000): ChartIR {
  return {
    kind: 'chart',
    chartType: 'unknown',
    properties: {
      transform: {
        position: { x, y },
        size: { width: cx, height: cy },
      },
      effects: [],
    },
    chartPartUri: rId,
  };
}

/** Relationship type constants (same as in the real code). */
const REL_IMAGE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
const REL_CHART = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveChartFallbacks', () => {
  it('returns elements unchanged when there are no charts', async () => {
    const elements: SlideElementIR[] = [
      {
        kind: 'shape',
        properties: { effects: [] },
      },
    ];

    const pkg = mockPackage();
    const result = await resolveChartFallbacks(elements, pkg, '/ppt/slides/slide1.xml');

    expect(result).toEqual(elements);
    // Should not call getPartRelationships since no charts
    expect(pkg.getPartRelationships).not.toHaveBeenCalled();
  });

  it('replaces ChartIR with PictureIR when cached image exists', async () => {
    const chart = chartElement('rId2', 914400, 914400, 7315200, 4572000);
    const elements: SlideElementIR[] = [chart];

    const pkg = mockPackage({
      '/ppt/slides/slide1.xml': [
        {
          id: 'rId2',
          type: REL_CHART,
          target: '/ppt/charts/chart1.xml',
        },
      ],
      '/ppt/charts/chart1.xml': [
        {
          id: 'rId1',
          type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/package',
          target: '/ppt/embeddings/Sheet1.xlsx',
        },
        {
          id: 'rId2',
          type: REL_IMAGE,
          target: '/ppt/media/chart1-preview.png',
        },
      ],
    });

    const result = await resolveChartFallbacks(elements, pkg, '/ppt/slides/slide1.xml');

    expect(result).toHaveLength(1);
    const pic = result[0] as PictureIR;
    expect(pic.kind).toBe('picture');
    expect(pic.imagePartUri).toBe('/ppt/media/chart1-preview.png');
    expect(pic.properties.transform?.position).toEqual({ x: 914400, y: 914400 });
    expect(pic.properties.transform?.size).toEqual({ width: 7315200, height: 4572000 });
    expect(pic.blipFill?.stretch).toBe(true);
    expect(pic.nonVisualProperties.name).toContain('Chart Fallback');
  });

  it('keeps ChartIR when no cached image relationship exists', async () => {
    const chart = chartElement('rId2');
    const elements: SlideElementIR[] = [chart];

    const pkg = mockPackage({
      '/ppt/slides/slide1.xml': [
        {
          id: 'rId2',
          type: REL_CHART,
          target: '/ppt/charts/chart1.xml',
        },
      ],
      '/ppt/charts/chart1.xml': [
        // Only the Excel data source, no image
        {
          id: 'rId1',
          type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/package',
          target: '/ppt/embeddings/Sheet1.xlsx',
        },
      ],
    });

    const result = await resolveChartFallbacks(elements, pkg, '/ppt/slides/slide1.xml');

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('chart');
    // chartPartUri should be resolved to the absolute path
    expect((result[0] as ChartIR).chartPartUri).toBe('/ppt/charts/chart1.xml');
  });

  it('keeps ChartIR when chart relationship ID is not found', async () => {
    const chart = chartElement('rId999');
    const elements: SlideElementIR[] = [chart];

    const pkg = mockPackage({
      '/ppt/slides/slide1.xml': [
        // rId999 doesn't exist
        {
          id: 'rId2',
          type: REL_CHART,
          target: '/ppt/charts/chart1.xml',
        },
      ],
    });

    const result = await resolveChartFallbacks(elements, pkg, '/ppt/slides/slide1.xml');

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('chart');
  });

  it('handles multiple charts on the same slide', async () => {
    const chart1 = chartElement('rId2', 100000, 100000);
    const chart2 = chartElement('rId3', 5000000, 100000);
    const elements: SlideElementIR[] = [
      { kind: 'shape', properties: { effects: [] } },
      chart1,
      chart2,
    ];

    const pkg = mockPackage({
      '/ppt/slides/slide1.xml': [
        {
          id: 'rId2',
          type: REL_CHART,
          target: '/ppt/charts/chart1.xml',
        },
        {
          id: 'rId3',
          type: REL_CHART,
          target: '/ppt/charts/chart2.xml',
        },
      ],
      '/ppt/charts/chart1.xml': [
        {
          id: 'rId1',
          type: REL_IMAGE,
          target: '/ppt/media/chart1-preview.png',
        },
      ],
      '/ppt/charts/chart2.xml': [
        {
          id: 'rId1',
          type: REL_IMAGE,
          target: '/ppt/media/chart2-preview.png',
        },
      ],
    });

    const result = await resolveChartFallbacks(elements, pkg, '/ppt/slides/slide1.xml');

    expect(result).toHaveLength(3);
    expect(result[0].kind).toBe('shape'); // unchanged
    expect(result[1].kind).toBe('picture'); // chart1 resolved
    expect(result[2].kind).toBe('picture'); // chart2 resolved
    expect((result[1] as PictureIR).imagePartUri).toBe('/ppt/media/chart1-preview.png');
    expect((result[2] as PictureIR).imagePartUri).toBe('/ppt/media/chart2-preview.png');
  });

  it('handles mixed resolved and unresolved charts', async () => {
    const chart1 = chartElement('rId2'); // will have cached image
    const chart2 = chartElement('rId3'); // will NOT have cached image
    const elements: SlideElementIR[] = [chart1, chart2];

    const pkg = mockPackage({
      '/ppt/slides/slide1.xml': [
        {
          id: 'rId2',
          type: REL_CHART,
          target: '/ppt/charts/chart1.xml',
        },
        {
          id: 'rId3',
          type: REL_CHART,
          target: '/ppt/charts/chart2.xml',
        },
      ],
      '/ppt/charts/chart1.xml': [
        {
          id: 'rId1',
          type: REL_IMAGE,
          target: '/ppt/media/chart1-preview.png',
        },
      ],
      '/ppt/charts/chart2.xml': [
        // No image, only data source
        {
          id: 'rId1',
          type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/package',
          target: '/ppt/embeddings/Sheet2.xlsx',
        },
      ],
    });

    const result = await resolveChartFallbacks(elements, pkg, '/ppt/slides/slide1.xml');

    expect(result).toHaveLength(2);
    expect(result[0].kind).toBe('picture'); // chart1 resolved to picture
    expect(result[1].kind).toBe('chart'); // chart2 stays as chart
  });

  it('skips external image targets', async () => {
    const chart = chartElement('rId2');
    const elements: SlideElementIR[] = [chart];

    const pkg = mockPackage({
      '/ppt/slides/slide1.xml': [
        {
          id: 'rId2',
          type: REL_CHART,
          target: '/ppt/charts/chart1.xml',
        },
      ],
      '/ppt/charts/chart1.xml': [
        {
          id: 'rId1',
          type: REL_IMAGE,
          target: 'https://example.com/chart.png',
          targetMode: 'External',
        },
      ],
    });

    const result = await resolveChartFallbacks(elements, pkg, '/ppt/slides/slide1.xml');

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('chart'); // Not resolved (external image)
  });

  it('skips external chart targets', async () => {
    const chart = chartElement('rId2');
    const elements: SlideElementIR[] = [chart];

    const pkg = mockPackage({
      '/ppt/slides/slide1.xml': [
        {
          id: 'rId2',
          type: REL_CHART,
          target: 'https://example.com/chart.xml',
          targetMode: 'External',
        },
      ],
    });

    const result = await resolveChartFallbacks(elements, pkg, '/ppt/slides/slide1.xml');

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('chart'); // Not resolved (external chart)
  });

  it('gracefully handles chart part with no rels file', async () => {
    const chart = chartElement('rId2');
    const elements: SlideElementIR[] = [chart];

    const pkg = mockPackage({
      '/ppt/slides/slide1.xml': [
        {
          id: 'rId2',
          type: REL_CHART,
          target: '/ppt/charts/chart1.xml',
        },
      ],
      // No entry for /ppt/charts/chart1.xml — getPartRelationships returns empty
    });

    const result = await resolveChartFallbacks(elements, pkg, '/ppt/slides/slide1.xml');

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('chart'); // Not resolved, but no error thrown
  });
});

// ---------------------------------------------------------------------------
// Integration test: real PPTX file
// ---------------------------------------------------------------------------

function minimalTheme(): ThemeIR {
  return {
    name: 'Test Theme',
    colorScheme: {
      dk1: { r: 0, g: 0, b: 0, a: 1 },
      lt1: { r: 255, g: 255, b: 255, a: 1 },
      dk2: { r: 68, g: 84, b: 106, a: 1 },
      lt2: { r: 231, g: 230, b: 230, a: 1 },
      accent1: { r: 68, g: 114, b: 196, a: 1 },
      accent2: { r: 237, g: 125, b: 49, a: 1 },
      accent3: { r: 165, g: 165, b: 165, a: 1 },
      accent4: { r: 255, g: 192, b: 0, a: 1 },
      accent5: { r: 91, g: 155, b: 213, a: 1 },
      accent6: { r: 112, g: 173, b: 71, a: 1 },
      hlink: { r: 5, g: 99, b: 193, a: 1 },
      folHlink: { r: 149, g: 79, b: 114, a: 1 },
    },
    fontScheme: {
      majorLatin: 'Calibri Light',
      minorLatin: 'Calibri',
    },
    formatScheme: {
      fillStyles: [{ type: 'none' }, { type: 'none' }, { type: 'none' }],
      lineStyles: [{}, {}, {}],
      effectStyles: [[], [], []],
      bgFillStyles: [{ type: 'none' }, { type: 'none' }, { type: 'none' }],
    },
  };
}

describe('chart fallback integration (real PPTX)', () => {
  const pptxPath = resolve(__dirname, '../../../../../test-data/charts-basic.pptx');

  it('parses chart graphicFrames and resolves cached images from charts-basic.pptx', async () => {
    const data = readFileSync(pptxPath);
    const pkg = await OpcPackageReader.open(data.buffer);
    const theme = minimalTheme();

    // Parse slide 1
    const slideXml = await pkg.getPartXml('/ppt/slides/slide1.xml');
    const slide = parseSlide(
      slideXml,
      '/ppt/slides/slide1.xml',
      '/ppt/slideLayouts/slideLayout6.xml',
      '/ppt/slideMasters/slideMaster1.xml',
      theme
    );

    // Should have parsed the chart graphicFrame as ChartIR
    const charts = slide.elements.filter((e) => e.kind === 'chart');
    expect(charts.length).toBeGreaterThanOrEqual(1);
    const chart = charts[0] as ChartIR;
    expect(chart.chartPartUri).toBe('rId2'); // raw rId before resolution

    // Resolve chart fallbacks
    const resolved = await resolveChartFallbacks(slide.elements, pkg, '/ppt/slides/slide1.xml');

    // The chart should now be a picture (since we injected cached images)
    const pictures = resolved.filter((e) => e.kind === 'picture');
    expect(pictures.length).toBeGreaterThanOrEqual(1);
    const pic = pictures[0] as PictureIR;
    expect(pic.imagePartUri).toBe('/ppt/media/chart1-preview.png');
    expect(pic.properties.transform).toBeDefined();
    expect(pic.properties.transform?.position).toEqual({ x: 914400, y: 914400 });
    expect(pic.properties.transform?.size).toEqual({ width: 7315200, height: 4572000 });
  });

  it('resolves chart images from both slides', async () => {
    const data = readFileSync(pptxPath);
    const pkg = await OpcPackageReader.open(data.buffer);
    const theme = minimalTheme();

    // Parse and resolve slide 2 (pie chart)
    const slideXml = await pkg.getPartXml('/ppt/slides/slide2.xml');
    const slide = parseSlide(
      slideXml,
      '/ppt/slides/slide2.xml',
      '/ppt/slideLayouts/slideLayout6.xml',
      '/ppt/slideMasters/slideMaster1.xml',
      theme
    );

    const resolved = await resolveChartFallbacks(slide.elements, pkg, '/ppt/slides/slide2.xml');

    const pictures = resolved.filter((e) => e.kind === 'picture');
    expect(pictures.length).toBeGreaterThanOrEqual(1);
    const pic = pictures[0] as PictureIR;
    expect(pic.imagePartUri).toBe('/ppt/media/chart2-preview.png');
  });
});
