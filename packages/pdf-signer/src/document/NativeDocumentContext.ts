/**
 * NativeDocumentContext — COS-level object registry for native PDF documents.
 *
 * Replaces pdf-lib's PDFContext for documents created via PDFDocument.create()
 * and loaded via PDFDocument.load().
 *
 * Manages: object number allocation, indirect object storage, catalog,
 * pages tree, info dictionary, and reference resolution.
 *
 * Phase 6: Supports both created and loaded documents.
 *   - create() → constructor builds new catalog + pages tree
 *   - load()   → fromLoadedPdf() populates from parsed COS objects
 */

import {
  COSName,
  COSInteger,
  COSString,
  COSArray,
  COSDictionary,
  COSObjectReference,
  COSStream,
  COSFloat,
} from '../pdfbox/cos/COSTypes.js';
import type { COSBase } from '../pdfbox/cos/COSBase.js';
import type { TrailerInfo } from '../pdfbox/parser/trailer.js';
import type { ParsedIndirectObject } from '../pdfbox/parser/full-document-loader.js';
import type { TrueTypeFontInfo } from './fonts/TrueTypeParser.js';
import { buildToUnicodeCMap } from './fonts/CMapBuilder.js';
import * as pako from 'pako';

export class NativeDocumentContext {
  private _objects = new Map<number, COSBase>();
  private _nextObjNum = 1;

  // Document structure refs
  catalogRef!: COSObjectReference;
  pagesRef!: COSObjectReference;
  private _infoRef?: COSObjectReference;

  // Cached dicts for direct access
  catalog!: COSDictionary;
  pages!: COSDictionary;
  private _info?: COSDictionary;

  /** Whether this context was loaded from an existing PDF (vs created fresh). */
  private _loaded = false;

  /** Original PDF bytes (loaded documents only, needed for save/signing). */
  private _pdfBytes?: Uint8Array;

  /** Trailer info from loaded PDF. */
  private _trailer?: TrailerInfo;

  /** PDF version string from loaded PDF (e.g. "1.7"). */
  private _version?: string;

  constructor() {
    // 1. Catalog: /Type /Catalog /Pages <pagesRef>
    this.catalog = new COSDictionary();
    this.catalog.setItem('Type', new COSName('Catalog'));
    this.catalogRef = this._register(this.catalog);

    // 2. Pages tree root: /Type /Pages /Kids [] /Count 0
    this.pages = new COSDictionary();
    this.pages.setItem('Type', new COSName('Pages'));
    this.pages.setItem('Kids', new COSArray());
    this.pages.setItem('Count', new COSInteger(0));
    this.pagesRef = this._register(this.pages);

    // Wire catalog → pages
    this.catalog.setItem('Pages', this.pagesRef);
  }

  // ---------------------------------------------------------------------------
  // Static factory for loaded PDFs
  // ---------------------------------------------------------------------------

