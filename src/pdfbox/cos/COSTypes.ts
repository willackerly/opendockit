/**
 * COSTypes - PDF Object Types for Signature Creation
 *
 * =============================================================================
 * PORTED FROM: Apache PDFBox COS classes
 * Sources:
 * - COSName.java
 * - COSInteger.java
 * - COSString.java
 * - COSArray.java
 * - COSDictionary.java
 * =============================================================================
 *
 * This file consolidates the essential COS types needed for PDF signatures.
 * For full PDF object serialization (streams, floats, etc.), refer to PDFBox
 * sources listed above.
 */

import type { COSBase } from './COSBase';
import type { COSWriter } from '../writer/COSWriter';
import { markObjectUpdated } from './COSUpdateInfo';
import { COSObjectKey } from '../writer/COSObjectKey';

/**
 * COSName - PDF Name Object
 *
 * PORTED FROM: COSName.java
 *
 * PDF names start with "/" and represent identifiers: /Type, /Page, /Contents
 * Names must be properly escaped (spaces become #20, etc.)
 */
export class COSName implements COSBase {
  private value: string;
  private direct: boolean = true; // Names are always direct

  constructor(name: string) {
    // Remove leading "/" if present
    this.value = name.startsWith('/') ? name.substring(1) : name;
  }

  getName(): string {
    return this.value;
  }

  accept(visitor: COSWriter): void {
    visitor.visitFromName(this);
  }

  isDirect(): boolean {
    return this.direct;
  }

  setDirect(direct: boolean): void {
    this.direct = direct;
  }

  /**
   * Get properly formatted PDF name with escaping
   * PORTED FROM: COSName.java writePDF()
   */
  toPDFString(): string {
    let result = '/';
    for (let i = 0; i < this.value.length; i++) {
      const char = this.value[i];
      const code = this.value.charCodeAt(i);

      // Characters that need hex escaping (ISO 32000-1:2008 Section 7.3.5)
      if (code < 33 || code > 126 || '/#()<>[]{}%'.includes(char)) {
        result += '#' + code.toString(16).padStart(2, '0').toUpperCase();
      } else {
        result += char;
      }
    }
    return result;
  }

  // Common PDF names as constants (like PDFBox COSName constants)
  static readonly TYPE = new COSName('Type');
  static readonly SUBTYPE = new COSName('Subtype');
  static readonly SUBFILTER = new COSName('SubFilter');
  static readonly FILTER = new COSName('Filter');
  static readonly SIG = new COSName('Sig');
  static readonly BYTERANGE = new COSName('ByteRange');
  static readonly CONTENTS = new COSName('Contents');
  static readonly M = new COSName('M');
  static readonly NAME = new COSName('Name');
  static readonly REASON = new COSName('Reason');
  static readonly LOCATION = new COSName('Location');
  static readonly CONTACT_INFO = new COSName('ContactInfo');
  static readonly V = new COSName('V');
  static readonly T = new COSName('T');
  static readonly FT = new COSName('FT');
  static readonly KIDS = new COSName('Kids');
  static readonly P = new COSName('P');
  static readonly RECT = new COSName('Rect');
  static readonly F = new COSName('F');
  static readonly SIZE = new COSName('Size');
  static readonly ROOT = new COSName('Root');
  static readonly INFO = new COSName('Info');
  static readonly ENCRYPT = new COSName('Encrypt');
  static readonly PREV = new COSName('Prev');
  static readonly ID = new COSName('ID');
  static readonly XREF = new COSName('XRef');
  static readonly LENGTH = new COSName('Length');
  static readonly INDEX = new COSName('Index');
  static readonly N = new COSName('N');
  static readonly FIRST = new COSName('First');
}

/**
 * COSInteger - PDF Integer Object
 *
 * PORTED FROM: COSInteger.java
 */
export class COSInteger implements COSBase {
  private value: number;
  private direct: boolean = true;

  constructor(value: number) {
    this.value = Math.floor(value); // Ensure integer
  }

  getValue(): number {
    return this.value;
  }

  accept(visitor: COSWriter): void {
    visitor.visitFromInt(this);
  }

  isDirect(): boolean {
    return this.direct;
  }

  setDirect(direct: boolean): void {
    this.direct = direct;
  }

  toPDFString(): string {
    return this.value.toString();
  }

  static readonly ZERO = new COSInteger(0);
}

/**
 * COSFloat - PDF real number object.
 */
export class COSFloat implements COSBase {
  private value: number;
  private direct: boolean = true;
  private raw?: string;

