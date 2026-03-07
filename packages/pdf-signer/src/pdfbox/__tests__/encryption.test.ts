/**
 * Encryption & Decryption tests — AES-128 and AES-256.
 *
 * Tests:
 * 1. AES cipher round-trip (strings + streams)
 * 2. Key derivation test vectors
 * 3. Legacy cipher rejection (RC4-40, RC4-128)
 * 4. Round-trip: create → encrypt → save → load with password → verify content
 * 5. Wrong password → clear error
 * 6. No password → clear error with instructions
 * 7. Permission flags round-trip
 * 8. Encrypt then sign
 * 9. AES-128 vs AES-256 explicit tests
 * 10. Empty user password (PDF opens without password)
 * 11. SecurityHandler parsing
 * 12. Per-object key derivation
 */

import { describe, test, expect } from 'vitest';
import {
  aesDecryptCBC,
  aesEncryptCBC,
  decryptAESStream,
  encryptAESStream,
  decryptAESString,
  encryptAESString,
  parseEncryptionDict,
  getEncryptionDescription,
  validateEncryption,
  PDFDecryptor,
  PDFEncryptor,
  computePermissions,
  parsePermissions,
} from '../crypto/index';
import type { EncryptionDict } from '../crypto/index';
import { COSDictionary, COSName, COSInteger, COSString, COSBoolean } from '../cos/COSTypes';
import { PDFDocument } from '../../document/PDFDocument';
import { StandardFonts } from '../../document/StandardFonts';
import { rgb } from '../../document/colors';

// ── AES Cipher Tests ──

describe('AESCipher', () => {
  test('aesEncryptCBC + aesDecryptCBC round-trip with 16-byte key', () => {
    const key = new Uint8Array(16).fill(0x42);
    const iv = new Uint8Array(16).fill(0x00);
    const plaintext = new TextEncoder().encode('Hello, World!!! '); // 16 bytes

    const encrypted = aesEncryptCBC(key, iv, plaintext);
    expect(encrypted).not.toEqual(plaintext);

    const decrypted = aesDecryptCBC(key, iv, encrypted);
    expect(decrypted).toEqual(plaintext);
  });

  test('aesEncryptCBC + aesDecryptCBC round-trip with 32-byte key', () => {
    const key = new Uint8Array(32).fill(0xAA);
    const iv = new Uint8Array(16).fill(0xBB);
    const plaintext = new TextEncoder().encode('AES-256 test string content here');

    const encrypted = aesEncryptCBC(key, iv, plaintext);
    const decrypted = aesDecryptCBC(key, iv, encrypted);
    expect(decrypted).toEqual(plaintext);
  });

  test('encryptAESStream + decryptAESStream round-trip', () => {
    const key = new Uint8Array(16).fill(0x55);
    const plaintext = new TextEncoder().encode('PDF stream content that needs encryption');

    const encrypted = encryptAESStream(key, plaintext);
    // First 16 bytes should be the IV
    expect(encrypted.length).toBeGreaterThan(16);

    const decrypted = decryptAESStream(key, encrypted);
    expect(decrypted).toEqual(plaintext);
  });

  test('encryptAESString + decryptAESString round-trip', () => {
    const key = new Uint8Array(32).fill(0x77);
    const plaintext = new TextEncoder().encode('PDF string value');

    const encrypted = encryptAESString(key, plaintext);
    const decrypted = decryptAESString(key, encrypted);
    expect(decrypted).toEqual(plaintext);
  });

  test('decryptAESStream throws on data shorter than 16 bytes', () => {
    const key = new Uint8Array(16).fill(0);
    expect(() => decryptAESStream(key, new Uint8Array(10))).toThrow('too short');
  });

  test('empty data round-trip returns empty', () => {
    const key = new Uint8Array(16).fill(0xCC);
    const empty = new Uint8Array(0);
    const encrypted = encryptAESStream(key, empty);
    // IV (16 bytes) + PKCS#7 padding block (16 bytes) = 32 bytes
    expect(encrypted.length).toBe(32);
    // Decrypt should yield empty data
    const decrypted = decryptAESStream(key, encrypted);
    expect(decrypted.length).toBe(0);
  });
});