  /**
   * Create a context from a parsed PDF. Populates the object registry from
   * parsed indirect objects and wires up catalog/pages/info from trailer refs.
   */
  static fromLoadedPdf(
    parsedObjects: ParsedIndirectObject[],
    trailer: TrailerInfo,
    pdfBytes: Uint8Array,
  ): NativeDocumentContext {
    // Use Object.create to skip the default constructor
    const ctx = Object.create(NativeDocumentContext.prototype) as NativeDocumentContext;
    ctx._objects = new Map<number, COSBase>();
    ctx._loaded = true;
    ctx._pdfBytes = pdfBytes;
    ctx._trailer = trailer;
    ctx._version = trailer.version;

    // Populate objects map
    for (const parsed of parsedObjects) {
      ctx._objects.set(parsed.key.objectNumber, parsed.object);
    }

    // Compute next object number
    let maxObjNum = 0;
    for (const objNum of ctx._objects.keys()) {
      if (objNum > maxObjNum) maxObjNum = objNum;
    }
    ctx._nextObjNum = Math.max(trailer.size, maxObjNum + 1);

    // Resolve catalog
    let catalogObj = ctx._objects.get(trailer.rootRef.objectNumber);
    if (!catalogObj || !(catalogObj instanceof COSDictionary)) {
      // Fallback: scan all loaded objects for one with /Type /Catalog
      catalogObj = ctx._findObjectByType('Catalog');
      if (!catalogObj || !(catalogObj instanceof COSDictionary)) {
        throw new Error(
          `Failed to resolve catalog object ${trailer.rootRef.objectNumber} ${trailer.rootRef.generation} R`,
        );
      }
    }
    ctx.catalog = catalogObj;
    // Find the actual object number for the catalog
    let catalogObjNum = trailer.rootRef.objectNumber;
    for (const [objNum, obj] of ctx._objects) {
      if (obj === catalogObj) {
        catalogObjNum = objNum;
        break;
      }
    }
    ctx.catalogRef = new COSObjectReference(
      catalogObjNum,
      trailer.rootRef.generation,
    );

    // Resolve pages tree root from catalog /Pages
    const pagesEntry = ctx.catalog.getItem('Pages');
    if (pagesEntry instanceof COSObjectReference) {
      let pagesObj = ctx._objects.get(pagesEntry.objectNumber);
      if (!pagesObj || !(pagesObj instanceof COSDictionary)) {
        // Fallback: scan for /Type /Pages dictionary
        pagesObj = ctx._findObjectByType('Pages');
      }
      if (!pagesObj || !(pagesObj instanceof COSDictionary)) {
        throw new Error(
          `Failed to resolve pages object ${pagesEntry.objectNumber} ${pagesEntry.generationNumber} R`,
        );
      }
      ctx.pages = pagesObj;
      // Find the correct object number for the pages dict
      let pagesObjNum = pagesEntry.objectNumber;
      for (const [objNum, obj] of ctx._objects) {
        if (obj === pagesObj) {
          pagesObjNum = objNum;
          break;
        }
      }
      ctx.pagesRef = new COSObjectReference(pagesObjNum, pagesEntry.generationNumber);
    } else if (pagesEntry instanceof COSDictionary) {
      ctx.pages = pagesEntry;
      // Inline pages dict — assign an object number
      ctx.pagesRef = ctx._register(pagesEntry);
    } else {
      // Fallback: scan all objects for /Type /Pages
      const pagesObj = ctx._findObjectByType('Pages');
      if (pagesObj && pagesObj instanceof COSDictionary) {
        ctx.pages = pagesObj;
        let pagesObjNum = 0;
        for (const [objNum, obj] of ctx._objects) {
          if (obj === pagesObj) {
            pagesObjNum = objNum;
            break;
          }
        }
        ctx.pagesRef = pagesObjNum > 0
          ? new COSObjectReference(pagesObjNum, 0)
          : ctx._register(pagesObj);
      } else {
        throw new Error('Catalog /Pages entry is missing or invalid');
      }
    }

    // Resolve info dictionary (optional)
    if (trailer.infoRef) {
      const infoObj = ctx._objects.get(trailer.infoRef.objectNumber);
      if (infoObj instanceof COSDictionary) {
        ctx._info = infoObj;
        ctx._infoRef = new COSObjectReference(
          trailer.infoRef.objectNumber,
          trailer.infoRef.generation,
        );
      }
    }

    return ctx;
  }

  // ---------------------------------------------------------------------------
  // Loaded document properties
  // ---------------------------------------------------------------------------

  /** True if this context was loaded from an existing PDF. */
  get isLoaded(): boolean {
    return this._loaded;
  }

  /** PDF version string (e.g. "1.7"). Defaults to "1.7" for created docs. */
  get version(): string {
    return this._version ?? '1.7';
  }

  /** Set the PDF version string (e.g. "1.4", "1.7"). */
  setVersion(version: string): void {
    this._version = version;
  }

