/**
 * Mutable element types for the flat edit model.
 *
 * These types wrap the read-only IR with mutable transform, text, and fill
 * fields. Each editable element keeps a frozen reference to its original IR
 * for diffing/reconstitution, plus granular dirty flags to track which
 * properties have been modified.
 *
 * All spatial values (position, size) are in EMU (English Metric Units),
 * matching the OOXML coordinate system used throughout the IR.
 */

import type { SlideElementIR, FillIR } from '../ir/index.js';

// ---------------------------------------------------------------------------
// Dirty flags -- granular per-field tracking
// ---------------------------------------------------------------------------

/** Tracks which editable properties have been modified. */
export interface DirtyFlags {
  position?: boolean;
  size?: boolean;
  rotation?: boolean;
  text?: boolean;
  fill?: boolean;
  deleted?: boolean;
}

// ---------------------------------------------------------------------------
// Editable transform (mutable, EMU source of truth)
// ---------------------------------------------------------------------------

/** Mutable transform data. All spatial values in EMU. */
export interface EditableTransform {
  /** X offset from parent origin (EMU). */
  x: number;
  /** Y offset from parent origin (EMU). */
  y: number;
  /** Width (EMU). */
  width: number;
  /** Height (EMU). */
  height: number;
  /** Clockwise rotation in degrees (0-360). */
  rotation?: number;
  /** Horizontal flip. */
  flipH?: boolean;
  /** Vertical flip. */
  flipV?: boolean;
}

// ---------------------------------------------------------------------------
// Editable text (populated only when text is edited)
// ---------------------------------------------------------------------------

/** A single run of text with uniform formatting. */
export interface EditableTextRun {
  text: string;
  properties?: Record<string, unknown>; // pass-through of CharacterPropertiesIR
}

/** A paragraph containing one or more text runs. */
export interface EditableParagraph {
  runs: EditableTextRun[];
  properties?: Record<string, unknown>; // pass-through of ParagraphPropertiesIR
}

/** Editable text body -- replaces the original text when present. */
export interface EditableTextBody {
  paragraphs: EditableParagraph[];
}

// ---------------------------------------------------------------------------
// Editable elements (discriminated on 'kind')
// ---------------------------------------------------------------------------

/** Common fields shared by all editable element types. */
export interface EditableElementBase {
  /** Globally unique ID: partUri#shapeId. */
  readonly id: string;
  /** Element kind from IR. */
  readonly kind: SlideElementIR['kind'];
  /** Frozen original IR -- never mutated. */
  readonly originalIR: Readonly<SlideElementIR>;
  /** Which OPC part owns this element. */
  readonly originalPartUri: string;
  /** Granular dirty flags. */
  dirty: DirtyFlags;
  /** Mutable transform (EMU source of truth). */
  transform: EditableTransform;
  /** Soft-delete flag. */
  deleted: boolean;
}

/** Editable shape -- supports text and fill overrides. */
export interface EditableShape extends EditableElementBase {
  kind: 'shape';
  /** Edited text body (populated only when text is modified). */
  textEdits?: EditableTextBody;
  /** Fill override (populated only when fill is modified). */
  fillOverride?: FillIR;
}

/** Editable picture element. */
export interface EditablePicture extends EditableElementBase {
  kind: 'picture';
}

/** Editable group -- contains nested editable children. */
export interface EditableGroup extends EditableElementBase {
  kind: 'group';
  children: EditableElement[];
}

/** Editable connector element. */
export interface EditableConnector extends EditableElementBase {
  kind: 'connector';
}

/** Editable table element. */
export interface EditableTable extends EditableElementBase {
  kind: 'table';
}

/** Editable element for chart/unsupported kinds. */
export interface EditableGeneric extends EditableElementBase {
  kind: 'chart' | 'unsupported';
}

/** Discriminated union of all editable element types. */
export type EditableElement =
  | EditableShape
  | EditablePicture
  | EditableGroup
  | EditableConnector
  | EditableTable
  | EditableGeneric;
