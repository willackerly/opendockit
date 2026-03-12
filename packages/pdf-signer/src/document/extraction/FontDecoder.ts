/**
 * FontDecoder — decode character codes from PDF content streams to Unicode text.
 *
 * PDF fonts use various encoding schemes. This module builds a decoder for a given
 * font dictionary that maps raw byte codes to Unicode strings.
 *
 * Resolution order:
 * 1. /ToUnicode CMap stream (most reliable)
 * 2. /Encoding dict with /Differences array + Adobe Glyph List
 * 3. /Encoding name (WinAnsiEncoding, MacRomanEncoding, etc.)
 * 4. Built-in encoding for standard 14 fonts
 * 5. Raw byte passthrough (last resort)
 *
 * Font types:
 * - Type1 / TrueType (simple): 1-byte codes, /Widths + /FirstChar
 * - Type0 / CIDFont (composite): 2-byte codes, /DW + /W array
 */

import {
  COSName,
  COSArray,
  COSInteger,
  COSDictionary,
  COSStream,
  COSFloat,
  COSObjectReference,
} from '../../pdfbox/cos/COSTypes.js';
import type { COSBase } from '../../pdfbox/cos/COSBase.js';
import { parseToUnicodeCMap } from './CMapParser.js';
import { getDecompressedStreamData } from './StreamDecoder.js';
import { glyphNameToUnicode } from './AdobeGlyphList.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface FontDecoder {
  /** Font name from the font dictionary. */
  fontName: string;
  /** Decode a PDF string operand (from Tj) to Unicode. */
  decode(bytes: Uint8Array): string;
  /** Decode a hex string (from TJ array elements) to Unicode. */
  decodeHex(hex: string): string;
  /** Get character width in text space units (0–1000 scale). */
  getCharWidth(code: number): number;
  /** True for Type0/CIDFont (2-byte codes). */
  isComposite: boolean;
  /** Character code → Unicode mapping (from ToUnicode CMap + encoding). */
  charCodeToUnicode?: Map<number, string>;
}

// ---------------------------------------------------------------------------
// Resolver type — resolves COSObjectReference to actual objects
// ---------------------------------------------------------------------------

export type ObjectResolver = (ref: COSObjectReference) => COSBase | undefined;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build a FontDecoder from a font dictionary.
 * @param fontDict The font's COSDictionary
 * @param resolve Function to resolve indirect object references
 */
export function buildFontDecoder(
  fontDict: COSDictionary,
  resolve: ObjectResolver,
): FontDecoder {
  const baseFont = resolveItem(fontDict, 'BaseFont', resolve);
  const fontName = baseFont instanceof COSName ? baseFont.getName() : 'Unknown';

  const subtype = resolveItem(fontDict, 'Subtype', resolve);
  const subtypeName = subtype instanceof COSName ? subtype.getName() : '';
  const isComposite = subtypeName === 'Type0';

  // Build the code-to-unicode map
  const toUnicodeMap = buildToUnicodeMap(fontDict, resolve);
  const encodingMap = isComposite ? undefined : buildEncodingMap(fontDict, resolve, fontName);
  const widthMap = isComposite
    ? buildCIDWidthMap(fontDict, resolve)
    : buildSimpleWidthMap(fontDict, resolve);

  // Read /FontDescriptor → /MissingWidth for simple fonts
  let missingWidth = 0;
  if (!isComposite) {
    const fd = resolveItem(fontDict, 'FontDescriptor', resolve);
    if (fd instanceof COSDictionary) {
      missingWidth = getIntFromDict(fd, 'MissingWidth', resolve, 0);
    }
  }

  // Build combined charCode→unicode map for font cmap rebuilding.
  // Merges toUnicodeMap (highest priority) with encodingMap fallback.
  const charCodeToUnicode = new Map<number, string>();
  if (toUnicodeMap) {
    for (const [code, uni] of toUnicodeMap) {
      charCodeToUnicode.set(code, uni);
    }
  }
  if (encodingMap) {
    for (const [code, uni] of encodingMap) {
      if (!charCodeToUnicode.has(code)) {
        charCodeToUnicode.set(code, uni);
      }
    }
  }

  return {
    fontName,
    isComposite,
    charCodeToUnicode: charCodeToUnicode.size > 0 ? charCodeToUnicode : undefined,

    decode(bytes: Uint8Array): string {
      let result = '';
      if (isComposite) {
        // 2-byte codes
        for (let i = 0; i + 1 < bytes.length; i += 2) {
          const code = (bytes[i] << 8) | bytes[i + 1];
          result += codeToChar(code, toUnicodeMap, encodingMap, isComposite);
        }
      } else {
        // 1-byte codes
        for (let i = 0; i < bytes.length; i++) {
          result += codeToChar(bytes[i], toUnicodeMap, encodingMap, false);
        }
      }
      return result;
    },

    decodeHex(hex: string): string {
      let result = '';
      if (isComposite) {
        for (let i = 0; i + 3 < hex.length; i += 4) {
          const code = parseInt(hex.substring(i, i + 4), 16);
          result += codeToChar(code, toUnicodeMap, encodingMap, isComposite);
        }
      } else {
        for (let i = 0; i + 1 < hex.length; i += 2) {
          const code = parseInt(hex.substring(i, i + 2), 16);
          result += codeToChar(code, toUnicodeMap, encodingMap, false);
        }
      }
      return result;
    },

    getCharWidth(code: number): number {
      // Composite: use /DW stored at sentinel -1 (from buildCIDWidthMap), fallback 1000
      // Simple: use /MissingWidth from FontDescriptor, fallback 500 (reasonable average)
      return widthMap.get(code) ?? (isComposite ? (widthMap.get(-1) ?? 1000) : (missingWidth || 500));
    },
  };
}