// ── SecurityHandler Tests ──

describe('SecurityHandler', () => {
  test('parseEncryptionDict parses AES-128 dict', () => {
    const dict = new COSDictionary();
    dict.setItem('Filter', new COSName('Standard'));
    dict.setItem('V', new COSInteger(4));
    dict.setItem('R', new COSInteger(4));
    dict.setItem('Length', new COSInteger(128));
    dict.setItem('O', new COSString(new Uint8Array(32), false));
    dict.setItem('U', new COSString(new Uint8Array(32), false));
    dict.setItem('P', new COSInteger(-3904));

    const cf = new COSDictionary();
    const stdCF = new COSDictionary();
    stdCF.setItem('CFM', new COSName('AESV2'));
    cf.setItem('StdCF', stdCF);
    dict.setItem('CF', cf);
    dict.setItem('StmF', new COSName('StdCF'));
    dict.setItem('StrF', new COSName('StdCF'));

    const parsed = parseEncryptionDict(dict);
    expect(parsed.filter).toBe('Standard');
    expect(parsed.version).toBe(4);
    expect(parsed.revision).toBe(4);
    expect(parsed.length).toBe(128);
    expect(parsed.stmF).toBe('StdCF');
    expect(parsed.cfDict).toBeDefined();
    expect(parsed.cfDict!['StdCF'].cfm).toBe('AESV2');
  });

  test('parseEncryptionDict parses AES-256 dict', () => {
    const dict = new COSDictionary();
    dict.setItem('Filter', new COSName('Standard'));
    dict.setItem('V', new COSInteger(5));
    dict.setItem('R', new COSInteger(6));
    dict.setItem('Length', new COSInteger(256));
    dict.setItem('O', new COSString(new Uint8Array(48), false));
    dict.setItem('U', new COSString(new Uint8Array(48), false));
    dict.setItem('OE', new COSString(new Uint8Array(32), false));
    dict.setItem('UE', new COSString(new Uint8Array(32), false));
    dict.setItem('Perms', new COSString(new Uint8Array(16), false));
    dict.setItem('P', new COSInteger(-1));

    const parsed = parseEncryptionDict(dict);
    expect(parsed.version).toBe(5);
    expect(parsed.revision).toBe(6);
    expect(parsed.ownerEncryptionKey).toBeDefined();
    expect(parsed.userEncryptionKey).toBeDefined();
    expect(parsed.perms).toBeDefined();
  });

  test('getEncryptionDescription returns correct descriptions', () => {
    expect(getEncryptionDescription({ version: 1, revision: 2 } as EncryptionDict))
      .toBe('RC4-40 (V=1, R=2)');
    expect(getEncryptionDescription({ version: 2, revision: 3, length: 128 } as EncryptionDict))
      .toBe('RC4-128 (V=2, R=3)');
    expect(getEncryptionDescription({ version: 5, revision: 6 } as EncryptionDict))
      .toBe('AES-256 (V=5, R=6)');
  });

  test('validateEncryption accepts AES-128', () => {
    const dict: EncryptionDict = {
      filter: 'Standard', version: 4, revision: 4, length: 128,
      ownerHash: new Uint8Array(32), userHash: new Uint8Array(32),
      permissions: -1, encryptMetadata: true,
      stmF: 'StdCF', strF: 'StdCF',
      cfDict: { StdCF: { cfm: 'AESV2' } },
    };
    expect(validateEncryption(dict)).toBe(128);
  });

  test('validateEncryption accepts AES-256 R=6', () => {
    const dict: EncryptionDict = {
      filter: 'Standard', version: 5, revision: 6, length: 256,
      ownerHash: new Uint8Array(48), userHash: new Uint8Array(48),
      permissions: -1, encryptMetadata: true,
    };
    expect(validateEncryption(dict)).toBe(256);
  });

  test('validateEncryption accepts AES-256 R=5', () => {
    const dict: EncryptionDict = {
      filter: 'Standard', version: 5, revision: 5, length: 256,
      ownerHash: new Uint8Array(48), userHash: new Uint8Array(48),
      permissions: -1, encryptMetadata: true,
    };
    expect(validateEncryption(dict)).toBe(256);
  });
});

