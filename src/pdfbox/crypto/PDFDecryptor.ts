/**
 * PDFDecryptor — per-object decryption during document load.
 *
 * For AES-128: per-object key = MD5(fileKey + objNum(3 LE bytes) + genNum(2 LE bytes) + "sAlT")
 * For AES-256: per-object key = file encryption key (no per-object derivation)
 */

import forge from 'node-forge';
import type { EncryptionDict } from './SecurityHandler';
import { decryptAESStream, decryptAESString } from './AESCipher';

export class PDFDecryptor {
  private readonly fileEncryptionKey: Uint8Array;
  readonly encryptionDict: EncryptionDict;
  private readonly keyLengthBits: 128 | 256;

  constructor(
    fileEncryptionKey: Uint8Array,
    encryptionDict: EncryptionDict,
    _documentId: Uint8Array,
    keyLengthBits: 128 | 256,
  ) {
    this.fileEncryptionKey = fileEncryptionKey;
    this.encryptionDict = encryptionDict;
    this.keyLengthBits = keyLengthBits;
  }

  /**
   * Compute the per-object key for AES-128 (Algorithm 1a).
   * For AES-256, always returns the file encryption key directly.
   */
  computeObjectKey(objectNumber: number, generationNumber: number): Uint8Array {
    if (this.keyLengthBits === 256) {
      return this.fileEncryptionKey;
    }

    // AES-128: Algorithm 1a
    // key = MD5(fileKey + objNum(3 LE bytes) + genNum(2 LE bytes) + "sAlT")
    const data = new Uint8Array(this.fileEncryptionKey.length + 5 + 4);
    data.set(this.fileEncryptionKey, 0);
    let offset = this.fileEncryptionKey.length;

    // Object number as 3 LE bytes
    data[offset++] = objectNumber & 0xFF;
    data[offset++] = (objectNumber >> 8) & 0xFF;
    data[offset++] = (objectNumber >> 16) & 0xFF;

    // Generation number as 2 LE bytes
    data[offset++] = generationNumber & 0xFF;
    data[offset++] = (generationNumber >> 8) & 0xFF;

    // "sAlT" for AES
    data[offset++] = 0x73; // 's'
    data[offset++] = 0x41; // 'A'
    data[offset++] = 0x6C; // 'l'
    data[offset++] = 0x54; // 'T'

    const md = forge.md.md5.create();
    md.update(uint8ToForge(data.subarray(0, offset)));
    const hash = forgeToUint8(md.digest().getBytes());

    // Use first min(keyLength/8 + 5, 16) bytes
    const keyLen = Math.min(this.fileEncryptionKey.length + 5, 16);
    return hash.subarray(0, keyLen);
  }

  /**
   * Decrypt a string value.
   */
  decryptString(data: Uint8Array, objectNumber: number, generationNumber: number): Uint8Array {
    if (data.length === 0) return data;
    const key = this.computeObjectKey(objectNumber, generationNumber);
    try {
      return decryptAESString(key, data);
    } catch {
      // Return original data if decryption fails (might not be encrypted)
      return data;
    }
  }

  /**
   * Decrypt a stream.
   */
  decryptStream(data: Uint8Array, objectNumber: number, generationNumber: number): Uint8Array {
    if (data.length === 0) return data;
    const key = this.computeObjectKey(objectNumber, generationNumber);
    try {
      return decryptAESStream(key, data);
    } catch {
      // Return original data if decryption fails
      return data;
    }
  }

  /**
   * Check whether an object should be decrypted.
   * Skip XRef streams and signature /Contents.
   */
  shouldDecrypt(objectNumber: number, dictBody?: string): boolean {
    if (objectNumber === 0) return false;

    // Skip XRef streams
    if (dictBody) {
      if (dictBody.includes('/Type /XRef') || dictBody.includes('/Type/XRef')) {
        return false;
      }
      // Skip signature /Contents values (binary PKCS#7 data)
      if (dictBody.includes('/Type /Sig') || dictBody.includes('/Type/Sig')) {
        return false;
      }
    }

    return true;
  }

  /** Expose key length for external callers */
  get aesKeyLength(): 128 | 256 {
    return this.keyLengthBits;
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
