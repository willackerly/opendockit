/**
 * Redaction system tests — PDAnnotationRedact, content stream tokenizer,
 * content stream redactor, and full redaction pipeline.
 */

import { describe, it, expect } from 'vitest';
import { PDFDocument } from '../PDFDocument.js';
import { rgb } from '../colors.js';
import { PDAnnotationRedact } from '../annotations/PDAnnotationRedact.js';
import type { RedactAnnotationOptions } from '../annotations/PDAnnotationRedact.js';
import {
  tokenizeContentStream,
  parseOperations,
  applyRedactions,
} from '../redaction/index.js';
import type { RedactionRect, CSToken } from '../redaction/index.js';
import {
  COSName,
  COSString,
  COSFloat,
  COSInteger,
  COSArray,
  COSDictionary,
} from '../../pdfbox/cos/COSTypes.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Encode a string as a Uint8Array. */
function encode(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/** Decode a Uint8Array to a string. */
function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
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

const RECT: [number, number, number, number] = [100, 200, 300, 250];

// ---------------------------------------------------------------------------
// 1. PDAnnotationRedact
// ---------------------------------------------------------------------------

describe('PDAnnotationRedact', () => {
  it('creates dict with /Subtype /Redact', () => {
    const annot = new PDAnnotationRedact({ rect: RECT });
    expect(nameValue(annot._dict, 'Type')).toBe('Annot');
    expect(nameValue(annot._dict, 'Subtype')).toBe('Redact');
  });

  it('sets /Rect as 4-element array', () => {
    const annot = new PDAnnotationRedact({ rect: [10, 20, 300, 400] });
    const rect = arrayValue(annot._dict, 'Rect');
    expect(rect.size()).toBe(4);
    expect(arrayNumbers(rect)).toEqual([10, 20, 300, 400]);
  });

  it('default color is red (annotation border indicates pending redaction)', () => {
    const annot = new PDAnnotationRedact({ rect: RECT });
    const c = arrayValue(annot._dict, 'C');
    expect(c.size()).toBe(3);
    const vals = arrayNumbers(c);
    expect(vals[0]).toBeCloseTo(1.0, 5);
    expect(vals[1]).toBeCloseTo(0.0, 5);
    expect(vals[2]).toBeCloseTo(0.0, 5);
  });

  it('sets /IC (interior color) — defaults to black', () => {
    const annot = new PDAnnotationRedact({ rect: RECT });
    const ic = arrayValue(annot._dict, 'IC');
    expect(ic.size()).toBe(3);
    const vals = arrayNumbers(ic);
    expect(vals[0]).toBeCloseTo(0.0, 5);
    expect(vals[1]).toBeCloseTo(0.0, 5);
    expect(vals[2]).toBeCloseTo(0.0, 5);
  });

  it('sets custom /IC interior color', () => {
    const annot = new PDAnnotationRedact({
      rect: RECT,
      interiorColor: rgb(1, 1, 1),
    });
    const ic = arrayValue(annot._dict, 'IC');
    const vals = arrayNumbers(ic);
    expect(vals[0]).toBeCloseTo(1.0, 5);
    expect(vals[1]).toBeCloseTo(1.0, 5);
    expect(vals[2]).toBeCloseTo(1.0, 5);
  });

  it('sets /QuadPoints from explicit array', () => {
    const qp = [100, 250, 300, 250, 100, 200, 300, 200];
    const annot = new PDAnnotationRedact({ rect: RECT, quadPoints: qp });
    const arr = arrayValue(annot._dict, 'QuadPoints');
    expect(arr.size()).toBe(8);
    expect(arrayNumbers(arr)).toEqual(qp);
  });

  it('auto-generates /QuadPoints from rect when not provided', () => {
    const annot = new PDAnnotationRedact({ rect: [50, 100, 200, 150] });
    const arr = arrayValue(annot._dict, 'QuadPoints');
    expect(arr.size()).toBe(8);
    const vals = arrayNumbers(arr);
    // upper-left, upper-right, lower-left, lower-right
    expect(vals).toEqual([50, 150, 200, 150, 50, 100, 200, 100]);
  });

  it('sets /OverlayText when provided', () => {
    const annot = new PDAnnotationRedact({
      rect: RECT,
      overlayText: '[REDACTED]',
    });
    expect(stringValue(annot._dict, 'OverlayText')).toBe('[REDACTED]');
  });

  it('does not set /OverlayText when not provided', () => {
    const annot = new PDAnnotationRedact({ rect: RECT });
    expect(annot._dict.getItem('OverlayText')).toBeUndefined();
  });

  it('sets /DA (default appearance) when provided', () => {
    const annot = new PDAnnotationRedact({
      rect: RECT,
      defaultAppearance: '/Helv 12 Tf 1 g',
    });
    expect(stringValue(annot._dict, 'DA')).toBe('/Helv 12 Tf 1 g');
  });

  it('sets /Q (justification) when provided', () => {
    const annot = new PDAnnotationRedact({
      rect: RECT,
      justification: 1,
    });
    expect(intValue(annot._dict, 'Q')).toBe(1);
  });

  it('can be added to a page', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const annot = new PDAnnotationRedact({
      rect: RECT,
      contents: 'Redact this area',
    });
    page.addAnnotation(annot);

    const dicts = page.getAnnotationDicts();
    expect(dicts.length).toBe(1);
    expect(nameValue(dicts[0], 'Subtype')).toBe('Redact');
  });

  it('round-trips through save/load', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    page.addAnnotation(new PDAnnotationRedact({
      rect: [72, 700, 300, 720],
      contents: 'Sensitive info',
      overlayText: '[REDACTED]',
      interiorColor: rgb(0, 0, 0),
    }));

    const bytes = await doc.save();
    const loaded = await PDFDocument.load(bytes);
    const loadedPage = loaded.getPage(0);
    const dicts = loadedPage.getAnnotationDicts();
    expect(dicts.length).toBe(1);
    expect(nameValue(dicts[0], 'Subtype')).toBe('Redact');
    expect(stringValue(dicts[0], 'Contents')).toBe('Sensitive info');
    expect(stringValue(dicts[0], 'OverlayText')).toBe('[REDACTED]');
  });
});

