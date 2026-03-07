/**
 * KeyDerivation — password validation and file encryption key derivation.
 *
 * Implements PDF spec algorithms for AES-128 (R=4) and AES-256 (R=5/6).
 *
 * For AES-128 (R=4):
 *   - Algorithm 2: Compute encryption key from password + /O + /P + document ID using MD5
 *   - Algorithm 4/5: Compute /U value, compare to validate user password
 *   - Algorithm 3: Compute /O value for owner password validation
 *
 * For AES-256 (R=5):
 *   - Key = SHA-256(password + validation salt from /U)
 *   - Validate: compare first 32 bytes of /U or /O
 *   - Derive file encryption key: AES-256-CBC decrypt /UE or /OE
 *
 * For AES-256 (R=6):
 *   - Algorithm 2.B: Complex iterative hash (SHA-256/384/512 + AES-CBC rounds)
 */

import forge from 'node-forge';
import type { EncryptionDict } from './SecurityHandler';
import { aesDecryptCBC, aesEncryptCBC } from './AESCipher';

// Password padding per PDF spec (Algorithm 2, step a)
const PASSWORD_PADDING = new Uint8Array([
  0x28, 0xBF, 0x4E, 0x5E, 0x4E, 0x75, 0x8A, 0x41,
  0x64, 0x00, 0x4B, 0x49, 0x43, 0x4B, 0x00, 0x41,
  0x42, 0x00, 0x4E, 0x53, 0x68, 0x69, 0x46, 0x54,
  0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x32,
]);

/**
 * Attempt to derive the file encryption key from a password.
 * Tries user password first, then owner password.
 * Returns the file encryption key on success, throws on failure.
 */
export function deriveFileEncryptionKey(
  dict: EncryptionDict,
  password: string,
  documentId: Uint8Array,
): Uint8Array {
  const passwordBytes = stringToLatin1(password);

  if (dict.revision <= 4) {
    return deriveKeyR4(dict, passwordBytes, documentId);
  }
  // R=5 or R=6
  return deriveKeyR56(dict, passwordBytes);
}

// ── AES-128 (R=4) ──

function deriveKeyR4(
  dict: EncryptionDict,
  password: Uint8Array,
  documentId: Uint8Array,
): Uint8Array {
  const keyLength = dict.length / 8; // bytes

  // Try user password
  const userKey = computeEncryptionKeyR4(password, dict, documentId, keyLength);
  if (validateUserPasswordR4(userKey, dict, documentId)) {
    return userKey;
  }

  // Try as owner password: recover user password from /O, then derive
  const userFromOwner = recoverUserPasswordFromOwner(password, dict, keyLength);
  const ownerKey = computeEncryptionKeyR4(userFromOwner, dict, documentId, keyLength);
  if (validateUserPasswordR4(ownerKey, dict, documentId)) {
    return ownerKey;
  }

  throw new Error('Invalid password for encrypted PDF.');
}

/**
 * Algorithm 2: Compute encryption key from user password.
 */
function computeEncryptionKeyR4(
  password: Uint8Array,
  dict: EncryptionDict,
  documentId: Uint8Array,
  keyLength: number,
): Uint8Array {
  // Step a: Pad password to 32 bytes
  const padded = padPassword(password);

  // Step b–f: MD5 hash
  const md = forge.md.md5.create();
  md.update(uint8ToForge(padded));
  md.update(uint8ToForge(dict.ownerHash.subarray(0, 32)));

  // /P as little-endian 4 bytes
  const pBytes = new Uint8Array(4);
  const p = dict.permissions;
  pBytes[0] = p & 0xFF;
  pBytes[1] = (p >> 8) & 0xFF;
  pBytes[2] = (p >> 16) & 0xFF;
  pBytes[3] = (p >> 24) & 0xFF;
  md.update(uint8ToForge(pBytes));

  md.update(uint8ToForge(documentId));

  // If R>=4 and EncryptMetadata is false, add 4 bytes of 0xFF
  if (dict.revision >= 4 && !dict.encryptMetadata) {
    md.update('\xFF\xFF\xFF\xFF');
  }

  let hash = forgeToUint8(md.digest().getBytes());

  // If R>=3, iterate MD5 50 times
  if (dict.revision >= 3) {
    for (let i = 0; i < 50; i++) {
      const md2 = forge.md.md5.create();
      md2.update(uint8ToForge(hash.subarray(0, keyLength)));
      hash = forgeToUint8(md2.digest().getBytes());
    }
  }

  return hash.subarray(0, keyLength);
}

