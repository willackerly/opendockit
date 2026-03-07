/**
 * SecurityHandler — parse /Encrypt dictionary and detect cipher type.
 *
 * Only AES-128 (V=4, R=4, CFM=AESV2) and AES-256 (V=5, R=5/6) are supported.
 * RC4 and other legacy ciphers throw a descriptive error.
 */

import {
  COSDictionary,
  COSName,
  COSInteger,
  COSString,
  COSBoolean,
} from '../cos/COSTypes';

export interface EncryptionDict {
  filter: string;         // 'Standard'
  subFilter?: string;
  version: number;        // V value (1=RC4-40, 2=RC4>40, 3=unpublished, 4=AES-128/RC4-128, 5=AES-256)
  revision: number;       // R value (2=RC4-40, 3=RC4-128, 4=AES-128, 5=AES-256, 6=AES-256-r6)
  length: number;         // key length in bits
  ownerHash: Uint8Array;  // /O (32 or 48 bytes)
  userHash: Uint8Array;   // /U (32 or 48 bytes)
  permissions: number;    // /P (signed 32-bit int)
  encryptMetadata: boolean; // /EncryptMetadata (default true)
  // Rev 5/6 only:
  ownerEncryptionKey?: Uint8Array; // /OE (32 bytes)
  userEncryptionKey?: Uint8Array;  // /UE (32 bytes)
  perms?: Uint8Array;     // /Perms (16 bytes)
  // Crypt filter info
  stmF?: string;  // /StmF stream filter name
  strF?: string;  // /StrF string filter name
  cfDict?: Record<string, { cfm: string; length?: number }>; // /CF dict
}

/**
 * Parse an /Encrypt dictionary into a structured EncryptionDict.
 */
export function parseEncryptionDict(
  encryptObj: COSDictionary,
  _documentId?: Uint8Array,
): EncryptionDict {
  const filter = getNameValue(encryptObj, 'Filter') ?? 'Standard';
  const subFilter = getNameValue(encryptObj, 'SubFilter');
  const version = encryptObj.getInt('V', 0);
  const revision = encryptObj.getInt('R', 0);
  const length = encryptObj.getInt('Length', version === 1 ? 40 : 128);

  const ownerHash = getStringBytes(encryptObj, 'O');
  const userHash = getStringBytes(encryptObj, 'U');

  if (!ownerHash || !userHash) {
    throw new Error('Encrypted PDF missing /O or /U entries in /Encrypt dictionary');
  }

  const pValue = encryptObj.getItem('P');
  const permissions = pValue instanceof COSInteger
    ? toSigned32(pValue.getValue())
    : -1;

  // /EncryptMetadata defaults to true per spec
  const emEntry = encryptObj.getItem('EncryptMetadata');
  const encryptMetadata = emEntry instanceof COSBoolean ? emEntry.getValue() : true;

  // Rev 5/6 fields
  const ownerEncryptionKey = getStringBytes(encryptObj, 'OE');
  const userEncryptionKey = getStringBytes(encryptObj, 'UE');
  const perms = getStringBytes(encryptObj, 'Perms');

  // Crypt filter names
  const stmF = getNameValue(encryptObj, 'StmF');
  const strF = getNameValue(encryptObj, 'StrF');

  // Parse /CF dictionary
  let cfDict: Record<string, { cfm: string; length?: number }> | undefined;
  const cfEntry = encryptObj.getItem('CF');
  if (cfEntry instanceof COSDictionary) {
    cfDict = {};
    for (const [key, val] of cfEntry.entrySet()) {
      if (val instanceof COSDictionary) {
        const cfm = getNameValue(val, 'CFM') ?? 'None';
        const cfLength = val.getInt('Length', 0);
        cfDict[key.getName()] = { cfm, length: cfLength || undefined };
      }
    }
  }

  return {
    filter,
    subFilter,
    version,
    revision,
    length,
    ownerHash,
    userHash,
    permissions,
    encryptMetadata,
    ownerEncryptionKey,
    userEncryptionKey,
    perms,
    stmF,
    strF,
    cfDict,
  };
}

/**
 * Get a human-readable description of the encryption type.
 */