// ---------------------------------------------------------------------------
// 2. Content Stream Tokenizer
// ---------------------------------------------------------------------------

describe('Content Stream Tokenizer', () => {
  it('tokenizes numbers', () => {
    const tokens = tokenizeContentStream(encode('42 3.14 -7 +2.5'));
    expect(tokens.length).toBe(4);
    expect(tokens[0]).toEqual({ type: 'number', value: '42', numValue: 42 });
    expect(tokens[1]).toEqual({ type: 'number', value: '3.14', numValue: 3.14 });
    expect(tokens[2]).toEqual({ type: 'number', value: '-7', numValue: -7 });
    expect(tokens[3]).toEqual({ type: 'number', value: '+2.5', numValue: 2.5 });
  });

  it('tokenizes operators', () => {
    const tokens = tokenizeContentStream(encode('BT ET Tj TJ Tm'));
    expect(tokens.length).toBe(5);
    expect(tokens.map(t => t.value)).toEqual(['BT', 'ET', 'Tj', 'TJ', 'Tm']);
    expect(tokens.every(t => t.type === 'operator')).toBe(true);
  });

  it('tokenizes parenthesized strings', () => {
    const tokens = tokenizeContentStream(encode('(Hello World)'));
    expect(tokens.length).toBe(1);
    expect(tokens[0].type).toBe('string');
    expect(tokens[0].value).toBe('Hello World');
  });

  it('handles escaped characters in strings', () => {
    const tokens = tokenizeContentStream(encode('(Hello\\nWorld\\(test\\))'));
    expect(tokens.length).toBe(1);
    expect(tokens[0].type).toBe('string');
    expect(tokens[0].value).toBe('Hello\nWorld(test)');
  });

  it('handles nested parentheses in strings', () => {
    const tokens = tokenizeContentStream(encode('(Hello (nested) World)'));
    expect(tokens.length).toBe(1);
    expect(tokens[0].value).toBe('Hello (nested) World');
  });

  it('tokenizes hex strings', () => {
    const tokens = tokenizeContentStream(encode('<48656C6C6F>'));
    expect(tokens.length).toBe(1);
    expect(tokens[0].type).toBe('hexstring');
    expect(tokens[0].value).toBe('48656C6C6F');
  });

  it('tokenizes names', () => {
    const tokens = tokenizeContentStream(encode('/FontName /F1'));
    expect(tokens.length).toBe(2);
    expect(tokens[0].type).toBe('name');
    expect(tokens[0].value).toBe('FontName');
    expect(tokens[1].type).toBe('name');
    expect(tokens[1].value).toBe('F1');
  });

  it('tokenizes arrays', () => {
    const tokens = tokenizeContentStream(encode('[1 2 3]'));
    expect(tokens.length).toBe(5);
    expect(tokens[0].type).toBe('array_start');
    expect(tokens[1]).toEqual({ type: 'number', value: '1', numValue: 1 });
    expect(tokens[2]).toEqual({ type: 'number', value: '2', numValue: 2 });
    expect(tokens[3]).toEqual({ type: 'number', value: '3', numValue: 3 });
    expect(tokens[4].type).toBe('array_end');
  });

  it('skips comments', () => {
    const tokens = tokenizeContentStream(encode('42 % this is a comment\n3.14'));
    expect(tokens.length).toBe(2);
    expect(tokens[0].numValue).toBe(42);
    expect(tokens[1].numValue).toBe(3.14);
  });

  it('handles a complete text operation', () => {
    const stream = 'BT /F1 12 Tf 72 700 Td <48656C6C6F> Tj ET';
    const tokens = tokenizeContentStream(encode(stream));
    const ops = tokens.filter(t => t.type === 'operator');
    expect(ops.map(o => o.value)).toEqual(['BT', 'Tf', 'Td', 'Tj', 'ET']);
  });

  it('handles rectangle + fill', () => {
    const stream = '100 200 300 50 re f';
    const tokens = tokenizeContentStream(encode(stream));
    expect(tokens.length).toBe(6);
    expect(tokens[4].type).toBe('operator');
    expect(tokens[4].value).toBe('re');
    expect(tokens[5].type).toBe('operator');
    expect(tokens[5].value).toBe('f');
  });

  it('handles multiline content stream', () => {
    const stream = 'q\n1 0 0 1 72 700 cm\n/Image1 Do\nQ';
    const tokens = tokenizeContentStream(encode(stream));
    const ops = tokens.filter(t => t.type === 'operator');
    expect(ops.map(o => o.value)).toEqual(['q', 'cm', 'Do', 'Q']);
  });

  it('tokenizes boolean and null values', () => {
    const tokens = tokenizeContentStream(encode('true false null'));
    expect(tokens.length).toBe(3);
    expect(tokens[0]).toEqual({ type: 'boolean', value: 'true' });
    expect(tokens[1]).toEqual({ type: 'boolean', value: 'false' });
    expect(tokens[2]).toEqual({ type: 'null', value: 'null' });
  });

  it('handles empty content stream', () => {
    const tokens = tokenizeContentStream(encode(''));
    expect(tokens.length).toBe(0);
  });

  it('handles whitespace-only content stream', () => {
    const tokens = tokenizeContentStream(encode('   \n\t\r  '));
    expect(tokens.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Content Stream Parser (tokens -> operations)
// ---------------------------------------------------------------------------

describe('Content Stream Parser', () => {
  it('parses simple operations', () => {
    const tokens = tokenizeContentStream(encode('100 200 m 300 400 l S'));
    const ops = parseOperations(tokens);
    expect(ops.length).toBe(3);
    expect(ops[0].operator).toBe('m');
    expect(ops[0].operands.length).toBe(2);
    expect(ops[1].operator).toBe('l');
    expect(ops[1].operands.length).toBe(2);
    expect(ops[2].operator).toBe('S');
    expect(ops[2].operands.length).toBe(0);
  });

  it('parses text operations', () => {
    const tokens = tokenizeContentStream(encode('BT /F1 12 Tf 72 700 Td (Hello) Tj ET'));
    const ops = parseOperations(tokens);
    expect(ops.length).toBe(5);
    expect(ops[0].operator).toBe('BT');
    expect(ops[1].operator).toBe('Tf');
    expect(ops[1].operands.length).toBe(2);
    expect(ops[2].operator).toBe('Td');
    expect(ops[2].operands.length).toBe(2);
    expect(ops[3].operator).toBe('Tj');
    expect(ops[3].operands.length).toBe(1);
    expect(ops[4].operator).toBe('ET');
  });

  it('parses TJ with array operand', () => {
    const tokens = tokenizeContentStream(encode('[(Hello) -50 (World)] TJ'));
    const ops = parseOperations(tokens);
    expect(ops.length).toBe(1);
    expect(ops[0].operator).toBe('TJ');
    // Array tokens are collected as operands
    expect(ops[0].operands.length).toBeGreaterThan(0);
  });

  it('parses rectangle operation', () => {
    const tokens = tokenizeContentStream(encode('50 100 200 300 re f'));
    const ops = parseOperations(tokens);
    expect(ops.length).toBe(2);
    expect(ops[0].operator).toBe('re');
    expect(ops[0].operands.length).toBe(4);
    expect(ops[1].operator).toBe('f');
  });

  it('parses graphics state push/pop', () => {
    const tokens = tokenizeContentStream(encode('q 1 0 0 1 50 100 cm Q'));
    const ops = parseOperations(tokens);
    expect(ops.length).toBe(3);
    expect(ops[0].operator).toBe('q');
    expect(ops[1].operator).toBe('cm');
    expect(ops[1].operands.length).toBe(6);
    expect(ops[2].operator).toBe('Q');
  });
});

// ---------------------------------------------------------------------------
// 4. Content Stream Redactor — Text Removal
// ---------------------------------------------------------------------------

describe('Content Stream Redactor — Text', () => {
  it('removes text within redaction rect', () => {
    // Text at position (100, 500)
    const stream = 'BT /F1 12 Tf 1 0 0 1 100 500 Tm (Secret Text) Tj ET';
    const redacted = applyRedactions(
      encode(stream),
      [{ x: 50, y: 490, width: 200, height: 30 }],
    );
    const result = decode(redacted);
    // The Tj operator should be removed
    expect(result).not.toContain('Tj');
    // But BT/ET and Tf/Tm should still be present
    expect(result).toContain('BT');
    expect(result).toContain('ET');
    expect(result).toContain('Tf');
    expect(result).toContain('Tm');
  });

  it('preserves text outside redaction rect', () => {
    const stream = 'BT /F1 12 Tf 1 0 0 1 100 500 Tm (Visible Text) Tj ET';
    const redacted = applyRedactions(
      encode(stream),
      [{ x: 400, y: 400, width: 100, height: 50 }],
    );
    const result = decode(redacted);
    expect(result).toContain('Tj');
    expect(result).toContain('Visible Text');
  });

  it('removes Tj but not TJ when only Tj is in rect', () => {
    const stream = [
      'BT',
      '/F1 12 Tf',
      '1 0 0 1 100 500 Tm',
      '(Secret) Tj',
      '1 0 0 1 100 300 Tm',
      '(Visible) Tj',
      'ET',
    ].join('\n');
    const redacted = applyRedactions(
      encode(stream),
      [{ x: 50, y: 490, width: 200, height: 30 }],
    );
    const result = decode(redacted);
    // First Tj (at y=500) should be removed, second (at y=300) should remain
    const tjMatches = result.match(/Tj/g);
    expect(tjMatches).not.toBeNull();
    expect(tjMatches!.length).toBe(1);
    expect(result).toContain('Visible');
    expect(result).not.toContain('Secret');
  });

  it('removes TJ array operator within rect', () => {
    const stream = 'BT /F1 12 Tf 1 0 0 1 100 500 Tm [(Hello) -50 (World)] TJ ET';
    const redacted = applyRedactions(
      encode(stream),
      [{ x: 50, y: 490, width: 200, height: 30 }],
    );
    const result = decode(redacted);
    expect(result).not.toContain('TJ');
  });

  it('handles Td text positioning', () => {
    const stream = [
      'BT',
      '/F1 12 Tf',
      '100 700 Td',
      '(Line 1) Tj',
      '0 -50 Td',
      '(Line 2) Tj',
      'ET',
    ].join('\n');

    // Redact only the area around y=650 (Line 2 after Td 0 -50)
    // Line 1 is at y=700, Line 2 is at y=650
    const redacted = applyRedactions(
      encode(stream),
      [{ x: 50, y: 640, width: 200, height: 20 }],
    );
    const result = decode(redacted);
    // Line 1 (at y=700) should be preserved
    expect(result).toContain('Line 1');
    // Line 2 (at y=650) should be removed
    expect(result).not.toContain('Line 2');
  });

  it('handles T* line advance', () => {
    const stream = [
      'BT',
      '/F1 12 Tf',
      '50 TL',
      '1 0 0 1 100 700 Tm',
      '(Line 1) Tj',
      'T*',
      '(Line 2) Tj',
      'ET',
    ].join('\n');

    // Line 1 is at y=700, Line 2 at y=650 (700 - 50)
    const redacted = applyRedactions(
      encode(stream),
      [{ x: 50, y: 640, width: 200, height: 20 }],
    );
    const result = decode(redacted);
    expect(result).toContain('Line 1');
    expect(result).not.toContain('Line 2');
  });
});

// ---------------------------------------------------------------------------
// 5. Content Stream Redactor — Graphics Removal
// ---------------------------------------------------------------------------

describe('Content Stream Redactor — Graphics', () => {
  it('removes rectangle within redaction rect', () => {
    const stream = '100 200 150 50 re f';
    const redacted = applyRedactions(
      encode(stream),
      [{ x: 80, y: 180, width: 200, height: 100 }],
    );
    const result = decode(redacted);
    // The re + f should be removed
    // But there should be redaction fill rect at the end
    const lines = result.split('\n');
    const reCount = lines.filter(l => l.trim().endsWith('re')).length;
    // Only the redaction fill rect should contain 're', not the original
    expect(reCount).toBe(1); // just the redaction fill
  });

  it('preserves rectangle outside redaction rect', () => {
    const stream = '100 200 150 50 re f';
    const redacted = applyRedactions(
      encode(stream),
      [{ x: 500, y: 500, width: 50, height: 50 }],
    );
    const result = decode(redacted);
    // Original re should be preserved
    expect(result).toContain('100 200 150 50 re');
  });

  it('removes line path within redaction rect', () => {
    const stream = '100 200 m 250 200 l S';
    const redacted = applyRedactions(
      encode(stream),
      [{ x: 80, y: 190, width: 200, height: 30 }],
    );
    const result = decode(redacted);
    // The path ops and stroke should be removed
    expect(result).not.toContain('100 200 m');
  });
});

// ---------------------------------------------------------------------------
// 6. Content Stream Redactor — Fill Rectangles
// ---------------------------------------------------------------------------

describe('Content Stream Redactor — Fill Rectangles', () => {
  it('appends fill rectangle for each redaction rect', () => {
    const stream = 'q Q'; // empty content
    const redacted = applyRedactions(
      encode(stream),
      [
        { x: 100, y: 200, width: 150, height: 50 },
        { x: 300, y: 400, width: 200, height: 100 },
      ],
    );
    const result = decode(redacted);
    // Should contain two 're' + 'f' sequences for the redaction fills
    const lines = result.split('\n');
    const fillRects = lines.filter(l => l.trim().endsWith('re'));
    expect(fillRects.length).toBe(2);
    expect(result).toContain('100 200 150 50 re');
    expect(result).toContain('300 400 200 100 re');
  });

  it('uses specified interior color for fill', () => {
    const stream = 'q Q';
    const redacted = applyRedactions(
      encode(stream),
      [{ x: 100, y: 200, width: 150, height: 50 }],
      { r: 1, g: 1, b: 1 }, // white
    );
    const result = decode(redacted);
    expect(result).toContain('1 1 1 rg');
  });

  it('defaults to black fill when no color specified', () => {
    const stream = 'q Q';
    const redacted = applyRedactions(
      encode(stream),
      [{ x: 100, y: 200, width: 150, height: 50 }],
    );
    const result = decode(redacted);
    expect(result).toContain('0 0 0 rg');
  });
});

// ---------------------------------------------------------------------------
// 7. Content Stream Redactor — No-op Cases
// ---------------------------------------------------------------------------

describe('Content Stream Redactor — Edge Cases', () => {
  it('returns original stream when no redaction rects', () => {
    const stream = 'BT /F1 12 Tf 72 700 Td (Hello) Tj ET';
    const input = encode(stream);
    const redacted = applyRedactions(input, []);
    // Should return the exact same bytes
    expect(redacted).toBe(input);
  });

  it('handles empty content stream', () => {
    const redacted = applyRedactions(
      encode(''),
      [{ x: 100, y: 200, width: 150, height: 50 }],
    );
    const result = decode(redacted);
    // Should just have the fill rect
    expect(result).toContain('rg');
    expect(result).toContain('re');
    expect(result).toContain('f');
  });

  it('redaction of area with no content just adds fill rect', () => {
    const stream = 'q 1 0 0 rg 500 500 50 50 re f Q';
    const redacted = applyRedactions(
      encode(stream),
      [{ x: 100, y: 200, width: 150, height: 50 }], // no content here
    );
    const result = decode(redacted);
    // Original content should be preserved (it's not in the redaction rect)
    expect(result).toContain('500 500 50 50 re');
    // Redaction fill rect should be appended
    expect(result).toContain('100 200 150 50 re');
  });

  it('handles multiple text blocks', () => {
    const stream = [
      'BT /F1 12 Tf 1 0 0 1 100 500 Tm (Block 1) Tj ET',
      'BT /F1 12 Tf 1 0 0 1 100 300 Tm (Block 2) Tj ET',
    ].join('\n');
    const redacted = applyRedactions(
      encode(stream),
      [{ x: 50, y: 490, width: 200, height: 30 }],
    );
    const result = decode(redacted);
    // Block 1 should be removed
    expect(result).not.toContain('Block 1');
    // Block 2 should remain
    expect(result).toContain('Block 2');
  });

  it('handles graphics state save/restore around redacted content', () => {
    const stream = [
      'q',
      '1 0 0 1 100 500 cm',
      '0 0 50 50 re f',
      'Q',
      'q',
      '1 0 0 1 400 400 cm',
      '0 0 50 50 re f',
      'Q',
    ].join('\n');
    const redacted = applyRedactions(
      encode(stream),
      [{ x: 90, y: 490, width: 70, height: 70 }],
    );
    const result = decode(redacted);
    // First block (at 100,500 via cm) should be removed
    // But q/Q structure should remain (graphics state ops are preserved)
    expect(result).toContain('q');
    expect(result).toContain('Q');
    // Second block (at 400,400 via cm) should remain
    expect(result).toContain('400 400');
  });
});

// ---------------------------------------------------------------------------
// 8. Multiple Redaction Regions
// ---------------------------------------------------------------------------

describe('Multiple Redaction Regions', () => {
  it('redacts text from multiple regions', () => {
    const stream = [
      'BT',
      '/F1 12 Tf',
      '1 0 0 1 100 700 Tm (Top Secret) Tj',
      '1 0 0 1 100 500 Tm (Also Secret) Tj',
      '1 0 0 1 100 300 Tm (Visible) Tj',
      'ET',
    ].join('\n');
    const redacted = applyRedactions(
      encode(stream),
      [
        { x: 50, y: 690, width: 200, height: 30 },
        { x: 50, y: 490, width: 200, height: 30 },
      ],
    );
    const result = decode(redacted);
    expect(result).not.toContain('Top Secret');
    expect(result).not.toContain('Also Secret');
    expect(result).toContain('Visible');
  });

  it('produces fill rects for all redaction regions', () => {
    const stream = 'q Q';
    const rects: RedactionRect[] = [
      { x: 100, y: 100, width: 50, height: 20 },
      { x: 200, y: 200, width: 60, height: 30 },
      { x: 300, y: 300, width: 70, height: 40 },
    ];
    const redacted = applyRedactions(encode(stream), rects);
    const result = decode(redacted);
    const reLines = result.split('\n').filter(l => l.trim().endsWith('re'));
    expect(reLines.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 9. XObject (Image) Redaction
// ---------------------------------------------------------------------------

describe('Content Stream Redactor — XObjects', () => {
  it('removes Do operator when image overlaps redaction rect', () => {
    // Image placed at (100, 200), scaled to 300x200
    const stream = 'q 300 0 0 200 100 200 cm /Image1 Do Q';
    const redacted = applyRedactions(
      encode(stream),
      [{ x: 150, y: 250, width: 100, height: 100 }],
    );
    const result = decode(redacted);
    expect(result).not.toContain('Do');
  });

  it('preserves Do operator when image is outside redaction rect', () => {
    const stream = 'q 300 0 0 200 100 200 cm /Image1 Do Q';
    const redacted = applyRedactions(
      encode(stream),
      [{ x: 500, y: 500, width: 50, height: 50 }],
    );
    const result = decode(redacted);
    expect(result).toContain('Do');
  });
});

// ---------------------------------------------------------------------------
// 10. Full Pipeline Integration
// ---------------------------------------------------------------------------

describe('Full Redaction Pipeline', () => {
  it('create doc with text, add redact annotation, verify annotation dict', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const font = await doc.embedStandardFont('Helvetica');
    page.drawText('This is confidential information', {
      x: 72,
      y: 700,
      font,
      size: 12,
    });

    // Add redaction annotation
    const redactAnnot = new PDAnnotationRedact({
      rect: [72, 695, 350, 715],
      interiorColor: rgb(0, 0, 0),
      overlayText: '[REDACTED]',
    });
    page.addAnnotation(redactAnnot);

    const bytes = await doc.save();
    expect(bytes.length).toBeGreaterThan(100);

    // Verify the annotation persists
    const loaded = await PDFDocument.load(bytes);
    const loadedPage = loaded.getPage(0);
    const dicts = loadedPage.getAnnotationDicts();
    expect(dicts.length).toBe(1);
    expect(nameValue(dicts[0], 'Subtype')).toBe('Redact');
  });

  it('applyRedactions removes text and adds fill rect in one step', () => {
    const stream = [
      'q',
      'BT',
      '/F1 12 Tf',
      '1 0 0 1 72 700 Tm',
      '(Confidential) Tj',
      'ET',
      'Q',
    ].join('\n');

    const result = applyRedactions(
      encode(stream),
      [{ x: 60, y: 690, width: 200, height: 25 }],
      { r: 0, g: 0, b: 0 },
    );
    const text = decode(result);

    // Text should be removed
    expect(text).not.toContain('Confidential');
    expect(text).not.toMatch(/\(.*\)\s*Tj/);

    // Fill rect should be added
    expect(text).toContain('0 0 0 rg');
    expect(text).toContain('60 690 200 25 re');
    expect(text).toContain('f');
  });
});
