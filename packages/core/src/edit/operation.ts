/** A single undoable/redoable operation. */
export interface Operation {
  /** Unique element ID (partUri#shapeId format). */
  elementId: string;
  /** The field that was changed. */
  field: string;
  /** Value before the change. */
  oldValue: unknown;
  /** Value after the change. */
  newValue: unknown;
  /** Timestamp of the operation. */
  timestamp: number;
}

/** A group of operations that should undo/redo together. */
export interface Transaction {
  /** Human-readable label (e.g., "Move shape", "Edit text"). */
  label: string;
  /** Operations in this transaction. */
  operations: Operation[];
  /** Timestamp when the transaction was committed. */
  timestamp: number;
}
