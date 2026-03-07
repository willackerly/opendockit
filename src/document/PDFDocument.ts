/**
 * PDFDocument — native-only document wrapper.
 *
 * All operations use the native COS parser and NativeDocumentContext.
 * pdf-lib has been fully removed (Phase 8 Strangler Fig complete).
 */

import { PDFPage } from './PDFPage.js';
import { PDFFont } from './PDFFont.js';
import { PDFImage } from './PDFImage.js';
import { PDFForm } from './PDFForm.js';
import { NativeDocumentContext } from './NativeDocumentContext.js';
import { NativePDFWriter } from './NativePDFWriter.js';
import { copyPages as nativeCopyPages } from './CopyPages.js';
import { StandardFontMetrics } from './fonts/StandardFontMetrics.js';
import type { StandardFonts } from './StandardFonts.js';
import type {
  LoadOptions,
  CreateOptions,
  SaveOptions,
  Base64SaveOptions,
  EmbedFontOptions,
  SetTitleOptions,
} from './options.js';
import { parsePdfTrailer, computeDeterministicDocumentId } from '../pdfbox/parser/trailer.js';
import { loadParsedIndirectObjects } from '../pdfbox/parser/full-document-loader.js';
import { applyPDFAConformance } from './pdfa/PDFAConformance.js';
import type { PDFALevel } from './pdfa/PDFAConformance.js';
import { COSDictionary, COSString, COSStream, COSArray, COSInteger } from '../pdfbox/cos/COSTypes.js';
// COSStream and COSArray used in decryptParsedObjects below
import {
  parseEncryptionDict,
  getEncryptionDescription,
  validateEncryption,
  deriveFileEncryptionKey,
  PDFDecryptor,
} from '../pdfbox/crypto/index.js';
import type { EncryptionDict } from '../pdfbox/crypto/index.js';

export class PDFDocument {
  /** @internal — native COS context */
  readonly _nativeCtx: NativeDocumentContext;
  /** @internal — tracked pages */
  _nativePages: PDFPage[] = [];
  /** @internal — default word breaks for text wrapping */
  private _defaultWordBreaks: string[] = [' '];
  /** @internal — raw bytes from load (for round-trip reference) */
  _rawBytes?: Uint8Array;
  /** @internal — encryption info if the loaded PDF was encrypted */
  private _encryptionDict?: EncryptionDict;

  /** @internal */
  constructor(nativeCtx: NativeDocumentContext) {
    this._nativeCtx = nativeCtx;
  }

  /** True if this document uses the native path (always true now). */
  get isNative(): boolean {
    return true;
  }

  // --- Static factory methods ---

  static async load(
    pdf: string | Uint8Array | ArrayBuffer,
    options?: LoadOptions,
  ): Promise<PDFDocument> {
    const bytes = toUint8Array(pdf);
    return PDFDocument._loadNative(bytes, options);
  }