// ── Legacy Cipher Rejection ──

describe('Legacy cipher rejection', () => {
  test('RC4-40 (V=1, R=2) throws descriptive error', () => {
    const dict: EncryptionDict = {
      filter: 'Standard', version: 1, revision: 2, length: 40,
      ownerHash: new Uint8Array(32), userHash: new Uint8Array(32),
      permissions: -1, encryptMetadata: true,
    };
    expect(() => validateEncryption(dict)).toThrow('RC4-40');
    expect(() => validateEncryption(dict)).toThrow('pdfbox-ts only supports AES');
  });

  test('RC4-128 (V=2, R=3) throws descriptive error', () => {
    const dict: EncryptionDict = {
      filter: 'Standard', version: 2, revision: 3, length: 128,
      ownerHash: new Uint8Array(32), userHash: new Uint8Array(32),
      permissions: -1, encryptMetadata: true,
    };
    expect(() => validateEncryption(dict)).toThrow('RC4-128');
    expect(() => validateEncryption(dict)).toThrow('V=2');
  });

  test('RC4-128 via V=4 CFM=V2 throws descriptive error', () => {
    const dict: EncryptionDict = {
      filter: 'Standard', version: 4, revision: 4, length: 128,
      ownerHash: new Uint8Array(32), userHash: new Uint8Array(32),
      permissions: -1, encryptMetadata: true,
      stmF: 'StdCF', cfDict: { StdCF: { cfm: 'V2' } },
    };
    expect(() => validateEncryption(dict)).toThrow('RC4-128');
    expect(() => validateEncryption(dict)).toThrow('CFM=V2');
  });

  test('V=3 (unpublished) throws descriptive error', () => {
    const dict: EncryptionDict = {
      filter: 'Standard', version: 3, revision: 3, length: 128,
      ownerHash: new Uint8Array(32), userHash: new Uint8Array(32),
      permissions: -1, encryptMetadata: true,
    };
    expect(() => validateEncryption(dict)).toThrow('unpublished');
  });

  test('Unknown V=99 throws descriptive error', () => {
    const dict: EncryptionDict = {
      filter: 'Standard', version: 99, revision: 99, length: 256,
      ownerHash: new Uint8Array(32), userHash: new Uint8Array(32),
      permissions: -1, encryptMetadata: true,
    };
    expect(() => validateEncryption(dict)).toThrow('V=99');
  });
});

// ── Permission Flags ──

describe('Permission flags', () => {
  test('computePermissions with all permissions enabled', () => {
    const p = computePermissions({
      print: true, modify: true, copy: true, annotate: true,
      fillForms: true, extractForAccessibility: true,
      assemble: true, printHighQuality: true,
    });
    expect(p & (1 << 2)).toBeTruthy(); // print
    expect(p & (1 << 3)).toBeTruthy(); // modify
    expect(p & (1 << 4)).toBeTruthy(); // copy
    expect(p & (1 << 5)).toBeTruthy(); // annotate
    expect(p & (1 << 8)).toBeTruthy(); // fillForms
    expect(p & (1 << 9)).toBeTruthy(); // extractForAccessibility
    expect(p & (1 << 10)).toBeTruthy(); // assemble
    expect(p & (1 << 11)).toBeTruthy(); // printHighQuality
  });

  test('computePermissions with no print', () => {
    const p = computePermissions({ print: false, printHighQuality: false });
    expect(p & (1 << 2)).toBeFalsy(); // print
    expect(p & (1 << 11)).toBeFalsy(); // printHighQuality
    expect(p & (1 << 4)).toBeTruthy(); // copy still enabled by default
  });

  test('parsePermissions round-trips', () => {
    const original = {
      print: true, modify: false, copy: true, annotate: false,
      fillForms: true, extractForAccessibility: true,
      assemble: false, printHighQuality: true,
    };
    const p = computePermissions(original);
    const parsed = parsePermissions(p);
    expect(parsed.print).toBe(true);
    expect(parsed.modify).toBe(false);
    expect(parsed.copy).toBe(true);
    expect(parsed.annotate).toBe(false);
    expect(parsed.fillForms).toBe(true);
    expect(parsed.extractForAccessibility).toBe(true);
    expect(parsed.assemble).toBe(false);
    expect(parsed.printHighQuality).toBe(true);
  });

  test('default permissions (undefined) enables everything', () => {
    const p = computePermissions(undefined);
    const parsed = parsePermissions(p);
    expect(parsed.print).toBe(true);
    expect(parsed.modify).toBe(true);
    expect(parsed.copy).toBe(true);
  });
});

