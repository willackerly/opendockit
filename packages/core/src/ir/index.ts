/**
 * Barrel export for all IR types.
 *
 * Usage:
 *   import { FillIR, ShapePropertiesIR, ThemeIR } from '@opendockit/core/ir';
 */

// Common types
export type { RgbaColor, ResolvedColor, BoundingBox, Point, Size } from './common.js';

// DrawingML IR types
export type {
  // Transforms
  TransformIR,
  // Fills
  SolidFillIR,
  GradientStopIR,
  GradientFillIR,
  PatternFillIR,
  PictureFillIR,
  NoFill,
  FillIR,
  // Line / Stroke
  DashStyle,
  LineCap,
  LineJoin,
  CompoundLine,
  LineEnd,
  LineIR,
  // Effects
  OuterShadowIR,
  InnerShadowIR,
  GlowIR,
  ReflectionIR,
  SoftEdgeIR,
  EffectIR,
  // Geometry
  ShapeGuideIR,
  AdjustHandleIR,
  ConnectionSiteIR,
  MoveToCommand,
  LineToCommand,
  ArcToCommand,
  CubicBezierToCommand,
  QuadBezierToCommand,
  CloseCommand,
  PathCommandIR,
  ShapePathIR,
  PresetGeometryIR,
  CustomGeometryIR,
  GeometryIR,
  // Style References
  StyleReferenceIR,
  // Shape Properties
  ShapePropertiesIR,
  // Text
  TextBodyIR,
  BodyPropertiesIR,
  SpacingIR,
  ParagraphIR,
  ParagraphPropertiesIR,
  UnderlineStyle,
  CharacterPropertiesIR,
  RunIR,
  LineBreakIR,
  BulletPropertiesIR,
  ListStyleLevelIR,
  ListStyleIR,
  // Picture
  CropRect,
  TileInfo,
  PictureIR,
  // Group
  GroupIR,
  // Connector
  ConnectionReference,
  ConnectorIR,
  // Table
  TableCellBorders,
  TableCellIR,
  TableRowIR,
  TableIR,
  // Slide elements
  DrawingMLShapeIR,
  UnsupportedIR,
  SlideElementIR,
} from './drawingml-ir.js';

// Theme IR types
export type { ColorSchemeIR, FontSchemeIR, FormatSchemeIR, ThemeIR } from './theme-ir.js';

// Chart IR types (stub)
export type { ChartIR } from './chart-ir.js';