  /** @internal — native load path (COS parser) */
  private static async _loadNative(
    bytes: Uint8Array,
    options?: LoadOptions,
  ): Promise<PDFDocument> {
    // Parse trailer and check for encryption
    const trailer = parsePdfTrailer(bytes);

    let decryptor: PDFDecryptor | undefined;
    let encDict: EncryptionDict | undefined;

    if (trailer.encryptRef && !options?.ignoreEncryption) {
      // Parse the /Encrypt dictionary object
      const encryptObjNum = trailer.encryptRef.objectNumber;

      // We need to load objects first to get the /Encrypt dict
      const parsed = loadParsedIndirectObjects(bytes, trailer);
      const encryptObj = parsed.find(p => p.key.objectNumber === encryptObjNum);

      if (!encryptObj || !(encryptObj.object instanceof COSDictionary)) {
        throw new Error(
          `Failed to resolve /Encrypt object ${encryptObjNum}. Cannot decrypt this PDF.`,
        );
      }

      // Extract document ID from trailer /ID array
      const documentId = extractDocumentId(trailer.idLiteral, bytes);

      // Parse and validate encryption
      encDict = parseEncryptionDict(encryptObj.object, documentId);
      const keyLengthBits = validateEncryption(encDict);

      // Derive encryption key from password
      const password = options?.password;
      if (password === undefined || password === null) {
        // Try empty string as user password first (common: PDF opens without password)
        try {
          const key = deriveFileEncryptionKey(encDict, '', documentId);
          decryptor = new PDFDecryptor(key, encDict, documentId, keyLengthBits);
        } catch {
          const desc = getEncryptionDescription(encDict);
          throw new Error(
            `This PDF is encrypted (${desc}). Provide a password: ` +
            `PDFDocument.load(bytes, { password: 'xxx' })`,
          );
        }
      } else {
        try {
          const key = deriveFileEncryptionKey(encDict, password, documentId);
          decryptor = new PDFDecryptor(key, encDict, documentId, keyLengthBits);
        } catch {
          throw new Error('Invalid password for encrypted PDF.');
        }
      }

      // Decrypt all objects in-place
      decryptParsedObjects(parsed, decryptor, encryptObjNum);

      // Rebuild context from decrypted objects
      const ctx = NativeDocumentContext.fromLoadedPdf(parsed, trailer, bytes);
      const doc = new PDFDocument(ctx);
      doc._rawBytes = bytes;
      doc._encryptionDict = encDict;

      // Build page list
      const pageList = ctx.getPageList();
      doc._nativePages = pageList.map(({ pageDict, pageRef }) =>
        PDFPage._createNative(pageDict, pageRef, doc),
      );

      if (!options || options.updateMetadata !== false) {
        ctx.setProducer('pdfbox-ts');
        ctx.setModificationDate(new Date());
      }

      return doc;
    }

    if (trailer.encryptRef && options?.ignoreEncryption) {
      // ignoreEncryption: skip encryption handling, load as-is
      // (strings/streams will still be encrypted, but document structure is readable)
    }

    // Unencrypted path
    const parsed = loadParsedIndirectObjects(bytes, trailer);

    // Build native context
    const ctx = NativeDocumentContext.fromLoadedPdf(parsed, trailer, bytes);
    const doc = new PDFDocument(ctx);

    // Store raw bytes for reference
    doc._rawBytes = bytes;

    // Build page list
    const pageList = ctx.getPageList();
    doc._nativePages = pageList.map(({ pageDict, pageRef }) =>
      PDFPage._createNative(pageDict, pageRef, doc),
    );

    // Update metadata if requested (matching pdf-lib behavior)
    if (!options || options.updateMetadata !== false) {
      ctx.setProducer('pdfbox-ts');
      ctx.setModificationDate(new Date());
    }

    return doc;
  }

  static async create(options?: CreateOptions): Promise<PDFDocument> {
    const ctx = new NativeDocumentContext();
    const doc = new PDFDocument(ctx);

    // Set default metadata
    if (!options || options.updateMetadata !== false) {
      ctx.setProducer('pdfbox-ts');
      ctx.setCreationDate(new Date());
      ctx.setModificationDate(new Date());
    }

    return doc;
  }

  // --- Low-level access ---

  get context(): any {
    throw new Error(
      'PDFDocument.context is not available. ' +
      'Use PDFDocument._nativeCtx for direct COS access.',
    );
  }

  get catalog(): any {
    throw new Error(
      'PDFDocument.catalog is not available. ' +
      'Use PDFDocument._nativeCtx.catalog for direct COS access.',
    );
  }

  get isEncrypted(): boolean {
    return this._encryptionDict !== undefined;
  }

  /** Get details about the encryption, if the PDF was loaded encrypted. */
  get encryptionType(): string | undefined {
    if (!this._encryptionDict) return undefined;
    return getEncryptionDescription(this._encryptionDict);
  }

  get defaultWordBreaks(): string[] {
    return this._defaultWordBreaks;
  }

  set defaultWordBreaks(breaks: string[]) {
    this._defaultWordBreaks = breaks;
  }

  // --- Fontkit ---

  registerFontkit(_fontkit: unknown): void {
    // No-op: fontkit registration is not needed for native fonts.
    // TrueType fonts are embedded natively via embedFont(Uint8Array).
  }

  // --- Form ---

  getForm(): PDFForm {
    return PDFForm._wrapNative(this._nativeCtx);
  }

  // --- Metadata getters ---

  getTitle(): string | undefined {
    return this._nativeCtx.getInfoString('Title');
  }

  getAuthor(): string | undefined {
    return this._nativeCtx.getInfoString('Author');
  }

  getSubject(): string | undefined {
    return this._nativeCtx.getInfoString('Subject');
  }

  getKeywords(): string | undefined {
    return this._nativeCtx.getInfoString('Keywords');
  }

  getCreator(): string | undefined {
    return this._nativeCtx.getInfoString('Creator');
  }

  getProducer(): string | undefined {
    return this._nativeCtx.getInfoString('Producer');
  }

  getCreationDate(): Date | undefined {
    return this._nativeCtx.getInfoDate('CreationDate');
  }

  getModificationDate(): Date | undefined {
    return this._nativeCtx.getInfoDate('ModDate');
  }

