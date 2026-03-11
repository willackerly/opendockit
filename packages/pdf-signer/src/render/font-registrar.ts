/**
 * Font Registrar — registers extracted PDF font bytes with Canvas2D.
 *
 * Supports both Node.js (node-canvas registerFont) and browser (FontFace API)
 * environments. Generates unique family names to avoid collisions and caches
 * registrations to prevent duplicates.
 *
 * Usage:
 *   const registrar = new FontRegistrar();
 *   const family = await registrar.register('ABCDEF+Helvetica-Bold', fontBytes);
 *   // Use `family` in ctx.font = `bold 12px '${family}'`
 *   registrar.cleanup(); // after rendering
 */

import { isNodeEnvironment } from './canvas-factory.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RegisteredFont {
  /** The unique family name that was registered with the canvas system. */
  family: string;
  /** Temp file path (Node.js only) — needed for cleanup. */
  tempPath?: string;
  /** FontFace object (browser only) — needed for cleanup. */
  fontFace?: FontFace;
}

// ---------------------------------------------------------------------------
// FontRegistrar
// ---------------------------------------------------------------------------

export class FontRegistrar {
  /** Map from PDF font name/key → registered font info. */
  private cache = new Map<string, RegisteredFont>();

  /** Counter for generating unique names. */
  private counter = 0;

  /**
   * Register font bytes so they can be used in Canvas2D ctx.font.
   *
   * @param pdfFontName  The PDF font name (e.g. 'ABCDEF+Helvetica-Bold')
   * @param fontBytes    Raw TrueType (.ttf) or OpenType (.otf) font data
   * @param options      Optional weight/style hints
   * @returns The registered family name to use in ctx.font
   */
  async register(
    pdfFontName: string,
    fontBytes: Uint8Array,
    options?: { weight?: string; style?: string; fontType?: string }
  ): Promise<string> {
    // Check cache — don't re-register the same font
    const cached = this.cache.get(pdfFontName);
    if (cached) {
      return cached.family;
    }

    // Generate unique family name
    const family = this.generateFamilyName(pdfFontName);

    let registered: RegisteredFont;

    if (isNodeEnvironment) {
      registered = await this.registerNode(family, fontBytes, options);
    } else {
      registered = await this.registerBrowser(family, fontBytes, options);
    }

    this.cache.set(pdfFontName, registered);
    return registered.family;
  }

  /**
   * Check if a font has already been registered.
   */
  has(pdfFontName: string): boolean {
    return this.cache.has(pdfFontName);
  }

  /**
   * Get the registered family name for a PDF font, if registered.
   */
  getFamily(pdfFontName: string): string | undefined {
    return this.cache.get(pdfFontName)?.family;
  }

  /**
   * Clean up all registered fonts.
   * - Node.js: deletes temp files (note: node-canvas doesn't support unregistering)
   * - Browser: removes FontFace objects from document.fonts
   */
  async cleanup(): Promise<void> {
    if (isNodeEnvironment) {
      // Delete temp files
      for (const entry of this.cache.values()) {
        if (entry.tempPath) {
          try {
            const fs = await import('fs');
            fs.unlinkSync(entry.tempPath);
          } catch {
            // Ignore cleanup errors — file may already be deleted
          }
        }
      }
    } else {
      // Browser: remove FontFace from document.fonts
      for (const entry of this.cache.values()) {
        if (entry.fontFace && typeof document !== 'undefined') {
          try {
            (document.fonts as any).delete(entry.fontFace);
          } catch {
            // Ignore cleanup errors
          }
        }
      }
    }

    this.cache.clear();
  }

