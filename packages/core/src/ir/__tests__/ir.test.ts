/**
 * Smoke tests for IR types.
 *
 * These tests verify that:
 * 1. Every major IR type can be constructed as plain data
 * 2. Discriminated unions narrow correctly (switch on type/kind)
 * 3. JSON serialization round-trips preserve all fields
 *
 * The IR module is pure types — the TypeScript compiler is the primary
 * "test." These runtime tests confirm the shapes are usable.
 */

import { describe, expect, it } from 'vitest';
import type {
  // common
  RgbaColor,
  ResolvedColor,
  BoundingBox,
  Point,
  Size,
  // transforms
  TransformIR,
  // fills
  SolidFillIR,
  GradientFillIR,
  GradientStopIR,
  PatternFillIR,
  PictureFillIR,
  NoFill,
  FillIR,
  // line
  LineIR,
  LineEnd,
  // effects
  OuterShadowIR,
  InnerShadowIR,
  GlowIR,
  ReflectionIR,
  SoftEdgeIR,
  EffectIR,
  // geometry
  ShapeGuideIR,
  ShapePathIR,
  PresetGeometryIR,
  CustomGeometryIR,
  GeometryIR,
  PathCommandIR,
  // shape properties
  ShapePropertiesIR,
  // text
  TextBodyIR,
  BodyPropertiesIR,
  ParagraphIR,
  RunIR,
  LineBreakIR,
  CharacterPropertiesIR,
  BulletPropertiesIR,
  SpacingIR,
  // picture
  PictureIR,
  CropRect,
  TileInfo,
  // group
  GroupIR,
  // connector
  ConnectorIR,
  // table
  TableIR,
  TableRowIR,
  TableCellIR,
  // slide elements
  DrawingMLShapeIR,
  UnsupportedIR,
  SlideElementIR,
  // theme
  ColorSchemeIR,
  FontSchemeIR,
  FormatSchemeIR,
  ThemeIR,
  // chart
  ChartIR,
} from '../index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round-trip through JSON and verify deep equality. */
function jsonRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const white: RgbaColor = { r: 255, g: 255, b: 255, a: 1 };
const black: RgbaColor = { r: 0, g: 0, b: 0, a: 1 };
const red: ResolvedColor = { r: 255, g: 0, b: 0, a: 1, schemeKey: 'accent2' };
const blue: ResolvedColor = { r: 0, g: 0, b: 255, a: 0.8 };
const transparent: ResolvedColor = { r: 0, g: 0, b: 0, a: 0 };

// ---------------------------------------------------------------------------
// Common types
// ---------------------------------------------------------------------------

describe('common types', () => {
  it('constructs RgbaColor', () => {
    const c: RgbaColor = { r: 128, g: 64, b: 32, a: 0.5 };
    expect(c.r).toBe(128);
    expect(c.a).toBe(0.5);
  });

  it('constructs ResolvedColor with optional schemeKey', () => {
    const c: ResolvedColor = { r: 0, g: 0, b: 0, a: 1, schemeKey: 'dk1' };
    expect(c.schemeKey).toBe('dk1');

    const c2: ResolvedColor = { r: 255, g: 255, b: 255, a: 1 };
    expect(c2.schemeKey).toBeUndefined();
  });

  it('constructs Point and Size', () => {
    const p: Point = { x: 914400, y: 457200 };
    const s: Size = { width: 914400, height: 457200 };
    expect(p.x).toBe(914400);
    expect(s.width).toBe(914400);
  });

  it('constructs BoundingBox', () => {
    const bb: BoundingBox = { x: 0, y: 0, width: 9144000, height: 6858000 };
    expect(bb.width).toBe(9144000);
  });

  it('JSON round-trips common types', () => {
    const bb: BoundingBox = { x: 100, y: 200, width: 300, height: 400 };
    expect(jsonRoundTrip(bb)).toEqual(bb);

    const c: ResolvedColor = { r: 1, g: 2, b: 3, a: 0.5, schemeKey: 'hlink' };
    expect(jsonRoundTrip(c)).toEqual(c);
  });
});