  // --- Metadata setters ---

  setTitle(title: string, _options?: SetTitleOptions): void {
    this._nativeCtx.setTitle(title);
  }

  setAuthor(author: string): void {
    this._nativeCtx.setAuthor(author);
  }

  setSubject(subject: string): void {
    this._nativeCtx.setSubject(subject);
  }

  setKeywords(keywords: string[]): void {
    this._nativeCtx.setKeywords(keywords.join(', '));
  }

  setCreator(creator: string): void {
    this._nativeCtx.setCreator(creator);
  }

  setProducer(producer: string): void {
    this._nativeCtx.setProducer(producer);
  }

  setLanguage(language: string): void {
    this._nativeCtx.catalog.setItem('Lang', new COSString(language));
  }

  setCreationDate(creationDate: Date): void {
    this._nativeCtx.setCreationDate(creationDate);
  }

  setModificationDate(modificationDate: Date): void {
    this._nativeCtx.setModificationDate(modificationDate);
  }

  // --- Pages ---

  getPageCount(): number {
    return this._nativePages.length;
  }

  getPages(): PDFPage[] {
    return [...this._nativePages];
  }

  getPage(index: number): PDFPage {
    if (index < 0 || index >= this._nativePages.length) {
      throw new Error(`Page index ${index} out of range [0, ${this._nativePages.length})`);
    }
    return this._nativePages[index];
  }

  getPageIndices(): number[] {
    return this._nativePages.map((_, i) => i);
  }

  removePage(index: number): void {
    const kids = this._nativeCtx.pages.getItem('Kids') as COSArray;
    kids.remove(index);
    const count = this._nativeCtx.pages.getInt('Count');
    this._nativeCtx.pages.setItem('Count', new COSInteger(count - 1));
    this._nativePages.splice(index, 1);
  }

  addPage(page?: PDFPage | [number, number]): PDFPage {
    // Accept a pre-built native page (e.g. from copyPages)
    if (page instanceof PDFPage && page._nativePageDict && page._nativePageRef) {
      this._nativeCtx.addCopiedPage(page._nativePageRef);
      this._nativePages.push(page);
      return page;
    }
    let width = 612, height = 792; // Letter default
    if (Array.isArray(page)) {
      [width, height] = page;
    }
    const { pageDict, pageRef } = this._nativeCtx.addPage(width, height);
    const nativePage = PDFPage._createNative(pageDict, pageRef, this);
    this._nativePages.push(nativePage);
    return nativePage;
  }

  insertPage(
    index: number,
    page?: PDFPage | [number, number],
  ): PDFPage {
    if (page instanceof PDFPage && page._nativePageDict && page._nativePageRef) {
      // Pre-built page (e.g. from copyPages) — insert into COS tree at position
      const kids = this._nativeCtx.pages.getItem('Kids') as COSArray;
      kids.insert(index, page._nativePageRef);
      const count = this._nativeCtx.pages.getInt('Count');
      this._nativeCtx.pages.setItem('Count', new COSInteger(count + 1));
      this._nativePages.splice(index, 0, page);
      return page;
    }
    let width = 612, height = 792;
    if (Array.isArray(page)) {
      [width, height] = page;
    }
    const { pageDict, pageRef } = this._nativeCtx.addPage(width, height);
    // addPage appended to end of Kids — move to correct position
    const kids = this._nativeCtx.pages.getItem('Kids') as COSArray;
    kids.remove(kids.size() - 1);
    kids.insert(index, pageRef);
    const nativePage = PDFPage._createNative(pageDict, pageRef, this);
    // addPage already pushed to end — don't push again, just splice
    this._nativePages.splice(index, 0, nativePage);
    return nativePage;
  }

  async copyPages(
    srcDoc: PDFDocument,
    indices: number[],
  ): Promise<PDFPage[]> {
    return nativeCopyPages(srcDoc, this, indices);
  }

  async copy(): Promise<PDFDocument> {
    const bytes = await this.save();
    return PDFDocument.load(bytes);
  }

  // --- JavaScript ---

  addJavaScript(_name: string, _script: string): void {
    throw new Error(
      'PDFDocument.addJavaScript() is not yet implemented natively. ' +
      'This feature will be available in a future release.',
    );
  }

  // --- Attachments ---

  async attach(
    _attachment: string | Uint8Array | ArrayBuffer,
    _name: string,
    _options?: unknown,
  ): Promise<void> {
    throw new Error(
      'PDFDocument.attach() is not yet implemented natively. ' +
      'This feature will be available in a future release.',
    );
  }

  // --- Font embedding ---

