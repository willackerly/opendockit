/**
 * Option interfaces for PDF document operations.
 * Native implementation — structurally identical to pdf-lib's option types.
 */

import type { Color } from './colors.js';
import type { Rotation } from './rotations.js';
import type { PDFFont } from './PDFFont.js';

// --- Document options ---

export enum ParseSpeeds {
  Fastest = Infinity,
  Fast = 1500,
  Medium = 500,
  Slow = 100,
}

export interface LoadOptions {
  ignoreEncryption?: boolean;
  /** Password for encrypted PDFs. Tries as user password first, then owner password. */
  password?: string;
  parseSpeed?: ParseSpeeds | number;
  throwOnInvalidObject?: boolean;
  updateMetadata?: boolean;
  capNumbers?: boolean;
}

export interface CreateOptions {
  updateMetadata?: boolean;
}

export interface SaveOptions {
  useObjectStreams?: boolean;
  addDefaultPage?: boolean;
  objectsPerTick?: number;
  updateFieldAppearances?: boolean;
  /** Apply PDF/A conformance at save time. Adds XMP metadata, sRGB ICC profile, and OutputIntents. */
  pdfaConformance?: 'PDF/A-1b' | 'PDF/A-2b' | 'PDF/A-3b';
  /** Encrypt the PDF on save. Only AES-128 and AES-256 are supported. */
  encrypt?: {
    userPassword?: string;
    ownerPassword: string;
    permissions?: import('../pdfbox/crypto/PDFEncryptor').PDFPermissions;
    keyLength?: 128 | 256;
  };
}

export interface Base64SaveOptions extends SaveOptions {
  dataUri?: boolean;
}

export interface EmbedFontOptions {
  subset?: boolean;
  customName?: string;
  features?: Record<string, boolean>;
}

export interface SetTitleOptions {
  showInWindowTitleBar: boolean;
}

export enum AFRelationship {
  Source = 'Source',
  Data = 'Data',
  Alternative = 'Alternative',
  Supplement = 'Supplement',
  EncryptedPayload = 'EncryptedPayload',
  FormData = 'EncryptedPayload',
  Schema = 'Schema',
  Unspecified = 'Unspecified',
}

export interface AttachmentOptions {
  mimeType?: string;
  description?: string;
  creationDate?: Date;
  modificationDate?: Date;
  afRelationship?: AFRelationship;
}

// --- Drawing options ---

export enum BlendMode {
  Normal = 'Normal',
  Multiply = 'Multiply',
  Screen = 'Screen',
  Overlay = 'Overlay',
  Darken = 'Darken',
  Lighten = 'Lighten',
  ColorDodge = 'ColorDodge',
  ColorBurn = 'ColorBurn',
  HardLight = 'HardLight',
  SoftLight = 'SoftLight',
  Difference = 'Difference',
  Exclusion = 'Exclusion',
}

export enum LineCapStyle {
  Butt = 0,
  Round = 1,
  Projecting = 2,
}

export enum TextRenderingMode {
  Fill = 0,
  Outline = 1,
  FillAndOutline = 2,
  Invisible = 3,
  FillAndClip = 4,
  OutlineAndClip = 5,
  FillAndOutlineAndClip = 6,
  Clip = 7,
}

export enum TextAlignment {
  Left = 0,
  Center = 1,
  Right = 2,
}

export enum ImageAlignment {
  Left = 0,
  Center = 1,
  Right = 2,
}

export interface PDFPageDrawTextOptions {
  color?: Color;
  opacity?: number;
  blendMode?: BlendMode;
  font?: PDFFont;
  size?: number;
  rotate?: Rotation;
  xSkew?: Rotation;
  ySkew?: Rotation;
  x?: number;
  y?: number;
  lineHeight?: number;
  maxWidth?: number;
  wordBreaks?: string[];
}

export interface PDFPageDrawImageOptions {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotate?: Rotation;
  xSkew?: Rotation;
  ySkew?: Rotation;
  opacity?: number;
  blendMode?: BlendMode;
}

export interface PDFPageDrawPageOptions {
  x?: number;
  y?: number;
  xScale?: number;
  yScale?: number;
  width?: number;
  height?: number;
  rotate?: Rotation;
  xSkew?: Rotation;
  ySkew?: Rotation;
  opacity?: number;
  blendMode?: BlendMode;
}

export interface PDFPageDrawSVGOptions {
  x?: number;
  y?: number;
  scale?: number;
  rotate?: Rotation;
  borderWidth?: number;
  color?: Color;
  opacity?: number;
  borderColor?: Color;
  borderOpacity?: number;
  borderDashArray?: number[];
  borderDashPhase?: number;
  borderLineCap?: LineCapStyle;
  blendMode?: BlendMode;
}

export interface PDFPageDrawLineOptions {
  start: { x: number; y: number };
  end: { x: number; y: number };
  thickness?: number;
  color?: Color;
  opacity?: number;
  lineCap?: LineCapStyle;
  dashArray?: number[];
  dashPhase?: number;
  blendMode?: BlendMode;
}

export interface PDFPageDrawRectangleOptions {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotate?: Rotation;
  xSkew?: Rotation;
  ySkew?: Rotation;
  borderWidth?: number;
  color?: Color;
  opacity?: number;
  borderColor?: Color;
  borderOpacity?: number;
  borderDashArray?: number[];
  borderDashPhase?: number;
  borderLineCap?: LineCapStyle;
  blendMode?: BlendMode;
}

export interface PDFPageDrawSquareOptions {
  x?: number;
  y?: number;
  size?: number;
  rotate?: Rotation;
  xSkew?: Rotation;
  ySkew?: Rotation;
  borderWidth?: number;
  color?: Color;
  opacity?: number;
  borderColor?: Color;
  borderOpacity?: number;
  borderDashArray?: number[];
  borderDashPhase?: number;
  borderLineCap?: LineCapStyle;
  blendMode?: BlendMode;
}

export interface PDFPageDrawEllipseOptions {
  x?: number;
  y?: number;
  xScale?: number;
  yScale?: number;
  rotate?: Rotation;
  color?: Color;
  opacity?: number;
  borderColor?: Color;
  borderOpacity?: number;
  borderWidth?: number;
  borderDashArray?: number[];
  borderDashPhase?: number;
  borderLineCap?: LineCapStyle;
  blendMode?: BlendMode;
}

export interface PDFPageDrawCircleOptions {
  x?: number;
  y?: number;
  size?: number;
  color?: Color;
  opacity?: number;
  borderColor?: Color;
  borderOpacity?: number;
  borderWidth?: number;
  borderDashArray?: number[];
  borderDashPhase?: number;
  borderLineCap?: LineCapStyle;
  blendMode?: BlendMode;
}

// --- Form field options ---

export interface FieldAppearanceOptions {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  textColor?: Color;
  backgroundColor?: Color;
  borderColor?: Color;
  borderWidth?: number;
  rotate?: Rotation;
  font?: PDFFont;
  hidden?: boolean;
}

export interface FlattenOptions {
  updateFieldAppearances: boolean;
}