/**
 * Algorithm 5 (R=4): Validate user password by computing /U and comparing.
 */
function validateUserPasswordR4(
  key: Uint8Array,
  dict: EncryptionDict,
  documentId: Uint8Array,
): boolean {
  if (dict.revision >= 3) {
    // Algorithm 5 for R>=3
    const md = forge.md.md5.create();
    md.update(uint8ToForge(PASSWORD_PADDING));
    md.update(uint8ToForge(documentId));
    let hash = forgeToUint8(md.digest().getBytes());

    // Encrypt with key
    hash = rc4Encrypt(key, hash);

    // 19 rounds of RC4 with modified key
    for (let i = 1; i <= 19; i++) {
      const derivedKey = new Uint8Array(key.length);
      for (let j = 0; j < key.length; j++) {
        derivedKey[j] = key[j] ^ i;
      }
      hash = rc4Encrypt(derivedKey, hash);
    }

    // Compare first 16 bytes
    return arraysEqual(hash.subarray(0, 16), dict.userHash.subarray(0, 16));
  }

  // R=2: Algorithm 4
  const encrypted = rc4Encrypt(key, new Uint8Array(PASSWORD_PADDING));
  return arraysEqual(encrypted, dict.userHash.subarray(0, 32));
}

/**
 * Algorithm 3 (reverse): Recover user password from /O using owner password.
 */
function recoverUserPasswordFromOwner(
  ownerPassword: Uint8Array,
  dict: EncryptionDict,
  keyLength: number,
): Uint8Array {
  // Pad owner password
  const padded = padPassword(ownerPassword);

  // MD5 of padded password
  const md = forge.md.md5.create();
  md.update(uint8ToForge(padded));
  let hash = forgeToUint8(md.digest().getBytes());

  if (dict.revision >= 3) {
    for (let i = 0; i < 50; i++) {
      const md2 = forge.md.md5.create();
      md2.update(uint8ToForge(hash.subarray(0, keyLength)));
      hash = forgeToUint8(md2.digest().getBytes());
    }
  }

  const ownerKey = hash.subarray(0, keyLength);

  if (dict.revision >= 3) {
    // Decrypt /O 20 times in reverse
    const buf = new Uint8Array(32);
    buf.set(dict.ownerHash.subarray(0, 32));
    let decrypted: Uint8Array = buf;
    for (let i = 19; i >= 0; i--) {
      const derivedKey = new Uint8Array(ownerKey.length);
      for (let j = 0; j < ownerKey.length; j++) {
        derivedKey[j] = ownerKey[j] ^ i;
      }
      decrypted = rc4Encrypt(derivedKey, decrypted);
    }
    return decrypted;
  }

  // R=2: single RC4 decrypt
  return rc4Encrypt(ownerKey, new Uint8Array(dict.ownerHash.subarray(0, 32)));
}

// ── AES-256 (R=5/6) ──

function deriveKeyR56(
  dict: EncryptionDict,
  password: Uint8Array,
): Uint8Array {
  // Truncate password to 127 bytes per spec
  const pwd = password.subarray(0, Math.min(password.length, 127));

  // Try user password
  if (dict.userHash.length >= 48 && dict.userEncryptionKey) {
    const validationSalt = dict.userHash.subarray(32, 40);
    const hash = dict.revision === 6
      ? computeHashR6(pwd, validationSalt, new Uint8Array(0))
      : sha256(concat(pwd, validationSalt));

    if (arraysEqual(hash.subarray(0, 32), dict.userHash.subarray(0, 32))) {
      // Derive file encryption key from /UE
      const keySalt = dict.userHash.subarray(40, 48);
      const fileKeyHash = dict.revision === 6
        ? computeHashR6(pwd, keySalt, new Uint8Array(0))
        : sha256(concat(pwd, keySalt));
      const iv = new Uint8Array(16); // zero IV
      return aesDecryptCBC(fileKeyHash.subarray(0, 32), iv, dict.userEncryptionKey);
    }
  }

  // Try owner password
  if (dict.ownerHash.length >= 48 && dict.ownerEncryptionKey) {
    const validationSalt = dict.ownerHash.subarray(32, 40);
    const uEntry = dict.userHash.subarray(0, 48);
    const hash = dict.revision === 6
      ? computeHashR6(pwd, validationSalt, uEntry)
      : sha256(concat(pwd, validationSalt, uEntry));

    if (arraysEqual(hash.subarray(0, 32), dict.ownerHash.subarray(0, 32))) {
      // Derive file encryption key from /OE
      const keySalt = dict.ownerHash.subarray(40, 48);
      const fileKeyHash = dict.revision === 6
        ? computeHashR6(pwd, keySalt, uEntry)
        : sha256(concat(pwd, keySalt, uEntry));
      const iv = new Uint8Array(16);
      return aesDecryptCBC(fileKeyHash.subarray(0, 32), iv, dict.ownerEncryptionKey);
    }
  }

  throw new Error('Invalid password for encrypted PDF.');
}

