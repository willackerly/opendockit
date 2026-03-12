/**
 * PDF/A-3 file attachment embedding.
 *
 * Adds an embedded file to a PDFDocument following the PDF/A-3 spec:
 *  - /EmbeddedFile stream with /Type, /Subtype, /Params
 *  - /Filespec dictionary with /F, /UF, /EF, /AFRelationship
 *  - Catalog /Names -> /EmbeddedFiles name tree
 *  - Catalog /AF array
 *
 * This enables lossless round-trip: embed the original PPTX (or any file)
 * inside the exported PDF so the source document is never lost.
 */

import type { PDFDocument } from '../document/PDFDocument.js';
import {
  COSName,
  COSInteger,
  COSString,
  COSDictionary,
  COSStream,
  COSArray,
} from '../pdfbox/cos/COSTypes.js';

/**
 * Embed a file attachment into a PDFDocument with PDF/A-3 compliant structure.
 *
 * @param doc - The PDFDocument to embed into
 * @param filename - The filename for the attachment (e.g. "presentation.pptx")
 * @param data - The raw file bytes to embed
 * @param mimeType - MIME type string (e.g. "application/vnd.openxmlformats-officedocument.presentationml.presentation")
 */
export function embedFileAttachment(
  doc: PDFDocument,
  filename: string,
  data: Uint8Array,
  mimeType: string,
): void {
  const ctx = doc._nativeCtx;

  // 1. Create the /EmbeddedFile stream
  const efStream = new COSStream();
  efStream.setItem('Type', new COSName('EmbeddedFile'));
  efStream.setItem('Subtype', mimeTypeToSubtype(mimeType));
  efStream.setData(data);
  // /Params dictionary with /Size
  const params = new COSDictionary();
  params.setDirect(true);
  params.setItem('Size', new COSInteger(data.length));
  efStream.setItem('Params', params);

  const efRef = ctx.register(efStream);

  // 2. Create the /Filespec dictionary
  const filespec = new COSDictionary();
  filespec.setItem('Type', new COSName('Filespec'));
  filespec.setItem('F', new COSString(filename));
  filespec.setItem('UF', encodeUtf16Be(filename));
  // /EF dictionary pointing to the embedded file stream
  const efDict = new COSDictionary();
  efDict.setDirect(true);
  efDict.setItem('F', efRef);
  efDict.setItem('UF', efRef);
  filespec.setItem('EF', efDict);
  // PDF/A-3 requires /AFRelationship
  filespec.setItem('AFRelationship', new COSName('Source'));

  const filespecRef = ctx.register(filespec);

  // 3. Add to catalog /Names -> /EmbeddedFiles name tree
  const catalog = ctx.catalog;

  let namesDict = catalog.getItem('Names');
  if (!namesDict || !(namesDict instanceof COSDictionary)) {
    namesDict = new COSDictionary();
    (namesDict as COSDictionary).setDirect(true);
    catalog.setItem('Names', namesDict);
  }

  const nameTree = namesDict as COSDictionary;
  let embeddedFilesDict = nameTree.getItem('EmbeddedFiles');
  if (!embeddedFilesDict || !(embeddedFilesDict instanceof COSDictionary)) {
    embeddedFilesDict = new COSDictionary();
    (embeddedFilesDict as COSDictionary).setDirect(true);
    nameTree.setItem('EmbeddedFiles', embeddedFilesDict);
  }

  const efNamesDict = embeddedFilesDict as COSDictionary;
  let namesArray = efNamesDict.getItem('Names');
  if (!namesArray || !(namesArray instanceof COSArray)) {
    namesArray = new COSArray();
    (namesArray as COSArray).setDirect(true);
    efNamesDict.setItem('Names', namesArray);
  }

  // Name tree entries are pairs: [name, ref, name, ref, ...]
  const arr = namesArray as COSArray;
  arr.add(new COSString(filename));
  arr.add(filespecRef);

  // 4. Add to catalog /AF array (PDF/A-3 requirement)
  let afArray = catalog.getItem('AF');
  if (!afArray || !(afArray instanceof COSArray)) {
    afArray = new COSArray();
    catalog.setItem('AF', afArray);
  }
  (afArray as COSArray).add(filespecRef);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a MIME type to a PDF /Subtype name.
 * PDF spec uses MIME-style subtype names for /EmbeddedFile streams.
 */
function mimeTypeToSubtype(mimeType: string): COSName {
  // PDF /Subtype for embedded files uses the MIME type with "/" replaced by "#2F"
  // or can use a registered subtype. Common approach: use the full MIME type.
  return new COSName(mimeType.replace('/', '#2F'));
}

/**
 * Encode a filename as a UTF-16BE COSString with BOM for the /UF entry.
 * PDF spec requires /UF to be a text string (UTF-16BE with BOM or UTF-8 with BOM in PDF 2.0).
 */
function encodeUtf16Be(str: string): COSString {
  // BOM (0xFE 0xFF) + UTF-16BE encoded characters
  const bytes = new Uint8Array(2 + str.length * 2);
  bytes[0] = 0xfe;
  bytes[1] = 0xff;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    bytes[2 + i * 2] = (code >> 8) & 0xff;
    bytes[2 + i * 2 + 1] = code & 0xff;
  }
  return new COSString(bytes);
}