export function getEncryptionDescription(dict: EncryptionDict): string {
  if (dict.version === 1 && dict.revision === 2) {
    return 'RC4-40 (V=1, R=2)';
  }
  if (dict.version === 2 && dict.revision === 3) {
    return `RC4-${dict.length} (V=2, R=3)`;
  }
  if (dict.version === 4 && dict.revision === 4) {
    // Check crypt filter to distinguish AES-128 from RC4-128
    const cfm = resolveCFM(dict);
    if (cfm === 'AESV2') {
      return 'AES-128 (V=4, R=4, CFM=AESV2)';
    }
    return `RC4-128 (V=4, R=4, CFM=${cfm})`;
  }
  if (dict.version === 5) {
    if (dict.revision === 6) {
      return 'AES-256 (V=5, R=6)';
    }
    return `AES-256 (V=5, R=${dict.revision})`;
  }
  return `Unknown (V=${dict.version}, R=${dict.revision})`;
}

/**
 * Validate the encryption type and throw for unsupported ciphers.
 * Returns 128 or 256 for the AES key length if supported.
 */
export function validateEncryption(dict: EncryptionDict): 128 | 256 {
  // V=1, R=2 → RC4-40
  if (dict.version === 1) {
    throw new Error(
      `Unsupported encryption: this PDF uses RC4-40 (Security Handler V=${dict.version}, R=${dict.revision}). ` +
      `pdfbox-ts only supports AES-128 and AES-256 encryption.`,
    );
  }

  // V=2, R=3 → RC4-128
  if (dict.version === 2) {
    throw new Error(
      `Unsupported encryption: this PDF uses RC4-${dict.length} (Security Handler V=${dict.version}, R=${dict.revision}). ` +
      `pdfbox-ts only supports AES-128 and AES-256 encryption.`,
    );
  }

  // V=3 → unpublished
  if (dict.version === 3) {
    throw new Error(
      `Unsupported encryption: this PDF uses an unpublished algorithm (Security Handler V=3, R=${dict.revision}). ` +
      `pdfbox-ts only supports AES-128 and AES-256 encryption.`,
    );
  }

  // V=4, R=4 → check crypt filter for AESV2 vs V2
  if (dict.version === 4) {
    const cfm = resolveCFM(dict);
    if (cfm === 'AESV2') {
      return 128;
    }
    throw new Error(
      `Unsupported encryption: this PDF uses RC4-128 (Security Handler V=4, R=${dict.revision}, CFM=${cfm}). ` +
      `pdfbox-ts only supports AES-128 and AES-256 encryption.`,
    );
  }

  // V=5, R=5 or R=6 → AES-256
  if (dict.version === 5) {
    if (dict.revision === 5 || dict.revision === 6) {
      return 256;
    }
    throw new Error(
      `Unsupported encryption: unknown revision R=${dict.revision} for V=5. ` +
      `pdfbox-ts only supports AES-256 R=5/R=6.`,
    );
  }

  throw new Error(
    `Unsupported encryption: unknown Security Handler V=${dict.version}, R=${dict.revision}. ` +
    `pdfbox-ts only supports AES-128 (V=4, R=4) and AES-256 (V=5, R=5/6).`,
  );
}

/**
 * Resolve the Crypt Filter Method from /StmF or /CF.
 */
function resolveCFM(dict: EncryptionDict): string {
  // Check /StmF for the filter name, then look up in /CF
  const filterName = dict.stmF ?? 'StdCF';
  if (dict.cfDict && dict.cfDict[filterName]) {
    return dict.cfDict[filterName].cfm;
  }
  // Default: if no /CF at all, it's V2 (RC4)
  return 'V2';
}

// ── Helpers ──

function getNameValue(dict: COSDictionary, key: string): string | undefined {
  const val = dict.getItem(key);
  if (val instanceof COSName) return val.getName();
  return undefined;
}

function getStringBytes(dict: COSDictionary, key: string): Uint8Array | undefined {
  const val = dict.getItem(key);
  if (val instanceof COSString) return val.getBytes();
  return undefined;
}

/** Convert an unsigned 32-bit value to signed 32-bit. */
function toSigned32(n: number): number {
  return n | 0;
}
