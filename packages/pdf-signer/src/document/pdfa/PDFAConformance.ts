/**
 * PDFAConformance — applies PDF/A compliance to a NativeDocumentContext.
 *
 * Supports:
 *   - PDF/A-1b (ISO 19005-1, Level B — visual appearance)
 *   - PDF/A-2b (ISO 19005-2, Level B — visual appearance)
 *   - PDF/A-3b (ISO 19005-3, Level B — visual appearance)
 *
 * When applied, this module:
 *   1. Adds /Metadata stream with XMP (including pdfaid namespace)
 *   2. Adds /OutputIntents array with sRGB ICC profile
 *   3. Ensures /Info dict is consistent with XMP
 *   4. Sets PDF version header appropriately (1.4 for PDF/A-1b, 1.7 for PDF/A-2b+)
 */

import { NativeDocumentContext } from '../NativeDocumentContext.js';
import {
  COSName,
  COSInteger,
  COSArray,
  COSDictionary,
  COSStream,
  COSString,
} from '../../pdfbox/cos/COSTypes.js';
import { generateXMPMetadata } from './XMPMetadata.js';
import { buildSRGBICCProfile } from './ICCProfile.js';

/** Supported PDF/A conformance levels. */
export type PDFALevel = 'PDF/A-1b' | 'PDF/A-2b' | 'PDF/A-3b';

/**
 * Apply PDF/A conformance to a NativeDocumentContext.
 *
 * This modifies the catalog to include the required /Metadata and
 * /OutputIntents entries. Should be called right before serialization.
 *
 * @param ctx The document context to modify.
 * @param level The PDF/A conformance level ('PDF/A-1b', 'PDF/A-2b', or 'PDF/A-3b').
 */
export function applyPDFAConformance(
  ctx: NativeDocumentContext,
  level: PDFALevel,
): void {
  const { part, conformance, pdfVersion } = parsePDFALevel(level);

  // 1. Set PDF version
  ctx.setVersion(pdfVersion);

  // 2. Gather document metadata from the info dict
  const title = ctx.getInfoString('Title');
  const author = ctx.getInfoString('Author');
  const subject = ctx.getInfoString('Subject');
  const keywords = ctx.getInfoString('Keywords');
  const creator = ctx.getInfoString('Creator');
  const producer = ctx.getInfoString('Producer');
  const createDate = ctx.getInfoDate('CreationDate');
  const modifyDate = ctx.getInfoDate('ModDate');

  // 3. Generate XMP metadata
  const xmpXml = generateXMPMetadata({
    part,
    conformance,
    title,
    author,
    subject,
    keywords,
    creator,
    producer,
    createDate,
    modifyDate,
  });

  // 4. Create /Metadata stream on catalog
  const xmpBytes = new TextEncoder().encode(xmpXml);
  const metadataStream = new COSStream();
  metadataStream.setItem('Type', new COSName('Metadata'));
  metadataStream.setItem('Subtype', new COSName('XML'));
  // XMP metadata must NOT be compressed (PDF/A requirement)
  // COSStream.setData sets /Length automatically; we do NOT add /Filter
  metadataStream.setData(xmpBytes);

  const metadataRef = ctx.register(metadataStream);
  ctx.catalog.setItem('Metadata', metadataRef);

  // 5. Create /OutputIntents array with sRGB ICC profile
  addOutputIntents(ctx);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parsePDFALevel(level: PDFALevel): {
  part: number;
  conformance: string;
  pdfVersion: string;
} {
  switch (level) {
    case 'PDF/A-1b':
      return { part: 1, conformance: 'B', pdfVersion: '1.4' };
    case 'PDF/A-2b':
      return { part: 2, conformance: 'B', pdfVersion: '1.7' };
    case 'PDF/A-3b':
      return { part: 3, conformance: 'B', pdfVersion: '1.7' };
    default:
      throw new Error(`Unsupported PDF/A level: ${level}`);
  }
}

/**
 * Add /OutputIntents with an sRGB ICC profile to the catalog.
 *
 * Structure:
 *   /OutputIntents [ <<
 *     /Type /OutputIntent
 *     /S /GTS_PDFA1
 *     /OutputConditionIdentifier (sRGB IEC61966-2.1)
 *     /RegistryName (http://www.color.org)
 *     /Info (sRGB IEC61966-2.1)
 *     /DestOutputProfile <ICC stream ref>
 *   >> ]
 */
function addOutputIntents(ctx: NativeDocumentContext): void {
  // Build the ICC profile stream
  const iccData = buildSRGBICCProfile();
  const iccStream = new COSStream();
  // /N 3 — number of color components (RGB = 3)
  iccStream.setItem('N', new COSInteger(3));
  iccStream.setData(iccData);
  const iccRef = ctx.register(iccStream);

  // Build the OutputIntent dictionary
  const outputIntent = new COSDictionary();
  outputIntent.setItem('Type', new COSName('OutputIntent'));
  outputIntent.setItem('S', new COSName('GTS_PDFA1'));
  outputIntent.setItem(
    'OutputConditionIdentifier',
    new COSString('sRGB IEC61966-2.1'),
  );
  outputIntent.setItem(
    'RegistryName',
    new COSString('http://www.color.org'),
  );
  outputIntent.setItem(
    'Info',
    new COSString('sRGB IEC61966-2.1'),
  );
  outputIntent.setItem('DestOutputProfile', iccRef);

  const outputIntentRef = ctx.register(outputIntent);

  // Add /OutputIntents array to catalog
  const outputIntents = new COSArray();
  outputIntents.add(outputIntentRef);
  ctx.catalog.setItem('OutputIntents', outputIntents);
}
