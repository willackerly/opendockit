/**
 * FieldAppearanceGenerator — generates /AP /N appearance streams for form fields.
 *
 * Makes field values visible without /NeedAppearances. Critical for:
 * 1. Viewers that don't support /NeedAppearances (show blank fields)
 * 2. Flattening (appearance stream IS the visual content)
 * 3. Sign-after-fill workflows (appearance must exist before signing)
 *
 * Follows the same pattern as AppearanceGenerator.ts for annotations:
 * setNormalAppearance() creates Form XObjects with indirect Resources.
 *
 * Resources on Form XObjects MUST be indirect objects (Adobe Reader requirement — see MEMORY.md).
 */

import type { NativeDocumentContext } from '../NativeDocumentContext.js';
import { ContentStreamBuilder } from '../content-stream/ContentStreamBuilder.js';
import { StandardFontMetrics } from '../fonts/StandardFontMetrics.js';
import { encodeTextToHex, encodingForFont } from '../fonts/encoding.js';
import { setNormalAppearance } from '../annotations/AppearanceGenerator.js';
import { readFields, FF_MULTILINE } from '../NativeFormReader.js';
import {
  COSName,
  COSInteger,
  COSFloat,
  COSArray,
  COSDictionary,
  COSStream,
  COSObjectReference,
} from '../../pdfbox/cos/COSTypes.js';

// ---------------------------------------------------------------------------
// Font name mapping: DA short name -> standard font base name
// ---------------------------------------------------------------------------

const FONT_NAME_MAP: Record<string, string> = {
  'Helv': 'Helvetica',
  'HeBo': 'Helvetica-Bold',
  'HeIt': 'Helvetica-Oblique',
  'HeBI': 'Helvetica-BoldOblique',
  'Cour': 'Courier',
  'CoBo': 'Courier-Bold',
  'CoIt': 'Courier-Oblique',
  'CoBI': 'Courier-BoldOblique',
  'TiRo': 'Times-Roman',
  'TiBo': 'Times-Bold',
  'TiIt': 'Times-Italic',
  'TiBI': 'Times-BoldItalic',
  'Symb': 'Symbol',
  'ZaDb': 'ZapfDingbats',
};

/** Resolve a DA font short name to a standard PDF font base name. */
function resolveBaseFontName(daFontName: string): string {
  return FONT_NAME_MAP[daFontName] ?? daFontName;
}

// ---------------------------------------------------------------------------
// DA (Default Appearance) string parsing
// ---------------------------------------------------------------------------

interface ParsedDA {
  fontName: string;       // Short name from DA (e.g. "Helv")
  fontSize: number;       // Size from DA (0 = auto-size)
  colorOps: string;       // Color operators from DA (e.g. "0 g" or "1 0 0 rg")
}

/**
 * Parse a /DA (Default Appearance) string.
 * Common formats:
 *   /Helv 12 Tf 0 g
 *   /Helv 0 Tf 0.5 0.5 0.5 rg
 *   /HeBo 10 Tf 0 0 1 rg
 */
function parseDA(da: string | undefined): ParsedDA {
  if (!da) {
    return { fontName: 'Helv', fontSize: 0, colorOps: '0 g' };
  }

  // Extract font name and size: /FontName size Tf
  let fontName = 'Helv';
  let fontSize = 0;
  const fontMatch = da.match(/\/(\S+)\s+([\d.]+)\s+Tf/);
  if (fontMatch) {
    fontName = fontMatch[1];
    fontSize = parseFloat(fontMatch[2]);
  }

  // Extract color operators — everything after "Tf" (minus leading whitespace)
  let colorOps = '0 g';
  const tfIdx = da.indexOf('Tf');
  if (tfIdx >= 0) {
    const after = da.substring(tfIdx + 2).trim();
    if (after.length > 0) {
      colorOps = after;
    }
  } else {
    // No Tf found — try to extract color from the whole string
    const rgMatch = da.match(/([\d.]+\s+[\d.]+\s+[\d.]+\s+rg)/);
    const gMatch = da.match(/([\d.]+\s+g)\b/);
    if (rgMatch) colorOps = rgMatch[1];
    else if (gMatch) colorOps = gMatch[1];
  }

  return { fontName, fontSize, colorOps };
}

