/**
 * FontExtractor — extract embedded font programs from PDF font dictionaries.
 *
 * PDF fonts embed their font programs in the FontDescriptor:
 *   Font Dict → /FontDescriptor → /FontFile (Type1), /FontFile2 (TrueType),
 *   /FontFile3 (CFF/OpenType)
 *
 * This module extracts the raw font bytes, detects the font type, and optionally
 * parses basic metrics from the font program using existing TrueTypeParser/CFFParser.
 *
 * For Type0/CIDFont (composite fonts), the FontDescriptor lives on the
 * descendant CIDFont, not the top-level Type0 dict.
 */

import {
  COSName,
  COSArray,
  COSDictionary,
  COSStream,
  COSObjectReference,
} from '../../pdfbox/cos/COSTypes.js';
import type { COSBase } from '../../pdfbox/cos/COSBase.js';
import { getDecompressedStreamData } from './StreamDecoder.js';
import type { ObjectResolver } from './FontDecoder.js';
import { parseTrueType } from '../fonts/TrueTypeParser.js';
import { parseCFFFont } from '../fonts/CFFParser.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** The type of font program embedded in the PDF. */
export type FontProgramType = 'TrueType' | 'CFF' | 'Type1';

/** Extracted font program with metadata. */
export interface ExtractedFont {
  /** PostScript font name from the font dictionary. */
  fontName: string;
  /** Type of font program. */
  fontType: FontProgramType;
  /** Raw font program bytes (decompressed). */
  rawBytes: Uint8Array;
  /** Basic metrics parsed from the font program (if parsing succeeded). */
  metrics?: {
    ascender: number;
    descender: number;
    unitsPerEm: number;
  };
  /** Glyph ID to advance width mapping (in font units). */
  glyphWidths?: Map<number, number>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Extract an embedded font program from a PDF font dictionary.
 *
 * @param fontDict The font's COSDictionary (Type1, TrueType, or Type0)
 * @param resolve Function to resolve indirect object references
 * @returns ExtractedFont if a font program is embedded, undefined otherwise
 */
export function extractEmbeddedFont(
  fontDict: COSDictionary,
  resolve: ObjectResolver,
): ExtractedFont | undefined {
  const baseFont = resolveItem(fontDict, 'BaseFont', resolve);
  const fontName = baseFont instanceof COSName ? baseFont.getName() : 'Unknown';

  const subtype = resolveItem(fontDict, 'Subtype', resolve);
  const subtypeName = subtype instanceof COSName ? subtype.getName() : '';

  // For composite (Type0) fonts, the FontDescriptor is on the descendant CIDFont
  let descriptorSource: COSDictionary = fontDict;
  if (subtypeName === 'Type0') {
    const descendants = resolveItem(fontDict, 'DescendantFonts', resolve);
    if (descendants instanceof COSArray && descendants.size() > 0) {
      const cidFont = resolveElement(descendants, 0, resolve);
      if (cidFont instanceof COSDictionary) {
        descriptorSource = cidFont;
      }
    }
  }

  // Get the FontDescriptor
  const fdEntry = resolveItem(descriptorSource, 'FontDescriptor', resolve);
  if (!(fdEntry instanceof COSDictionary)) {
    return undefined; // No FontDescriptor — font program not embedded
  }

  // Try each FontFile key in order of specificity
  const { stream, fontType } = findFontStream(fdEntry, resolve);
  if (!stream) {
    return undefined; // No font program embedded
  }

  // Decompress the stream
  const rawBytes = getDecompressedStreamData(stream);
  if (rawBytes.length === 0) {
    return undefined;
  }

  // Build the result
  const result: ExtractedFont = {
    fontName,
    fontType,
    rawBytes,
  };

  // Attempt to parse metrics from the font program
  tryParseMetrics(result);

  return result;
}

// ---------------------------------------------------------------------------
// Font stream detection
// ---------------------------------------------------------------------------

/**
 * Find the font program stream in a FontDescriptor dictionary.
 * Checks FontFile2 (TrueType), FontFile3 (CFF/OpenType), and FontFile (Type1).
 */
function findFontStream(
  fontDescriptor: COSDictionary,
  resolve: ObjectResolver,
): { stream: COSStream | null; fontType: FontProgramType } {
  // FontFile2 — TrueType
  const ff2 = resolveItem(fontDescriptor, 'FontFile2', resolve);
  if (ff2 instanceof COSStream) {
    return { stream: ff2, fontType: 'TrueType' };
  }

  // FontFile3 — CFF/OpenType (subtype determines exact type)
  const ff3 = resolveItem(fontDescriptor, 'FontFile3', resolve);
  if (ff3 instanceof COSStream) {
    // Check the /Subtype of the stream to determine CFF vs OpenType
    const streamDict = ff3.getDictionary();
    const streamSubtype = resolveItem(streamDict, 'Subtype', resolve);
    const streamSubtypeName =
      streamSubtype instanceof COSName ? streamSubtype.getName() : '';

    // CIDFontType0C = CFF for CIDFont, Type1C = CFF for Type1, OpenType = OpenType/CFF
    if (
      streamSubtypeName === 'CIDFontType0C' ||
      streamSubtypeName === 'Type1C' ||
      streamSubtypeName === 'OpenType'
    ) {
      return { stream: ff3, fontType: 'CFF' };
    }
    // Default to CFF for unknown FontFile3 subtypes
    return { stream: ff3, fontType: 'CFF' };
  }

  // FontFile — Type1 (PFB or raw charstrings)
  const ff1 = resolveItem(fontDescriptor, 'FontFile', resolve);
  if (ff1 instanceof COSStream) {
    return { stream: ff1, fontType: 'Type1' };
  }

  return { stream: null, fontType: 'Type1' };
}

// ---------------------------------------------------------------------------
// Metric parsing
// ---------------------------------------------------------------------------

/**
 * Try to parse font metrics from the raw font bytes.
 * Mutates `result` to add metrics and glyphWidths if parsing succeeds.
 * Silently ignores parsing failures (non-critical).
 */
function tryParseMetrics(result: ExtractedFont): void {
  try {
    if (result.fontType === 'TrueType') {
      const info = parseTrueType(result.rawBytes);
      result.metrics = {
        ascender: info.ascender,
        descender: info.descender,
        unitsPerEm: info.unitsPerEm,
      };
      // Convert Uint16Array to Map<number, number>
      const widthMap = new Map<number, number>();
      for (let i = 0; i < info.advanceWidths.length; i++) {
        if (info.advanceWidths[i] > 0) {
          widthMap.set(i, info.advanceWidths[i]);
        }
      }
      result.glyphWidths = widthMap;
    } else if (result.fontType === 'CFF') {
      const info = parseCFFFont(result.rawBytes);
      result.metrics = {
        ascender: info.ascender,
        descender: info.descender,
        unitsPerEm: info.unitsPerEm,
      };
      const widthMap = new Map<number, number>();
      for (let i = 0; i < info.advanceWidths.length; i++) {
        if (info.advanceWidths[i] > 0) {
          widthMap.set(i, info.advanceWidths[i]);
        }
      }
      result.glyphWidths = widthMap;
    }
    // Type1: skip metric parsing — PFB format is complex and not yet supported
  } catch {
    // Parsing failed — leave metrics undefined (non-critical)
  }
}

// ---------------------------------------------------------------------------
// Helpers (mirror FontDecoder patterns)
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
