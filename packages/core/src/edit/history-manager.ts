import type { Operation, Transaction } from './operation.js';

/**
 * Tracks undo/redo history as a stack of transactions.
 *
 * This is a standalone tracker — it does not call EditablePresentation
 * methods directly. The caller is responsible for actually applying
 * undo/redo by reversing the returned operations.
 */
export class HistoryManager {
  private undoStack: Transaction[] = [];
  private redoStack: Transaction[] = [];
  private pendingOps: Operation[] = [];
  private pendingLabel: string | null = null;
  private readonly maxStackSize: number;

  constructor(maxStackSize = 100) {
    this.maxStackSize = maxStackSize;
  }

  /**
   * Record an operation. If no transaction is in progress via
   * {@link beginTransaction}, the operation is auto-committed as a
   * single-op transaction.
   */
  record(op: Operation): void {
    if (this.pendingLabel !== null) {
      this.pendingOps.push(op);
    } else {
      // Auto-commit as a single-op transaction.
      this.undoStack.push({
        label: op.field,
        operations: [op],
        timestamp: op.timestamp,
      });
      this.redoStack.length = 0;
      this.trimStack();
    }
  }

  /** Begin a transaction group. All ops until {@link commit} are grouped. */
  beginTransaction(label: string): void {
    this.pendingLabel = label;
    this.pendingOps = [];
  }

  /**
   * Commit pending ops as a single transaction.
   * No-op if there are no pending operations.
   */
  commit(): void {
    if (this.pendingOps.length > 0) {
      this.undoStack.push({
        label: this.pendingLabel ?? 'unnamed',
        operations: [...this.pendingOps],
        timestamp: Date.now(),
      });
      this.redoStack.length = 0;
      this.trimStack();
    }
    this.pendingLabel = null;
    this.pendingOps = [];
  }

  /** Undo the last transaction. Returns the transaction to reverse, or null. */
  undo(): Transaction | null {
    const tx = this.undoStack.pop();
    if (!tx) return null;
    this.redoStack.push(tx);
    return tx;
  }

  /** Redo the last undone transaction. Returns the transaction to replay, or null. */
  redo(): Transaction | null {
    const tx = this.redoStack.pop();
    if (!tx) return null;
    this.undoStack.push(tx);
    return tx;
  }

  /** Whether undo is available. */
  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Whether redo is available. */
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Number of undo steps available. */
  get undoCount(): number {
    return this.undoStack.length;
  }

  /** Number of redo steps available. */
  get redoCount(): number {
    return this.redoStack.length;
  }

  /** Clear all history. */
  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.pendingOps = [];
    this.pendingLabel = null;
  }

  private trimStack(): void {
    while (this.undoStack.length > this.maxStackSize) {
      this.undoStack.shift();
    }
  }
}
