/**
 * Edge-case unit tests for NativeDocumentContext.
 *
 * Covers: object registration at scale, number allocation, resolveRef,
 * page tree management, info dictionary getters/setters, stream creation,
 * graphics state, font embedding encoding rules, version defaults,
 * assign/lookup, and objectCount semantics.
 */

import { describe, it, expect } from 'vitest';
import { NativeDocumentContext } from '../NativeDocumentContext.js';
import {
  COSDictionary,
  COSName,
  COSInteger,
  COSArray,
  COSFloat,
  COSStream,
  COSObjectReference,
} from '../../pdfbox/cos/COSTypes.js';

describe('NativeDocumentContext edge cases', () => {
  // -------------------------------------------------------------------------
  // Object registration at scale
  // -------------------------------------------------------------------------

  it('registers 50+ objects and all are enumerable', () => {
    const ctx = new NativeDocumentContext();
    // Constructor already registered catalog (1) and pages (2)
    const refs: COSObjectReference[] = [];
    for (let i = 0; i < 50; i++) {
      const dict = new COSDictionary();
      dict.setItem('Index', new COSInteger(i));
      refs.push(ctx.register(dict));
    }

    const entries = ctx.enumerateObjects();
    // 2 (constructor) + 50 = 52 objects
    expect(entries.length).toBe(52);

    // Every registered ref should be resolvable
    for (const ref of refs) {
      expect(ctx.resolveRef(ref)).toBeDefined();
    }

    // Object numbers should be sorted ascending
    const objNums = entries.map(([num]) => num);
    expect(objNums).toEqual([...objNums].sort((a, b) => a - b));
  });

  // -------------------------------------------------------------------------
  // Object number allocation
  // -------------------------------------------------------------------------

  it('object number allocation starts at 1 for a new context', () => {
    const ctx = new NativeDocumentContext();
    // Catalog gets object number 1
    expect(ctx.catalogRef.objectNumber).toBe(1);
    // Pages gets object number 2
    expect(ctx.pagesRef.objectNumber).toBe(2);
  });

  it('objectCount equals N + 1 after registering N objects (includes free head 0)', () => {
    const ctx = new NativeDocumentContext();
    // Constructor registers 2 objects (catalog=1, pages=2) => objectCount = 3
    expect(ctx.objectCount).toBe(3);

    // Register 5 more
    for (let i = 0; i < 5; i++) {
      ctx.register(new COSDictionary());
    }
    // Total registered: 2 + 5 = 7, objectCount = 8 (0 free head + 7 objects)
    expect(ctx.objectCount).toBe(8);
  });

  // -------------------------------------------------------------------------
  // resolveRef
  // -------------------------------------------------------------------------

  it('resolveRef to a non-existent object returns undefined', () => {
    const ctx = new NativeDocumentContext();
    const fakeRef = new COSObjectReference(9999, 0);
    expect(ctx.resolveRef(fakeRef)).toBeUndefined();
  });

  it('resolveRef returns the correct object for a valid reference', () => {
    const ctx = new NativeDocumentContext();
    const dict = new COSDictionary();
    dict.setItem('Custom', new COSName('Value'));
    const ref = ctx.register(dict);

    const resolved = ctx.resolveRef(ref);
    expect(resolved).toBe(dict);
  });

  // -------------------------------------------------------------------------
  // addPage defaults and custom dimensions
  // -------------------------------------------------------------------------

  it('addPage defaults to Letter size (612 x 792)', () => {
    const ctx = new NativeDocumentContext();
    const { pageDict } = ctx.addPage();

    const mediaBox = pageDict.getItem('MediaBox') as COSArray;
    expect(mediaBox).toBeInstanceOf(COSArray);
    expect(mediaBox.size()).toBe(4);

    const w = mediaBox.get(2) as COSInteger;
    const h = mediaBox.get(3) as COSInteger;
    expect(w.getValue()).toBe(612);
    expect(h.getValue()).toBe(792);
  });

  it('addPage with custom dimensions uses COSFloat for non-integers', () => {
    const ctx = new NativeDocumentContext();
    const { pageDict } = ctx.addPage(595.28, 841.89);

    const mediaBox = pageDict.getItem('MediaBox') as COSArray;
    const w = mediaBox.get(2);
    const h = mediaBox.get(3);

    // Non-integer dimensions should be COSFloat
    expect(w).toBeInstanceOf(COSFloat);
    expect(h).toBeInstanceOf(COSFloat);
    expect((w as COSFloat).getValue()).toBeCloseTo(595.28, 2);
    expect((h as COSFloat).getValue()).toBeCloseTo(841.89, 2);
  });

  it('addPage with integer dimensions uses COSInteger', () => {
    const ctx = new NativeDocumentContext();
    const { pageDict } = ctx.addPage(400, 300);

    const mediaBox = pageDict.getItem('MediaBox') as COSArray;
    const w = mediaBox.get(2);
    const h = mediaBox.get(3);

    expect(w).toBeInstanceOf(COSInteger);
    expect(h).toBeInstanceOf(COSInteger);
    expect((w as COSInteger).getValue()).toBe(400);
    expect((h as COSInteger).getValue()).toBe(300);
  });

  // -------------------------------------------------------------------------
  // Page list / page tree
  // -------------------------------------------------------------------------

  it('getPageList on fresh context returns empty array', () => {
    const ctx = new NativeDocumentContext();
    expect(ctx.getPageList()).toEqual([]);
  });

  it('addPage then getPageList returns 1 page with correct MediaBox', () => {
    const ctx = new NativeDocumentContext();
    ctx.addPage(800, 600);

    const pages = ctx.getPageList();
    expect(pages.length).toBe(1);

    const mediaBox = pages[0].pageDict.getItem('MediaBox') as COSArray;
    expect(mediaBox.size()).toBe(4);
    expect((mediaBox.get(2) as COSInteger).getValue()).toBe(800);
    expect((mediaBox.get(3) as COSInteger).getValue()).toBe(600);
  });

  it('pages tree /Count is incremented correctly with multiple pages', () => {
    const ctx = new NativeDocumentContext();

    expect(ctx.pages.getInt('Count')).toBe(0);

    ctx.addPage();
    expect(ctx.pages.getInt('Count')).toBe(1);

    ctx.addPage();
    expect(ctx.pages.getInt('Count')).toBe(2);

    ctx.addPage();
    ctx.addPage();
    ctx.addPage();
    expect(ctx.pages.getInt('Count')).toBe(5);

    const pageList = ctx.getPageList();
    expect(pageList.length).toBe(5);
  });

  // -------------------------------------------------------------------------
  // Info dictionary
  // -------------------------------------------------------------------------

  it('set and get Title, Author, Subject, Keywords, Creator, Producer', () => {
    const ctx = new NativeDocumentContext();
    ctx.setTitle('Test Title');
    ctx.setAuthor('Test Author');
    ctx.setSubject('Test Subject');
    ctx.setKeywords('keyword1, keyword2');
    ctx.setCreator('Test Creator');
    ctx.setProducer('Test Producer');

    expect(ctx.getInfoString('Title')).toBe('Test Title');
    expect(ctx.getInfoString('Author')).toBe('Test Author');
    expect(ctx.getInfoString('Subject')).toBe('Test Subject');
    expect(ctx.getInfoString('Keywords')).toBe('keyword1, keyword2');
    expect(ctx.getInfoString('Creator')).toBe('Test Creator');
    expect(ctx.getInfoString('Producer')).toBe('Test Producer');
  });

  it('set CreationDate, get it back, verify Date object', () => {
    const ctx = new NativeDocumentContext();
    const date = new Date('2025-03-15T10:30:45Z');
    ctx.setCreationDate(date);

    const retrieved = ctx.getInfoDate('CreationDate');
    expect(retrieved).toBeInstanceOf(Date);
    expect(retrieved!.getUTCFullYear()).toBe(2025);
    expect(retrieved!.getUTCMonth()).toBe(2); // March = 2
    expect(retrieved!.getUTCDate()).toBe(15);
    expect(retrieved!.getUTCHours()).toBe(10);
    expect(retrieved!.getUTCMinutes()).toBe(30);
    expect(retrieved!.getUTCSeconds()).toBe(45);
  });

  it('get non-existent info key returns undefined', () => {
    const ctx = new NativeDocumentContext();
    // No info dict created yet
    expect(ctx.getInfoString('Title')).toBeUndefined();
    expect(ctx.getInfoDate('CreationDate')).toBeUndefined();

    // Create info dict with Title, but not Author
    ctx.setTitle('Only Title');
    expect(ctx.getInfoString('Title')).toBe('Only Title');
    expect(ctx.getInfoString('Author')).toBeUndefined();
    expect(ctx.getInfoDate('ModDate')).toBeUndefined();
  });

  it('infoRef is undefined before any info is set', () => {
    const ctx = new NativeDocumentContext();
    expect(ctx.infoRef).toBeUndefined();
  });

  it('infoRef is defined after setting any info field', () => {
    const ctx = new NativeDocumentContext();
    ctx.setTitle('Trigger info creation');
    expect(ctx.infoRef).toBeDefined();
    expect(ctx.infoRef!.objectNumber).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // createStream
  // -------------------------------------------------------------------------

  it('createStream creates a valid stream with data', () => {
    const ctx = new NativeDocumentContext();
    const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const ref = ctx.createStream(data);

    expect(ref).toBeInstanceOf(COSObjectReference);
    expect(ref.objectNumber).toBeGreaterThan(0);

    const resolved = ctx.resolveRef(ref);
    expect(resolved).toBeInstanceOf(COSStream);

    const stream = resolved as COSStream;
    expect(stream.getData()).toEqual(data);
    // Length should be set on the stream's dictionary
    const lengthVal = stream.getDictionary().getInt('Length');
    expect(lengthVal).toBe(5);
  });

  // -------------------------------------------------------------------------
  // createGraphicsState
  // -------------------------------------------------------------------------

  it('createGraphicsState with fillOpacity only', () => {
    const ctx = new NativeDocumentContext();
    const ref = ctx.createGraphicsState({ fillOpacity: 0.7 });
    const dict = ctx.resolveRef(ref) as COSDictionary;

    expect(dict).toBeInstanceOf(COSDictionary);
    const typeEntry = dict.getItem('Type') as COSName;
    expect(typeEntry.getName()).toBe('ExtGState');

    const ca = dict.getItem('ca') as COSFloat;
    expect(ca.getValue()).toBeCloseTo(0.7);

    // strokeOpacity (CA) and blendMode (BM) should not be present
    expect(dict.getItem('CA')).toBeUndefined();
    expect(dict.getItem('BM')).toBeUndefined();
  });

  it('createGraphicsState with both fillOpacity and strokeOpacity', () => {
    const ctx = new NativeDocumentContext();
    const ref = ctx.createGraphicsState({ fillOpacity: 0.3, strokeOpacity: 0.8 });
    const dict = ctx.resolveRef(ref) as COSDictionary;

    const ca = dict.getItem('ca') as COSFloat;
    const CA = dict.getItem('CA') as COSFloat;
    expect(ca.getValue()).toBeCloseTo(0.3);
    expect(CA.getValue()).toBeCloseTo(0.8);
  });

  it('createGraphicsState with blendMode', () => {
    const ctx = new NativeDocumentContext();
    const ref = ctx.createGraphicsState({ blendMode: 'Multiply' });
    const dict = ctx.resolveRef(ref) as COSDictionary;

    const bm = dict.getItem('BM') as COSName;
    expect(bm.getName()).toBe('Multiply');

    // fillOpacity and strokeOpacity should not be present
    expect(dict.getItem('ca')).toBeUndefined();
    expect(dict.getItem('CA')).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // embedStandardFont
  // -------------------------------------------------------------------------

  it('embedStandardFont creates proper font dict with /Type /Font /Subtype /Type1', () => {
    const ctx = new NativeDocumentContext();
    const ref = ctx.embedStandardFont('Courier');
    const dict = ctx.resolveRef(ref) as COSDictionary;

    expect(dict).toBeInstanceOf(COSDictionary);

    const type = dict.getItem('Type') as COSName;
    expect(type.getName()).toBe('Font');

    const subtype = dict.getItem('Subtype') as COSName;
    expect(subtype.getName()).toBe('Type1');

    const baseFont = dict.getItem('BaseFont') as COSName;
    expect(baseFont.getName()).toBe('Courier');
  });

  it('embedStandardFont for Symbol has no /Encoding entry', () => {
    const ctx = new NativeDocumentContext();
    const ref = ctx.embedStandardFont('Symbol');
    const dict = ctx.resolveRef(ref) as COSDictionary;

    expect(dict.getItem('Encoding')).toBeUndefined();

    const baseFont = dict.getItem('BaseFont') as COSName;
    expect(baseFont.getName()).toBe('Symbol');
  });

  it('embedStandardFont for ZapfDingbats has no /Encoding entry', () => {
    const ctx = new NativeDocumentContext();
    const ref = ctx.embedStandardFont('ZapfDingbats');
    const dict = ctx.resolveRef(ref) as COSDictionary;

    expect(dict.getItem('Encoding')).toBeUndefined();

    const baseFont = dict.getItem('BaseFont') as COSName;
    expect(baseFont.getName()).toBe('ZapfDingbats');
  });

  it('embedStandardFont for Helvetica has /Encoding /WinAnsiEncoding', () => {
    const ctx = new NativeDocumentContext();
    const ref = ctx.embedStandardFont('Helvetica');
    const dict = ctx.resolveRef(ref) as COSDictionary;

    const encoding = dict.getItem('Encoding') as COSName;
    expect(encoding).toBeInstanceOf(COSName);
    expect(encoding.getName()).toBe('WinAnsiEncoding');
  });

  // -------------------------------------------------------------------------
  // Version
  // -------------------------------------------------------------------------

  it('version defaults to "1.7" for new contexts', () => {
    const ctx = new NativeDocumentContext();
    expect(ctx.version).toBe('1.7');
  });

  // -------------------------------------------------------------------------
  // assign() and lookup()
  // -------------------------------------------------------------------------

  it('assign() can overwrite existing objects', () => {
    const ctx = new NativeDocumentContext();

    const original = new COSDictionary();
    original.setItem('Label', new COSName('Original'));
    const ref = ctx.register(original);
    const objNum = ref.objectNumber;

    expect(ctx.lookup(objNum)).toBe(original);

    // Overwrite
    const replacement = new COSDictionary();
    replacement.setItem('Label', new COSName('Replaced'));
    ctx.assign(objNum, replacement);

    const looked = ctx.lookup(objNum) as COSDictionary;
    expect(looked).toBe(replacement);
    expect((looked.getItem('Label') as COSName).getName()).toBe('Replaced');
  });

  it('lookup() returns assigned objects correctly', () => {
    const ctx = new NativeDocumentContext();

    // Assign at a specific high object number
    const dict = new COSDictionary();
    dict.setItem('Key', new COSName('Value'));
    ctx.assign(100, dict);

    expect(ctx.lookup(100)).toBe(dict);
    // objectCount should have been bumped
    expect(ctx.objectCount).toBeGreaterThanOrEqual(101);
  });

  it('assign() at a high number advances nextObjNum', () => {
    const ctx = new NativeDocumentContext();
    // Constructor: nextObjNum = 3
    expect(ctx.objectCount).toBe(3);

    ctx.assign(50, new COSDictionary());
    // nextObjNum should now be 51
    expect(ctx.objectCount).toBe(51);

    // Next register() should get object number 51
    const ref = ctx.register(new COSDictionary());
    expect(ref.objectNumber).toBe(51);
    expect(ctx.objectCount).toBe(52);
  });
});