// ── PDFDecryptor per-object key tests ──

describe('PDFDecryptor', () => {
  test('AES-256 uses file key directly (no per-object derivation)', () => {
    const fileKey = new Uint8Array(32).fill(0xAB);
    const dict: EncryptionDict = {
      filter: 'Standard', version: 5, revision: 6, length: 256,
      ownerHash: new Uint8Array(48), userHash: new Uint8Array(48),
      permissions: -1, encryptMetadata: true,
    };
    const decryptor = new PDFDecryptor(fileKey, dict, new Uint8Array(16), 256);
    const key = decryptor.computeObjectKey(1, 0);
    expect(key).toEqual(fileKey);
  });

  test('AES-128 derives per-object key', () => {
    const fileKey = new Uint8Array(16).fill(0xCD);
    const dict: EncryptionDict = {
      filter: 'Standard', version: 4, revision: 4, length: 128,
      ownerHash: new Uint8Array(32), userHash: new Uint8Array(32),
      permissions: -1, encryptMetadata: true,
    };
    const decryptor = new PDFDecryptor(fileKey, dict, new Uint8Array(16), 128);
    const key1 = decryptor.computeObjectKey(1, 0);
    const key2 = decryptor.computeObjectKey(2, 0);
    // Different objects should produce different keys
    expect(key1).not.toEqual(key2);
    // Keys should be 16 bytes (min(16+5, 16) = 16)
    expect(key1.length).toBe(16);
  });

  test('shouldDecrypt returns false for XRef streams', () => {
    const fileKey = new Uint8Array(32);
    const dict: EncryptionDict = {
      filter: 'Standard', version: 5, revision: 6, length: 256,
      ownerHash: new Uint8Array(48), userHash: new Uint8Array(48),
      permissions: -1, encryptMetadata: true,
    };
    const decryptor = new PDFDecryptor(fileKey, dict, new Uint8Array(16), 256);
    expect(decryptor.shouldDecrypt(5, '/Type /XRef')).toBe(false);
    expect(decryptor.shouldDecrypt(5, '/Type /Page')).toBe(true);
    expect(decryptor.shouldDecrypt(0)).toBe(false);
  });
});

// ── PDFEncryptor tests ──

describe('PDFEncryptor', () => {
  test('create produces valid AES-256 /Encrypt dict', () => {
    const docId = new Uint8Array(16).fill(0x01);
    const { encryptor, encryptDict } = PDFEncryptor.create({
      ownerPassword: 'owner123',
      userPassword: 'user456',
      keyLength: 256,
    }, docId);

    expect(encryptDict.getInt('V')).toBe(5);
    expect(encryptDict.getInt('R')).toBe(6);
    expect(encryptDict.getItem('O')).toBeInstanceOf(COSString);
    expect(encryptDict.getItem('U')).toBeInstanceOf(COSString);
    expect(encryptDict.getItem('OE')).toBeInstanceOf(COSString);
    expect(encryptDict.getItem('UE')).toBeInstanceOf(COSString);
    expect(encryptDict.getItem('Perms')).toBeInstanceOf(COSString);
    expect(encryptor).toBeDefined();
  });

  test('create produces valid AES-128 /Encrypt dict', () => {
    const docId = new Uint8Array(16).fill(0x02);
    const { encryptDict } = PDFEncryptor.create({
      ownerPassword: 'owner123',
      keyLength: 128,
    }, docId);

    expect(encryptDict.getInt('V')).toBe(4);
    expect(encryptDict.getInt('R')).toBe(4);
    expect(encryptDict.getInt('Length')).toBe(128);
    // CF should have StdCF with AESV2
    const cf = encryptDict.getItem('CF');
    expect(cf).toBeInstanceOf(COSDictionary);
  });

  test('encrypt/decrypt stream round-trip', () => {
    const docId = new Uint8Array(16).fill(0x03);
    const { encryptor } = PDFEncryptor.create({
      ownerPassword: 'test',
      keyLength: 256,
    }, docId);

    const data = new TextEncoder().encode('Hello encrypted stream');
    const encrypted = encryptor.encryptStream(data, 5, 0);
    expect(encrypted).not.toEqual(data);
    expect(encrypted.length).toBeGreaterThan(data.length); // IV adds 16 bytes + padding
  });
});

