/**
 * PDFEncryptor — encrypt strings and streams during PDF save.
 *
 * Creates encryption dictionaries and encrypts content for AES-128 or AES-256.
 */

import forge from 'node-forge';
import {
  COSDictionary,
  COSName,
  COSInteger,
  COSString,
} from '../cos/COSTypes';
import { encryptAESStream, encryptAESString } from './AESCipher';
import { generateEncryptionArtifacts } from './KeyDerivation';

export interface PDFPermissions {
  print?: boolean;                    // bit 3
  modify?: boolean;                   // bit 4
  copy?: boolean;                     // bit 5
  annotate?: boolean;                 // bit 6
  fillForms?: boolean;                // bit 9
  extractForAccessibility?: boolean;  // bit 10
  assemble?: boolean;                 // bit 11
  printHighQuality?: boolean;         // bit 12
}

export interface EncryptOptions {
  userPassword?: string;    // empty = no password to open
  ownerPassword: string;    // required
  permissions?: PDFPermissions;
  keyLength?: 128 | 256;   // default 256
}

/**
 * Compute the /P permission flags from human-readable permissions.
 */
export function computePermissions(perms?: PDFPermissions): number {
  // Start with required bits: bits 7-8 must be 1, bits 13-32 must be 1 (per spec)
  let p = 0xFFFFF000 | 0xC0; // bits 7-8 and 13-32 set

  if (!perms) {
    // Default: all permissions granted
    return p | 0xF3C;
  }

  if (perms.print !== false)                    p |= (1 << 2);  // bit 3
  if (perms.modify !== false)                   p |= (1 << 3);  // bit 4
  if (perms.copy !== false)                     p |= (1 << 4);  // bit 5
  if (perms.annotate !== false)                 p |= (1 << 5);  // bit 6
  if (perms.fillForms !== false)                p |= (1 << 8);  // bit 9
  if (perms.extractForAccessibility !== false)  p |= (1 << 9);  // bit 10
  if (perms.assemble !== false)                 p |= (1 << 10); // bit 11
  if (perms.printHighQuality !== false)         p |= (1 << 11); // bit 12

  return p | 0;  // Force to signed 32-bit integer
}

/**
 * Parse /P permission flags back to human-readable permissions.
 */
export function parsePermissions(p: number): PDFPermissions {
  return {
    print: !!(p & (1 << 2)),
    modify: !!(p & (1 << 3)),
    copy: !!(p & (1 << 4)),
    annotate: !!(p & (1 << 5)),
    fillForms: !!(p & (1 << 8)),
    extractForAccessibility: !!(p & (1 << 9)),
    assemble: !!(p & (1 << 10)),
    printHighQuality: !!(p & (1 << 11)),
  };
}

export class PDFEncryptor {
  private readonly fileEncryptionKey: Uint8Array;
  private readonly keyLengthBits: 128 | 256;

  private constructor(fileEncryptionKey: Uint8Array, keyLengthBits: 128 | 256) {
    this.fileEncryptionKey = fileEncryptionKey;
    this.keyLengthBits = keyLengthBits;
  }