  /** Original PDF bytes (loaded documents only). */
  get pdfBytes(): Uint8Array | undefined {
    return this._pdfBytes;
  }

  /** Trailer info (loaded documents only). */
  get trailer(): TrailerInfo | undefined {
    return this._trailer;
  }

  // ---------------------------------------------------------------------------
  // Reference resolution
  // ---------------------------------------------------------------------------

  /** Resolve a COSObjectReference to the actual object. */
  resolveRef(ref: COSObjectReference): COSBase | undefined {
    return this._objects.get(ref.objectNumber);
  }

  // ---------------------------------------------------------------------------
  // Page tree traversal (loaded documents)
  // ---------------------------------------------------------------------------

  /**
   * Walk the page tree and return ordered (pageDict, pageRef) pairs.
   * Handles nested /Pages nodes and inherited properties (MediaBox, CropBox, Resources).
   */
  getPageList(): Array<{ pageDict: COSDictionary; pageRef: COSObjectReference }> {
    const result: Array<{ pageDict: COSDictionary; pageRef: COSObjectReference }> = [];
    this._walkPageTree(this.pages, result, []);
    return result;
  }

  private _walkPageTree(
    node: COSDictionary,
    result: Array<{ pageDict: COSDictionary; pageRef: COSObjectReference }>,
    parentChain: COSDictionary[],
  ): void {
    const kidsEntry = node.getItem('Kids');
    if (!kidsEntry || !(kidsEntry instanceof COSArray)) return;

    for (let i = 0; i < kidsEntry.size(); i++) {
      const kidRef = kidsEntry.get(i);
      if (!(kidRef instanceof COSObjectReference)) continue;

      const kidObj = this._objects.get(kidRef.objectNumber);
      if (!(kidObj instanceof COSDictionary)) continue;

      const typeEntry = kidObj.getItem('Type');
      const typeName = typeEntry instanceof COSName ? typeEntry.getName() : undefined;

      if (typeName === 'Pages') {
        // Intermediate pages node — recurse
        this._walkPageTree(kidObj, result, [...parentChain, node]);
      } else {
        // Leaf page node — apply inherited properties
        this._applyInheritedProperties(kidObj, [...parentChain, node]);
        result.push({ pageDict: kidObj, pageRef: kidRef });
      }
    }
  }