// ---------------------------------------------------------------------------
// Code to character resolution
// ---------------------------------------------------------------------------

function codeToChar(
  code: number,
  toUnicodeMap?: Map<number, string>,
  encodingMap?: Map<number, string>,
  isComposite?: boolean,
): string {
  // 1. ToUnicode (highest priority)
  if (toUnicodeMap) {
    const mapped = toUnicodeMap.get(code);
    if (mapped !== undefined) return mapped;
  }

  // 2. Encoding map (from /Differences or named encoding)
  if (encodingMap) {
    const mapped = encodingMap.get(code);
    if (mapped !== undefined) return mapped;
  }

  // 3. For composite fonts: try Identity-H (code = Unicode code point)
  //    This handles ligature codes and other mapped glyphs where ToUnicode
  //    is incomplete. Only accept printable, non-PUA characters.
  if (isComposite && code > 0 && code <= 0xFFFF) {
    if (code >= 0x20 && (code < 0xE000 || code > 0xF8FF)) {
      return String.fromCodePoint(code);
    }
  }

  // 4. Fallback: treat as ASCII
  if (code >= 32 && code <= 126) {
    return String.fromCharCode(code);
  }

  // 5. Last resort: empty for control chars, raw byte otherwise
  if (code < 32) return '';
  return String.fromCharCode(code);
}

// ---------------------------------------------------------------------------
// ToUnicode map
// ---------------------------------------------------------------------------