  /**
   * Create an encryptor + encryption dictionary for a new encrypted PDF.
   */
  static create(
    options: EncryptOptions,
    documentId: Uint8Array,
  ): { encryptor: PDFEncryptor; encryptDict: COSDictionary } {
    const keyLength = options.keyLength ?? 256;
    const userPassword = options.userPassword ?? '';
    const ownerPassword = options.ownerPassword;
    const permissions = computePermissions(options.permissions);

    const artifacts = generateEncryptionArtifacts(
      userPassword,
      ownerPassword,
      permissions,
      keyLength,
      documentId,
    );

    // Build /Encrypt dictionary
    const dict = new COSDictionary();
    dict.setItem('Filter', new COSName('Standard'));

    if (keyLength === 128) {
      dict.setItem('V', new COSInteger(4));
      dict.setItem('R', new COSInteger(4));
      dict.setItem('Length', new COSInteger(128));

      // Crypt filter for AES-128
      const stdCF = new COSDictionary();
      stdCF.setDirect(true);
      stdCF.setItem('CFM', new COSName('AESV2'));
      stdCF.setItem('AuthEvent', new COSName('DocOpen'));
      stdCF.setItem('Length', new COSInteger(16));

      const cf = new COSDictionary();
      cf.setDirect(true);
      cf.setItem('StdCF', stdCF);

      dict.setItem('CF', cf);
      dict.setItem('StmF', new COSName('StdCF'));
      dict.setItem('StrF', new COSName('StdCF'));
    } else {
      // AES-256
      dict.setItem('V', new COSInteger(5));
      dict.setItem('R', new COSInteger(6));
      dict.setItem('Length', new COSInteger(256));

      // Crypt filter for AES-256
      const stdCF = new COSDictionary();
      stdCF.setDirect(true);
      stdCF.setItem('CFM', new COSName('AESV3'));
      stdCF.setItem('AuthEvent', new COSName('DocOpen'));
      stdCF.setItem('Length', new COSInteger(32));

      const cf = new COSDictionary();
      cf.setDirect(true);
      cf.setItem('StdCF', stdCF);

      dict.setItem('CF', cf);
      dict.setItem('StmF', new COSName('StdCF'));
      dict.setItem('StrF', new COSName('StdCF'));
    }

    dict.setItem('O', new COSString(artifacts.ownerHash, true));
    dict.setItem('U', new COSString(artifacts.userHash, true));
    dict.setItem('P', new COSInteger(permissions));

    if (artifacts.ownerEncryptionKey) {
      dict.setItem('OE', new COSString(artifacts.ownerEncryptionKey, true));
    }
    if (artifacts.userEncryptionKey) {
      dict.setItem('UE', new COSString(artifacts.userEncryptionKey, true));
    }
    if (artifacts.perms) {
      dict.setItem('Perms', new COSString(artifacts.perms, true));
    }

    const encryptor = new PDFEncryptor(artifacts.fileEncryptionKey, keyLength);
    return { encryptor, encryptDict: dict };
  }

  /**
   * Encrypt a string value for a specific object.
   */
  encryptString(data: Uint8Array, objectNumber: number, generationNumber: number): Uint8Array {
    if (data.length === 0) return data;
    const key = this.computeObjectKey(objectNumber, generationNumber);
    return encryptAESString(key, data);
  }

  /**
   * Encrypt a stream for a specific object.
   */
  encryptStream(data: Uint8Array, objectNumber: number, generationNumber: number): Uint8Array {
    if (data.length === 0) return data;
    const key = this.computeObjectKey(objectNumber, generationNumber);
    return encryptAESStream(key, data);
  }

  /**
   * Compute per-object key (same algorithm as PDFDecryptor).
   */
  private computeObjectKey(objectNumber: number, generationNumber: number): Uint8Array {
    if (this.keyLengthBits === 256) {
      return this.fileEncryptionKey;
    }

    // AES-128: Algorithm 1a
    const data = new Uint8Array(this.fileEncryptionKey.length + 5 + 4);
    data.set(this.fileEncryptionKey, 0);
    let offset = this.fileEncryptionKey.length;

    data[offset++] = objectNumber & 0xFF;
    data[offset++] = (objectNumber >> 8) & 0xFF;
    data[offset++] = (objectNumber >> 16) & 0xFF;
    data[offset++] = generationNumber & 0xFF;
    data[offset++] = (generationNumber >> 8) & 0xFF;
    data[offset++] = 0x73; // 's'
    data[offset++] = 0x41; // 'A'
    data[offset++] = 0x6C; // 'l'
    data[offset++] = 0x54; // 'T'

    const md = forge.md.md5.create();
    md.update(uint8ToForge(data.subarray(0, offset)));
    const hash = forgeToUint8(md.digest().getBytes());

    const keyLen = Math.min(this.fileEncryptionKey.length + 5, 16);
    return hash.subarray(0, keyLen);
  }
}

// ── Helpers ──

function uint8ToForge(arr: Uint8Array): string {
  let result = '';
  for (let i = 0; i < arr.length; i++) {
    result += String.fromCharCode(arr[i]);
  }
  return result;
}

function forgeToUint8(str: string): Uint8Array {
  const result = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    result[i] = str.charCodeAt(i);
  }
  return result;
}