/**
 * Algorithm 2.B (R=6): Iterative hash with SHA-256/384/512 + AES-CBC.
 */
function computeHashR6(
  password: Uint8Array,
  salt: Uint8Array,
  u: Uint8Array,
): Uint8Array {
  // Initial round: SHA-256(password + salt + u)
  let k = sha256(concat(password, salt, u));

  let lastE0 = 0;
  for (let round = 0; round < 64 || lastE0 > round - 32; round++) {
    // Build K1: repeat (password + K + u) 64 times
    const block = concat(password, k, u);
    const k1 = new Uint8Array(block.length * 64);
    for (let i = 0; i < 64; i++) {
      k1.set(block, i * block.length);
    }

    // AES-128-CBC encrypt K1 using first 16 bytes of K as key, next 16 as IV
    const aesKey = k.subarray(0, 16);
    const aesIv = k.subarray(16, 32);
    const e = aesEncryptCBCNoPadding(aesKey, aesIv, k1);

    // Determine which SHA to use based on first 16 bytes of E modulo 3
    const sum = e.subarray(0, 16).reduce((acc, b) => acc + b, 0);
    const mod = sum % 3;

    if (mod === 0) {
      k = sha256(e);
    } else if (mod === 1) {
      k = sha384(e);
    } else {
      k = sha512(e);
    }

    lastE0 = e[e.length - 1];
  }

  return k.subarray(0, 32);
}

// ── AES-CBC without padding (for R=6 hash) ──

function aesEncryptCBCNoPadding(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  // node-forge CBC always adds PKCS7 padding. For R=6, the data is already
  // a multiple of 16, so we need to strip the padding block after encryption.
  // But more precisely, Algorithm 2.B requires no padding — the input IS a
  // multiple of 16. We encrypt, then strip the extra 16-byte padding block.
  const cipher = forge.cipher.createCipher(
    'AES-CBC',
    forge.util.createBuffer(uint8ToForge(key)),
  );
  cipher.start({ iv: forge.util.createBuffer(uint8ToForge(iv)) });
  cipher.update(forge.util.createBuffer(uint8ToForge(data)));
  cipher.finish();
  const encrypted = forgeToUint8(cipher.output.getBytes());
  // Strip PKCS7 padding block (16 bytes of 0x10)
  return encrypted.subarray(0, data.length);
}

// ── SHA helpers ──

function sha256(data: Uint8Array): Uint8Array {
  const md = forge.md.sha256.create();
  md.update(uint8ToForge(data));
  return forgeToUint8(md.digest().getBytes());
}

function sha384(data: Uint8Array): Uint8Array {
  const md = forge.md.sha384.create();
  md.update(uint8ToForge(data));
  return forgeToUint8(md.digest().getBytes());
}

function sha512(data: Uint8Array): Uint8Array {
  const md = forge.md.sha512.create();
  md.update(uint8ToForge(data));
  return forgeToUint8(md.digest().getBytes());
}

// ── RC4 (only used for password validation in R=4 key derivation, NOT for content) ──

function rc4Encrypt(key: Uint8Array, data: Uint8Array): Uint8Array {
  // Minimal RC4 for password validation only — not used for stream/string encryption
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 0xFF;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const result = new Uint8Array(data.length);
  let a = 0;
  let b = 0;
  for (let k = 0; k < data.length; k++) {
    a = (a + 1) & 0xFF;
    b = (b + s[a]) & 0xFF;
    [s[a], s[b]] = [s[b], s[a]];
    result[k] = data[k] ^ s[(s[a] + s[b]) & 0xFF];
  }
  return result;
}