// ---------------------------------------------------------------------------
// Transforms
// ---------------------------------------------------------------------------

describe('TransformIR', () => {
  it('constructs with all fields', () => {
    const xfrm: TransformIR = {
      position: { x: 914400, y: 914400 },
      size: { width: 4572000, height: 2743200 },
      rotation: 45,
      flipH: true,
      flipV: false,
    };
    expect(xfrm.rotation).toBe(45);
    expect(xfrm.flipH).toBe(true);
  });

  it('constructs with only required fields', () => {
    const xfrm: TransformIR = {
      position: { x: 0, y: 0 },
      size: { width: 100, height: 100 },
    };
    expect(xfrm.rotation).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Fills
// ---------------------------------------------------------------------------

describe('FillIR discriminated union', () => {
  it('constructs SolidFillIR', () => {
    const fill: SolidFillIR = { type: 'solid', color: red };
    expect(fill.type).toBe('solid');
    expect(fill.color.r).toBe(255);
  });

  it('constructs GradientFillIR', () => {
    const stops: GradientStopIR[] = [
      { position: 0, color: white },
      { position: 1, color: black },
    ];
    const fill: GradientFillIR = {
      type: 'gradient',
      kind: 'linear',
      angle: 90,
      stops,
    };
    expect(fill.stops).toHaveLength(2);
    expect(fill.kind).toBe('linear');
  });

  it('constructs GradientFillIR with tileRect', () => {
    const fill: GradientFillIR = {
      type: 'gradient',
      kind: 'path',
      stops: [{ position: 0.5, color: blue }],
      tileRect: { left: 0, top: 0, right: 1, bottom: 1 },
    };
    expect(fill.tileRect?.right).toBe(1);
  });

  it('constructs PatternFillIR', () => {
    const fill: PatternFillIR = {
      type: 'pattern',
      preset: 'dkHorz',
      foreground: black,
      background: white,
    };
    expect(fill.preset).toBe('dkHorz');
  });

  it('constructs PictureFillIR', () => {
    const fill: PictureFillIR = {
      type: 'picture',
      imagePartUri: '/ppt/media/image1.png',
      stretch: true,
      crop: { left: 0, top: 0, right: 0.1, bottom: 0.1 },
    };
    expect(fill.imagePartUri).toBe('/ppt/media/image1.png');
  });

  it('constructs NoFill', () => {
    const fill: NoFill = { type: 'none' };
    expect(fill.type).toBe('none');
  });

  it('narrows FillIR via switch', () => {
    const fills: FillIR[] = [
      { type: 'solid', color: red },
      { type: 'gradient', kind: 'linear', angle: 0, stops: [] },
      { type: 'pattern', preset: 'pct5', foreground: black, background: white },
      { type: 'picture', imagePartUri: '/img.png' },
      { type: 'none' },
    ];

    const types: string[] = [];
    for (const fill of fills) {
      switch (fill.type) {
        case 'solid':
          types.push(`solid:${fill.color.r}`);
          break;
        case 'gradient':
          types.push(`gradient:${fill.kind}`);
          break;
        case 'pattern':
          types.push(`pattern:${fill.preset}`);
          break;
        case 'picture':
          types.push(`picture:${fill.imagePartUri}`);
          break;
        case 'none':
          types.push('none');
          break;
      }
    }
    expect(types).toEqual([
      'solid:255',
      'gradient:linear',
      'pattern:pct5',
      'picture:/img.png',
      'none',
    ]);
  });

  it('JSON round-trips all fill types', () => {
    const fills: FillIR[] = [
      { type: 'solid', color: red },
      {
        type: 'gradient',
        kind: 'radial',
        stops: [
          { position: 0, color: white },
          { position: 1, color: black },
        ],
      },
      { type: 'pattern', preset: 'pct50', foreground: black, background: white },
      { type: 'picture', imagePartUri: '/img.png', stretch: true },
      { type: 'none' },
    ];
    for (const fill of fills) {
      expect(jsonRoundTrip(fill)).toEqual(fill);
    }
  });
});

// ---------------------------------------------------------------------------
// Line
// ---------------------------------------------------------------------------

describe('LineIR', () => {
  it('constructs with all fields', () => {
    const headEnd: LineEnd = { type: 'triangle', width: 'med', length: 'lg' };
    const tailEnd: LineEnd = { type: 'arrow', width: 'sm', length: 'sm' };
    const line: LineIR = {
      color: blue,
      width: 12700,
      dashStyle: 'dashDot',
      compound: 'double',
      cap: 'round',
      join: 'bevel',
      headEnd,
      tailEnd,
    };
    expect(line.width).toBe(12700);
    expect(line.dashStyle).toBe('dashDot');
    expect(line.headEnd?.type).toBe('triangle');
  });

  it('constructs with minimal fields', () => {
    const line: LineIR = {};
    expect(line.color).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

describe('EffectIR discriminated union', () => {
  it('constructs OuterShadowIR', () => {
    const e: OuterShadowIR = {
      type: 'outerShadow',
      blurRadius: 50800,
      distance: 38100,
      direction: 315,
      color: { ...black, a: 0.4 },
      alignment: 'ctr',
    };
    expect(e.type).toBe('outerShadow');
  });

  it('constructs InnerShadowIR', () => {
    const e: InnerShadowIR = {
      type: 'innerShadow',
      blurRadius: 25400,
      distance: 12700,
      direction: 90,
      color: transparent,
    };
    expect(e.distance).toBe(12700);
  });

  it('constructs GlowIR', () => {
    const e: GlowIR = {
      type: 'glow',
      radius: 63500,
      color: { r: 255, g: 215, b: 0, a: 0.6 },
    };
    expect(e.radius).toBe(63500);
  });

  it('constructs ReflectionIR', () => {
    const e: ReflectionIR = {
      type: 'reflection',
      blurRadius: 12700,
      startOpacity: 0.5,
      endOpacity: 0,
      distance: 0,
      direction: 90,
      fadeDirection: 90,
    };
    expect(e.startOpacity).toBe(0.5);
  });

  it('constructs SoftEdgeIR', () => {
    const e: SoftEdgeIR = { type: 'softEdge', radius: 25400 };
    expect(e.type).toBe('softEdge');
  });

  it('narrows EffectIR via switch', () => {
    const effects: EffectIR[] = [
      { type: 'outerShadow', blurRadius: 0, distance: 0, direction: 0, color: black },
      { type: 'innerShadow', blurRadius: 0, distance: 0, direction: 0, color: black },
      { type: 'glow', radius: 0, color: black },
      {
        type: 'reflection',
        blurRadius: 0,
        startOpacity: 1,
        endOpacity: 0,
        distance: 0,
        direction: 0,
        fadeDirection: 0,
      },
      { type: 'softEdge', radius: 0 },
    ];

    const types: string[] = [];
    for (const e of effects) {
      switch (e.type) {
        case 'outerShadow':
          types.push('outer');
          break;
        case 'innerShadow':
          types.push('inner');
          break;
        case 'glow':
          types.push('glow');
          break;
        case 'reflection':
          types.push('reflection');
          break;
        case 'softEdge':
          types.push('soft');
          break;
      }
    }
    expect(types).toEqual(['outer', 'inner', 'glow', 'reflection', 'soft']);
  });
});

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

describe('GeometryIR', () => {
  it('constructs PresetGeometryIR', () => {
    const geo: PresetGeometryIR = {
      kind: 'preset',
      name: 'roundRect',
      adjustValues: { adj: 16667 },
    };
    expect(geo.name).toBe('roundRect');
    expect(geo.adjustValues?.adj).toBe(16667);
  });

  it('constructs CustomGeometryIR with path commands', () => {
    const guides: ShapeGuideIR[] = [
      { name: 'adj', formula: 'val 25000' },
      { name: 'x1', formula: '*/ w adj 100000' },
    ];
    const commands: PathCommandIR[] = [
      { kind: 'moveTo', x: 0, y: 0 },
      { kind: 'lineTo', x: 100, y: 0 },
      { kind: 'arcTo', wR: 50, hR: 50, startAngle: 0, sweepAngle: 90 },
      { kind: 'cubicBezierTo', x1: 10, y1: 20, x2: 30, y2: 40, x: 50, y: 60 },
      { kind: 'quadBezierTo', x1: 25, y1: 75, x: 100, y: 100 },
      { kind: 'close' },
    ];
    const path: ShapePathIR = {
      width: 100,
      height: 100,
      fill: 'norm',
      stroke: true,
      commands,
    };
    const geo: CustomGeometryIR = {
      kind: 'custom',
      guides,
      paths: [path],
      connectionSites: [{ angle: 0, posX: 'x1', posY: 'y1' }],
    };
    expect(geo.paths[0].commands).toHaveLength(6);
    expect(geo.connectionSites?.[0].angle).toBe(0);
  });

  it('narrows GeometryIR via switch on kind', () => {
    const geometries: GeometryIR[] = [
      { kind: 'preset', name: 'rect' },
      { kind: 'custom', guides: [], paths: [] },
    ];

    const results: string[] = [];
    for (const geo of geometries) {
      switch (geo.kind) {
        case 'preset':
          results.push(geo.name);
          break;
        case 'custom':
          results.push(`custom:${geo.guides.length}`);
          break;
      }
    }
    expect(results).toEqual(['rect', 'custom:0']);
  });
});

// ---------------------------------------------------------------------------
// Shape Properties
// ---------------------------------------------------------------------------

describe('ShapePropertiesIR', () => {
  it('constructs a fully-populated shape properties', () => {
    const props: ShapePropertiesIR = {
      transform: {
        position: { x: 0, y: 0 },
        size: { width: 914400, height: 914400 },
        rotation: 0,
      },
      fill: { type: 'solid', color: red },
      line: { color: black, width: 12700, dashStyle: 'solid' },
      effects: [
        {
          type: 'outerShadow',
          blurRadius: 50800,
          distance: 38100,
          direction: 315,
          color: { ...black, a: 0.4 },
        },
      ],
      geometry: { kind: 'preset', name: 'rect' },
    };
    expect(props.effects).toHaveLength(1);
    expect(props.fill?.type).toBe('solid');
  });

  it('constructs with empty effects array', () => {
    const props: ShapePropertiesIR = { effects: [] };
    expect(props.transform).toBeUndefined();
    expect(props.effects).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

describe('Text IR types', () => {
  it('constructs RunIR and LineBreakIR', () => {
    const charProps: CharacterPropertiesIR = {
      fontSize: 1800,
      fontFamily: 'Calibri',
      bold: true,
      italic: false,
      underline: 'single',
      strikethrough: 'none',
      color: black,
      baseline: 0,
      spacing: 0,
      latin: 'Calibri',
      eastAsian: 'MS Gothic',
      complexScript: 'Arial',
    };
    const run: RunIR = { kind: 'run', text: 'Hello, world!', properties: charProps };
    expect(run.kind).toBe('run');
    expect(run.text).toBe('Hello, world!');

    const br: LineBreakIR = { kind: 'lineBreak', properties: {} };
    expect(br.kind).toBe('lineBreak');
  });

  it('constructs ParagraphIR with bullets', () => {
    const spacing: SpacingIR = { value: 100, unit: 'pct' };
    const bullet: BulletPropertiesIR = {
      type: 'char',
      char: '\u2022',
      color: red,
      sizePercent: 100,
      font: 'Arial',
    };
    const para: ParagraphIR = {
      runs: [
        { kind: 'run', text: 'Item 1', properties: { fontSize: 1200 } },
        { kind: 'lineBreak', properties: {} },
        { kind: 'run', text: 'Item 2', properties: { fontSize: 1200 } },
      ],
      properties: {
        alignment: 'left',
        level: 0,
        indent: 228600,
        marginLeft: 457200,
        spaceBefore: spacing,
        lineSpacing: { value: 150, unit: 'pct' },
      },
      bulletProperties: bullet,
    };
    expect(para.runs).toHaveLength(3);
    expect(para.bulletProperties?.type).toBe('char');
  });

  it('constructs TextBodyIR', () => {
    const body: TextBodyIR = {
      paragraphs: [
        {
          runs: [{ kind: 'run', text: 'Title', properties: { fontSize: 4400, bold: true } }],
          properties: { alignment: 'center' },
        },
      ],
      bodyProperties: {
        wrap: 'square',
        verticalAlign: 'middle',
        anchorCtr: true,
        leftInset: 91440,
        rightInset: 91440,
        topInset: 45720,
        bottomInset: 45720,
        columns: 1,
        autoFit: 'shrink',
      },
    };
    expect(body.paragraphs).toHaveLength(1);
    expect(body.bodyProperties.verticalAlign).toBe('middle');
  });

  it('constructs auto-numbering bullets', () => {
    const bullet: BulletPropertiesIR = {
      type: 'autoNum',
      autoNumType: 'arabicPeriod',
      startAt: 1,
    };
    expect(bullet.autoNumType).toBe('arabicPeriod');
  });
});

// ---------------------------------------------------------------------------
// Picture
// ---------------------------------------------------------------------------

describe('PictureIR', () => {
  it('constructs with all fields', () => {
    const crop: CropRect = { left: 0.05, top: 0.1, right: 0.05, bottom: 0.1 };
    const tile: TileInfo = {
      offsetX: 0,
      offsetY: 0,
      scaleX: 1,
      scaleY: 1,
      flip: 'xy',
      alignment: 'ctr',
    };
    const pic: PictureIR = {
      kind: 'picture',
      imagePartUri: '/ppt/media/image1.png',
      properties: {
        transform: {
          position: { x: 100000, y: 200000 },
          size: { width: 500000, height: 300000 },
        },
        effects: [],
      },
      blipFill: { crop, stretch: false, tile },
      nonVisualProperties: {
        name: 'Picture 1',
        description: 'A photo',
        hidden: false,
      },
    };
    expect(pic.kind).toBe('picture');
    expect(pic.blipFill?.crop?.left).toBe(0.05);
    expect(pic.nonVisualProperties.name).toBe('Picture 1');
  });
});

// ---------------------------------------------------------------------------
// Group
// ---------------------------------------------------------------------------

describe('GroupIR', () => {
  it('constructs with nested children', () => {
    const childShape: DrawingMLShapeIR = {
      kind: 'shape',
      id: '5',
      name: 'Rect 1',
      properties: {
        transform: {
          position: { x: 0, y: 0 },
          size: { width: 100000, height: 100000 },
        },
        fill: { type: 'solid', color: blue },
        effects: [],
        geometry: { kind: 'preset', name: 'rect' },
      },
    };
    const group: GroupIR = {
      kind: 'group',
      properties: {
        transform: {
          position: { x: 500000, y: 500000 },
          size: { width: 2000000, height: 2000000 },
        },
        effects: [],
      },
      childOffset: { x: 0, y: 0 },
      childExtent: { width: 1000000, height: 1000000 },
      children: [childShape],
    };
    expect(group.kind).toBe('group');
    expect(group.children).toHaveLength(1);
    expect(group.children[0].kind).toBe('shape');
  });
});

// ---------------------------------------------------------------------------
// Connector
// ---------------------------------------------------------------------------

describe('ConnectorIR', () => {
  it('constructs with connection references', () => {
    const connector: ConnectorIR = {
      kind: 'connector',
      properties: {
        line: { color: black, width: 9525 },
        effects: [],
      },
      startConnection: { shapeId: '3', connectionSiteIndex: 2 },
      endConnection: { shapeId: '7', connectionSiteIndex: 0 },
    };
    expect(connector.startConnection?.shapeId).toBe('3');
  });
});

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

describe('TableIR', () => {
  it('constructs a 2x2 table', () => {
    const cell: TableCellIR = {
      textBody: {
        paragraphs: [{ runs: [{ kind: 'run', text: 'Cell', properties: {} }], properties: {} }],
        bodyProperties: {},
      },
      fill: { type: 'solid', color: white },
      borders: {
        left: { color: black, width: 12700 },
        right: { color: black, width: 12700 },
        top: { color: black, width: 12700 },
        bottom: { color: black, width: 12700 },
      },
    };
    const mergedCell: TableCellIR = {
      gridSpan: 2,
      textBody: {
        paragraphs: [{ runs: [{ kind: 'run', text: 'Merged', properties: {} }], properties: {} }],
        bodyProperties: {},
      },
    };
    const row1: TableRowIR = { height: 370840, cells: [mergedCell] };
    const row2: TableRowIR = { height: 370840, cells: [cell, cell] };
    const table: TableIR = {
      kind: 'table',
      properties: { effects: [] },
      rows: [row1, row2],
      tableStyle: '{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}',
    };
    expect(table.kind).toBe('table');
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0].cells[0].gridSpan).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// SlideElementIR discriminated union
// ---------------------------------------------------------------------------

describe('SlideElementIR discriminated union', () => {
  it('narrows all element kinds via switch', () => {
    const elements: SlideElementIR[] = [
      {
        kind: 'shape',
        id: '1',
        name: 'Shape',
        properties: { effects: [] },
      },
      {
        kind: 'picture',
        imagePartUri: '/img.png',
        properties: { effects: [] },
        nonVisualProperties: { name: 'Pic' },
      },
      {
        kind: 'group',
        properties: { effects: [] },
        childOffset: { x: 0, y: 0 },
        childExtent: { width: 100, height: 100 },
        children: [],
      },
      {
        kind: 'connector',
        properties: { effects: [] },
      },
      {
        kind: 'table',
        properties: { effects: [] },
        rows: [],
      },
      {
        kind: 'chart',
        chartType: 'bar',
        properties: { effects: [] },
        chartPartUri: '/ppt/charts/chart1.xml',
      },
      {
        kind: 'unsupported',
        elementType: 'mc:AlternateContent',
        reason: 'Not yet implemented',
      },
    ];

    const kinds: string[] = [];
    for (const el of elements) {
      switch (el.kind) {
        case 'shape':
          kinds.push(`shape:${el.name}`);
          break;
        case 'picture':
          kinds.push(`picture:${el.imagePartUri}`);
          break;
        case 'group':
          kinds.push(`group:${el.children.length}`);
          break;
        case 'connector':
          kinds.push('connector');
          break;
        case 'table':
          kinds.push(`table:${el.rows.length}`);
          break;
        case 'chart':
          kinds.push(`chart:${el.chartType}`);
          break;
        case 'unsupported':
          kinds.push(`unsupported:${el.elementType}`);
          break;
      }
    }
    expect(kinds).toEqual([
      'shape:Shape',
      'picture:/img.png',
      'group:0',
      'connector',
      'table:0',
      'chart:bar',
      'unsupported:mc:AlternateContent',
    ]);
  });

  it('DrawingMLShapeIR with placeholder', () => {
    const shape: DrawingMLShapeIR = {
      kind: 'shape',
      id: '2',
      name: 'Title 1',
      properties: { effects: [] },
      textBody: {
        paragraphs: [
          {
            runs: [{ kind: 'run', text: 'Slide Title', properties: { fontSize: 4400 } }],
            properties: { alignment: 'center' },
          },
        ],
        bodyProperties: { verticalAlign: 'middle' },
      },
      placeholderType: 'title',
      placeholderIndex: 0,
    };
    expect(shape.placeholderType).toBe('title');
    expect(shape.placeholderIndex).toBe(0);
  });

  it('UnsupportedIR with bounds', () => {
    const el: UnsupportedIR = {
      kind: 'unsupported',
      elementType: 'p:oleObj',
      bounds: { x: 0, y: 0, width: 1000000, height: 500000 },
      reason: 'OLE objects not supported',
    };
    expect(el.bounds?.width).toBe(1000000);
  });
});

// ---------------------------------------------------------------------------
// Theme IR
// ---------------------------------------------------------------------------

describe('ThemeIR', () => {
  it('constructs a complete theme', () => {
    const colorScheme: ColorSchemeIR = {
      dk1: { r: 0, g: 0, b: 0, a: 1 },
      lt1: { r: 255, g: 255, b: 255, a: 1 },
      dk2: { r: 31, g: 73, b: 125, a: 1 },
      lt2: { r: 238, g: 236, b: 225, a: 1 },
      accent1: { r: 79, g: 129, b: 189, a: 1 },
      accent2: { r: 192, g: 80, b: 77, a: 1 },
      accent3: { r: 155, g: 187, b: 89, a: 1 },
      accent4: { r: 128, g: 100, b: 162, a: 1 },
      accent5: { r: 75, g: 172, b: 198, a: 1 },
      accent6: { r: 247, g: 150, b: 70, a: 1 },
      hlink: { r: 0, g: 0, b: 255, a: 1 },
      folHlink: { r: 128, g: 0, b: 128, a: 1 },
    };

    const fontScheme: FontSchemeIR = {
      majorLatin: 'Calibri Light',
      majorEastAsia: 'MS Gothic',
      majorComplexScript: 'Arial',
      minorLatin: 'Calibri',
      minorEastAsia: 'MS Gothic',
      minorComplexScript: 'Arial',
    };

    const noFill: NoFill = { type: 'none' };
    const solidFill: SolidFillIR = { type: 'solid', color: colorScheme.accent1 };
    const gradFill: GradientFillIR = {
      type: 'gradient',
      kind: 'linear',
      angle: 90,
      stops: [
        { position: 0, color: { ...colorScheme.accent1, a: 0.5 } },
        { position: 1, color: colorScheme.accent1 },
      ],
    };

    const thinLine: LineIR = { width: 9525, dashStyle: 'solid', cap: 'flat', join: 'round' };
    const medLine: LineIR = { width: 25400, dashStyle: 'solid', cap: 'flat', join: 'round' };
    const thickLine: LineIR = { width: 38100, dashStyle: 'solid', cap: 'flat', join: 'round' };

    const formatScheme: FormatSchemeIR = {
      fillStyles: [noFill, solidFill, gradFill],
      lineStyles: [thinLine, medLine, thickLine],
      effectStyles: [
        [],
        [],
        [
          {
            type: 'outerShadow',
            blurRadius: 50800,
            distance: 38100,
            direction: 315,
            color: { r: 0, g: 0, b: 0, a: 0.4 },
          },
        ],
      ],
      bgFillStyles: [noFill, solidFill, gradFill],
    };

    const theme: ThemeIR = {
      name: 'Office Theme',
      colorScheme,
      fontScheme,
      formatScheme,
    };

    expect(theme.name).toBe('Office Theme');
    expect(theme.colorScheme.accent1.r).toBe(79);
    expect(theme.fontScheme.majorLatin).toBe('Calibri Light');
    expect(theme.formatScheme.fillStyles).toHaveLength(3);
    expect(theme.formatScheme.lineStyles).toHaveLength(3);
    expect(theme.formatScheme.effectStyles).toHaveLength(3);
  });

  it('JSON round-trips ThemeIR', () => {
    const theme: ThemeIR = {
      name: 'Test',
      colorScheme: {
        dk1: black,
        lt1: white,
        dk2: black,
        lt2: white,
        accent1: red,
        accent2: blue,
        accent3: red,
        accent4: blue,
        accent5: red,
        accent6: blue,
        hlink: blue,
        folHlink: red,
      },
      fontScheme: { majorLatin: 'Arial', minorLatin: 'Calibri' },
      formatScheme: {
        fillStyles: [{ type: 'none' }, { type: 'none' }, { type: 'none' }],
        lineStyles: [{}, {}, {}],
        effectStyles: [[], [], []],
        bgFillStyles: [{ type: 'none' }, { type: 'none' }, { type: 'none' }],
      },
    };
    expect(jsonRoundTrip(theme)).toEqual(theme);
  });
});

// ---------------------------------------------------------------------------
// Chart IR (stub)
// ---------------------------------------------------------------------------

describe('ChartIR', () => {
  it('constructs a stub chart', () => {
    const chart: ChartIR = {
      kind: 'chart',
      chartType: 'pie',
      properties: { effects: [] },
      chartPartUri: '/ppt/charts/chart1.xml',
    };
    expect(chart.kind).toBe('chart');
    expect(chart.chartType).toBe('pie');
  });
});

// ---------------------------------------------------------------------------
// Comprehensive JSON round-trip
// ---------------------------------------------------------------------------

describe('JSON round-trip (comprehensive)', () => {
  it('round-trips a complex SlideElementIR', () => {
    const shape: DrawingMLShapeIR = {
      kind: 'shape',
      id: '42',
      name: 'Complex Shape',
      properties: {
        transform: {
          position: { x: 914400, y: 1828800 },
          size: { width: 4572000, height: 2743200 },
          rotation: 15.5,
          flipH: true,
          flipV: false,
        },
        fill: {
          type: 'gradient',
          kind: 'linear',
          angle: 135,
          stops: [
            { position: 0, color: { r: 255, g: 0, b: 0, a: 1, schemeKey: 'accent1' } },
            { position: 0.5, color: { r: 0, g: 255, b: 0, a: 0.8 } },
            { position: 1, color: { r: 0, g: 0, b: 255, a: 1 } },
          ],
        },
        line: {
          color: { r: 0, g: 0, b: 0, a: 1 },
          width: 25400,
          dashStyle: 'lgDashDotDot',
          cap: 'square',
          join: 'miter',
          headEnd: { type: 'diamond', width: 'lg', length: 'lg' },
          tailEnd: { type: 'stealth', width: 'sm', length: 'med' },
        },
        effects: [
          {
            type: 'outerShadow',
            blurRadius: 76200,
            distance: 50800,
            direction: 270,
            color: { r: 0, g: 0, b: 0, a: 0.3 },
            alignment: 'bl',
          },
          { type: 'glow', radius: 101600, color: { r: 255, g: 255, b: 0, a: 0.5 } },
        ],
        geometry: {
          kind: 'custom',
          guides: [
            { name: 'adj', formula: 'val 50000' },
            { name: 'x1', formula: '*/ w adj 100000' },
          ],
          paths: [
            {
              width: 100,
              height: 100,
              fill: 'norm',
              stroke: true,
              commands: [
                { kind: 'moveTo', x: 0, y: 50 },
                { kind: 'lineTo', x: 50, y: 0 },
                { kind: 'cubicBezierTo', x1: 60, y1: 0, x2: 100, y2: 40, x: 100, y: 50 },
                { kind: 'close' },
              ],
            },
          ],
        },
      },
      textBody: {
        paragraphs: [
          {
            runs: [
              {
                kind: 'run',
                text: 'Hello',
                properties: {
                  fontSize: 2400,
                  fontFamily: 'Calibri',
                  bold: true,
                  italic: false,
                  underline: 'wavyDouble',
                  color: { r: 255, g: 255, b: 255, a: 1 },
                },
              },
              { kind: 'lineBreak', properties: {} },
              {
                kind: 'run',
                text: 'World',
                properties: {
                  fontSize: 1800,
                  baseline: 30,
                },
              },
            ],
            properties: {
              alignment: 'justify',
              level: 0,
              spaceBefore: { value: 12, unit: 'pt' },
              lineSpacing: { value: 150, unit: 'pct' },
            },
            bulletProperties: {
              type: 'autoNum',
              autoNumType: 'romanUcPeriod',
              startAt: 1,
              color: { r: 100, g: 100, b: 100, a: 1 },
              sizePercent: 75,
            },
          },
        ],
        bodyProperties: {
          wrap: 'square',
          verticalAlign: 'top',
          leftInset: 91440,
          rightInset: 91440,
          topInset: 45720,
          bottomInset: 45720,
          autoFit: 'shrink',
        },
      },
      placeholderType: 'body',
      placeholderIndex: 1,
    };

    const roundTripped = jsonRoundTrip(shape);
    expect(roundTripped).toEqual(shape);
  });
});