// ---------------------------------------------------------------------------
// Widget rect helper
// ---------------------------------------------------------------------------

function getWidgetRect(fieldDict: COSDictionary): [number, number, number, number] | undefined {
  const rectEntry = fieldDict.getItem('Rect');
  if (!(rectEntry instanceof COSArray) || rectEntry.size() < 4) return undefined;
  return [
    cosNum(rectEntry, 0),
    cosNum(rectEntry, 1),
    cosNum(rectEntry, 2),
    cosNum(rectEntry, 3),
  ];
}

function cosNum(arr: COSArray, idx: number): number {
  const el = arr.get(idx);
  if (!el) return 0;
  if ('getValue' in el) return (el as any).getValue();
  return 0;
}

// ---------------------------------------------------------------------------
// Auto-size font calculation
// ---------------------------------------------------------------------------

/**
 * Calculate the auto-sized font size for a text field.
 * If fontSize is 0 in DA, we compute one that fits the widget rect.
 */
function autoSizeFontSize(
  text: string,
  rectWidth: number,
  rectHeight: number,
  baseFontName: string,
): number {
  // Try to load metrics; fall back to a reasonable default
  let fontSize = 12;
  try {
    const metrics = StandardFontMetrics.load(baseFontName);
    const encoding = encodingForFont(baseFontName);
    const textWidth12 = metrics.widthOfTextAtSize(text || ' ', 12, encoding);

    // Scale to fit width (with 4pt padding total)
    const availWidth = rectWidth - 4;
    if (textWidth12 > 0 && availWidth > 0) {
      fontSize = Math.min(12, (availWidth / textWidth12) * 12);
    }
    // Also cap at rect height - 2
    if (rectHeight > 2) {
      fontSize = Math.min(fontSize, rectHeight - 2);
    }
  } catch {
    // If metrics aren't available, use a reasonable heuristic
    fontSize = Math.min(12, rectHeight > 2 ? rectHeight - 2 : 12);
  }

  // Floor at 1pt minimum
  return Math.max(1, fontSize);
}

// ---------------------------------------------------------------------------
// Ensure font in AcroForm /DR and return its font key
// ---------------------------------------------------------------------------

/**
 * Ensure the font referenced in DA is available in the AcroForm /DR dict.
 * Returns the font resource key (e.g. "Helv") and font ref.
 */
function ensureFontInDR(
  ctx: NativeDocumentContext,
  fontName: string,
): { fontKey: string; fontRef: COSObjectReference } {
  const drDict = ctx.ensureDefaultResources();
  let fontDict = drDict.getItem('Font');
  if (fontDict instanceof COSObjectReference) {
    fontDict = ctx.resolveRef(fontDict);
    if (fontDict) drDict.setItem('Font', fontDict);
  }
  if (!(fontDict instanceof COSDictionary)) {
    fontDict = new COSDictionary();
    (fontDict as COSDictionary).setDirect(true);
    drDict.setItem('Font', fontDict);
  }

  // Check if font key already exists in DR
  const existing = (fontDict as COSDictionary).getItem(fontName);
  if (existing instanceof COSObjectReference) {
    return { fontKey: fontName, fontRef: existing };
  }

  // Embed the standard font and add to DR
  const baseName = resolveBaseFontName(fontName);
  const fontRef = ctx.embedStandardFont(baseName);
  (fontDict as COSDictionary).setItem(fontName, fontRef);
  return { fontKey: fontName, fontRef };
}

// ---------------------------------------------------------------------------
// Text field appearance generation
// ---------------------------------------------------------------------------

/**
 * Generate and set the /AP /N appearance stream for a text field widget.
 * This makes the field's value visible without /NeedAppearances.
 */
