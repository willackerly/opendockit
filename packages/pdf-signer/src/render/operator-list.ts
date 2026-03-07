/**
 * OperatorList — Container for rendering operations.
 *
 * Two parallel arrays:
 *   fnArray[i]   = OPS integer code (what operation to perform)
 *   argsArray[i] = arguments for that operation (null if none)
 *
 * This is the seam between evaluation (content stream → ops) and
 * rendering (ops → Canvas 2D). Same format as PDF.js's OperatorList
 * so we can eventually replace PDF.js piece by piece.
 */

import type { OPSCode } from './ops.js';

export class OperatorList {
  fnArray: OPSCode[] = [];
  argsArray: (any[] | null)[] = [];

  /** Total number of operations. */
  get length(): number {
    return this.fnArray.length;
  }

  /** Add an operation with no arguments. */
  addOp(fn: OPSCode): void {
    this.fnArray.push(fn);
    this.argsArray.push(null);
  }

  /** Add an operation with arguments. */
  addOpArgs(fn: OPSCode, args: any[]): void {
    this.fnArray.push(fn);
    this.argsArray.push(args);
  }

  /** Append all operations from another OperatorList. */
  addAll(other: OperatorList): void {
    for (let i = 0; i < other.length; i++) {
      this.fnArray.push(other.fnArray[i]);
      this.argsArray.push(other.argsArray[i]);
    }
  }
}