  /** PDF spec 7.7.3.4: MediaBox, CropBox, Resources, Rotate are inheritable. */
  private _applyInheritedProperties(
    pageDict: COSDictionary,
    parentChain: COSDictionary[],
  ): void {
    const inheritableKeys = ['MediaBox', 'CropBox', 'Resources', 'Rotate'];
    for (const key of inheritableKeys) {
      if (pageDict.getItem(key)) continue;
      // Walk parents from innermost to outermost
      for (let i = parentChain.length - 1; i >= 0; i--) {
        const parentValue = parentChain[i].getItem(key);
        if (parentValue) {
          pageDict.setItem(key, parentValue);
          break;
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Object registry
  // ---------------------------------------------------------------------------

  /** Register a COS object, assign it the next object number. Returns its reference. */
  register(obj: COSBase): COSObjectReference {
    return this._register(obj);
  }

  /**
   * Allocate the next object number without registering an object yet.
   * Used by copyPages to break circular references: allocate first,
   * then assign the cloned object after recursion completes.
   */
  allocateRef(): COSObjectReference {
    const num = this._nextObjNum++;
    return new COSObjectReference(num, 0);
  }

  /** Assign an object at a specific object number. */
  assign(objNum: number, obj: COSBase): void {
    this._objects.set(objNum, obj);
    if (objNum >= this._nextObjNum) {
      this._nextObjNum = objNum + 1;
    }
  }

  /** Look up an indirect object by number. */
  lookup(objNum: number): COSBase | undefined {
    return this._objects.get(objNum);
  }

  /** Total number of objects (for xref /Size). */
  get objectCount(): number {
    return this._nextObjNum; // includes 0 (free head)
  }

  /** Enumerate all indirect objects sorted by object number. */
  enumerateObjects(): Array<[number, COSBase]> {
    return Array.from(this._objects.entries()).sort((a, b) => a[0] - b[0]);
  }

  // ---------------------------------------------------------------------------
  // Stream creation helper
  // ---------------------------------------------------------------------------

  /** Create a COSStream from raw bytes and register it. Returns the ref. */
  createStream(data: Uint8Array): COSObjectReference {
    const stream = new COSStream();
    stream.setData(data);
    return this._register(stream);
  }

  // ---------------------------------------------------------------------------
  // Page management
  // ---------------------------------------------------------------------------

  /**
   * Add a page to the document. Returns the page dict and its object reference.
   * MediaBox defaults to Letter [0 0 612 792] if not specified.
   */
  addPage(width: number = 612, height: number = 792): {
    pageDict: COSDictionary;
    pageRef: COSObjectReference;
  } {
    const pageDict = new COSDictionary();
    pageDict.setItem('Type', new COSName('Page'));
    pageDict.setItem('Parent', this.pagesRef);

    // MediaBox — use COSFloat for non-integer dimensions (e.g. A4 = 595.28 x 841.89)
    const mediaBox = new COSArray();
    mediaBox.add(new COSInteger(0));
    mediaBox.add(new COSInteger(0));
    mediaBox.add(Number.isInteger(width) ? new COSInteger(width) : new COSFloat(width));
    mediaBox.add(Number.isInteger(height) ? new COSInteger(height) : new COSFloat(height));
    pageDict.setItem('MediaBox', mediaBox);

    // Resources (empty, populated as fonts/images are used)
    const resources = new COSDictionary();
    resources.setDirect(true);
    pageDict.setItem('Resources', resources);

    // Contents (array of stream refs, populated as drawing occurs)
    const contents = new COSArray();
    contents.setDirect(true);
    pageDict.setItem('Contents', contents);

    const pageRef = this._register(pageDict);

    // Update pages tree
    const kids = this.pages.getItem('Kids') as COSArray;
    kids.add(pageRef);
    const count = this.pages.getInt('Count');
    this.pages.setItem('Count', new COSInteger(count + 1));

    return { pageDict, pageRef };
  }

  /**
   * Add a pre-built page (from copyPages) to the pages tree.
   * The page dict is already registered; this just adds its ref to /Kids and bumps /Count.
   */
  addCopiedPage(pageRef: COSObjectReference): void {
    const kids = this.pages.getItem('Kids') as COSArray;
    kids.add(pageRef);
    const count = this.pages.getInt('Count');
    this.pages.setItem('Count', new COSInteger(count + 1));
  }

  // ---------------------------------------------------------------------------
  // Standard font embedding
  // ---------------------------------------------------------------------------

  /**
   * Create a Type1 standard font dictionary and register it.
   * Standard fonts don't need embedding — just a reference dict.
   */
  embedStandardFont(baseFontName: string): COSObjectReference {
    const fontDict = new COSDictionary();
    fontDict.setItem('Type', new COSName('Font'));
    fontDict.setItem('Subtype', new COSName('Type1'));
    fontDict.setItem('BaseFont', new COSName(baseFontName));

    // WinAnsiEncoding for most fonts; Symbol and ZapfDingbats use built-in
    if (baseFontName !== 'Symbol' && baseFontName !== 'ZapfDingbats') {
      fontDict.setItem('Encoding', new COSName('WinAnsiEncoding'));
    }

    return this._register(fontDict);
  }

  // ---------------------------------------------------------------------------
  // Custom font embedding (TrueType)
  // ---------------------------------------------------------------------------

  /**
   * Embed a TrueType font as a Type0/CIDFontType2 composite font.
   * Creates 5 PDF objects: FontFile2, FontDescriptor, CIDFont, ToUnicode, Type0.
   * Returns the Type0 font dictionary reference.
   */
  embedCustomFont(info: TrueTypeFontInfo): COSObjectReference {
    const scale = 1000 / info.unitsPerEm;

    // 1. FontFile2 stream — flate-compressed TTF bytes
    const fontFile2Stream = new COSStream();
    fontFile2Stream.setItem('Length1', new COSInteger(info.rawBytes.length));
    fontFile2Stream.setItem('Filter', new COSName('FlateDecode'));
    fontFile2Stream.setData(pako.deflate(info.rawBytes));
    const fontFile2Ref = this._register(fontFile2Stream);

    // 2. FontDescriptor
    const fontDescriptor = new COSDictionary();
    fontDescriptor.setItem('Type', new COSName('FontDescriptor'));
    fontDescriptor.setItem('FontName', new COSName(info.postScriptName));
    fontDescriptor.setItem('Flags', new COSInteger(info.flags));

    const bboxArray = new COSArray();
    bboxArray.add(new COSInteger(Math.round(info.fontBBox[0] * scale)));
    bboxArray.add(new COSInteger(Math.round(info.fontBBox[1] * scale)));
    bboxArray.add(new COSInteger(Math.round(info.fontBBox[2] * scale)));
    bboxArray.add(new COSInteger(Math.round(info.fontBBox[3] * scale)));
    fontDescriptor.setItem('FontBBox', bboxArray);

    fontDescriptor.setItem('ItalicAngle', Number.isInteger(info.italicAngle)
      ? new COSInteger(info.italicAngle)
      : new COSFloat(info.italicAngle));
    fontDescriptor.setItem('Ascent', new COSInteger(Math.round(info.ascender * scale)));
    fontDescriptor.setItem('Descent', new COSInteger(Math.round(info.descender * scale)));
    fontDescriptor.setItem('CapHeight', new COSInteger(Math.round(info.capHeight * scale)));
    fontDescriptor.setItem('StemV', new COSInteger(info.stemV));
    fontDescriptor.setItem('FontFile2', fontFile2Ref);
    const fontDescriptorRef = this._register(fontDescriptor);

    // 3. CIDFont dictionary (CIDFontType2)
    const cidFont = new COSDictionary();
    cidFont.setItem('Type', new COSName('Font'));
    cidFont.setItem('Subtype', new COSName('CIDFontType2'));
    cidFont.setItem('BaseFont', new COSName(info.postScriptName));

    // CIDSystemInfo
    const cidSystemInfo = new COSDictionary();
    cidSystemInfo.setDirect(true);
    cidSystemInfo.setItem('Registry', new COSString('Adobe'));
    cidSystemInfo.setItem('Ordering', new COSString('Identity'));
    cidSystemInfo.setItem('Supplement', new COSInteger(0));
    cidFont.setItem('CIDSystemInfo', cidSystemInfo);

    cidFont.setItem('FontDescriptor', fontDescriptorRef);
    cidFont.setItem('CIDToGIDMap', new COSName('Identity'));

    // /W widths array: [0 [w0 w1 w2 ... wN]]
    const widthValues = new COSArray();
    for (let i = 0; i < info.numGlyphs; i++) {
      widthValues.add(new COSInteger(Math.round(info.advanceWidths[i] * scale)));
    }
    const wArray = new COSArray();
    wArray.add(new COSInteger(0));
    wArray.add(widthValues);
    cidFont.setItem('W', wArray);

    // DW (default width)
    cidFont.setItem('DW', new COSInteger(Math.round((info.advanceWidths[0] || 1000) * scale)));

    const cidFontRef = this._register(cidFont);

    // 4. ToUnicode CMap stream
    // Build glyph ID -> Unicode map (inverse of cmap)
    const glyphToUnicode = new Map<number, number>();
    for (const [unicode, glyphId] of info.cmap) {
      // Only store the first Unicode mapping for each glyph
      if (!glyphToUnicode.has(glyphId)) {
        glyphToUnicode.set(glyphId, unicode);
      }
    }
    const cmapStr = buildToUnicodeCMap(glyphToUnicode);
    const cmapBytes = new TextEncoder().encode(cmapStr);
    const toUnicodeStream = new COSStream();
    toUnicodeStream.setData(cmapBytes);
    const toUnicodeRef = this._register(toUnicodeStream);

    // 5. Type0 font dictionary (top-level)
    const type0 = new COSDictionary();
    type0.setItem('Type', new COSName('Font'));
    type0.setItem('Subtype', new COSName('Type0'));
    type0.setItem('BaseFont', new COSName(info.postScriptName));
    type0.setItem('Encoding', new COSName('Identity-H'));

    const descendantFonts = new COSArray();
    descendantFonts.add(cidFontRef);
    type0.setItem('DescendantFonts', descendantFonts);
    type0.setItem('ToUnicode', toUnicodeRef);

    return this._register(type0);
  }

  // ---------------------------------------------------------------------------
  // Graphics state
  // ---------------------------------------------------------------------------

  /**
   * Create an ExtGState dictionary and register it.
   * Used for opacity/blend mode in drawing operations.
   */
  createGraphicsState(params: {
    fillOpacity?: number;
    strokeOpacity?: number;
    blendMode?: string;
  }): COSObjectReference {
    const gsDict = new COSDictionary();
    gsDict.setItem('Type', new COSName('ExtGState'));

    if (params.fillOpacity !== undefined) {
      gsDict.setItem('ca', new COSFloat(params.fillOpacity));
    }
    if (params.strokeOpacity !== undefined) {
      gsDict.setItem('CA', new COSFloat(params.strokeOpacity));
    }
    if (params.blendMode !== undefined) {
      gsDict.setItem('BM', new COSName(params.blendMode));
    }

    return this._register(gsDict);
  }

  // ---------------------------------------------------------------------------
  // Metadata (Info dictionary)
  // ---------------------------------------------------------------------------

  private _ensureInfoDict(): COSDictionary {
    if (!this._info) {
      this._info = new COSDictionary();
      this._infoRef = this._register(this._info);
    }
    return this._info;
  }

  get infoRef(): COSObjectReference | undefined {
    return this._infoRef;
  }

  setTitle(title: string): void {
    this._ensureInfoDict().setItem('Title', new COSString(title));
  }

  setAuthor(author: string): void {
    this._ensureInfoDict().setItem('Author', new COSString(author));
  }

  setSubject(subject: string): void {
    this._ensureInfoDict().setItem('Subject', new COSString(subject));
  }

  setKeywords(keywords: string): void {
    this._ensureInfoDict().setItem('Keywords', new COSString(keywords));
  }

  setCreator(creator: string): void {
    this._ensureInfoDict().setItem('Creator', new COSString(creator));
  }

  setProducer(producer: string): void {
    this._ensureInfoDict().setItem('Producer', new COSString(producer));
  }

  setCreationDate(date: Date): void {
    this._ensureInfoDict().setItem(
      'CreationDate',
      new COSString(formatPdfDate(date)),
    );
  }

  setModificationDate(date: Date): void {
    this._ensureInfoDict().setItem(
      'ModDate',
      new COSString(formatPdfDate(date)),
    );
  }

  getInfoString(key: string): string | undefined {
    return this._info?.getString(key);
  }

  getInfoDate(key: string): Date | undefined {
    const str = this._info?.getString(key);
    if (!str) return undefined;
    return parsePdfDate(str);
  }

  // ---------------------------------------------------------------------------
  // AcroForm management (for native form field creation)
  // ---------------------------------------------------------------------------

  /** Get or create the /AcroForm dictionary on the catalog. */
  ensureAcroForm(): COSDictionary {
    let entry = this.catalog.getItem('AcroForm');
    if (entry instanceof COSObjectReference) {
      const resolved = this.resolveRef(entry);
      if (resolved instanceof COSDictionary) return resolved;
    }
    if (entry instanceof COSDictionary) return entry;

    // Create new AcroForm
    const acroForm = new COSDictionary();
    acroForm.setItem('Fields', new COSArray());
    const ref = this._register(acroForm);
    this.catalog.setItem('AcroForm', ref);
    return acroForm;
  }

  /** Get or create the /Fields array in /AcroForm. */
  ensureFieldsArray(): COSArray {
    const acroForm = this.ensureAcroForm();
    let fields = acroForm.getItem('Fields');
    if (fields instanceof COSObjectReference) {
      const resolved = this.resolveRef(fields);
      if (resolved instanceof COSArray) return resolved;
    }
    if (fields instanceof COSArray) return fields;

    const arr = new COSArray();
    acroForm.setItem('Fields', arr);
    return arr;
  }

  /** Get or create /DR (default resources) on /AcroForm with Helvetica. */
  ensureDefaultResources(): COSDictionary {
    const acroForm = this.ensureAcroForm();
    let dr = acroForm.getItem('DR');
    if (dr instanceof COSObjectReference) {
      const resolved = this.resolveRef(dr);
      if (resolved instanceof COSDictionary) return resolved;
    }
    if (dr instanceof COSDictionary) return dr;

    // Create default resources with Helvetica
    const drDict = new COSDictionary();
    drDict.setDirect(true);

    const fontDict = new COSDictionary();
    fontDict.setDirect(true);

    // Standard Helvetica font dict
    const helvetica = new COSDictionary();
    helvetica.setItem('Type', new COSName('Font'));
    helvetica.setItem('Subtype', new COSName('Type1'));
    helvetica.setItem('BaseFont', new COSName('Helvetica'));
    helvetica.setItem('Encoding', new COSName('WinAnsiEncoding'));
    const helvRef = this._register(helvetica);
    fontDict.setItem('Helv', helvRef);

    drDict.setItem('Font', fontDict);
    acroForm.setItem('DR', drDict);
    // Also set /DA for default appearance
    if (!acroForm.getItem('DA')) {
      acroForm.setItem('DA', new COSString('/Helv 0 Tf 0 g'));
    }
    return drDict;
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  /**
   * Scan all loaded objects for a dictionary with /Type matching the given name.
   * Used as fallback when xref-based resolution fails for critical objects.
   */
  private _findObjectByType(typeName: string): COSBase | undefined {
    for (const [, obj] of this._objects) {
      if (obj instanceof COSDictionary) {
        const typeEntry = obj.getItem('Type');
        if (typeEntry instanceof COSName && typeEntry.getName() === typeName) {
          return obj;
        }
      }
    }
    return undefined;
  }

  private _register(obj: COSBase): COSObjectReference {
    const num = this._nextObjNum++;
    this._objects.set(num, obj);
    return new COSObjectReference(num, 0);
  }
}

// ---------------------------------------------------------------------------
// PDF date formatting (D:YYYYMMDDHHmmSSOHH'mm')
// ---------------------------------------------------------------------------

function formatPdfDate(date: Date): string {
  const y = date.getUTCFullYear().toString();
  const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const d = date.getUTCDate().toString().padStart(2, '0');
  const h = date.getUTCHours().toString().padStart(2, '0');
  const min = date.getUTCMinutes().toString().padStart(2, '0');
  const s = date.getUTCSeconds().toString().padStart(2, '0');
  return `D:${y}${m}${d}${h}${min}${s}Z`;
}

function parsePdfDate(str: string): Date | undefined {
  // D:YYYYMMDDHHmmSS(Z|+HH'mm'|-HH'mm')
  const match = str.match(
    /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/,
  );
  if (!match) return undefined;
  const [, y, mo, d, h, mi, s] = match;
  return new Date(
    Date.UTC(
      parseInt(y),
      (parseInt(mo || '1')) - 1,
      parseInt(d || '1'),
      parseInt(h || '0'),
      parseInt(mi || '0'),
      parseInt(s || '0'),
    ),
  );
}