  constructor(value: number, raw?: string) {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid float value for COSFloat: ${value}`);
    }
    this.value = value;
    this.raw = raw;
  }

  getValue(): number {
    return this.value;
  }

  accept(visitor: COSWriter): void {
    visitor.visitFromFloat(this);
  }

  isDirect(): boolean {
    return this.direct;
  }

  setDirect(direct: boolean): void {
    this.direct = direct;
  }

  toPDFString(): string {
    if (this.raw) {
      return this.raw;
    }
    if (Number.isInteger(this.value)) {
      return this.value.toString();
    }
    const formatted = this.value.toFixed(6).replace(/\.?0+$/, '');
    return formatted === '-0' ? '0' : formatted;
  }
}

/**
 * COSString - PDF String Object
 *
 * PORTED FROM: COSString.java
 *
 * PDF strings come in two forms:
 * - Literal: (Hello World)
 * - Hex: <48656C6C6F20576F726C64>
 */
export class COSString implements COSBase {
  private value: Uint8Array;
  private direct: boolean = true;
  private forceHex: boolean = false;

  constructor(value: string | Uint8Array, forceHex: boolean = false) {
    if (typeof value === 'string') {
      // Convert string to bytes (ISO-8859-1)
      this.value = new Uint8Array(value.length);
      for (let i = 0; i < value.length; i++) {
        this.value[i] = value.charCodeAt(i) & 0xff;
      }
    } else {
      this.value = value;
    }
    this.forceHex = forceHex;
  }

  setValue(value: string | Uint8Array, forceHex: boolean = this.forceHex): void {
    if (typeof value === 'string') {
      const bytes = new Uint8Array(value.length);
      for (let i = 0; i < value.length; i++) {
        bytes[i] = value.charCodeAt(i) & 0xff;
      }
      this.value = bytes;
    } else {
      this.value = value;
    }
    this.forceHex = forceHex;
    markObjectUpdated(this);
  }

  getBytes(): Uint8Array {
    return this.value;
  }

  getString(): string {
    return Array.from(this.value).map(b => String.fromCharCode(b)).join('');
  }

  accept(visitor: COSWriter): void {
    visitor.visitFromString(this);
  }

  isDirect(): boolean {
    return this.direct;
  }

  setDirect(direct: boolean): void {
    this.direct = direct;
  }

  /**
   * Convert to PDF hex string format
   * PORTED FROM: COSString.java writeHexString()
   */
  toHexString(): string {
    let hex = '<';
    for (let i = 0; i < this.value.length; i++) {
      hex += this.value[i].toString(16).padStart(2, '0').toUpperCase();
    }
    hex += '>';
    return hex;
  }

  /**
   * Convert to PDF literal string format
   * PORTED FROM: COSString.java writeLiteralString()
   */
  toLiteralString(): string {
    let result = '(';
    for (let i = 0; i < this.value.length; i++) {
      const byte = this.value[i];
      const char = String.fromCharCode(byte);

      // Escape special characters
      if (char === '\\' || char === '(' || char === ')') {
        result += '\\' + char;
      } else if (byte < 32 || byte > 126) {
        // Non-printable: use octal
        result += '\\' + byte.toString(8).padStart(3, '0');
      } else {
        result += char;
      }
    }
    result += ')';
    return result;
  }

  shouldUseHex(): boolean {
    return this.forceHex;
  }
}

/**
 * COSArray - PDF Array Object
 *
 * PORTED FROM: COSArray.java
 *
 * PDF arrays: [1 2 3], [/Name (String) 42]
 */
export class COSArray implements COSBase {
  private elements: COSBase[] = [];
  private direct: boolean = false; // Arrays can be indirect

  add(element: COSBase): void {
    this.elements.push(element);
    markObjectUpdated(this);
  }

  get(index: number): COSBase | undefined {
    return this.elements[index];
  }

  set(index: number, element: COSBase): void {
    this.elements[index] = element;
    markObjectUpdated(this);
  }

  size(): number {
    return this.elements.length;
  }

  remove(index: number): void {
    this.elements.splice(index, 1);
    markObjectUpdated(this);
  }

  insert(index: number, element: COSBase): void {
    this.elements.splice(index, 0, element);
    markObjectUpdated(this);
  }

  getElements(): COSBase[] {
    return this.elements;
  }

  accept(visitor: COSWriter): void {
    visitor.visitFromArray(this);
  }

  isDirect(): boolean {
    return this.direct;
  }

  setDirect(direct: boolean): void {
    this.direct = direct;
  }
}

/**
 * COSDictionary - PDF Dictionary Object
 *
 * PORTED FROM: COSDictionary.java
 *
 * PDF dictionaries: << /Type /Page /Contents 5 0 R >>
 * Stored as Map<COSName, COSBase>
 */
export class COSDictionary implements COSBase {
  private items: Map<string, COSBase> = new Map();
  private direct: boolean = false; // Dictionaries can be indirect

  setItem(key: COSName | string, value: COSBase): void {
    const keyName = typeof key === 'string' ? key : key.getName();
    this.items.set(keyName, value);
    markObjectUpdated(this);
  }

  getItem(key: COSName | string): COSBase | undefined {
    const keyName = typeof key === 'string' ? key : key.getName();
    return this.items.get(keyName);
  }

  removeItem(key: COSName | string): void {
    const keyName = typeof key === 'string' ? key : key.getName();
    this.items.delete(keyName);
    markObjectUpdated(this);
  }

  containsKey(key: COSName | string): boolean {
    const keyName = typeof key === 'string' ? key : key.getName();
    return this.items.has(keyName);
  }

  /**
   * Get all entries as [COSName, COSBase] pairs
   * PORTED FROM: COSDictionary.java entrySet()
   */
  entrySet(): Array<[COSName, COSBase]> {
    const entries: Array<[COSName, COSBase]> = [];
    for (const [keyStr, value] of Array.from(this.items.entries())) {
      entries.push([new COSName(keyStr), value]);
    }
    return entries;
  }

  size(): number {
    return this.items.size;
  }

  accept(visitor: COSWriter): void {
    visitor.visitFromDictionary(this);
  }

  isDirect(): boolean {
    return this.direct;
  }

  setDirect(direct: boolean): void {
    this.direct = direct;
  }

  // Convenience methods for common operations

  getCOSArray(key: COSName | string): COSArray | undefined {
    const value = this.getItem(key);
    return value instanceof COSArray ? value : undefined;
  }

  getCOSName(key: COSName | string): COSName | undefined {
    const value = this.getItem(key);
    return value instanceof COSName ? value : undefined;
  }

  getInt(key: COSName | string, defaultValue: number = 0): number {
    const value = this.getItem(key);
    return value instanceof COSInteger ? value.getValue() : defaultValue;
  }

  getString(key: COSName | string): string | undefined {
    const value = this.getItem(key);
    return value instanceof COSString ? value.getString() : undefined;
  }
}

/**
 * COSObjectReference - represents an indirect reference (e.g., "5 0 R").
 */
export class COSObjectReference implements COSBase {
  private readonly key: COSObjectKey;

  constructor(objectNumber: number, generationNumber?: number);
  constructor(key: COSObjectKey);
  constructor(
    arg1: number | COSObjectKey,
    generationNumber: number = 0
  ) {
    if (arg1 instanceof COSObjectKey) {
      this.key = arg1;
    } else {
      this.key = new COSObjectKey(arg1, generationNumber);
    }
  }

  get objectNumber(): number {
    return this.key.objectNumber;
  }

  get generationNumber(): number {
    return this.key.generationNumber;
  }

  accept(visitor: COSWriter): void {
    visitor.visitFromObjectReference(this);
  }

  isDirect(): boolean {
    return true;
  }

  setDirect(): void {
    // Indirect references are always written directly; nothing to do.
  }

  toReferenceString(): string {
    return `${this.key.objectNumber} ${this.key.generationNumber} R`;
  }

  equals(other: COSObjectReference | undefined): boolean {
    if (!other) return false;
    return (
      this.key.objectNumber === other.key.objectNumber &&
      this.key.generationNumber === other.key.generationNumber
    );
  }
}

/**
 * COSBoolean - PDF boolean object.
 */
export class COSBoolean implements COSBase {
  private readonly value: boolean;

  constructor(value: boolean) {
    this.value = value;
  }

  static readonly TRUE = new COSBoolean(true);
  static readonly FALSE = new COSBoolean(false);

  getValue(): boolean {
    return this.value;
  }

  accept(visitor: COSWriter): void {
    visitor.visitFromBoolean(this);
  }

  isDirect(): boolean {
    return true;
  }

  setDirect(): void {
    // booleans are always direct
  }

  toPDFString(): string {
    return this.value ? 'true' : 'false';
  }
}

/**
 * COSNull - PDF null object.
 */
export class COSNull implements COSBase {
  static readonly NULL = new COSNull();

  private constructor() {}

  accept(visitor: COSWriter): void {
    visitor.visitFromNull(this);
  }

  isDirect(): boolean {
    return true;
  }

  setDirect(): void {
    // noop
  }

  toPDFString(): string {
    return 'null';
  }
}

/**
 * COSStream - minimal PDF stream object (dictionary + data bytes).
 */
export class COSStream implements COSBase {
  private readonly dict: COSDictionary = new COSDictionary();
  private data: Uint8Array = new Uint8Array();
  private direct = false;

  setItem(key: COSName | string, value: COSBase): void {
    this.dict.setItem(key, value);
  }

  getDictionary(): COSDictionary {
    return this.dict;
  }

  setData(data: Uint8Array): void {
    this.data = data;
    this.dict.setItem(new COSName('Length'), new COSInteger(data.length));
  }

  getData(): Uint8Array {
    return this.data;
  }

  accept(visitor: COSWriter): void {
    visitor.visitFromStream(this);
  }

  isDirect(): boolean {
    return this.direct;
  }

  setDirect(direct: boolean): void {
    this.direct = direct;
  }
}