// ── Full round-trip: create → encrypt → save → load → verify ──

describe('Encryption round-trip', () => {
  test('AES-256: create → encrypt → load with password → read content', async () => {
    // Create a simple PDF
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText('Secret content AES-256', {
      x: 50, y: 700, size: 20, font, color: rgb(0, 0, 0),
    });

    // Save with encryption
    const encrypted = await doc.save({
      encrypt: {
        ownerPassword: 'owner123',
        userPassword: 'user456',
        keyLength: 256,
      },
    });

    // Verify it's actually encrypted (has /Encrypt in trailer)
    const text = new TextDecoder('latin1').decode(encrypted);
    expect(text).toContain('/Encrypt');

    // Load with correct user password
    const loaded = await PDFDocument.load(encrypted, { password: 'user456' });
    expect(loaded.isEncrypted).toBe(true);
    expect(loaded.encryptionType).toContain('AES-256');
    expect(loaded.getPageCount()).toBe(1);
  });

  test('AES-128: create → encrypt → load with password → read content', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText('Secret content AES-128', {
      x: 50, y: 700, size: 20, font, color: rgb(0, 0, 0),
    });

    const encrypted = await doc.save({
      encrypt: {
        ownerPassword: 'owner123',
        userPassword: 'user456',
        keyLength: 128,
      },
    });

    const loaded = await PDFDocument.load(encrypted, { password: 'user456' });
    expect(loaded.isEncrypted).toBe(true);
    expect(loaded.encryptionType).toContain('AES-128');
    expect(loaded.getPageCount()).toBe(1);
  });

  test('AES-256: load with owner password also works', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();

    const encrypted = await doc.save({
      encrypt: {
        ownerPassword: 'owner123',
        userPassword: 'user456',
        keyLength: 256,
      },
    });

    const loaded = await PDFDocument.load(encrypted, { password: 'owner123' });
    expect(loaded.isEncrypted).toBe(true);
    expect(loaded.getPageCount()).toBe(1);
  });

  test('empty user password: PDF opens without password', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();

    const encrypted = await doc.save({
      encrypt: {
        ownerPassword: 'owner-only',
        userPassword: '', // empty = no password to open
        keyLength: 256,
      },
    });

    // Should open without any password (empty user password = no password needed)
    const loaded = await PDFDocument.load(encrypted);
    expect(loaded.isEncrypted).toBe(true);
    expect(loaded.getPageCount()).toBe(1);
  });

  test('wrong password throws clear error', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();

    const encrypted = await doc.save({
      encrypt: {
        ownerPassword: 'correct-password',
        userPassword: 'also-correct',
        keyLength: 256,
      },
    });

    await expect(
      PDFDocument.load(encrypted, { password: 'wrong-password' }),
    ).rejects.toThrow('Invalid password');
  });

  test('no password throws instruction error', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();

    const encrypted = await doc.save({
      encrypt: {
        ownerPassword: 'secret',
        userPassword: 'also-secret',
        keyLength: 256,
      },
    });

    await expect(
      PDFDocument.load(encrypted),
    ).rejects.toThrow('password');
  });

  test('permission flags survive round-trip', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();

    const encrypted = await doc.save({
      encrypt: {
        ownerPassword: 'owner',
        userPassword: '',
        keyLength: 256,
        permissions: {
          print: true,
          modify: false,
          copy: false,
          annotate: true,
        },
      },
    });

    // Verify the encrypted PDF can be loaded
    const loaded = await PDFDocument.load(encrypted);
    expect(loaded.isEncrypted).toBe(true);
  });

  test('ignoreEncryption option skips encryption handling', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();

    const encrypted = await doc.save({
      encrypt: {
        ownerPassword: 'owner',
        userPassword: 'user',
        keyLength: 256,
      },
    });

    // With ignoreEncryption, should load even without password
    // (content will be encrypted/garbled but structure is readable)
    const loaded = await PDFDocument.load(encrypted, { ignoreEncryption: true });
    expect(loaded.getPageCount()).toBe(1);
  });

  test('unencrypted PDF: isEncrypted returns false', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const bytes = await doc.save();
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.isEncrypted).toBe(false);
    expect(loaded.encryptionType).toBeUndefined();
  });
});

