/**
 * Diagnostic test — trace ToUnicode CMap resolution for the IC CISO PDF.
 *
 * This test loads the IC CISO PDF, walks fonts on page 5 (a page with garbled text),
 * and traces the exact failure point in the ToUnicode resolution chain.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from '../../document/PDFDocument.js';
import {
  COSName,
  COSDictionary,
  COSStream,
  COSObjectReference,
} from '../../pdfbox/cos/COSTypes.js';
import type { COSBase } from '../../pdfbox/cos/COSBase.js';
import { buildFontDecoder } from '../../document/extraction/FontDecoder.js';
import { getDecompressedStreamData } from '../../document/extraction/StreamDecoder.js';
import { parseToUnicodeCMap } from '../../document/extraction/CMapParser.js';

// Path to the IC CISO PDF
const PDF_PATH = path.resolve(__dirname, '../../../test-pdfs/working/ic-ciso-visit.pdf');
const pdfExists = fs.existsSync(PDF_PATH);

function resolveItem(
  dict: COSDictionary,
  key: string,
  resolve: (ref: COSObjectReference) => COSBase | undefined,
): COSBase | undefined {
  const entry = dict.getItem(key);
  if (entry instanceof COSObjectReference) return resolve(entry);
  return entry;
}

describe('ToUnicode CMap diagnostic (IC CISO PDF)', () => {
  it.skipIf(!pdfExists)('should trace ToUnicode resolution for all fonts on first pages', async () => {
    const bytes = fs.readFileSync(PDF_PATH);
    const doc = await PDFDocument.load(new Uint8Array(bytes));
    const ctx = (doc as any)._nativeCtx;
    expect(ctx).toBeDefined();

    const resolve = (ref: COSObjectReference) => ctx.resolveRef(ref);
    const pageList = ctx.getPageList();
    console.log(`IC CISO PDF: ${pageList.length} pages`);

    // Check first 6 pages
    for (let pageIndex = 0; pageIndex < Math.min(6, pageList.length); pageIndex++) {
      const page = pageList[pageIndex];
      const pageDict = page.pageDict;

      let resources: COSBase | undefined = pageDict.getItem('Resources');
      if (resources instanceof COSObjectReference) resources = resolve(resources);
      if (!(resources instanceof COSDictionary)) continue;

      let fontDict: COSBase | undefined = (resources as COSDictionary).getItem('Font');
      if (fontDict instanceof COSObjectReference) fontDict = resolve(fontDict);
      if (!(fontDict instanceof COSDictionary)) continue;

      const fontNames = (fontDict as COSDictionary).entrySet().map(([k]) => k.getName());
      console.log(`\nPage ${pageIndex + 1} fonts: ${fontNames.join(', ')}`);

      for (const fontName of fontNames) {
        let font: COSBase | undefined = (fontDict as COSDictionary).getItem(fontName);
        if (font instanceof COSObjectReference) font = resolve(font);
        if (!(font instanceof COSDictionary)) continue;

        // Check ToUnicode entry
        const rawToUnicode = (font as COSDictionary).getItem('ToUnicode');
        const hasToUnicode = rawToUnicode !== undefined;
        const toUnicodeType = rawToUnicode?.constructor.name ?? 'undefined';

        let resolved = rawToUnicode;
        if (resolved instanceof COSObjectReference) resolved = resolve(resolved);
        const resolvedType = resolved?.constructor.name ?? 'undefined';

        let mapEntries = 0;
        let note = '';

        if (resolved instanceof COSStream) {
          try {
            const data = getDecompressedStreamData(resolved);
            const map = parseToUnicodeCMap(data);
            if (map) {
              mapEntries = map.size;
              const entries = Array.from(map.entries()).slice(0, 3);
              note = entries.map(([k, v]) => `${k}→"${v}"`).join(' ');
            }
          } catch (err) {
            note = `DECODE_ERROR: ${String(err)}`;
          }
        } else if (resolved instanceof COSDictionary) {
          note = 'BUG: Resolved to COSDictionary (stream data lost)';
          const hasLength = (resolved as COSDictionary).getItem('Length') !== undefined;
          const hasFilter = (resolved as COSDictionary).getItem('Filter') !== undefined;
          if (hasLength || hasFilter) {
            note += ` [/Length=${hasLength}, /Filter=${hasFilter}]`;
          }
        } else if (!hasToUnicode) {
          note = 'no ToUnicode';
        } else {
          note = `unexpected type: ${resolvedType}`;
        }

        console.log(
          `  ${fontName}: ToUnicode=${hasToUnicode} (${toUnicodeType}) → ${resolvedType}, entries=${mapEntries} ${note}`
        );
      }
    }
  });

  it.skipIf(!pdfExists)('should build font decoders and test text decoding', async () => {
    const bytes = fs.readFileSync(PDF_PATH);
    const doc = await PDFDocument.load(new Uint8Array(bytes));
    const ctx = (doc as any)._nativeCtx;
    const resolve = (ref: COSObjectReference) => ctx.resolveRef(ref);
    const pageList = ctx.getPageList();

    // Check page 5 (index 4)
    const pageIndex = Math.min(4, pageList.length - 1);
    const page = pageList[pageIndex];
    const pageDict = page.pageDict;

    let resources: COSBase | undefined = pageDict.getItem('Resources');
    if (resources instanceof COSObjectReference) resources = resolve(resources);
    if (!(resources instanceof COSDictionary)) return;

    let fontDict: COSBase | undefined = (resources as COSDictionary).getItem('Font');
    if (fontDict instanceof COSObjectReference) fontDict = resolve(fontDict);
    if (!(fontDict instanceof COSDictionary)) return;

    const decoderResults: Array<{ name: string; ok: boolean; error?: string }> = [];

    for (const fontName of (fontDict as COSDictionary).entrySet().map(([k]) => k.getName())) {
      let font: COSBase | undefined = (fontDict as COSDictionary).getItem(fontName);
      if (font instanceof COSObjectReference) font = resolve(font);
      if (!(font instanceof COSDictionary)) continue;

      try {
        const decoder = buildFontDecoder(font as COSDictionary, resolve);
        const testBytes = new Uint8Array([0x00, 0x48, 0x00, 0x65, 0x00, 0x6C]);
        const decoded = decoder.decode(testBytes);
        console.log(
          `  ${fontName} (${decoder.fontName}): composite=${decoder.isComposite}, sample="${decoded}"`
        );
        decoderResults.push({ name: fontName, ok: true });
      } catch (err) {
        console.log(`  ${fontName}: BUILD FAILED — ${String(err)}`);
        decoderResults.push({ name: fontName, ok: false, error: String(err) });
      }
    }

    // All decoders should build successfully
    const failed = decoderResults.filter((r) => !r.ok);
    expect(failed).toHaveLength(0);
  });
});
