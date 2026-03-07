/**
 * Image embedding edge cases.
 *
 * Tests cover minimal valid images, corrupt/empty data, dimension verification,
 * round-trip save/load with images, and duplicate embedding.
 */

import { describe, it, expect } from 'vitest';
import { PDFDocument } from '../PDFDocument.js';

// ---------------------------------------------------------------------------
// Minimal 1x1 JPEG (RGB) — hardcoded known-good byte array
// ---------------------------------------------------------------------------
const MINIMAL_JPEG = new Uint8Array([
  0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
  0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
  0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
  0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
  0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
  0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
  0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
  0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
  0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72,
  0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45,
  0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
  0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75,
  0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3,
  0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6,
  0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9,
  0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
  0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4,
  0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01,
  0x00, 0x00, 0x3F, 0x00, 0x7B, 0x94, 0x11, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xD9,
]);

// ---------------------------------------------------------------------------
// Valid 1x1 red PNG (RGB, 8-bit, correct Adler-32) — reused from native-document.test.ts
// ---------------------------------------------------------------------------
const RED_1x1_PNG = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1,
  0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222, 0, 0, 0, 12, 73, 68, 65,
  84, 120, 156, 99, 248, 207, 192, 0, 0, 3, 1, 1, 0, 201, 254, 146, 239, 0, 0, 0,
  0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

// ---------------------------------------------------------------------------
// Valid 1x1 RGBA PNG (with alpha channel) — colorType 6, 8-bit
// Built by hand: PNG signature + IHDR + IDAT (deflated filter-byte + RGBA pixel) + IEND
// ---------------------------------------------------------------------------
function buildRgba1x1Png(): Uint8Array {
  // We need to build a valid PNG with colorType=6 (RGBA).
  // Raw pixel data for 1x1 RGBA: filter byte (0) + R G B A = 5 bytes
  // Pixel: red with 50% alpha = [0xFF, 0x00, 0x00, 0x80]
  const rawPixelData = new Uint8Array([0x00, 0xFF, 0x00, 0x00, 0x80]);

  // Deflate the raw data
  const pako = require('pako') as typeof import('pako');
  const compressedData = pako.deflate(rawPixelData);

  // CRC-32 table
  const crcTable: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c;
  }
  function crc32(buf: Uint8Array): number {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
      crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function writeU32BE(arr: Uint8Array, offset: number, value: number): void {
    arr[offset] = (value >>> 24) & 0xFF;
    arr[offset + 1] = (value >>> 16) & 0xFF;
    arr[offset + 2] = (value >>> 8) & 0xFF;
    arr[offset + 3] = value & 0xFF;
  }

  // IHDR chunk data (13 bytes): width(4) + height(4) + bitDepth(1) + colorType(1) + compression(1) + filter(1) + interlace(1)
  const ihdrData = new Uint8Array(13);
  writeU32BE(ihdrData, 0, 1);  // width = 1
  writeU32BE(ihdrData, 4, 1);  // height = 1
  ihdrData[8] = 8;             // bitDepth = 8
  ihdrData[9] = 6;             // colorType = 6 (RGBA)
  ihdrData[10] = 0;            // compression = 0
  ihdrData[11] = 0;            // filter = 0
  ihdrData[12] = 0;            // interlace = 0

  // Build chunks
  function buildChunk(type: string, data: Uint8Array): Uint8Array {
    const typeBytes = new Uint8Array([
      type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3),
    ]);
    const chunk = new Uint8Array(4 + 4 + data.length + 4); // length + type + data + crc
    writeU32BE(chunk, 0, data.length);
    chunk.set(typeBytes, 4);
    chunk.set(data, 8);
    // CRC is over type + data
    const crcInput = new Uint8Array(4 + data.length);
    crcInput.set(typeBytes, 0);
    crcInput.set(data, 4);
    writeU32BE(chunk, 8 + data.length, crc32(crcInput));
    return chunk;
  }

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrChunk = buildChunk('IHDR', ihdrData);
  const idatChunk = buildChunk('IDAT', compressedData);
  const iendChunk = buildChunk('IEND', new Uint8Array(0));

  // Concatenate
  const total = signature.length + ihdrChunk.length + idatChunk.length + iendChunk.length;
  const png = new Uint8Array(total);
  let offset = 0;
  png.set(signature, offset); offset += signature.length;
  png.set(ihdrChunk, offset); offset += ihdrChunk.length;
  png.set(idatChunk, offset); offset += idatChunk.length;
  png.set(iendChunk, offset);

  return png;
}