  async embedFont(
    font: StandardFonts | string | Uint8Array | ArrayBuffer,
    _options?: EmbedFontOptions,
  ): Promise<PDFFont> {
    // Standard font name string
    if (typeof font === 'string' && StandardFontMetrics.isStandardFont(font)) {
      return PDFFont._createNativeStandard(font, this._nativeCtx);
    }
    // TrueType binary font data
    if (font instanceof Uint8Array || font instanceof ArrayBuffer) {
      const bytes = font instanceof Uint8Array ? font : new Uint8Array(font);
      return PDFFont._createNativeCustom(bytes, this._nativeCtx);
    }
    throw new Error(
      `Only standard fonts and TrueType (.ttf) fonts are supported. ` +
      `Use StandardFonts enum values (e.g., 'Helvetica', 'TimesRoman') ` +
      `or pass TrueType font bytes as Uint8Array.`,
    );
  }

  embedStandardFont(font: StandardFonts): PDFFont {
    return PDFFont._createNativeStandard(font as string, this._nativeCtx);
  }

  // --- Image embedding ---

  async embedJpg(
    jpg: string | Uint8Array | ArrayBuffer,
  ): Promise<PDFImage> {
    const bytes = toUint8Array(jpg);
    return PDFImage._createNativeJpeg(bytes, this._nativeCtx);
  }

  async embedPng(
    png: string | Uint8Array | ArrayBuffer,
  ): Promise<PDFImage> {
    const bytes = toUint8Array(png);
    return PDFImage._createNativePng(bytes, this._nativeCtx);
  }

  // --- Page embedding ---

  async embedPdf(
    _pdf: string | Uint8Array | ArrayBuffer | PDFDocument,
    _indices?: number[],
  ): Promise<never> {
    throw new Error(
      'PDFDocument.embedPdf() is not yet implemented natively. ' +
      'Use copyPages() instead for page-level operations.',
    );
  }

  async embedPage(
    _page: PDFPage,
    _boundingBox?: unknown,
    _transformationMatrix?: unknown,
  ): Promise<never> {
    throw new Error(
      'PDFDocument.embedPage() is not yet implemented natively. ' +
      'Use copyPages() instead for page-level operations.',
    );
  }

  async embedPages(
    _pages: PDFPage[],
    _boundingBoxes?: unknown[],
    _transformationMatrices?: unknown[],
  ): Promise<never> {
    throw new Error(
      'PDFDocument.embedPages() is not yet implemented natively. ' +
      'Use copyPages() instead for page-level operations.',
    );
  }

  // --- Flush & save ---

  async flush(): Promise<void> {
    // No flush needed for native
  }

  async save(options?: SaveOptions): Promise<Uint8Array> {
    // Apply PDF/A conformance if requested
    if (options?.pdfaConformance) {
      applyPDFAConformance(this._nativeCtx, options.pdfaConformance as PDFALevel);
    }

    if (options?.encrypt) {
      return NativePDFWriter.writeEncrypted(this._nativeCtx, options.encrypt, {
        useObjectStreams: options?.useObjectStreams ?? false,
      });
    }

    return NativePDFWriter.write(this._nativeCtx, {
      useObjectStreams: options?.useObjectStreams ?? false,
    });
  }

  async saveAsBase64(_options?: Base64SaveOptions): Promise<string> {
    // Apply PDF/A conformance if requested
    if (_options?.pdfaConformance) {
      applyPDFAConformance(this._nativeCtx, _options.pdfaConformance as PDFALevel);
    }

    const bytes = _options?.encrypt
      ? NativePDFWriter.writeEncrypted(this._nativeCtx, _options.encrypt, {
          useObjectStreams: _options?.useObjectStreams ?? false,
        })
      : NativePDFWriter.write(this._nativeCtx, {
          useObjectStreams: _options?.useObjectStreams ?? false,
        });
    return uint8ArrayToBase64(bytes);
  }

  findPageForAnnotationRef(
    _ref: unknown,
  ): PDFPage | undefined {
    return undefined;
  }

  // --- Rendering (requires pdfbox-ts/render) ---

  /**
   * Render a page to PNG. Requires `pdfjs-dist` (and `canvas` in Node.js).
   *
   * This saves the document to bytes, then renders via PDF.js.
   * For rendering multiple pages, use `PDFRenderer` from `pdfbox-ts/render` directly.
   *
   * @param pageIndex  0-based page index (default: 0)
   * @param options    Rendering options (scale, background)
   * @returns PNG bytes, dimensions, and page index
   */
  async renderPage(
    pageIndex = 0,
    options?: { scale?: number; background?: string },
  ): Promise<{ png: Uint8Array; width: number; height: number; pageIndex: number }> {
    // Lazy-import the render module to keep it optional
    const { renderPage: render } = await import('../render/PDFRenderer.js');
    return render(this, pageIndex, options);
  }
}

