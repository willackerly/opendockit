/**
 * NativePDFWriter — serialize a NativeDocumentContext to valid PDF bytes.
 *
 * Uses the existing COSWriter (visitor pattern) for object serialization
 * and XRefWriter for cross-reference table generation.
 *
 * Output structure:
 *   %PDF-1.7
 *   %<binary>
 *   1 0 obj ... endobj
 *   2 0 obj ... endobj
 *   ...
 *   xref
 *   0 N
 *   0000000000 65535 f\r\n
 *   0000000015 00000 n\r\n
 *   ...
 *   trailer
 *   << /Size N /Root 1 0 R [/Info M 0 R] >>
 *   startxref
 *   OFFSET
 *   %%EOF
 */

import { COSWriter } from '../pdfbox/writer/COSWriter.js';
import { COSStandardOutputStream } from '../pdfbox/writer/COSStandardOutputStream.js';
import { writeXrefTable, writeTrailer } from '../pdfbox/writer/XRefWriter.js';
import { XRefEntryType, type TableXRefEntry } from '../pdfbox/writer/XRefEntries.js';
import type { NativeDocumentContext } from './NativeDocumentContext.js';
import type { COSBase } from '../pdfbox/cos/COSBase.js';
import { COSStream, COSString, COSDictionary, COSArray } from '../pdfbox/cos/COSTypes.js';
import { PDFEncryptor, type EncryptOptions } from '../pdfbox/crypto/PDFEncryptor.js';
import forge from 'node-forge';

export interface NativePDFWriterOptions {
  useObjectStreams?: boolean;
}

export class NativePDFWriter {
  /**
   * Serialize a NativeDocumentContext to a complete, valid PDF file.
   */
  static write(ctx: NativeDocumentContext, _options?: NativePDFWriterOptions): Uint8Array {
    const output = new COSStandardOutputStream();
    const writer = new COSWriter(output);

    // 1. Header — use the original PDF version if loaded, otherwise 1.7
    writer.writeHeader(ctx.version);

    // 2. Write all indirect objects, collect xref entries
    const xrefEntries: TableXRefEntry[] = [];

    // Free head entry (object 0)
    xrefEntries.push({
      objectNumber: 0,
      byteOffset: 0,
      generation: 65535,
      inUse: false,
      type: XRefEntryType.FREE,
    });

    for (const [objNum, obj] of ctx.enumerateObjects()) {
      let offset: number;
      try {
        offset = writer.writeIndirectObject(objNum, obj, 0);
      } catch {
        // COSWriter deduplication can reject repeated singleton instances
        // (e.g. multiple xref gap-fillers using COSNull.NULL).
        // Write them directly to the output stream as a fallback.
        offset = output.getPos();
        output.writeString(`${objNum} 0 obj`);
        output.writeEOL();
        obj.accept(writer);
        output.writeEOL();
        output.writeString('endobj');
        output.writeEOL();
      }
      xrefEntries.push({
        objectNumber: objNum,
        byteOffset: offset,
        generation: 0,
        inUse: true,
        type: XRefEntryType.NORMAL,
      });
    }

    // 3. Write xref table
    const xrefStart = output.getPos();
    writeXrefTable(output, xrefEntries, { incremental: false });

    // 4. Build trailer dict string
    let trailerStr = `<< /Size ${ctx.objectCount} /Root ${ctx.catalogRef.toReferenceString()}`;
    if (ctx.infoRef) {
      trailerStr += ` /Info ${ctx.infoRef.toReferenceString()}`;
    }
    trailerStr += ' >>';

    // 5. Write trailer + startxref + %%EOF
    writeTrailer(output, trailerStr, xrefStart);

    // Strip trailing newline after %%EOF to match pdf-lib behavior.
    // The IncrementalWriteContext expects files to NOT end with \n so it can
    // add its own \r\n separator before the incremental update.
    const bytes = output.toUint8Array();
    if (bytes.length > 0 && bytes[bytes.length - 1] === 0x0a) {
      return bytes.subarray(0, bytes.length - 1);
    }
    return bytes;
  }