function buildToUnicodeMap(
  fontDict: COSDictionary,
  resolve: ObjectResolver,
): Map<number, string> | undefined {
  const entry = resolveItem(fontDict, 'ToUnicode', resolve);

  if (entry instanceof COSStream) {
    const data = getDecompressedStreamData(entry);
    return parseToUnicodeCMap(data);
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Encoding map (simple fonts)
// ---------------------------------------------------------------------------

function buildEncodingMap(
  fontDict: COSDictionary,
  resolve: ObjectResolver,
  fontName: string,
): Map<number, string> | undefined {
  const map = new Map<number, string>();

  // Start with base encoding
  const encodingEntry = resolveItem(fontDict, 'Encoding', resolve);

  let baseEncodingName: string | undefined;

  if (encodingEntry instanceof COSName) {
    baseEncodingName = encodingEntry.getName();
  } else if (encodingEntry instanceof COSDictionary) {
    const baseEnc = resolveItem(encodingEntry, 'BaseEncoding', resolve);
    if (baseEnc instanceof COSName) {
      baseEncodingName = baseEnc.getName();
    }

    // Apply /Differences
    const diffs = resolveItem(encodingEntry, 'Differences', resolve);
    if (diffs instanceof COSArray) {
      applyDifferences(diffs, map, resolve);
    }
  }

  // If no explicit encoding, try to infer from font name
  if (!baseEncodingName) {
    baseEncodingName = inferEncoding(fontName);
  }

  // Fill in base encoding for any codes not covered by /Differences
  if (baseEncodingName) {
    const baseMap = getNamedEncoding(baseEncodingName);
    if (baseMap) {
      for (const [code, char] of baseMap) {
        if (!map.has(code)) {
          map.set(code, char);
        }
      }
    }
  }

  return map.size > 0 ? map : undefined;
}

function applyDifferences(
  diffs: COSArray,
  map: Map<number, string>,
  resolve: ObjectResolver,
): void {
  let code = 0;
  for (let i = 0; i < diffs.size(); i++) {
    const el = resolveElement(diffs, i, resolve);
    if (el instanceof COSInteger) {
      code = el.getValue();
    } else if (el instanceof COSName) {
      const glyphName = el.getName();
      const cp = glyphNameToUnicode(glyphName);
      if (cp !== undefined) {
        map.set(code, String.fromCodePoint(cp));
      }
      code++;
    }
  }
}

// ---------------------------------------------------------------------------
// Named encodings
// ---------------------------------------------------------------------------

function getNamedEncoding(name: string): Map<number, string> | undefined {
  switch (name) {
    case 'WinAnsiEncoding':
      return WIN_ANSI_DECODE;
    case 'MacRomanEncoding':
      return MAC_ROMAN_DECODE;
    case 'MacExpertEncoding':
      return undefined; // Rare, skip
    case 'StandardEncoding':
      return STANDARD_DECODE;
    default:
      return undefined;
  }
}

function inferEncoding(fontName: string): string | undefined {
  // Standard 14 fonts default to StandardEncoding (except Symbol/ZapfDingbats)
  if (fontName === 'Symbol' || fontName === 'ZapfDingbats') {
    return undefined; // These have built-in encodings
  }
  // Most PDF generators use WinAnsiEncoding by default
  return 'WinAnsiEncoding';
}

// ---------------------------------------------------------------------------
// Width maps
// ---------------------------------------------------------------------------

function buildSimpleWidthMap(
  fontDict: COSDictionary,
  resolve: ObjectResolver,
): Map<number, number> {
  const map = new Map<number, number>();
  const firstChar = getIntFromDict(fontDict, 'FirstChar', resolve, 0);
  const widths = resolveItem(fontDict, 'Widths', resolve);

  if (widths instanceof COSArray) {
    for (let i = 0; i < widths.size(); i++) {
      const el = resolveElement(widths, i, resolve);
      const w = getNumericValue(el);
      if (w !== undefined) {
        map.set(firstChar + i, w);
      }
    }
  }

  return map;
}

function buildCIDWidthMap(
  fontDict: COSDictionary,
  resolve: ObjectResolver,
): Map<number, number> {
  const map = new Map<number, number>();

  // Navigate: Type0 → DescendantFonts[0] → /W + /DW
  const descendants = resolveItem(fontDict, 'DescendantFonts', resolve);
  if (!(descendants instanceof COSArray) || descendants.size() === 0) return map;

  const cidFontEntry = resolveElement(descendants, 0, resolve);
  if (!(cidFontEntry instanceof COSDictionary)) return map;

  const defaultWidth = getIntFromDict(cidFontEntry, 'DW', resolve, 1000);

  const wArray = resolveItem(cidFontEntry, 'W', resolve);
  if (wArray instanceof COSArray) {
    let i = 0;
    while (i < wArray.size()) {
      const first = resolveElement(wArray, i, resolve);
      if (!(first instanceof COSInteger)) break;
      const firstCid = first.getValue();
      i++;

      if (i >= wArray.size()) break;
      const second = resolveElement(wArray, i, resolve);
      i++;

      if (second instanceof COSArray) {
        // Format: c [w1 w2 w3 ...] — individual widths starting at firstCid
        for (let j = 0; j < second.size(); j++) {
          const w = getNumericValue(resolveElement(second, j, resolve));
          if (w !== undefined) {
            map.set(firstCid + j, w);
          }
        }
      } else if (second instanceof COSInteger) {
        // Format: c_first c_last w — same width for range
        const lastCid = second.getValue();
        if (i >= wArray.size()) break;
        const w = getNumericValue(resolveElement(wArray, i, resolve));
        i++;
        if (w !== undefined) {
          for (let cid = firstCid; cid <= lastCid; cid++) {
            map.set(cid, w);
          }
        }
      }
    }
  }

  // Store default width at a sentinel
  map.set(-1, defaultWidth);

  return map;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveItem(
  dict: COSDictionary,
  key: string,
  resolve: ObjectResolver,
): COSBase | undefined {
  const entry = dict.getItem(key);
  if (entry instanceof COSObjectReference) {
    return resolve(entry);
  }
  return entry;
}

function resolveElement(
  array: COSArray,
  index: number,
  resolve: ObjectResolver,
): COSBase | undefined {
  const el = array.get(index);
  if (el instanceof COSObjectReference) {
    return resolve(el);
  }
  return el;
}

function getIntFromDict(
  dict: COSDictionary,
  key: string,
  resolve: ObjectResolver,
  defaultValue: number,
): number {
  const entry = resolveItem(dict, key, resolve);
  if (entry instanceof COSInteger) return entry.getValue();
  if (entry instanceof COSFloat) return Math.round(entry.getValue());
  return defaultValue;
}

function getNumericValue(entry: COSBase | undefined): number | undefined {
  if (entry instanceof COSInteger) return entry.getValue();
  if (entry instanceof COSFloat) return entry.getValue();
  return undefined;
}

// ---------------------------------------------------------------------------
// WinAnsiEncoding reverse map (byte → Unicode character)
// ---------------------------------------------------------------------------

const WIN_ANSI_DECODE: Map<number, string> = new Map();
// Fill standard ASCII range
for (let i = 32; i <= 126; i++) WIN_ANSI_DECODE.set(i, String.fromCharCode(i));
// Fill Latin-1 Supplement
for (let i = 160; i <= 255; i++) WIN_ANSI_DECODE.set(i, String.fromCharCode(i));
// Windows-1252 specific mappings (128-159 range)
const win1252Extras: Array<[number, number]> = [
  [128, 0x20AC], // Euro
  [130, 0x201A], // quotesinglbase
  [131, 0x0192], // florin
  [132, 0x201E], // quotedblbase
  [133, 0x2026], // ellipsis
  [134, 0x2020], // dagger
  [135, 0x2021], // daggerdbl
  [136, 0x02C6], // circumflex
  [137, 0x2030], // perthousand
  [138, 0x0160], // Scaron
  [139, 0x2039], // guilsinglleft
  [140, 0x0152], // OE
  [142, 0x017D], // Zcaron
  [145, 0x2018], // quoteleft
  [146, 0x2019], // quoteright
  [147, 0x201C], // quotedblleft
  [148, 0x201D], // quotedblright
  [149, 0x2022], // bullet
  [150, 0x2013], // endash
  [151, 0x2014], // emdash
  [152, 0x02DC], // tilde
  [153, 0x2122], // trademark
  [154, 0x0161], // scaron
  [155, 0x203A], // guilsinglright
  [156, 0x0153], // oe
  [158, 0x017E], // zcaron
  [159, 0x0178], // Ydieresis
];
for (const [byte, cp] of win1252Extras) {
  WIN_ANSI_DECODE.set(byte, String.fromCodePoint(cp));
}

// ---------------------------------------------------------------------------
// MacRomanEncoding reverse map
// ---------------------------------------------------------------------------

const MAC_ROMAN_DECODE: Map<number, string> = new Map();
for (let i = 32; i <= 126; i++) MAC_ROMAN_DECODE.set(i, String.fromCharCode(i));
const macRomanHighBytes: Array<[number, number]> = [
  [128, 0x00C4], [129, 0x00C5], [130, 0x00C7], [131, 0x00C9],
  [132, 0x00D1], [133, 0x00D6], [134, 0x00DC], [135, 0x00E1],
  [136, 0x00E0], [137, 0x00E2], [138, 0x00E4], [139, 0x00E3],
  [140, 0x00E5], [141, 0x00E7], [142, 0x00E9], [143, 0x00E8],
  [144, 0x00EA], [145, 0x00EB], [146, 0x00ED], [147, 0x00EC],
  [148, 0x00EE], [149, 0x00EF], [150, 0x00F1], [151, 0x00F3],
  [152, 0x00F2], [153, 0x00F4], [154, 0x00F6], [155, 0x00F5],
  [156, 0x00FA], [157, 0x00F9], [158, 0x00FB], [159, 0x00FC],
  [160, 0x2020], [161, 0x00B0], [162, 0x00A2], [163, 0x00A3],
  [164, 0x00A7], [165, 0x2022], [166, 0x00B6], [167, 0x00DF],
  [168, 0x00AE], [169, 0x00A9], [170, 0x2122], [171, 0x00B4],
  [172, 0x00A8], [174, 0x00C6], [175, 0x00D8],
  [177, 0x00B1], [180, 0x00A5], [181, 0x00B5],
  [187, 0x00AA], [188, 0x00BA], [190, 0x00E6], [191, 0x00F8],
  [192, 0x00BF], [193, 0x00A1], [194, 0x00AC],
  [196, 0x0192], [199, 0x00AB], [200, 0x00BB],
  [201, 0x2026], [202, 0x00A0],
  [203, 0x00C0], [204, 0x00C3], [205, 0x00D5],
  [206, 0x0152], [207, 0x0153],
  [208, 0x2013], [209, 0x2014],
  [210, 0x201C], [211, 0x201D], [212, 0x2018], [213, 0x2019],
  [214, 0x00F7],
  [216, 0x00FF], [217, 0x0178],
  [218, 0x2044], [219, 0x20AC],
  [220, 0x2039], [221, 0x203A], [222, 0xFB01], [223, 0xFB02],
  [224, 0x2021], [225, 0x00B7],
  [226, 0x201A], [227, 0x201E],
  [228, 0x2030],
  [229, 0x00C2], [230, 0x00CA], [231, 0x00C1], [232, 0x00CB],
  [233, 0x00C8], [234, 0x00CD], [235, 0x00CE], [236, 0x00CF],
  [237, 0x00CC], [238, 0x00D3], [239, 0x00D4],
  [241, 0x00D2], [242, 0x00DA], [243, 0x00DB], [244, 0x00D9],
  [245, 0x0131], [246, 0x02C6], [247, 0x02DC],
  [248, 0x00AF], [249, 0x02D8], [250, 0x02D9], [251, 0x02DA],
  [252, 0x00B8], [253, 0x02DD], [254, 0x02DB], [255, 0x02C7],
];
for (const [byte, cp] of macRomanHighBytes) {
  MAC_ROMAN_DECODE.set(byte, String.fromCodePoint(cp));
}

// ---------------------------------------------------------------------------
// StandardEncoding reverse map
// ---------------------------------------------------------------------------

const STANDARD_DECODE: Map<number, string> = new Map();
for (let i = 32; i <= 126; i++) STANDARD_DECODE.set(i, String.fromCharCode(i));
const standardExtras: Array<[number, number]> = [
  [161, 0x00A1], [162, 0x00A2], [163, 0x00A3], [164, 0x2044],
  [165, 0x00A5], [166, 0x0192], [167, 0x00A7],
  [168, 0x00A4], [169, 0x0027], [170, 0x201C],
  [171, 0x00AB], [172, 0x2039], [173, 0x203A],
  [174, 0xFB01], [175, 0xFB02],
  [177, 0x2013], [178, 0x2020], [179, 0x2021],
  [180, 0x00B7], [182, 0x00B6], [183, 0x2022],
  [184, 0x201A], [185, 0x201E], [186, 0x201D],
  [187, 0x00BB], [188, 0x2026], [189, 0x2030],
  [191, 0x00BF],
  [193, 0x0060], [194, 0x00B4], [195, 0x02C6],
  [196, 0x02DC], [197, 0x00AF], [198, 0x02D8],
  [199, 0x02D9], [200, 0x00A8], [202, 0x02DA],
  [203, 0x00B8], [205, 0x02DD], [206, 0x02DB], [207, 0x02C7],
  [208, 0x2014],
  [225, 0x00C6], [227, 0x00AA],
  [232, 0x0141], [233, 0x00D8], [234, 0x0152],
  [235, 0x00BA],
  [241, 0x00E6], [245, 0x0131],
  [248, 0x0142], [249, 0x00F8], [250, 0x0153],
  [251, 0x00DF],
];
for (const [byte, cp] of standardExtras) {
  STANDARD_DECODE.set(byte, String.fromCodePoint(cp));
}