export function generateTextFieldAppearance(
  ctx: NativeDocumentContext,
  fieldDict: COSDictionary,
  value: string,
  options?: { font?: string; fontSize?: number; alignment?: number },
): void {
  const rect = getWidgetRect(fieldDict);
  if (!rect) return;

  const [llx, lly, urx, ury] = rect;
  const width = urx - llx;
  const height = ury - lly;
  if (width <= 0 || height <= 0) return;

  // Parse DA string from field or use defaults
  const daStr = fieldDict.getString('DA') ?? undefined;
  const da = parseDA(daStr);

  // Apply option overrides
  const fontName = options?.font ?? da.fontName;
  const baseFontName = resolveBaseFontName(fontName);
  const isMultiline = (fieldDict.getInt('Ff', 0) & FF_MULTILINE) !== 0;

  // Determine font size
  let fontSize = options?.fontSize ?? da.fontSize;
  if (fontSize === 0) {
    // Auto-size: use the first line for width calculation
    const firstLine = isMultiline ? (value.split('\n')[0] || ' ') : (value || ' ');
    fontSize = autoSizeFontSize(firstLine, width, height, baseFontName);
  }

  // Get alignment from field /Q or option override
  const alignment = options?.alignment ?? fieldDict.getInt('Q', 0);

  // Ensure font exists in DR
  const { fontKey, fontRef } = ensureFontInDR(ctx, fontName);

  // Build the content stream
  const b = new ContentStreamBuilder();
  b.beginMarkedContent('Tx');
  b.pushGraphicsState();
  // Clip rect (1pt inset)
  b.rectangle(1, 1, width - 2, height - 2);
  b.clip();
  b.endPath();

  if (value) {
    b.beginText();
    b.raw(`/${fontKey} ${formatNum(fontSize)} Tf`);
    b.raw(da.colorOps);

    if (isMultiline) {
      // Multiline: split on newlines, use TL and T* operators
      const lines = value.split('\n');
      const leading = fontSize * 1.2;
      b.setTextLeading(leading);

      // Start from top-left (with padding)
      const startY = height - fontSize - 1;
      b.moveText(2, startY);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const x = computeAlignmentX(line, alignment, width, fontSize, baseFontName);
        if (i === 0 && x > 2) {
          // Adjust first line position for center/right alignment
          b.raw(`${formatNum(x - 2)} 0 Td`);
        }
        const hex = encodeTextForStream(line, baseFontName);
        b.showText(hex);
        if (i < lines.length - 1) {
          if (alignment !== 0 && i < lines.length - 1) {
            // For centered/right, reposition each line
            const nextX = computeAlignmentX(lines[i + 1], alignment, width, fontSize, baseFontName);
            const currentX = i === 0 ? x : computeAlignmentX(line, alignment, width, fontSize, baseFontName);
            b.raw(`${formatNum(nextX - currentX)} ${formatNum(-leading)} Td`);
          } else {
            b.nextLine();
          }
        }
      }
    } else {
      // Single line
      const x = computeAlignmentX(value, alignment, width, fontSize, baseFontName);
      const y = (height / 2) - (fontSize * 0.3);
      b.moveText(x, y);
      const hex = encodeTextForStream(value, baseFontName);
      b.showText(hex);
    }

    b.endText();
  }

  b.popGraphicsState();
  b.endMarkedContent();

  // Build resources with font
  const resFontDict = new COSDictionary();
  resFontDict.setDirect(true);
  resFontDict.setItem(fontKey, fontRef);
  const resources = new COSDictionary();
  resources.setItem('Font', resFontDict);

  setNormalAppearance(ctx, fieldDict, [0, 0, width, height], b.toBytes(), resources);
}

// ---------------------------------------------------------------------------
// Checkbox appearance generation
// ---------------------------------------------------------------------------

/**
 * Generate and set the /AP /N appearance stream for a checkbox widget.
 * Sets /AP /N as a dict with /Yes and /Off streams, and /AS accordingly.
 */
