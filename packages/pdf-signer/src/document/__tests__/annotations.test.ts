/**
 * Annotation system tests — PDAnnotation base class, all 12 subclasses,
 * PDFPage.addAnnotation() integration, and qpdf validation.
 */

import { describe, it, expect } from 'vitest';
import { PDFDocument } from '../PDFDocument.js';
import { rgb, cmyk, grayscale } from '../colors.js';
import {
  PDAnnotation,
  PDAnnotationHighlight,
  PDAnnotationUnderline,
  PDAnnotationStrikeout,
  PDAnnotationSquiggly,
  PDAnnotationText,
  PDAnnotationFreeText,
  PDAnnotationRubberStamp,
  PDAnnotationLine,
  PDAnnotationSquare,
  PDAnnotationCircle,
  PDAnnotationInk,
  PDAnnotationLink,
  ANNOTATION_FLAG_PRINT,
  ANNOTATION_FLAG_HIDDEN,
  ANNOTATION_FLAG_LOCKED,
  StampName,
  TextIconName,
  LineEndingStyle,
  FreeTextAlignment,
} from '../annotations/index.js';
import {
  COSName,
  COSString,
  COSFloat,
  COSInteger,
  COSArray,
  COSDictionary,
  COSBoolean,
} from '../../pdfbox/cos/COSTypes.js';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasCommand(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Shorthand: get a COSName value from a dict entry. */
function nameValue(dict: COSDictionary, key: string): string {
  const item = dict.getItem(key);
  expect(item).toBeInstanceOf(COSName);
  return (item as COSName).getName();
}

/** Shorthand: get a COSString value from a dict entry. */
function stringValue(dict: COSDictionary, key: string): string {
  const item = dict.getItem(key);
  expect(item).toBeInstanceOf(COSString);
  return (item as COSString).getString();
}

/** Shorthand: get a COSInteger value from a dict entry. */
function intValue(dict: COSDictionary, key: string): number {
  const item = dict.getItem(key);
  expect(item).toBeInstanceOf(COSInteger);
  return (item as COSInteger).getValue();
}

/** Shorthand: get a COSFloat value from a dict entry. */
function floatValue(dict: COSDictionary, key: string): number {
  const item = dict.getItem(key);
  expect(item).toBeInstanceOf(COSFloat);
  return (item as COSFloat).getValue();
}

/** Get a COSArray from a dict entry. */
function arrayValue(dict: COSDictionary, key: string): COSArray {
  const item = dict.getItem(key);
  expect(item).toBeInstanceOf(COSArray);
  return item as COSArray;
}

/** Extract numeric values from a COSArray. */
function arrayNumbers(arr: COSArray): number[] {
  const result: number[] = [];
  for (let i = 0; i < arr.size(); i++) {
    const entry = arr.get(i);
    if (entry instanceof COSFloat) result.push(entry.getValue());
    else if (entry instanceof COSInteger) result.push(entry.getValue());
  }
  return result;
}

/** Standard rect for most tests. */
const RECT: [number, number, number, number] = [100, 200, 300, 250];

// ---------------------------------------------------------------------------
// 1. Base PDAnnotation
// ---------------------------------------------------------------------------

describe('PDAnnotation (base)', () => {
  it('creates dict with /Type Annot and correct /Subtype', () => {
    const annot = new PDAnnotationHighlight({ rect: RECT });
    const dict = annot.getCOSObject();
    expect(nameValue(dict, 'Type')).toBe('Annot');
    expect(nameValue(dict, 'Subtype')).toBe('Highlight');
  });

  it('sets /Rect as 4-element array', () => {
    const annot = new PDAnnotationHighlight({ rect: [10, 20, 300, 400] });
    const rect = arrayValue(annot._dict, 'Rect');
    expect(rect.size()).toBe(4);
    expect(arrayNumbers(rect)).toEqual([10, 20, 300, 400]);
  });

  it('sets /Contents when provided', () => {
    const annot = new PDAnnotationHighlight({ rect: RECT, contents: 'Hello world' });
    expect(stringValue(annot._dict, 'Contents')).toBe('Hello world');
  });

  it('sets /T (author) when provided', () => {
    const annot = new PDAnnotationHighlight({ rect: RECT, author: 'Alice' });
    expect(stringValue(annot._dict, 'T')).toBe('Alice');
  });

  it('sets /M (modified date) when provided', () => {
    const date = new Date('2025-06-15T10:30:00Z');
    const annot = new PDAnnotationHighlight({ rect: RECT, modifiedDate: date });
    const mVal = stringValue(annot._dict, 'M');
    // Format is D:YYYYMMDDHHmmSSZ
    expect(mVal).toBe('D:20250615103000Z');
  });

  it('default flags = PRINT (4)', () => {
    const annot = new PDAnnotationHighlight({ rect: RECT });
    expect(intValue(annot._dict, 'F')).toBe(ANNOTATION_FLAG_PRINT);
    expect(intValue(annot._dict, 'F')).toBe(4);
  });

  it('custom flags override default', () => {
    const flags = ANNOTATION_FLAG_PRINT | ANNOTATION_FLAG_LOCKED;
    const annot = new PDAnnotationHighlight({ rect: RECT, flags });
    expect(intValue(annot._dict, 'F')).toBe(flags);
  });

  it('sets /CA opacity', () => {
    const annot = new PDAnnotationHighlight({ rect: RECT, opacity: 0.5 });
    expect(floatValue(annot._dict, 'CA')).toBeCloseTo(0.5, 5);
  });

  it('sets /BS border style dict', () => {
    const annot = new PDAnnotationHighlight({
      rect: RECT,
      borderWidth: 2,
      borderStyle: 'D',
    });
    const bs = annot._dict.getItem('BS');
    expect(bs).toBeInstanceOf(COSDictionary);
    const bsDict = bs as COSDictionary;
    expect(nameValue(bsDict, 'Type')).toBe('Border');
    expect(nameValue(bsDict, 'S')).toBe('D');
    const w = bsDict.getItem('W');
    expect(w).toBeInstanceOf(COSInteger);
    expect((w as COSInteger).getValue()).toBe(2);
  });

  it('color (RGB) produces /C array with 3 components', () => {
    const annot = new PDAnnotationText({ rect: RECT, color: rgb(0.8, 0.2, 0.1) });
    const c = arrayValue(annot._dict, 'C');
    expect(c.size()).toBe(3);
    const vals = arrayNumbers(c);
    expect(vals[0]).toBeCloseTo(0.8, 5);
    expect(vals[1]).toBeCloseTo(0.2, 5);
    expect(vals[2]).toBeCloseTo(0.1, 5);
  });

  it('color (CMYK) produces /C array with 4 components', () => {
    const annot = new PDAnnotationText({
      rect: RECT,
      color: cmyk(0.1, 0.2, 0.3, 0.4),
    });
    const c = arrayValue(annot._dict, 'C');
    expect(c.size()).toBe(4);
    const vals = arrayNumbers(c);
    expect(vals).toEqual([0.1, 0.2, 0.3, 0.4].map(v => expect.closeTo(v, 5)));
  });

  it('color (grayscale) produces /C array with 1 component', () => {
    const annot = new PDAnnotationText({
      rect: RECT,
      color: grayscale(0.7),
    });
    const c = arrayValue(annot._dict, 'C');
    expect(c.size()).toBe(1);
    expect(arrayNumbers(c)[0]).toBeCloseTo(0.7, 5);
  });
});

// ---------------------------------------------------------------------------
// 2. PDAnnotationHighlight
// ---------------------------------------------------------------------------

describe('PDAnnotationHighlight', () => {
  it('subtype is /Highlight', () => {
    const annot = new PDAnnotationHighlight({ rect: RECT });
    expect(nameValue(annot._dict, 'Subtype')).toBe('Highlight');
  });

  it('sets /QuadPoints from explicit array', () => {
    const qp = [100, 250, 300, 250, 100, 200, 300, 200];
    const annot = new PDAnnotationHighlight({ rect: RECT, quadPoints: qp });
    const arr = arrayValue(annot._dict, 'QuadPoints');
    expect(arr.size()).toBe(8);
    expect(arrayNumbers(arr)).toEqual(qp);
  });

  it('default color is yellow (1, 1, 0) when no color provided', () => {
    const annot = new PDAnnotationHighlight({ rect: RECT });
    const c = arrayValue(annot._dict, 'C');
    expect(c.size()).toBe(3);
    const vals = arrayNumbers(c);
    expect(vals[0]).toBeCloseTo(1.0, 5);
    expect(vals[1]).toBeCloseTo(1.0, 5);
    expect(vals[2]).toBeCloseTo(0.0, 5);
  });

  it('auto-generates QuadPoints from rect when not provided', () => {
    const annot = new PDAnnotationHighlight({ rect: [50, 100, 200, 150] });
    const arr = arrayValue(annot._dict, 'QuadPoints');
    expect(arr.size()).toBe(8);
    // QuadPoints from rect: upper-left, upper-right, lower-left, lower-right
    // [llx, ury, urx, ury, llx, lly, urx, lly]
    const vals = arrayNumbers(arr);
    expect(vals).toEqual([50, 150, 200, 150, 50, 100, 200, 100]);
  });
});

// ---------------------------------------------------------------------------
// 3. PDAnnotationUnderline
// ---------------------------------------------------------------------------

describe('PDAnnotationUnderline', () => {
  it('subtype is /Underline', () => {
    const annot = new PDAnnotationUnderline({ rect: RECT });
    expect(nameValue(annot._dict, 'Subtype')).toBe('Underline');
  });

  it('sets /QuadPoints', () => {
    const qp = [10, 50, 200, 50, 10, 40, 200, 40];
    const annot = new PDAnnotationUnderline({ rect: RECT, quadPoints: qp });
    const arr = arrayValue(annot._dict, 'QuadPoints');
    expect(arrayNumbers(arr)).toEqual(qp);
  });
});

// ---------------------------------------------------------------------------
// 4. PDAnnotationStrikeout
// ---------------------------------------------------------------------------

describe('PDAnnotationStrikeout', () => {
  it('subtype is /StrikeOut', () => {
    const annot = new PDAnnotationStrikeout({ rect: RECT });
    expect(nameValue(annot._dict, 'Subtype')).toBe('StrikeOut');
  });

  it('sets /QuadPoints', () => {
    const qp = [20, 60, 250, 60, 20, 45, 250, 45];
    const annot = new PDAnnotationStrikeout({ rect: RECT, quadPoints: qp });
    const arr = arrayValue(annot._dict, 'QuadPoints');
    expect(arrayNumbers(arr)).toEqual(qp);
  });
});

// ---------------------------------------------------------------------------
// 5. PDAnnotationSquiggly
// ---------------------------------------------------------------------------

describe('PDAnnotationSquiggly', () => {
  it('subtype is /Squiggly', () => {
    const annot = new PDAnnotationSquiggly({ rect: RECT });
    expect(nameValue(annot._dict, 'Subtype')).toBe('Squiggly');
  });

  it('sets /QuadPoints', () => {
    const qp = [30, 70, 280, 70, 30, 55, 280, 55];
    const annot = new PDAnnotationSquiggly({ rect: RECT, quadPoints: qp });
    const arr = arrayValue(annot._dict, 'QuadPoints');
    expect(arrayNumbers(arr)).toEqual(qp);
  });
});

// ---------------------------------------------------------------------------
// 6. PDAnnotationText
// ---------------------------------------------------------------------------

describe('PDAnnotationText', () => {
  it('subtype is /Text', () => {
    const annot = new PDAnnotationText({ rect: RECT });
    expect(nameValue(annot._dict, 'Subtype')).toBe('Text');
  });

  it('sets /Name icon (default Comment)', () => {
    const annot = new PDAnnotationText({ rect: RECT });
    expect(nameValue(annot._dict, 'Name')).toBe('Comment');
  });

  it('sets /Name to custom icon', () => {
    const annot = new PDAnnotationText({ rect: RECT, iconName: TextIconName.KEY });
    expect(nameValue(annot._dict, 'Name')).toBe('Key');
  });

  it('sets /Open boolean', () => {
    const opened = new PDAnnotationText({ rect: RECT, open: true });
    const openVal = opened._dict.getItem('Open');
    expect(openVal).toBeInstanceOf(COSBoolean);
    expect((openVal as COSBoolean).getValue()).toBe(true);

    const closed = new PDAnnotationText({ rect: RECT, open: false });
    const closedVal = closed._dict.getItem('Open');
    expect(closedVal).toBeInstanceOf(COSBoolean);
    expect((closedVal as COSBoolean).getValue()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. PDAnnotationFreeText
// ---------------------------------------------------------------------------

describe('PDAnnotationFreeText', () => {
  it('subtype is /FreeText', () => {
    const annot = new PDAnnotationFreeText({ rect: RECT });
    expect(nameValue(annot._dict, 'Subtype')).toBe('FreeText');
  });

  it('sets /DA default appearance string', () => {
    const annot = new PDAnnotationFreeText({
      rect: RECT,
      defaultAppearance: '/Helv 14 Tf 0.5 g',
    });
    expect(stringValue(annot._dict, 'DA')).toBe('/Helv 14 Tf 0.5 g');
  });

  it('sets /Q alignment', () => {
    const annot = new PDAnnotationFreeText({
      rect: RECT,
      alignment: FreeTextAlignment.CENTER,
    });
    expect(intValue(annot._dict, 'Q')).toBe(1);

    const right = new PDAnnotationFreeText({
      rect: RECT,
      alignment: FreeTextAlignment.RIGHT,
    });
    expect(intValue(right._dict, 'Q')).toBe(2);
  });

  it('builds DA from fontSize + fontName when no explicit DA', () => {
    const annot = new PDAnnotationFreeText({
      rect: RECT,
      fontSize: 18,
      fontName: 'TiRo',
    });
    expect(stringValue(annot._dict, 'DA')).toBe('/TiRo 18 Tf 0 g');
  });

  it('uses default font Helv/12 when nothing specified', () => {
    const annot = new PDAnnotationFreeText({ rect: RECT });
    expect(stringValue(annot._dict, 'DA')).toBe('/Helv 12 Tf 0 g');
  });
});

// ---------------------------------------------------------------------------
// 8. PDAnnotationRubberStamp
// ---------------------------------------------------------------------------

describe('PDAnnotationRubberStamp', () => {
  it('subtype is /Stamp', () => {
    const annot = new PDAnnotationRubberStamp({ rect: RECT });
    expect(nameValue(annot._dict, 'Subtype')).toBe('Stamp');
  });

  it('sets /Name from StampName enum', () => {
    const annot = new PDAnnotationRubberStamp({
      rect: RECT,
      stampName: StampName.APPROVED,
    });
    expect(nameValue(annot._dict, 'Name')).toBe('Approved');
  });

  it('defaults to Draft stamp', () => {
    const annot = new PDAnnotationRubberStamp({ rect: RECT });
    expect(nameValue(annot._dict, 'Name')).toBe('Draft');
  });

  it('accepts custom stamp name string', () => {
    const annot = new PDAnnotationRubberStamp({
      rect: RECT,
      stampName: 'CustomStamp',
    });
    expect(nameValue(annot._dict, 'Name')).toBe('CustomStamp');
  });
});

// ---------------------------------------------------------------------------
// 9. PDAnnotationLine
// ---------------------------------------------------------------------------

describe('PDAnnotationLine', () => {
  it('subtype is /Line', () => {
    const annot = new PDAnnotationLine({
      rect: RECT,
      line: [50, 100, 300, 400],
    });
    expect(nameValue(annot._dict, 'Subtype')).toBe('Line');
  });

  it('sets /L array with 4 values', () => {
    const annot = new PDAnnotationLine({
      rect: RECT,
      line: [10, 20, 500, 600],
    });
    const l = arrayValue(annot._dict, 'L');
    expect(l.size()).toBe(4);
    expect(arrayNumbers(l)).toEqual([10, 20, 500, 600]);
  });

  it('sets /LE line ending styles', () => {
    const annot = new PDAnnotationLine({
      rect: RECT,
      line: [0, 0, 100, 100],
      lineEndingStyles: [LineEndingStyle.OPEN_ARROW, LineEndingStyle.CLOSED_ARROW],
    });
    const le = arrayValue(annot._dict, 'LE');
    expect(le.size()).toBe(2);
    expect((le.get(0) as COSName).getName()).toBe('OpenArrow');
    expect((le.get(1) as COSName).getName()).toBe('ClosedArrow');
  });

  it('sets /IC interior color', () => {
    const annot = new PDAnnotationLine({
      rect: RECT,
      line: [0, 0, 100, 100],
      interiorColor: rgb(0.5, 0.6, 0.7),
    });
    const ic = arrayValue(annot._dict, 'IC');
    expect(ic.size()).toBe(3);
    const vals = arrayNumbers(ic);
    expect(vals[0]).toBeCloseTo(0.5, 5);
    expect(vals[1]).toBeCloseTo(0.6, 5);
    expect(vals[2]).toBeCloseTo(0.7, 5);
  });
});

// ---------------------------------------------------------------------------
// 10. PDAnnotationSquare
// ---------------------------------------------------------------------------

describe('PDAnnotationSquare', () => {
  it('subtype is /Square', () => {
    const annot = new PDAnnotationSquare({ rect: RECT });
    expect(nameValue(annot._dict, 'Subtype')).toBe('Square');
  });

  it('sets /IC interior color', () => {
    const annot = new PDAnnotationSquare({
      rect: RECT,
      interiorColor: rgb(1, 0, 0),
    });
    const ic = arrayValue(annot._dict, 'IC');
    expect(ic.size()).toBe(3);
    const vals = arrayNumbers(ic);
    expect(vals[0]).toBeCloseTo(1.0, 5);
    expect(vals[1]).toBeCloseTo(0.0, 5);
    expect(vals[2]).toBeCloseTo(0.0, 5);
  });

  it('no /IC when interiorColor omitted', () => {
    const annot = new PDAnnotationSquare({ rect: RECT });
    expect(annot._dict.getItem('IC')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 11. PDAnnotationCircle
// ---------------------------------------------------------------------------

describe('PDAnnotationCircle', () => {
  it('subtype is /Circle', () => {
    const annot = new PDAnnotationCircle({ rect: RECT });
    expect(nameValue(annot._dict, 'Subtype')).toBe('Circle');
  });

  it('sets /IC interior color', () => {
    const annot = new PDAnnotationCircle({
      rect: RECT,
      interiorColor: cmyk(0.1, 0.2, 0.3, 0.05),
    });
    const ic = arrayValue(annot._dict, 'IC');
    expect(ic.size()).toBe(4);
    const vals = arrayNumbers(ic);
    expect(vals[0]).toBeCloseTo(0.1, 5);
    expect(vals[1]).toBeCloseTo(0.2, 5);
    expect(vals[2]).toBeCloseTo(0.3, 5);
    expect(vals[3]).toBeCloseTo(0.05, 5);
  });

  it('no /IC when interiorColor omitted', () => {
    const annot = new PDAnnotationCircle({ rect: RECT });
    expect(annot._dict.getItem('IC')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 12. PDAnnotationInk
// ---------------------------------------------------------------------------

describe('PDAnnotationInk', () => {
  it('subtype is /Ink', () => {
    const annot = new PDAnnotationInk({
      rect: RECT,
      inkList: [[100, 200, 150, 220, 200, 200]],
    });
    expect(nameValue(annot._dict, 'Subtype')).toBe('Ink');
  });

  it('sets /InkList as array of arrays', () => {
    const paths = [
      [10, 20, 30, 40, 50, 60],
      [100, 200, 150, 250],
    ];
    const annot = new PDAnnotationInk({ rect: RECT, inkList: paths });
    const inkList = arrayValue(annot._dict, 'InkList');
    expect(inkList.size()).toBe(2);

    const path0 = inkList.get(0) as COSArray;
    expect(path0.size()).toBe(6);
    expect(arrayNumbers(path0)).toEqual([10, 20, 30, 40, 50, 60]);

    const path1 = inkList.get(1) as COSArray;
    expect(path1.size()).toBe(4);
    expect(arrayNumbers(path1)).toEqual([100, 200, 150, 250]);
  });

  it('supports single ink path', () => {
    const annot = new PDAnnotationInk({
      rect: RECT,
      inkList: [[0, 0, 50, 50, 100, 0]],
    });
    const inkList = arrayValue(annot._dict, 'InkList');
    expect(inkList.size()).toBe(1);
    const path0 = inkList.get(0) as COSArray;
    expect(arrayNumbers(path0)).toEqual([0, 0, 50, 50, 100, 0]);
  });
});

// ---------------------------------------------------------------------------
// 13. PDAnnotationLink
// ---------------------------------------------------------------------------

describe('PDAnnotationLink', () => {
  it('subtype is /Link', () => {
    const annot = new PDAnnotationLink({ rect: RECT });
    expect(nameValue(annot._dict, 'Subtype')).toBe('Link');
  });

  it('sets /A URI action when uri provided', () => {
    const annot = new PDAnnotationLink({
      rect: RECT,
      uri: 'https://example.com',
    });
    const action = annot._dict.getItem('A');
    expect(action).toBeInstanceOf(COSDictionary);
    const actionDict = action as COSDictionary;
    expect(nameValue(actionDict, 'S')).toBe('URI');
    expect(stringValue(actionDict, 'URI')).toBe('https://example.com');
  });

  it('sets /Dest when destination provided', () => {
    const annot = new PDAnnotationLink({
      rect: RECT,
      destination: 'chapter1',
    });
    expect(stringValue(annot._dict, 'Dest')).toBe('chapter1');
  });

  it('has zero-width border by default', () => {
    const annot = new PDAnnotationLink({ rect: RECT });
    const bs = annot._dict.getItem('BS');
    expect(bs).toBeInstanceOf(COSDictionary);
    const bsDict = bs as COSDictionary;
    const w = bsDict.getItem('W');
    expect(w).toBeInstanceOf(COSInteger);
    expect((w as COSInteger).getValue()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 14. PDFPage.addAnnotation() integration
// ---------------------------------------------------------------------------

describe('PDFPage.addAnnotation()', () => {
  it('page gets /Annots after adding annotation', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const annot = new PDAnnotationHighlight({ rect: RECT, contents: 'Test' });
    page.addAnnotation(annot);

    const dicts = page.getAnnotationDicts();
    expect(dicts.length).toBe(1);
    expect(nameValue(dicts[0], 'Subtype')).toBe('Highlight');
  });

  it('multiple annotations grow /Annots', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();

    page.addAnnotation(new PDAnnotationHighlight({ rect: RECT }));
    page.addAnnotation(new PDAnnotationText({ rect: [50, 50, 80, 80], contents: 'Note' }));
    page.addAnnotation(new PDAnnotationSquare({ rect: [200, 200, 400, 400] }));

    const dicts = page.getAnnotationDicts();
    expect(dicts.length).toBe(3);
    expect(nameValue(dicts[0], 'Subtype')).toBe('Highlight');
    expect(nameValue(dicts[1], 'Subtype')).toBe('Text');
    expect(nameValue(dicts[2], 'Subtype')).toBe('Square');
  });

  it('annotation gets /P (page reference)', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const annot = new PDAnnotationText({ rect: RECT });
    page.addAnnotation(annot);

    // /P should be set (page reference)
    const p = annot._dict.getItem('P');
    expect(p).toBeDefined();
  });

  it('getAnnotationDicts() returns empty for page with no annotations', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const dicts = page.getAnnotationDicts();
    expect(dicts).toEqual([]);
  });

  it('round-trip: create -> save -> load -> verify annotations persist', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();

    page.addAnnotation(new PDAnnotationHighlight({
      rect: [72, 700, 300, 720],
      contents: 'Important',
      color: rgb(1, 1, 0),
    }));
    page.addAnnotation(new PDAnnotationText({
      rect: [50, 600, 74, 624],
      contents: 'A note',
      iconName: TextIconName.NOTE,
    }));

    const bytes = await doc.save();
    expect(bytes.length).toBeGreaterThan(100);

    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);
    const loadedPage = loaded.getPage(0);
    const dicts = loadedPage.getAnnotationDicts();
    expect(dicts.length).toBe(2);

    // Verify first annotation persisted
    expect(nameValue(dicts[0], 'Subtype')).toBe('Highlight');
    expect(stringValue(dicts[0], 'Contents')).toBe('Important');

    // Verify second annotation persisted
    expect(nameValue(dicts[1], 'Subtype')).toBe('Text');
    expect(stringValue(dicts[1], 'Contents')).toBe('A note');
    expect(nameValue(dicts[1], 'Name')).toBe('Note');
  });
});

// ---------------------------------------------------------------------------
// 15. qpdf validation
// ---------------------------------------------------------------------------

describe('qpdf validation', () => {
  const skipQpdf = !hasCommand('qpdf');

  it.skipIf(skipQpdf)('PDF with highlight annotation passes qpdf --check', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    page.addAnnotation(new PDAnnotationHighlight({
      rect: [72, 700, 400, 720],
      contents: 'Highlighted text',
      color: rgb(1, 1, 0),
    }));

    const bytes = await doc.save();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'annot-test-'));
    const tmpFile = path.join(tmpDir, 'highlight.pdf');
    try {
      fs.writeFileSync(tmpFile, bytes);
      execSync(`qpdf --check "${tmpFile}"`, { encoding: 'utf-8' });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it.skipIf(skipQpdf)('PDF with all annotation types passes qpdf --check', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();

    // Add one of every annotation type
    page.addAnnotation(new PDAnnotationHighlight({
      rect: [72, 750, 300, 770], contents: 'highlight',
    }));
    page.addAnnotation(new PDAnnotationUnderline({
      rect: [72, 720, 300, 740], contents: 'underline',
    }));
    page.addAnnotation(new PDAnnotationStrikeout({
      rect: [72, 690, 300, 710], contents: 'strikeout',
    }));
    page.addAnnotation(new PDAnnotationSquiggly({
      rect: [72, 660, 300, 680], contents: 'squiggly',
    }));
    page.addAnnotation(new PDAnnotationText({
      rect: [50, 620, 74, 644], contents: 'sticky note',
    }));
    page.addAnnotation(new PDAnnotationFreeText({
      rect: [72, 580, 400, 620], contents: 'free text',
      fontSize: 14,
    }));
    page.addAnnotation(new PDAnnotationRubberStamp({
      rect: [72, 530, 200, 570], stampName: StampName.APPROVED,
    }));
    page.addAnnotation(new PDAnnotationLine({
      rect: [72, 480, 400, 520],
      line: [72, 500, 400, 500],
      lineEndingStyles: [LineEndingStyle.NONE, LineEndingStyle.OPEN_ARROW],
    }));
    page.addAnnotation(new PDAnnotationSquare({
      rect: [72, 430, 200, 470],
      interiorColor: rgb(0.9, 0.9, 0.9),
      color: rgb(0, 0, 0),
    }));
    page.addAnnotation(new PDAnnotationCircle({
      rect: [220, 430, 350, 470],
      interiorColor: rgb(0.8, 0.8, 1.0),
    }));
    page.addAnnotation(new PDAnnotationInk({
      rect: [72, 380, 300, 420],
      inkList: [[72, 400, 150, 380, 200, 410, 300, 390]],
    }));
    page.addAnnotation(new PDAnnotationLink({
      rect: [72, 350, 300, 370],
      uri: 'https://example.com',
    }));

    const bytes = await doc.save();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'annot-all-'));
    const tmpFile = path.join(tmpDir, 'all-annotations.pdf');
    try {
      fs.writeFileSync(tmpFile, bytes);
      execSync(`qpdf --check "${tmpFile}"`, { encoding: 'utf-8' });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it.skipIf(skipQpdf)('PDF with annotations round-trips (save -> load -> save -> qpdf)', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    page.addAnnotation(new PDAnnotationHighlight({
      rect: [72, 700, 400, 720],
      contents: 'RT test',
    }));
    page.addAnnotation(new PDAnnotationSquare({
      rect: [72, 650, 200, 700],
      color: rgb(0, 0, 1),
      interiorColor: rgb(0.9, 0.9, 1),
    }));

    // First save
    const bytes1 = await doc.save();

    // Load and re-save
    const loaded = await PDFDocument.load(bytes1);
    const bytes2 = await loaded.save();

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'annot-rt-'));
    const tmpFile = path.join(tmpDir, 'round-trip.pdf');
    try {
      fs.writeFileSync(tmpFile, bytes2);
      execSync(`qpdf --check "${tmpFile}"`, { encoding: 'utf-8' });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