// ---------------------------------------------------------------------------
// Decryption helpers
// ---------------------------------------------------------------------------

/**
 * Extract the document ID from the trailer /ID array or compute a deterministic one.
 */
function extractDocumentId(idLiteral: string | undefined, pdfBytes: Uint8Array): Uint8Array {
  if (idLiteral) {
    // Parse hex strings from /ID array like [<hex1> <hex2>]
    const matches = idLiteral.match(/<([0-9A-Fa-f]+)>/g);
    if (matches && matches.length > 0) {
      const hex = matches[0].slice(1, -1);
      const result = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        result[i / 2] = parseInt(hex.slice(i, i + 2), 16);
      }
      return result;
    }
  }
  return computeDeterministicDocumentId(pdfBytes);
}

/**
 * Decrypt all parsed objects in-place using the provided decryptor.
 */
function decryptParsedObjects(
  parsed: Array<{ key: { objectNumber: number; generationNumber: number }; object: any }>,
  decryptor: PDFDecryptor,
  encryptObjNum: number,
): void {
  for (const entry of parsed) {
    const objNum = entry.key.objectNumber;
    const genNum = entry.key.generationNumber;

    // Skip the /Encrypt dict itself — it's not encrypted
    if (objNum === encryptObjNum) continue;

    const obj = entry.object;
    if (obj instanceof COSStream) {
      // Check if we should decrypt this stream
      const dictBody = describeDictForDecryption(obj.getDictionary());
      if (!decryptor.shouldDecrypt(objNum, dictBody)) continue;

      // Decrypt stream data
      const streamData = obj.getData();
      if (streamData.length > 0) {
        try {
          const decrypted = decryptor.decryptStream(streamData, objNum, genNum);
          obj.setData(decrypted);
        } catch {
          // Keep original data if decryption fails
        }
      }

      // Decrypt string values in the stream's dictionary
      decryptDictStrings(obj.getDictionary(), decryptor, objNum, genNum);
    } else if (obj instanceof COSDictionary) {
      decryptDictStrings(obj, decryptor, objNum, genNum);
    } else if (obj instanceof COSArray) {
      decryptArrayStrings(obj, decryptor, objNum, genNum);
    } else if (obj instanceof COSString) {
      // Top-level string object (rare but possible)
      const decrypted = decryptor.decryptString(obj.getBytes(), objNum, genNum);
      obj.setValue(decrypted, obj.shouldUseHex());
    }
  }
}

function decryptDictStrings(
  dict: COSDictionary,
  decryptor: PDFDecryptor,
  objNum: number,
  genNum: number,
): void {
  for (const [_key, value] of dict.entrySet()) {
    if (value instanceof COSString) {
      try {
        const decrypted = decryptor.decryptString(value.getBytes(), objNum, genNum);
        value.setValue(decrypted, value.shouldUseHex());
      } catch {
        // Keep original
      }
    } else if (value instanceof COSArray) {
      decryptArrayStrings(value, decryptor, objNum, genNum);
    } else if (value instanceof COSDictionary) {
      decryptDictStrings(value, decryptor, objNum, genNum);
    }
  }
}

function decryptArrayStrings(
  arr: COSArray,
  decryptor: PDFDecryptor,
  objNum: number,
  genNum: number,
): void {
  for (let i = 0; i < arr.size(); i++) {
    const elem = arr.get(i);
    if (elem instanceof COSString) {
      try {
        const decrypted = decryptor.decryptString(elem.getBytes(), objNum, genNum);
        elem.setValue(decrypted, elem.shouldUseHex());
      } catch {
        // Keep original
      }
    } else if (elem instanceof COSDictionary) {
      decryptDictStrings(elem, decryptor, objNum, genNum);
    } else if (elem instanceof COSArray) {
      decryptArrayStrings(elem, decryptor, objNum, genNum);
    }
  }
}

function describeDictForDecryption(dict: COSDictionary): string {
  const parts: string[] = [];
  const type = dict.getCOSName('Type');
  if (type) parts.push(`/Type /${type.getName()}`);
  const subtype = dict.getCOSName('Subtype');
  if (subtype) parts.push(`/Subtype /${subtype.getName()}`);
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function toUint8Array(
  input: string | Uint8Array | ArrayBuffer,
): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  // Base64 string
  const binaryString = atob(input);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
