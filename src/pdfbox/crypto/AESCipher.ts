/**
 * AESCipher — AES-CBC encrypt/decrypt wrappers around node-forge.
 *
 * Used for both AES-128 and AES-256. All functions use CBC mode with PKCS#7 padding.
 * For PDF streams/strings: the first 16 bytes are the IV, the rest is ciphertext.
 */

import forge from 'node-forge';

/**
 * Decrypt AES-CBC with explicit IV.
 */
export function aesDecryptCBC(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  const decipher = forge.cipher.createDecipher(
    'AES-CBC',
    forge.util.createBuffer(uint8ToForge(key)),
  );
  decipher.start({ iv: forge.util.createBuffer(uint8ToForge(iv)) });
  decipher.update(forge.util.createBuffer(uint8ToForge(data)));
  const ok = decipher.finish();
  if (!ok) {
    throw new Error('AES-CBC decryption failed (padding error)');
  }
  return forgeToUint8(decipher.output.getBytes());
}

/**
 * Encrypt AES-CBC with explicit IV.
 */
export function aesEncryptCBC(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  const cipher = forge.cipher.createCipher(
    'AES-CBC',
    forge.util.createBuffer(uint8ToForge(key)),
  );
  cipher.start({ iv: forge.util.createBuffer(uint8ToForge(iv)) });
  cipher.update(forge.util.createBuffer(uint8ToForge(data)));
  cipher.finish();
  return forgeToUint8(cipher.output.getBytes());
}

/**
 * Decrypt a PDF stream: first 16 bytes = IV, rest = AES-CBC ciphertext with PKCS#7 padding.
 */
export function decryptAESStream(key: Uint8Array, data: Uint8Array): Uint8Array {
  if (data.length < 16) {
    throw new Error('Encrypted stream too short (need at least 16 bytes for IV)');
  }
  const iv = data.subarray(0, 16);
  const ciphertext = data.subarray(16);
  if (ciphertext.length === 0) {
    return new Uint8Array(0);
  }
  return aesDecryptCBC(key, iv, ciphertext);
}

/**
 * Encrypt a PDF stream: generates random IV, prepends it to AES-CBC ciphertext.
 */
export function encryptAESStream(key: Uint8Array, data: Uint8Array): Uint8Array {
  const iv = generateIV();
  const ciphertext = aesEncryptCBC(key, iv, data);
  const result = new Uint8Array(16 + ciphertext.length);
  result.set(iv, 0);
  result.set(ciphertext, 16);
  return result;
}

/**
 * Decrypt a PDF string: same format as stream (IV + ciphertext).
 */
export function decryptAESString(key: Uint8Array, data: Uint8Array): Uint8Array {
  return decryptAESStream(key, data);
}

/**
 * Encrypt a PDF string: same format as stream (IV + ciphertext).
 */
export function encryptAESString(key: Uint8Array, data: Uint8Array): Uint8Array {
  return encryptAESStream(key, data);
}

/**
 * Generate 16 random bytes for an IV.
 */
function generateIV(): Uint8Array {
  const bytes = forge.random.getBytesSync(16);
  return forgeToUint8(bytes);
}

// ── Conversion helpers ──

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