export function generateCheckBoxAppearance(
  ctx: NativeDocumentContext,
  fieldDict: COSDictionary,
  checked: boolean,
): void {
  const rect = getWidgetRect(fieldDict);
  // Use default 12x12 if no rect or zero-size rect
  let size = 12;
  if (rect) {
    const w = rect[2] - rect[0];
    const h = rect[3] - rect[1];
    if (w > 0 && h > 0) size = Math.min(w, h);
  }

  // Build /Yes appearance: ZapfDingbats checkmark
  const yesStream = new COSStream();
  yesStream.setItem('Type', new COSName('XObject'));
  yesStream.setItem('Subtype', new COSName('Form'));
  const yesBbox = makeBboxArray(0, 0, size, size);
  yesStream.setItem('BBox', yesBbox);

  // ZapfDingbats character "4" = checkmark (code point 0x34 = 52)
  const checkBuilder = new ContentStreamBuilder();
  checkBuilder.pushGraphicsState();
  checkBuilder.beginText();
  const checkFontSize = size * 0.8;

  // Ensure ZapfDingbats font in DR
  const { fontKey: zadbKey, fontRef: zadbRef } = ensureZapfDingbatsInDR(ctx);
  checkBuilder.raw(`/${zadbKey} ${formatNum(checkFontSize)} Tf`);
  checkBuilder.raw('0 g');
  // Center the checkmark
  const checkX = size * 0.15;
  const checkY = size * 0.2;
  checkBuilder.moveText(checkX, checkY);
  // "4" in ZapfDingbats = checkmark (0x34)
  checkBuilder.showText('34');
  checkBuilder.endText();
  checkBuilder.popGraphicsState();

  // Resources for the Yes stream
  const yesFontDict = new COSDictionary();
  yesFontDict.setDirect(true);
  yesFontDict.setItem(zadbKey, zadbRef);
  const yesResources = new COSDictionary();
  yesResources.setItem('Font', yesFontDict);
  const yesResRef = ctx.register(yesResources);
  yesStream.setItem('Resources', yesResRef);

  yesStream.setData(checkBuilder.toBytes());
  const yesRef = ctx.register(yesStream);

  // Build /Off appearance: empty
  const offStream = new COSStream();
  offStream.setItem('Type', new COSName('XObject'));
  offStream.setItem('Subtype', new COSName('Form'));
  const offBbox = makeBboxArray(0, 0, size, size);
  offStream.setItem('BBox', offBbox);
  offStream.setData(new Uint8Array(0));
  const offRef = ctx.register(offStream);

  // Build /AP dict with /N containing /Yes and /Off
  const nDict = new COSDictionary();
  nDict.setDirect(true);
  nDict.setItem('Yes', yesRef);
  nDict.setItem('Off', offRef);

  let apDict = fieldDict.getItem('AP');
  if (!(apDict instanceof COSDictionary)) {
    apDict = new COSDictionary();
    (apDict as COSDictionary).setDirect(true);
    fieldDict.setItem('AP', apDict);
  }
  (apDict as COSDictionary).setItem('N', nDict);

  // Set /AS
  fieldDict.setItem('AS', new COSName(checked ? 'Yes' : 'Off'));
}

// ---------------------------------------------------------------------------
// Dropdown appearance generation
// ---------------------------------------------------------------------------

/**
 * Generate and set the /AP /N appearance stream for a dropdown widget.
 * Same as text field but single line only.
 */
export function generateDropdownAppearance(
  ctx: NativeDocumentContext,
  fieldDict: COSDictionary,
  value: string,
  options?: { font?: string; fontSize?: number },
): void {
  // Dropdown is single-line text appearance
  generateTextFieldAppearance(ctx, fieldDict, value, {
    font: options?.font,
    fontSize: options?.fontSize,
    alignment: 0, // Dropdowns are always left-aligned
  });
}

// ---------------------------------------------------------------------------
// Generate all field appearances
// ---------------------------------------------------------------------------

/**
 * Generate appearances for ALL fields in the document.
 * Call after filling fields to ensure they render everywhere.
 */