const RGBA_1x1_PNG = buildRgba1x1Png();

describe('Image embedding edge cases', () => {
  // -------------------------------------------------------------------------
  // Minimal valid images
  // -------------------------------------------------------------------------

  describe('minimal valid images', () => {
    it('embeds a minimal 1x1 RGB JPEG', async () => {
      const doc = await PDFDocument.create();
      const image = await doc.embedJpg(MINIMAL_JPEG);

      expect(image).toBeDefined();
      expect(image.width).toBe(1);
      expect(image.height).toBe(1);
    });

    it('embeds a minimal 1x1 RGB PNG', async () => {
      const doc = await PDFDocument.create();
      const image = await doc.embedPng(RED_1x1_PNG);

      expect(image).toBeDefined();
      expect(image.width).toBe(1);
      expect(image.height).toBe(1);
    });

    it('embeds a minimal 1x1 RGBA PNG (with alpha)', async () => {
      const doc = await PDFDocument.create();
      const image = await doc.embedPng(RGBA_1x1_PNG);

      expect(image).toBeDefined();
      expect(image.width).toBe(1);
      expect(image.height).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Zero-byte / empty data
  // -------------------------------------------------------------------------

  describe('zero-byte image data', () => {
    it('embedJpg throws on zero-byte data', async () => {
      const doc = await PDFDocument.create();
      await expect(doc.embedJpg(new Uint8Array(0))).rejects.toThrow();
    });

    it('embedPng throws on zero-byte data', async () => {
      const doc = await PDFDocument.create();
      await expect(doc.embedPng(new Uint8Array(0))).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Invalid / corrupt data
  // -------------------------------------------------------------------------

  describe('corrupt image data', () => {
    it('embedJpg throws on invalid JPEG data', async () => {
      const doc = await PDFDocument.create();
      const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
      await expect(doc.embedJpg(garbage)).rejects.toThrow();
    });

    it('embedPng throws on invalid PNG data', async () => {
      const doc = await PDFDocument.create();
      const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
      await expect(doc.embedPng(garbage)).rejects.toThrow();
    });

    it('embedJpg throws on truncated JPEG (SOI only)', async () => {
      const doc = await PDFDocument.create();
      // Just the SOI marker, no SOF
      const truncated = new Uint8Array([0xFF, 0xD8]);
      await expect(doc.embedJpg(truncated)).rejects.toThrow();
    });

    it('embedPng throws on truncated PNG (signature only)', async () => {
      const doc = await PDFDocument.create();
      // Just the PNG signature, no chunks
      const truncated = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
      await expect(doc.embedPng(truncated)).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Dimension verification
  // -------------------------------------------------------------------------

  describe('dimension verification', () => {
    it('JPEG PDFImage reports correct width and height', async () => {
      const doc = await PDFDocument.create();
      const image = await doc.embedJpg(MINIMAL_JPEG);

      expect(image.width).toBe(1);
      expect(image.height).toBe(1);
      expect(image.size()).toEqual({ width: 1, height: 1 });
    });

    it('PNG PDFImage reports correct width and height', async () => {
      const doc = await PDFDocument.create();
      const image = await doc.embedPng(RED_1x1_PNG);

      expect(image.width).toBe(1);
      expect(image.height).toBe(1);
      expect(image.size()).toEqual({ width: 1, height: 1 });
    });

    it('PDFImage.scale works for embedded JPEG', async () => {
      const doc = await PDFDocument.create();
      const image = await doc.embedJpg(MINIMAL_JPEG);

      const scaled = image.scale(100);
      expect(scaled).toEqual({ width: 100, height: 100 });
    });

    it('PDFImage.scaleToFit works for embedded PNG', async () => {
      const doc = await PDFDocument.create();
      const image = await doc.embedPng(RED_1x1_PNG);

      const fitted = image.scaleToFit(200, 100);
      // 1x1 image, so scaleToFit(200,100) -> factor = min(200/1, 100/1) = 100
      expect(fitted).toEqual({ width: 100, height: 100 });
    });
  });

  // -------------------------------------------------------------------------
  // Save / round-trip verification
  // -------------------------------------------------------------------------

  describe('save and round-trip', () => {
    it('JPEG embedded in doc produces XObject in saved PDF', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const image = await doc.embedJpg(MINIMAL_JPEG);

      page.drawImage(image, { x: 0, y: 0, width: 50, height: 50 });

      const bytes = await doc.save();
      const text = new TextDecoder().decode(bytes);

      // The saved PDF should contain an XObject image with DCTDecode filter
      expect(text).toContain('/XObject');
      expect(text).toContain('/DCTDecode');
      expect(text).toContain('/Subtype /Image');
    });

    it('PNG embedded in doc produces reasonable file size', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const image = await doc.embedPng(RED_1x1_PNG);

      page.drawImage(image, { x: 0, y: 0, width: 100, height: 100 });

      const bytes = await doc.save();

      // A minimal PDF with a 1x1 PNG should be well under 10KB
      // but definitely more than just a blank page
      expect(bytes.length).toBeGreaterThan(200);
      expect(bytes.length).toBeLessThan(10_000);
    });

    it('RGBA PNG with alpha channel round-trips through save/load', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const image = await doc.embedPng(RGBA_1x1_PNG);

      page.drawImage(image, { x: 10, y: 10, width: 50, height: 50 });

      const bytes = await doc.save();
      const loaded = await PDFDocument.load(bytes);

      expect(loaded.getPageCount()).toBe(1);

      // The saved PDF should contain an SMask (alpha channel)
      const text = new TextDecoder().decode(bytes);
      expect(text).toContain('/SMask');
    });
  });

  // -------------------------------------------------------------------------
  // Duplicate embedding
  // -------------------------------------------------------------------------

  describe('duplicate embedding', () => {
    it('embedding the same JPEG twice does not error', async () => {
      const doc = await PDFDocument.create();
      const image1 = await doc.embedJpg(MINIMAL_JPEG);
      const image2 = await doc.embedJpg(MINIMAL_JPEG);

      expect(image1.width).toBe(1);
      expect(image2.width).toBe(1);
      // Both should be valid, independent image objects
      expect(image1._nativeRef).toBeDefined();
      expect(image2._nativeRef).toBeDefined();
    });

    it('embedding the same PNG twice does not error', async () => {
      const doc = await PDFDocument.create();
      const image1 = await doc.embedPng(RED_1x1_PNG);
      const image2 = await doc.embedPng(RED_1x1_PNG);

      expect(image1.width).toBe(1);
      expect(image2.width).toBe(1);
      expect(image1._nativeRef).toBeDefined();
      expect(image2._nativeRef).toBeDefined();
    });

    it('both duplicate images can be drawn on a page and saved', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const image1 = await doc.embedJpg(MINIMAL_JPEG);
      const image2 = await doc.embedJpg(MINIMAL_JPEG);

      page.drawImage(image1, { x: 0, y: 0, width: 50, height: 50 });
      page.drawImage(image2, { x: 100, y: 0, width: 50, height: 50 });

      const bytes = await doc.save();
      const loaded = await PDFDocument.load(bytes);

      expect(loaded.getPageCount()).toBe(1);
    });
  });
});
