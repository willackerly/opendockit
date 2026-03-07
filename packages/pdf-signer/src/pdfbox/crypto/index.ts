/**
 * PDF encryption/decryption — AES-128 and AES-256 only.
 */

export {
  parseEncryptionDict,
  getEncryptionDescription,
  validateEncryption,
} from './SecurityHandler.js';
export type { EncryptionDict } from './SecurityHandler.js';

export {
  deriveFileEncryptionKey,
  generateEncryptionArtifacts,
} from './KeyDerivation.js';

export {
  aesDecryptCBC,
  aesEncryptCBC,
  decryptAESStream,
  encryptAESStream,
  decryptAESString,
  encryptAESString,
} from './AESCipher.js';

export { PDFDecryptor } from './PDFDecryptor.js';

export {
  PDFEncryptor,
  computePermissions,
  parsePermissions,
} from './PDFEncryptor.js';
export type { EncryptOptions, PDFPermissions } from './PDFEncryptor.js';