  /**
   * Serialize with encryption. Encrypts all strings and streams, adds /Encrypt dict and /ID.
   */
  static writeEncrypted(
    ctx: NativeDocumentContext,
    encryptOpts: EncryptOptions,
    _options?: NativePDFWriterOptions,
  ): Uint8Array {
    // Generate document ID
    const documentId = generateDocumentId();

    // Create encryptor and /Encrypt dictionary
    const { encryptor, encryptDict } = PDFEncryptor.create(encryptOpts, documentId);

    // Register the /Encrypt dictionary as an indirect object
    const encryptRef = ctx.register(encryptDict);

    const output = new COSStandardOutputStream();
    const writer = new COSWriter(output);

    writer.writeHeader(ctx.version);

    const xrefEntries: TableXRefEntry[] = [];
    xrefEntries.push({
      objectNumber: 0,
      byteOffset: 0,
      generation: 65535,
      inUse: false,
      type: XRefEntryType.FREE,
    });

    // Write all objects, encrypting strings and streams
    for (const [objNum, obj] of ctx.enumerateObjects()) {
      // Don't encrypt the /Encrypt dict itself
      const isEncryptDict = objNum === encryptRef.objectNumber;

      let objToWrite: COSBase;
      if (isEncryptDict) {
        objToWrite = obj;
      } else {
        objToWrite = encryptObject(obj, encryptor, objNum, 0);
      }

      let offset: number;
      try {
        offset = writer.writeIndirectObject(objNum, objToWrite, 0);
      } catch {
        offset = output.getPos();
        output.writeString(`${objNum} 0 obj`);
        output.writeEOL();
        objToWrite.accept(writer);
        output.writeEOL();
        output.writeString('endobj');
        output.writeEOL();
      }
      xrefEntries.push({
        objectNumber: objNum,
        byteOffset: offset,
        generation: 0,
        inUse: true,
        type: XRefEntryType.NORMAL,
      });
    }

    // Write xref table
    const xrefStart = output.getPos();
    writeXrefTable(output, xrefEntries, { incremental: false });

    // Build /ID array
    const idHex = bytesToHex(documentId);
    const idStr = `[<${idHex}> <${idHex}>]`;

    // Build trailer with /Encrypt and /ID
    let trailerStr = `<< /Size ${ctx.objectCount} /Root ${ctx.catalogRef.toReferenceString()}`;
    if (ctx.infoRef) {
      trailerStr += ` /Info ${ctx.infoRef.toReferenceString()}`;
    }
    trailerStr += ` /Encrypt ${encryptRef.toReferenceString()}`;
    trailerStr += ` /ID ${idStr}`;
    trailerStr += ' >>';

    writeTrailer(output, trailerStr, xrefStart);

    const bytes = output.toUint8Array();
    if (bytes.length > 0 && bytes[bytes.length - 1] === 0x0a) {
      return bytes.subarray(0, bytes.length - 1);
    }
    return bytes;
  }
}

// ---------------------------------------------------------------------------
// Encryption helpers
// ---------------------------------------------------------------------------

/**
 * Deep-clone a COS object, encrypting strings and streams.
 * We clone because we don't want to modify the in-memory document objects.
 */
function encryptObject(
  obj: COSBase,
  encryptor: PDFEncryptor,
  objNum: number,
  genNum: number,
): COSBase {
  if (obj instanceof COSStream) {
    // Clone stream: encrypt data and string values in dict
    const cloned = new COSStream();
    const dict = obj.getDictionary();
    for (const [key, value] of dict.entrySet()) {
      if (value instanceof COSString) {
        const encrypted = encryptor.encryptString(value.getBytes(), objNum, genNum);
        cloned.setItem(key, new COSString(encrypted, value.shouldUseHex()));
      } else {
        cloned.setItem(key, value);
      }
    }
    // Encrypt stream data
    const data = obj.getData();
    if (data.length > 0) {
      const encrypted = encryptor.encryptStream(data, objNum, genNum);
      // Override the Length in the dictionary to match encrypted data
      cloned.setData(encrypted);
    } else {
      cloned.setData(data);
    }
    return cloned;
  }

  if (obj instanceof COSDictionary) {
    return encryptDict(obj, encryptor, objNum, genNum);
  }

  if (obj instanceof COSArray) {
    return encryptArray(obj, encryptor, objNum, genNum);
  }

  if (obj instanceof COSString) {
    const encrypted = encryptor.encryptString(obj.getBytes(), objNum, genNum);
    return new COSString(encrypted, obj.shouldUseHex());
  }

  // All other types (COSName, COSInteger, COSFloat, etc.) pass through
  return obj;
}

function encryptDict(
  dict: COSDictionary,
  encryptor: PDFEncryptor,
  objNum: number,
  genNum: number,
): COSDictionary {
  const cloned = new COSDictionary();
  cloned.setDirect(dict.isDirect());
  for (const [key, value] of dict.entrySet()) {
    if (value instanceof COSString) {
      const encrypted = encryptor.encryptString(value.getBytes(), objNum, genNum);
      cloned.setItem(key, new COSString(encrypted, value.shouldUseHex()));
    } else if (value instanceof COSDictionary) {
      cloned.setItem(key, encryptDict(value, encryptor, objNum, genNum));
    } else if (value instanceof COSArray) {
      cloned.setItem(key, encryptArray(value, encryptor, objNum, genNum));
    } else {
      cloned.setItem(key, value);
    }
  }
  return cloned;
}

function encryptArray(
  arr: COSArray,
  encryptor: PDFEncryptor,
  objNum: number,
  genNum: number,
): COSArray {
  const cloned = new COSArray();
  cloned.setDirect(arr.isDirect());
  for (let i = 0; i < arr.size(); i++) {
    const elem = arr.get(i)!;
    if (elem instanceof COSString) {
      const encrypted = encryptor.encryptString(elem.getBytes(), objNum, genNum);
      cloned.add(new COSString(encrypted, elem.shouldUseHex()));
    } else if (elem instanceof COSDictionary) {
      cloned.add(encryptDict(elem, encryptor, objNum, genNum));
    } else if (elem instanceof COSArray) {
      cloned.add(encryptArray(elem, encryptor, objNum, genNum));
    } else {
      cloned.add(elem);
    }
  }
  return cloned;
}

function generateDocumentId(): Uint8Array {
  const bytes = forge.random.getBytesSync(16);
  const result = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    result[i] = bytes.charCodeAt(i);
  }
  return result;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0').toUpperCase();
  }
  return hex;
}