// ── Utility ──

function padPassword(password: Uint8Array): Uint8Array {
  const result = new Uint8Array(32);
  const len = Math.min(password.length, 32);
  result.set(password.subarray(0, len), 0);
  result.set(PASSWORD_PADDING.subarray(0, 32 - len), len);
  return result;
}

function stringToLatin1(str: string): Uint8Array {
  const result = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    result[i] = str.charCodeAt(i) & 0xFF;
  }
  return result;
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

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

// ── Exports for encryption (key generation, /U, /O, /UE, /OE computation) ──

/**
 * Generate encryption artifacts for a new encrypted PDF.
 * Returns the file encryption key and the dictionary values (/U, /O, /UE, /OE, /Perms).
 */
export function generateEncryptionArtifacts(
  userPassword: string,
  ownerPassword: string,
  permissions: number,
  keyLength: 128 | 256,
  documentId: Uint8Array,
): {
  fileEncryptionKey: Uint8Array;
  ownerHash: Uint8Array;
  userHash: Uint8Array;
  ownerEncryptionKey?: Uint8Array;
  userEncryptionKey?: Uint8Array;
  perms?: Uint8Array;
} {
  if (keyLength === 128) {
    return generateArtifactsR4(userPassword, ownerPassword, permissions, documentId);
  }
  return generateArtifactsR6(userPassword, ownerPassword, permissions);
}

function generateArtifactsR4(
  userPassword: string,
  ownerPassword: string,
  permissions: number,
  documentId: Uint8Array,
): {
  fileEncryptionKey: Uint8Array;
  ownerHash: Uint8Array;
  userHash: Uint8Array;
} {
  const keyLength = 16; // 128 bits = 16 bytes
  const userPwd = stringToLatin1(userPassword);
  const ownerPwd = stringToLatin1(ownerPassword);

  // Compute /O (Algorithm 3)
  const paddedOwner = padPassword(ownerPwd.length > 0 ? ownerPwd : userPwd);
  const md = forge.md.md5.create();
  md.update(uint8ToForge(paddedOwner));
  let ownerKeyHash = forgeToUint8(md.digest().getBytes());
  for (let i = 0; i < 50; i++) {
    const md2 = forge.md.md5.create();
    md2.update(uint8ToForge(ownerKeyHash.subarray(0, keyLength)));
    ownerKeyHash = forgeToUint8(md2.digest().getBytes());
  }
  const ownerKey = ownerKeyHash.subarray(0, keyLength);
  const paddedUser = padPassword(userPwd);
  let ownerHash = rc4Encrypt(ownerKey, paddedUser);
  for (let i = 1; i <= 19; i++) {
    const dk = new Uint8Array(ownerKey.length);
    for (let j = 0; j < ownerKey.length; j++) dk[j] = ownerKey[j] ^ i;
    ownerHash = rc4Encrypt(dk, ownerHash);
  }

  // Compute file encryption key (Algorithm 2)
  const fakeDict: EncryptionDict = {
    filter: 'Standard',
    version: 4,
    revision: 4,
    length: 128,
    ownerHash,
    userHash: new Uint8Array(32),
    permissions,
    encryptMetadata: true,
  };
  const fileKey = computeEncryptionKeyR4(userPwd, fakeDict, documentId, keyLength);

  // Compute /U (Algorithm 5 for R=4)
  const uMd = forge.md.md5.create();
  uMd.update(uint8ToForge(PASSWORD_PADDING));
  uMd.update(uint8ToForge(documentId));
  let uHash = forgeToUint8(uMd.digest().getBytes());
  uHash = rc4Encrypt(fileKey, uHash);
  for (let i = 1; i <= 19; i++) {
    const dk = new Uint8Array(fileKey.length);
    for (let j = 0; j < fileKey.length; j++) dk[j] = fileKey[j] ^ i;
    uHash = rc4Encrypt(dk, uHash);
  }
  // Pad /U to 32 bytes
  const userHash = new Uint8Array(32);
  userHash.set(uHash.subarray(0, 16), 0);

  return { fileEncryptionKey: fileKey, ownerHash, userHash };
}

