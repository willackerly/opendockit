/**
 * DrawingML Intermediate Representation types.
 *
 * These types form the contract between OOXML parsers (which produce IR)
 * and Canvas2D renderers (which consume IR). They are plain data — no
 * classes, no methods, no runtime dependencies.
 *
 * Discriminated unions use:
 *   - `type` for fills and effects
 *   - `kind` for slide elements, geometry, runs/linebreaks, and path commands
 *
 * Reference: ECMA-376 5th Edition, Part 1 — DrawingML
 */

import type { BoundingBox, Point, ResolvedColor, Size } from './common.js';

// ═══════════════════════════════════════════════════════════════════════════
// Hyperlinks
// ═══════════════════════════════════════════════════════════════════════════

/** A hyperlink target — external URL, internal slide jump, or action. */
export interface HyperlinkIR {
  /** External URL (e.g. "https://example.com"). */
  url?: string;
  /** Internal slide jump target (0-based slide index). */
  slideIndex?: number;
  /** Hover tooltip text. */
  tooltip?: string;
  /** Raw OOXML action string (e.g. "ppaction://hlinksldjump"). */
  action?: string;
  /**
   * Raw OPC relationship ID (e.g. "rId2") for deferred resolution.
   *
   * At parse time the relationship map is not available. The viewport
   * layer resolves this to a URL or slide reference after parsing.
   */
  relationshipId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Transforms
// ═══════════════════════════════════════════════════════════════════════════

/** 2D transform: position, size, rotation, and flips. */
export interface TransformIR {
  /** Offset from the parent coordinate origin (EMU). */
  position: Point;
  /** Extent in EMU. */
  size: Size;
  /** Clockwise rotation in degrees (0-360). */
  rotation?: number;
  /** Horizontal flip. */
  flipH?: boolean;
  /** Vertical flip. */
  flipV?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Fills — discriminated on `type`
// ═══════════════════════════════════════════════════════════════════════════

export interface SolidFillIR {
  type: 'solid';
  color: ResolvedColor;
}

export interface GradientStopIR {
  /** Position along the gradient path (0-1). */
  position: number;
  color: ResolvedColor;
}

export interface GradientFillIR {
  type: 'gradient';
  kind: 'linear' | 'radial' | 'path';
  /** Angle in degrees for linear gradients. */
  angle?: number;
  stops: GradientStopIR[];
  /** Tile rectangle for path gradients (percentages 0-1). */
  tileRect?: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
}

export interface PatternFillIR {
  type: 'pattern';
  /** OOXML preset pattern name, e.g. "pct5", "dkHorz". */
  preset: string;
  foreground: ResolvedColor;
  background: ResolvedColor;
}

export interface PictureFillIR {
  type: 'picture';
  /** OPC part URI of the referenced image. */
  imagePartUri: string;
  /** Whether the image is stretched to fill the shape bounds. */
  stretch?: boolean;
  /** Tile settings when the image is tiled. */
  tile?: TileInfo;
  /** Source crop rectangle (percentages 0-1). */
  crop?: CropRect;
}

export interface NoFill {
  type: 'none';
}

/** Discriminated union of all fill types. */
export type FillIR = SolidFillIR | GradientFillIR | PatternFillIR | PictureFillIR | NoFill;

// ═══════════════════════════════════════════════════════════════════════════
// Line / Stroke
// ═══════════════════════════════════════════════════════════════════════════

/** Dash presets from ECMA-376 ST_PresetLineDashVal. */
export type DashStyle =
  | 'solid'
  | 'dash'
  | 'dot'
  | 'dashDot'
  | 'lgDash'
  | 'lgDashDot'
  | 'lgDashDotDot'
  | 'sysDash'
  | 'sysDot'
  | 'sysDashDot'
  | 'sysDashDotDot';

/** Line cap style. */
export type LineCap = 'flat' | 'round' | 'square';

/** Line join style. */
export type LineJoin = 'round' | 'bevel' | 'miter';

/** Compound line type. */
export type CompoundLine = 'single' | 'double' | 'thickThin' | 'thinThick' | 'triple';

/** Line end decoration (arrowhead). */
export interface LineEnd {
  type: 'none' | 'triangle' | 'stealth' | 'diamond' | 'oval' | 'arrow';
  width?: 'sm' | 'med' | 'lg';
  length?: 'sm' | 'med' | 'lg';
}

/** Line formatting properties. */
export interface LineIR {
  color?: ResolvedColor;
  /** Line width in EMU. */
  width?: number;
  dashStyle?: DashStyle;
  compound?: CompoundLine;
  cap?: LineCap;
  join?: LineJoin;
  headEnd?: LineEnd;
  tailEnd?: LineEnd;
}

// ═══════════════════════════════════════════════════════════════════════════
// Effects — discriminated on `type`
// ═══════════════════════════════════════════════════════════════════════════

export interface OuterShadowIR {
  type: 'outerShadow';
  /** Blur radius in EMU. */
  blurRadius: number;
  /** Distance from shape in EMU. */
  distance: number;
  /** Direction in degrees (0 = right, 90 = bottom). */
  direction: number;
  color: ResolvedColor;
  /** Alignment of the shadow relative to the shape, e.g. "ctr", "tl". */
  alignment?: string;
}

export interface InnerShadowIR {
  type: 'innerShadow';
  /** Blur radius in EMU. */
  blurRadius: number;
  /** Distance from shape edge inward in EMU. */
  distance: number;
  /** Direction in degrees. */
  direction: number;
  color: ResolvedColor;
}

export interface GlowIR {
  type: 'glow';
  /** Glow radius in EMU. */
  radius: number;
  color: ResolvedColor;
}

export interface ReflectionIR {
  type: 'reflection';
  /** Blur radius in EMU. */
  blurRadius: number;
  /** Start opacity (0-1). */
  startOpacity: number;
  /** End opacity (0-1). */
  endOpacity: number;
  /** Distance from shape in EMU. */
  distance: number;
  /** Direction in degrees. */
  direction: number;
  /** Fade direction in degrees. */
  fadeDirection: number;
}

export interface SoftEdgeIR {
  type: 'softEdge';
  /** Soft edge radius in EMU. */
  radius: number;
}

/** Discriminated union of all effect types. */
export type EffectIR = OuterShadowIR | InnerShadowIR | GlowIR | ReflectionIR | SoftEdgeIR;

// ═══════════════════════════════════════════════════════════════════════════
// Geometry
// ═══════════════════════════════════════════════════════════════════════════

/** A named formula used for computing geometry guide values. */
export interface ShapeGuideIR {
  /** Guide name (used as a variable in other formulas). */
  name: string;
  /** Formula expression, e.g. "* / w adj1 100000". */
  formula: string;
}

/** Adjust handle for interactive shape resizing (authoring). */
export interface AdjustHandleIR {
  /** Guide name that this handle adjusts. */
  guideName: string;
  /** Minimum value. */
  minVal?: number;
  /** Maximum value. */
  maxVal?: number;
  /** X position formula/guide name. */
  posX?: string;
  /** Y position formula/guide name. */
  posY?: string;
}

/** Connection site on a shape for connectors. */
export interface ConnectionSiteIR {
  /** Angle in degrees. */
  angle: number;
  /** X position formula/guide name. */
  posX: string;
  /** Y position formula/guide name. */
  posY: string;
}

// -- Path commands (discriminated on `kind`) --

export interface MoveToCommand {
  kind: 'moveTo';
  x: number;
  y: number;
}

export interface LineToCommand {
  kind: 'lineTo';
  x: number;
  y: number;
}

export interface ArcToCommand {
  kind: 'arcTo';
  /** Width radius. */
  wR: number;
  /** Height radius. */
  hR: number;
  /** Start angle in degrees. */
  startAngle: number;
  /** Sweep angle in degrees. */
  sweepAngle: number;
}

export interface CubicBezierToCommand {
  kind: 'cubicBezierTo';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x: number;
  y: number;
}

export interface QuadBezierToCommand {
  kind: 'quadBezierTo';
  x1: number;
  y1: number;
  x: number;
  y: number;
}

export interface CloseCommand {
  kind: 'close';
}

export type PathCommandIR =
  | MoveToCommand
  | LineToCommand
  | ArcToCommand
  | CubicBezierToCommand
  | QuadBezierToCommand
  | CloseCommand;

/** A single sub-path within a custom geometry. */
export interface ShapePathIR {
  /** Coordinate-space width (defaults to shape width if absent). */
  width?: number;
  /** Coordinate-space height (defaults to shape height if absent). */
  height?: number;
  /** Fill mode for this sub-path. */
  fill?: 'norm' | 'none' | 'lighten' | 'lightenLess' | 'darken' | 'darkenLess';
  /** Whether this sub-path should be stroked. */
  stroke?: boolean;
  commands: PathCommandIR[];
}

/** Preset geometry — uses a named shape from OOXML presets. */
export interface PresetGeometryIR {
  kind: 'preset';
  /** Preset shape name, e.g. "rect", "roundRect", "ellipse". */
  name: string;
  /** Adjust values keyed by handle name, e.g. { adj: 16667 }. */
  adjustValues?: Record<string, number>;
}

/** Custom geometry — explicitly defined paths and guides. */
export interface CustomGeometryIR {
  kind: 'custom';
  guides: ShapeGuideIR[];
  adjustHandles?: AdjustHandleIR[];
  paths: ShapePathIR[];
  connectionSites?: ConnectionSiteIR[];
}

/** Discriminated union of geometry types. */
export type GeometryIR = PresetGeometryIR | CustomGeometryIR;

// ═══════════════════════════════════════════════════════════════════════════
// Style References
// ═══════════════════════════════════════════════════════════════════════════

/** Style references from p:style — theme format scheme lookups. */
export interface StyleReferenceIR {
  /** Fill style reference (1-based index into theme fillStyles). */
  fillRef?: { idx: number; color?: ResolvedColor };
  /** Line style reference (1-based index into theme lineStyles). */
  lnRef?: { idx: number; color?: ResolvedColor };
  /** Effect style reference (1-based index into theme effectStyles). */
  effectRef?: { idx: number; color?: ResolvedColor };
  /** Font style reference. */
  fontRef?: { idx: 'major' | 'minor'; color?: ResolvedColor };
}

// ═══════════════════════════════════════════════════════════════════════════
// Shape Properties (aggregate)
// ═══════════════════════════════════════════════════════════════════════════

/** Aggregated visual properties for any DrawingML shape. */
export interface ShapePropertiesIR {
  transform?: TransformIR;
  fill?: FillIR;
  line?: LineIR;
  effects: EffectIR[];
  geometry?: GeometryIR;
}

// ═══════════════════════════════════════════════════════════════════════════
// Text
// ═══════════════════════════════════════════════════════════════════════════

/** Text body — a sequence of paragraphs with body-level formatting. */
export interface TextBodyIR {
  paragraphs: ParagraphIR[];
  bodyProperties: BodyPropertiesIR;
  /** List style defaults from a:lstStyle (per-level paragraph/bullet/character defaults). */
  listStyle?: ListStyleIR;
}

/** Body-level text properties (wrapping, margins, auto-fit). */
export interface BodyPropertiesIR {
  /** Text wrapping mode. */
  wrap?: 'square' | 'none';
  /** Vertical alignment of text within the text body. */
  verticalAlign?: 'top' | 'middle' | 'bottom' | 'bottom4' | 'distributed';
  /** Center text horizontally within the bounding box. */
  anchorCtr?: boolean;
  /** Left inset in EMU. */
  leftInset?: number;
  /** Right inset in EMU. */
  rightInset?: number;
  /** Top inset in EMU. */
  topInset?: number;
  /** Bottom inset in EMU. */
  bottomInset?: number;
  /** Number of text columns. */
  columns?: number;
  /** Spacing between columns in EMU. */
  columnSpacing?: number;
  /** Auto-fit behavior. */
  autoFit?: 'none' | 'shrink' | 'spAutoFit';
  /** Font scale factor (percentage, e.g. 80 means 80%). Only for 'shrink'. */
  fontScale?: number;
  /** Line spacing reduction (percentage). Only for 'shrink'. */
  lnSpcReduction?: number;
  /** Text rotation in degrees (independent of shape rotation). */
  rotation?: number;
}

/** Spacing value — either in points or as a percentage of font size. */
export interface SpacingIR {
  value: number;
  /** "pt" for absolute points, "pct" for percentage (100 = single space). */
  unit: 'pt' | 'pct';
}

/** A single paragraph. */
export interface ParagraphIR {
  runs: (RunIR | LineBreakIR)[];
  properties: ParagraphPropertiesIR;
  bulletProperties?: BulletPropertiesIR;
}

/** Paragraph-level formatting. */
export interface ParagraphPropertiesIR {
  alignment?: 'left' | 'center' | 'right' | 'justify' | 'distributed';
  /** Outline level (0-8). */
  level?: number;
  /** First-line indent in EMU. */
  indent?: number;
  /** Left margin in EMU. */
  marginLeft?: number;
  /** Spacing before the paragraph. */
  spaceBefore?: SpacingIR;
  /** Spacing after the paragraph. */
  spaceAfter?: SpacingIR;
  /** Line spacing. */
  lineSpacing?: SpacingIR;
  /** Right-to-left text direction. */
  rtl?: boolean;
}

/** Underline style variants from ECMA-376 ST_TextUnderlineType. */
export type UnderlineStyle =
  | 'none'
  | 'single'
  | 'double'
  | 'heavy'
  | 'dotted'
  | 'dottedHeavy'
  | 'dash'
  | 'dashHeavy'
  | 'dashLong'
  | 'dashLongHeavy'
  | 'dotDash'
  | 'dotDashHeavy'
  | 'dotDotDash'
  | 'dotDotDashHeavy'
  | 'wavy'
  | 'wavyHeavy'
  | 'wavyDouble';

/** Character-level formatting. */
export interface CharacterPropertiesIR {
  /** Font size in hundredths of a point (e.g. 1200 = 12pt). */
  fontSize?: number;
  /** Primary font family name. */
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: UnderlineStyle;
  strikethrough?: 'none' | 'single' | 'double';
  color?: ResolvedColor;
  highlight?: ResolvedColor;
  /** Superscript/subscript baseline offset percentage (-100 to +100). */
  baseline?: number;
  /** Letter spacing in EMU. */
  spacing?: number;
  /** Latin font typeface name. */
  latin?: string;
  /** East Asian font typeface name. */
  eastAsian?: string;
  /** Complex script font typeface name. */
  complexScript?: string;
}

/** A run of text with uniform character formatting. */
export interface RunIR {
  kind: 'run';
  text: string;
  properties: CharacterPropertiesIR;
  /** Hyperlink attached to this run (from a:hlinkClick on a:rPr). */
  hyperlink?: HyperlinkIR;
}

/** A forced line break within a paragraph. */
export interface LineBreakIR {
  kind: 'lineBreak';
  properties: CharacterPropertiesIR;
}

/** Per-level text style defaults from a:lstStyle or p:txStyles. */
export interface ListStyleLevelIR {
  paragraphProperties?: ParagraphPropertiesIR;
  bulletProperties?: BulletPropertiesIR;
  defaultCharacterProperties?: CharacterPropertiesIR;
}

/** List style — level-based paragraph/bullet/character defaults. */
export interface ListStyleIR {
  defPPr?: ListStyleLevelIR;
  levels: Record<number, ListStyleLevelIR>; // keys 0-8 (lvl1pPr=0 ... lvl9pPr=8)
}

/** Bullet/numbering properties for a paragraph. */
export interface BulletPropertiesIR {
  type: 'none' | 'char' | 'autoNum' | 'picture';
  /** Bullet character (when type is 'char'). */
  char?: string;
  /** Auto-numbering scheme, e.g. "arabicPeriod", "romanUcPeriod". */
  autoNumType?: string;
  /** Starting number for auto-numbering. */
  startAt?: number;
  /** Bullet color override. */
  color?: ResolvedColor;
  /** Bullet size as percentage of the text font size. */
  sizePercent?: number;
  /** Bullet font family. */
  font?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Picture
// ═══════════════════════════════════════════════════════════════════════════

/** Crop rectangle (percentages 0-1, measured inward from each edge). */
export interface CropRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Tile information for tiled picture fills. */
export interface TileInfo {
  /** Horizontal offset in EMU. */
  offsetX: number;
  /** Vertical offset in EMU. */
  offsetY: number;
  /** Horizontal scale factor (1 = 100%). */
  scaleX: number;
  /** Vertical scale factor (1 = 100%). */
  scaleY: number;
  /** Tile flip mode. */
  flip?: 'none' | 'x' | 'y' | 'xy';
  /** Tile alignment, e.g. "tl", "ctr", "br". */
  alignment?: string;
}

/** A picture element — an image placed on a slide. */
export interface PictureIR {
  kind: 'picture';
  /** OPC part URI of the referenced image. */
  imagePartUri: string;
  properties: ShapePropertiesIR;
  blipFill?: {
    crop?: CropRect;
    stretch?: boolean;
    tile?: TileInfo;
  };
  nonVisualProperties: {
    name: string;
    description?: string;
    hidden?: boolean;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Group
// ═══════════════════════════════════════════════════════════════════════════

/** A group shape — a container that nests other slide elements. */
export interface GroupIR {
  kind: 'group';
  properties: ShapePropertiesIR;
  /** Child coordinate space origin. */
  childOffset: Point;
  /** Child coordinate space extent. */
  childExtent: Size;
  children: SlideElementIR[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Connector
// ═══════════════════════════════════════════════════════════════════════════

/** Connection endpoint reference. */
export interface ConnectionReference {
  shapeId: string;
  connectionSiteIndex: number;
}

/** A connector shape — a line connecting two shapes. */
export interface ConnectorIR {
  kind: 'connector';
  properties: ShapePropertiesIR;
  startConnection?: ConnectionReference;
  endConnection?: ConnectionReference;
}

// ═══════════════════════════════════════════════════════════════════════════
// Table
// ═══════════════════════════════════════════════════════════════════════════

/** Table cell borders. */
export interface TableCellBorders {
  left?: LineIR;
  right?: LineIR;
  top?: LineIR;
  bottom?: LineIR;
}

/** A single cell within a table row. */
export interface TableCellIR {
  textBody?: TextBodyIR;
  fill?: FillIR;
  borders?: TableCellBorders;
  /** Number of columns this cell spans. */
  gridSpan?: number;
  /** Number of rows this cell spans. */
  rowSpan?: number;
  /** Whether this cell is horizontally merged (continuation cell). */
  hMerge?: boolean;
  /** Whether this cell is vertically merged (continuation cell). */
  vMerge?: boolean;
}

/** A single row in a table. */
export interface TableRowIR {
  /** Row height in EMU. */
  height: number;
  cells: TableCellIR[];
}

/** A table element — a grid of cells with text and formatting. */
export interface TableIR {
  kind: 'table';
  properties: ShapePropertiesIR;
  rows: TableRowIR[];
  /** Column widths in EMU from `a:tblGrid/a:gridCol`. */
  columnWidths?: number[];
  /** OOXML table style GUID. */
  tableStyle?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Slide Elements — discriminated on `kind`
// ═══════════════════════════════════════════════════════════════════════════

/** A standard DrawingML shape (rectangle, ellipse, freeform, etc.). */
export interface DrawingMLShapeIR {
  kind: 'shape';
  /** Shape identifier (unique per slide). */
  id?: string;
  /** Shape name from the non-visual properties, e.g. "Title 1". */
  name?: string;
  properties: ShapePropertiesIR;
  /** Style references from p:style — theme format scheme lookups. */
  style?: StyleReferenceIR;
  textBody?: TextBodyIR;
  /** Placeholder type, e.g. "title", "body", "ctrTitle". */
  placeholderType?: string;
  /** Placeholder index. */
  placeholderIndex?: number;
  /** Shape-level hyperlink (from a:hlinkClick on p:cNvPr). */
  hyperlink?: HyperlinkIR;
}

/** Placeholder for unsupported or unrecognized element types. */
export interface UnsupportedIR {
  kind: 'unsupported';
  /** Original XML element type, e.g. "mc:AlternateContent". */
  elementType: string;
  /** Bounding box if one could be determined. */
  bounds?: BoundingBox;
  /** Human-readable reason the element was not parsed. */
  reason: string;
}

// Import chart type from its own module (re-exported below via barrel).
// The chart-ir module is a forward-reference stub.
import type { ChartIR } from './chart-ir.js';

/**
 * Union of all slide element types.
 *
 * Switch on `kind` to narrow:
 * ```ts
 * switch (element.kind) {
 *   case 'shape': ...
 *   case 'picture': ...
 *   case 'group': ...
 *   case 'connector': ...
 *   case 'table': ...
 *   case 'chart': ...
 *   case 'unsupported': ...
 * }
 * ```
 */
export type SlideElementIR =
  | DrawingMLShapeIR
  | PictureIR
  | GroupIR
  | ConnectorIR
  | TableIR
  | ChartIR
  | UnsupportedIR;