  /**
   * Number of registered fonts.
   */
  get size(): number {
    return this.cache.size;
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  /**
   * Generate a unique family name from a PDF font name.
   * Strips subset prefix and special characters, appends a counter for uniqueness.
   *
   * 'ABCDEF+Helvetica-Bold' → '_pdf_helvetica_bold_0'
   */
  private generateFamilyName(pdfFontName: string): string {
    // Strip subset prefix: 'ABCDEF+Helvetica-Bold' → 'Helvetica-Bold'
    const stripped = pdfFontName.replace(/^[A-Z]{6}\+/, '');
    // Normalize: lowercase, replace non-alphanumeric with underscore
    const normalized = stripped.toLowerCase().replace(/[^a-z0-9]/g, '_');
    return `_pdf_${normalized}_${this.counter++}`;
  }

  /**
   * Node.js registration: write to temp file, call registerFont.
   */
  private async registerNode(
    family: string,
    fontBytes: Uint8Array,
    options?: { weight?: string; style?: string; fontType?: string }
  ): Promise<RegisteredFont> {
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');

    // Write to temp file (registerFont requires a file path)
    // Use correct extension: .otf for CFF/OpenType fonts, .ttf for TrueType
    const tmpDir = os.tmpdir();
    const ext = options?.fontType === 'CFF' ? '.otf' : '.ttf';
    const tmpFile = path.join(tmpDir, `${family}${ext}`);

    // Write raw bytes first
    fs.writeFileSync(tmpFile, fontBytes);

    // PDF-embedded subsetted TrueType fonts often lack OS/2 table, use "true"
    // magic bytes, and have minimal name tables — all cause FreeType (node-canvas)
    // to reject them. Use fonttools (python3) to fix if available.
    try {
      await patchFontWithFonttools(tmpFile, family);
    } catch {
      // fonttools not available — try raw bytes anyway
    }

    // Register with node-canvas
    const { registerFont } = await import('canvas');
    registerFont(tmpFile, {
      family,
      weight: options?.weight ?? 'normal',
      style: options?.style ?? 'normal',
    });

    return { family, tempPath: tmpFile };
  }

  /**
   * Browser registration: create FontFace and add to document.fonts.
   */
  private async registerBrowser(
    family: string,
    fontBytes: Uint8Array,
    options?: { weight?: string; style?: string }
  ): Promise<RegisteredFont> {
    const buffer = fontBytes.buffer.slice(
      fontBytes.byteOffset,
      fontBytes.byteOffset + fontBytes.byteLength
    );

    const fontFace = new FontFace(family, buffer as ArrayBuffer, {
      weight: options?.weight ?? 'normal',
      style: options?.style ?? 'normal',
    });

    await fontFace.load();
    (document.fonts as any).add(fontFace);

    return { family, fontFace };
  }
}

// ---------------------------------------------------------------------------
// TrueType patching for registration compatibility
// ---------------------------------------------------------------------------

/**
 * Use python3 fonttools to fix a PDF-embedded subsetted TrueType font.
 *
 * PDF subsetters produce fonts with issues FreeType rejects:
 * - "true" sfVersion instead of 0x00010000
 * - Missing OS/2 table
 * - Minimal name table (no family/subfamily entries)
 *
 * fonttools can read these fonts and rewrite them with proper tables.
 */
async function patchFontWithFonttools(fontPath: string, family: string): Promise<void> {
  const { execSync } = await import('child_process');

  // Write a python script to /tmp and execute it
  const fs = await import('fs');
  const scriptPath = fontPath + '.fix.py';
  const script = `
import sys
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables.O_S_2f_2 import table_O_S_2f_2, Panose

f = TTFont(sys.argv[1])
f.sfntVersion = '\\x00\\x01\\x00\\x00'

# Add name entries if missing
name = f['name']
has_family = any(r.nameID == 1 and r.platformID == 3 for r in name.names)
if not has_family:
    ps_name = next((r.toStr() for r in name.names if r.nameID == 6), sys.argv[2])
    clean = ps_name.split('+')[-1] if '+' in ps_name else ps_name
    name.setName(clean, 1, 3, 1, 0x0409)
    name.setName('Regular', 2, 3, 1, 0x0409)
    name.setName(ps_name, 6, 3, 1, 0x0409)

# Add OS/2 if missing
if 'OS/2' not in f:
    os2 = table_O_S_2f_2()
    os2.version = 4
    os2.xAvgCharWidth = 500
    os2.usWeightClass = 400
    os2.usWidthClass = 5
    os2.fsType = 0
    for attr in ['ySubscriptXSize','ySubscriptYSize','ySubscriptXOffset','ySubscriptYOffset',
                 'ySuperscriptXSize','ySuperscriptYSize','ySuperscriptXOffset','ySuperscriptYOffset',
                 'yStrikeoutSize','yStrikeoutPosition','sFamilyClass']:
        setattr(os2, attr, 0)
    p = Panose()
    for attr in ['bFamilyType','bSerifStyle','bWeight','bProportion','bContrast',
                 'bStrokeVariation','bArmStyle','bLetterForm','bMidline','bXHeight']:
        setattr(p, attr, 0)
    os2.panose = p
    os2.ulUnicodeRange1 = os2.ulUnicodeRange2 = os2.ulUnicodeRange3 = os2.ulUnicodeRange4 = 0
    os2.achVendID = '    '
    os2.fsSelection = 0x40
    os2.usFirstCharIndex = 0
    os2.usLastCharIndex = 0xFFFF
    os2.sTypoAscender = f['hhea'].ascent
    os2.sTypoDescender = f['hhea'].descent
    os2.sTypoLineGap = 0
    os2.usWinAscent = f['hhea'].ascent
    os2.usWinDescent = abs(f['hhea'].descent)
    os2.ulCodePageRange1 = os2.ulCodePageRange2 = 0
    os2.sxHeight = os2.sCapHeight = os2.usDefaultChar = 0
    os2.usBreakChar = 32
    os2.usMaxContext = 0
    f['OS/2'] = os2

f.save(sys.argv[1])
`;
  fs.writeFileSync(scriptPath, script);
  try {
    execSync(`python3 "${scriptPath}" "${fontPath}" "${family}"`, {
      timeout: 5000,
      stdio: 'pipe',
    });
  } finally {
    try { fs.unlinkSync(scriptPath); } catch { /* ignore */ }
  }
}

// Reference implementation — pure TS approach that doesn't fully work
// because FreeType requires more complete table structures than we can easily generate.
/** @internal */
export function _patchTrueTypeForRegistration(fontBytes: Uint8Array): Uint8Array {
  const view = new DataView(fontBytes.buffer, fontBytes.byteOffset, fontBytes.byteLength);

  // Check magic: "true" (0x74727565) or standard (0x00010000)
  const magic = view.getUint32(0);
  const isTrueTypeMagic = magic === 0x74727565 || magic === 0x00010000;
  if (!isTrueTypeMagic) return fontBytes; // Not a TrueType font we can patch

  // Parse table directory
  const numTables = view.getUint16(4);

  // Check if OS/2 table exists
  let hasOS2 = false;
  for (let i = 0; i < numTables; i++) {
    const offset = 12 + i * 16;
    const tag = String.fromCharCode(
      fontBytes[offset], fontBytes[offset + 1],
      fontBytes[offset + 2], fontBytes[offset + 3]
    );
    if (tag === 'OS/2') {
      hasOS2 = true;
      break;
    }
  }

  if (hasOS2 && magic === 0x00010000) {
    return fontBytes; // Already fine
  }

  if (hasOS2) {
    // Just fix magic bytes
    const result = new Uint8Array(fontBytes);
    result[0] = 0x00; result[1] = 0x01; result[2] = 0x00; result[3] = 0x00;
    return result;
  }

  // Need to add OS/2 table. Build a minimal 78-byte OS/2 v4 table.
  // Read head table for unitsPerEm
  let unitsPerEm = 1000;
  let headOffset = 0;
  for (let i = 0; i < numTables; i++) {
    const off = 12 + i * 16;
    const tag = String.fromCharCode(
      fontBytes[off], fontBytes[off + 1], fontBytes[off + 2], fontBytes[off + 3]
    );
    if (tag === 'head') {
      headOffset = view.getUint32(off + 8);
      unitsPerEm = view.getUint16(headOffset + 18);
      break;
    }
  }

  // Read hhea table for ascender/descender
  let ascender = Math.round(unitsPerEm * 0.8);
  let descender = Math.round(unitsPerEm * -0.2);
  for (let i = 0; i < numTables; i++) {
    const off = 12 + i * 16;
    const tag = String.fromCharCode(
      fontBytes[off], fontBytes[off + 1], fontBytes[off + 2], fontBytes[off + 3]
    );
    if (tag === 'hhea') {
      const hheaOff = view.getUint32(off + 8);
      ascender = view.getInt16(hheaOff + 4);
      descender = view.getInt16(hheaOff + 6);
      break;
    }
  }

  // Build minimal OS/2 table (78 bytes = version 4 minimum)
  const os2Size = 78;
  const os2 = new ArrayBuffer(os2Size);
  const os2View = new DataView(os2);
  os2View.setUint16(0, 4); // version
  // xAvgCharWidth (offset 2) = 0
  os2View.setUint16(4, 400); // usWeightClass = normal
  os2View.setUint16(6, 5); // usWidthClass = medium
  // fsType (offset 8) = 0 (installable)
  // ySubscript/Superscript (offsets 10-24) = 0
  // yStrikeout (offsets 26-28) = 0
  // sFamilyClass (offset 30) = 0
  // panose (offsets 32-41) = 0
  // ulUnicodeRange1-4 (offsets 42-57) = 0
  // achVendID (offset 58) = 0
  os2View.setUint16(62, 0x0040); // fsSelection = REGULAR
  // usFirstCharIndex (offset 64) = 0
  os2View.setUint16(66, 0xFFFF); // usLastCharIndex
  os2View.setInt16(68, ascender); // sTypoAscender
  os2View.setInt16(70, descender); // sTypoDescender
  os2View.setInt16(72, 0); // sTypoLineGap
  os2View.setUint16(74, ascender); // usWinAscent
  os2View.setUint16(76, -descender); // usWinDescent

  // Rebuild font with OS/2 table added
  const newNumTables = numTables + 1;

  // Calculate new table directory size and data offset
  const oldDirEnd = 12 + numTables * 16;
  const os2PaddedSize = (os2Size + 3) & ~3;

  // Append OS/2 at the end (simpler than shifting existing data)
  const oldDataStart = oldDirEnd;
  const newSize = fontBytes.length + 16 + os2PaddedSize; // 16 for dir entry
  const result = new Uint8Array(newSize);

  // Copy header (first 4 bytes → fixed magic + bytes 4-5 unchanged for now)
  result[0] = 0x00; result[1] = 0x01; result[2] = 0x00; result[3] = 0x00;

  // Update numTables
  const resultView = new DataView(result.buffer);
  resultView.setUint16(4, newNumTables);

  // Recalculate searchRange, entrySelector, rangeShift
  let searchRange = 1;
  let entrySelector = 0;
  while (searchRange * 2 <= newNumTables) {
    searchRange *= 2;
    entrySelector++;
  }
  searchRange *= 16;
  resultView.setUint16(6, searchRange);
  resultView.setUint16(8, entrySelector);
  resultView.setUint16(10, newNumTables * 16 - searchRange);

  // Copy existing table directory entries, shifting offsets by 16 (one new entry)
  for (let i = 0; i < numTables; i++) {
    const srcOff = 12 + i * 16;
    const dstOff = 12 + i * 16; // Same position in directory
    // Copy tag, checksum, length
    for (let j = 0; j < 16; j++) {
      result[dstOff + j] = fontBytes[srcOff + j];
    }
    // Shift offset by 16 (extra directory entry)
    const origOffset = view.getUint32(srcOff + 8);
    resultView.setUint32(dstOff + 8, origOffset + 16);
  }

  // Add OS/2 directory entry at the end of the directory
  const os2DirOff = 12 + numTables * 16;
  result[os2DirOff] = 0x4F; result[os2DirOff + 1] = 0x53; // 'O','S'
  result[os2DirOff + 2] = 0x2F; result[os2DirOff + 3] = 0x32; // '/','2'
  resultView.setUint32(os2DirOff + 4, 0); // checksum (0 for now)
  resultView.setUint32(os2DirOff + 8, fontBytes.length + 16); // offset = end of original data + dir entry shift
  resultView.setUint32(os2DirOff + 12, os2Size); // length

  // Copy all original table data (shifted by 16 bytes for the extra dir entry)
  result.set(fontBytes.subarray(oldDataStart), oldDataStart + 16);

  // Append OS/2 table data at the end
  const os2Bytes = new Uint8Array(os2);
  result.set(os2Bytes, fontBytes.length + 16);

  return result;
}
