/**
 * Base wrapper for form fields — native COS mode only.
 *
 * Wraps a NativeFieldInfo from NativeFormReader.
 */

import type { NativeFieldInfo } from '../NativeFormReader.js';
import {
  FF_READ_ONLY,
  FF_REQUIRED,
  FF_NO_EXPORT,
} from '../NativeFormReader.js';

export class PDFField {
  /** @internal — native field info */ readonly _native?: NativeFieldInfo;

  /** @internal */
  constructor(native: NativeFieldInfo) {
    this._native = native;
  }

  /** @internal */
  static _wrapNative(info: NativeFieldInfo): PDFField {
    return new PDFField(info);
  }

  get ref(): never {
    throw new Error('PDFField.ref is not available on native fields.');
  }

  getName(): string {
    return this._native!.name;
  }

  isReadOnly(): boolean {
    return (this._native!.flags & FF_READ_ONLY) !== 0;
  }

  enableReadOnly(): void {
    this._native!.flags |= FF_READ_ONLY;
  }

  disableReadOnly(): void {
    this._native!.flags &= ~FF_READ_ONLY;
  }

  isRequired(): boolean {
    return (this._native!.flags & FF_REQUIRED) !== 0;
  }

  enableRequired(): void {
    this._native!.flags |= FF_REQUIRED;
  }

  disableRequired(): void {
    this._native!.flags &= ~FF_REQUIRED;
  }

  isExported(): boolean {
    return (this._native!.flags & FF_NO_EXPORT) === 0;
  }

  enableExporting(): void {
    this._native!.flags &= ~FF_NO_EXPORT;
  }

  disableExporting(): void {
    this._native!.flags |= FF_NO_EXPORT;
  }
}