function generateArtifactsR6(
  userPassword: string,
  ownerPassword: string,
  permissions: number,
): {
  fileEncryptionKey: Uint8Array;
  ownerHash: Uint8Array;
  userHash: Uint8Array;
  ownerEncryptionKey: Uint8Array;
  userEncryptionKey: Uint8Array;
  perms: Uint8Array;
} {
  const userPwd = stringToLatin1(userPassword).subarray(0, 127);
  const ownerPwd = stringToLatin1(ownerPassword).subarray(0, 127);

  // Generate random file encryption key (32 bytes)
  const fileEncryptionKey = forgeToUint8(forge.random.getBytesSync(32));

  // Generate random salts (8 bytes each)
  const userValidationSalt = forgeToUint8(forge.random.getBytesSync(8));
  const userKeySalt = forgeToUint8(forge.random.getBytesSync(8));
  const ownerValidationSalt = forgeToUint8(forge.random.getBytesSync(8));
  const ownerKeySalt = forgeToUint8(forge.random.getBytesSync(8));

  // Compute /U (48 bytes: 32-byte hash + 8-byte validation salt + 8-byte key salt)
  const uHash = computeHashR6(userPwd, userValidationSalt, new Uint8Array(0));
  const userHash = new Uint8Array(48);
  userHash.set(uHash.subarray(0, 32), 0);
  userHash.set(userValidationSalt, 32);
  userHash.set(userKeySalt, 40);

  // Compute /UE (32 bytes: AES-256-CBC encrypted file key)
  const ueKeyHash = computeHashR6(userPwd, userKeySalt, new Uint8Array(0));
  const zeroIv = new Uint8Array(16);
  const userEncryptionKey = aesEncryptCBC(ueKeyHash.subarray(0, 32), zeroIv, fileEncryptionKey);

  // Compute /O (48 bytes)
  const oHash = computeHashR6(ownerPwd, ownerValidationSalt, userHash);
  const ownerHash = new Uint8Array(48);
  ownerHash.set(oHash.subarray(0, 32), 0);
  ownerHash.set(ownerValidationSalt, 32);
  ownerHash.set(ownerKeySalt, 40);

  // Compute /OE
  const oeKeyHash = computeHashR6(ownerPwd, ownerKeySalt, userHash);
  const ownerEncryptionKey = aesEncryptCBC(oeKeyHash.subarray(0, 32), zeroIv, fileEncryptionKey);

  // Compute /Perms (16 bytes)
  const permsBlock = new Uint8Array(16);
  permsBlock[0] = permissions & 0xFF;
  permsBlock[1] = (permissions >> 8) & 0xFF;
  permsBlock[2] = (permissions >> 16) & 0xFF;
  permsBlock[3] = (permissions >> 24) & 0xFF;
  permsBlock[4] = 0xFF; // no restrictions on rest
  permsBlock[5] = 0xFF;
  permsBlock[6] = 0xFF;
  permsBlock[7] = 0xFF;
  permsBlock[8] = 0x54; // 'T' for encryptMetadata = true
  permsBlock[9] = 0x61; // 'a'
  permsBlock[10] = 0x64; // 'd'
  permsBlock[11] = 0x62; // 'b' — "Tadb" per spec
  // Bytes 12-15: random
  const randomTail = forgeToUint8(forge.random.getBytesSync(4));
  permsBlock.set(randomTail, 12);
  const perms = aesEncryptCBCNoPaddingDirect(fileEncryptionKey, zeroIv, permsBlock);

  return {
    fileEncryptionKey,
    ownerHash,
    userHash,
    ownerEncryptionKey,
    userEncryptionKey,
    perms,
  };
}

function aesEncryptCBCNoPaddingDirect(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  // ECB for single block since IV is zero and data is exactly 16 bytes
  // But we use CBC and strip padding
  const cipher = forge.cipher.createCipher(
    'AES-CBC',
    forge.util.createBuffer(uint8ToForge(key)),
  );
  cipher.start({ iv: forge.util.createBuffer(uint8ToForge(iv)) });
  cipher.update(forge.util.createBuffer(uint8ToForge(data)));
  cipher.finish();
  const encrypted = forgeToUint8(cipher.output.getBytes());
  return encrypted.subarray(0, data.length);
}