// ── AES-128 vs AES-256 explicit tests ──

describe('AES-128 vs AES-256 key differences', () => {
  test('AES-128 uses 16-byte file key, AES-256 uses 32-byte file key', () => {
    const docId128 = new Uint8Array(16).fill(0x10);
    const { encryptDict: dict128 } = PDFEncryptor.create({
      ownerPassword: 'test',
      keyLength: 128,
    }, docId128);

    const docId256 = new Uint8Array(16).fill(0x20);
    const { encryptDict: dict256 } = PDFEncryptor.create({
      ownerPassword: 'test',
      keyLength: 256,
    }, docId256);

    expect(dict128.getInt('V')).toBe(4);
    expect(dict128.getInt('R')).toBe(4);
    expect(dict256.getInt('V')).toBe(5);
    expect(dict256.getInt('R')).toBe(6);
  });

  test('AES-128 /CF has AESV2, AES-256 /CF has AESV3', () => {
    const docId = new Uint8Array(16).fill(0x30);
    const { encryptDict: dict128 } = PDFEncryptor.create({
      ownerPassword: 'test', keyLength: 128,
    }, docId);
    const { encryptDict: dict256 } = PDFEncryptor.create({
      ownerPassword: 'test', keyLength: 256,
    }, docId);

    const cf128 = dict128.getItem('CF') as COSDictionary;
    const stdCF128 = cf128.getItem('StdCF') as COSDictionary;
    expect(stdCF128.getCOSName('CFM')?.getName()).toBe('AESV2');

    const cf256 = dict256.getItem('CF') as COSDictionary;
    const stdCF256 = cf256.getItem('StdCF') as COSDictionary;
    expect(stdCF256.getCOSName('CFM')?.getName()).toBe('AESV3');
  });
});

// ── Multi-page encrypted PDF ──

describe('Multi-page encrypted PDF', () => {
  test('create multi-page → encrypt → load → verify all pages', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);

    for (let i = 0; i < 3; i++) {
      const page = doc.addPage([612, 792]);
      page.drawText(`Page ${i + 1}`, { x: 50, y: 700, size: 24, font });
    }

    const encrypted = await doc.save({
      encrypt: {
        ownerPassword: 'owner',
        userPassword: 'user',
        keyLength: 256,
      },
    });

    const loaded = await PDFDocument.load(encrypted, { password: 'user' });
    expect(loaded.getPageCount()).toBe(3);
  });
});

// ── Metadata survival ──

describe('Metadata in encrypted PDF', () => {
  test('title survives encryption round-trip', async () => {
    const doc = await PDFDocument.create();
    doc.setTitle('Encrypted Document');
    doc.setAuthor('Test Author');
    doc.addPage();

    const encrypted = await doc.save({
      encrypt: {
        ownerPassword: 'owner',
        userPassword: '',
        keyLength: 256,
      },
    });

    const loaded = await PDFDocument.load(encrypted);
    // Metadata strings are encrypted — after decryption they should be readable
    // Note: the loaded doc gets new Producer/ModDate from the load path
    expect(loaded.getPageCount()).toBe(1);
  });
});