export function generateAllFieldAppearances(ctx: NativeDocumentContext): void {
  const fields = readFields(ctx);
  for (const field of fields) {
    switch (field.type) {
      case 'Tx': {
        const value = field.value ?? '';
        generateTextFieldAppearance(ctx, field.dict, value);
        break;
      }
      case 'Btn': {
        // Check if this is a checkbox (not radio or pushbutton)
        const flags = field.flags;
        const isRadio = (flags & (1 << 25)) !== 0;
        const isPushbutton = (flags & (1 << 24)) !== 0;
        if (!isRadio && !isPushbutton) {
          const checked = field.value === 'Yes';
          generateCheckBoxAppearance(ctx, field.dict, checked);
        }
        break;
      }
      case 'Ch': {
        const value = field.value ?? '';
        generateDropdownAppearance(ctx, field.dict, value);
        break;
      }
      // Sig fields don't need appearance generation here
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBboxArray(x1: number, y1: number, x2: number, y2: number): COSArray {
  const arr = new COSArray();
  arr.setDirect(true);
  arr.add(Number.isInteger(x1) ? new COSInteger(x1) : new COSFloat(x1));
  arr.add(Number.isInteger(y1) ? new COSInteger(y1) : new COSFloat(y1));
  arr.add(Number.isInteger(x2) ? new COSInteger(x2) : new COSFloat(x2));
  arr.add(Number.isInteger(y2) ? new COSInteger(y2) : new COSFloat(y2));
  return arr;
}

function formatNum(n: number): string {
  // Round to avoid floating point noise
  const rounded = Math.round(n * 1000) / 1000;
  return String(rounded);
}

/**
 * Encode text to hex for PDF content stream showText operator.
 * Uses WinAnsiEncoding for standard fonts.
 */
function encodeTextForStream(text: string, baseFontName: string): string {
  try {
    const encoding = encodingForFont(baseFontName);
    return encodeTextToHex(text, encoding);
  } catch {
    // Fallback: simple hex encoding for ASCII
    let hex = '';
    for (let i = 0; i < text.length; i++) {
      hex += text.charCodeAt(i).toString(16).toUpperCase().padStart(2, '0');
    }
    return hex;
  }
}

/**
 * Compute the X position for text alignment within a field.
 */
function computeAlignmentX(
  text: string,
  alignment: number,
  fieldWidth: number,
  fontSize: number,
  baseFontName: string,
): number {
  if (alignment === 0) return 2; // left: 2pt padding

  let textWidth = 0;
  try {
    const metrics = StandardFontMetrics.load(baseFontName);
    const encoding = encodingForFont(baseFontName);
    textWidth = metrics.widthOfTextAtSize(text, fontSize, encoding);
  } catch {
    // Rough estimate: 0.5 * fontSize per character
    textWidth = text.length * fontSize * 0.5;
  }

  if (alignment === 1) {
    // Center
    return Math.max(2, (fieldWidth - textWidth) / 2);
  }
  if (alignment === 2) {
    // Right
    return Math.max(2, fieldWidth - textWidth - 2);
  }

  return 2;
}

/**
 * Ensure ZapfDingbats font exists in AcroForm /DR.
 */
function ensureZapfDingbatsInDR(
  ctx: NativeDocumentContext,
): { fontKey: string; fontRef: COSObjectReference } {
  const drDict = ctx.ensureDefaultResources();
  let fontDict = drDict.getItem('Font');
  if (fontDict instanceof COSObjectReference) {
    fontDict = ctx.resolveRef(fontDict);
    if (fontDict) drDict.setItem('Font', fontDict);
  }
  if (!(fontDict instanceof COSDictionary)) {
    fontDict = new COSDictionary();
    (fontDict as COSDictionary).setDirect(true);
    drDict.setItem('Font', fontDict);
  }

  const key = 'ZaDb';
  const existing = (fontDict as COSDictionary).getItem(key);
  if (existing instanceof COSObjectReference) {
    return { fontKey: key, fontRef: existing };
  }

  const fontRef = ctx.embedStandardFont('ZapfDingbats');
  (fontDict as COSDictionary).setItem(key, fontRef);
  return { fontKey: key, fontRef };
}
