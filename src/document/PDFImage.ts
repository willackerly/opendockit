/**
 * PDFImage — native-only image wrapper.
 *
 * Supports JPEG and PNG embedding via COS XObject streams.
 */

import {
  COSName,
  COSInteger,
  COSDictionary,
  COSStream,
  COSObjectReference,
} from '../pdfbox/cos/COSTypes.js';
import type { NativeDocumentContext } from './NativeDocumentContext.js';
import * as pako from 'pako';

export class PDFImage {
  /** @internal */ readonly _nativeRef?: COSObjectReference;
  private readonly _nativeWidth: number;
  private readonly _nativeHeight: number;

  /** @internal */
  constructor(
    nativeRef: COSObjectReference,
    width: number,
    height: number,
  ) {
    this._nativeRef = nativeRef;
    this._nativeWidth = width;
    this._nativeHeight = height;
  }

  get ref(): COSObjectReference | undefined {
    return this._nativeRef;
  }

  get width(): number {
    return this._nativeWidth;
  }

  get height(): number {
    return this._nativeHeight;
  }

  scale(factor: number): { width: number; height: number } {
    return { width: this._nativeWidth * factor, height: this._nativeHeight * factor };
  }

  scaleToFit(
    width: number,
    height: number,
  ): { width: number; height: number } {
    const w = this._nativeWidth;
    const h = this._nativeHeight;
    const factor = Math.min(width / w, height / h);
    return { width: w * factor, height: h * factor };
  }

  size(): { width: number; height: number } {
    return { width: this._nativeWidth, height: this._nativeHeight };
  }

  async embed(): Promise<void> {
    // Native images are already embedded at creation time
  }

  // =========================================================================
  // Native image creation
  // =========================================================================

  /** @internal — create a native JPEG image XObject */
  static _createNativeJpeg(
    bytes: Uint8Array,
    ctx: NativeDocumentContext,
  ): PDFImage {
    const { width, height, components } = parseJpegHeader(bytes);
    const colorSpace =
      components === 1
        ? 'DeviceGray'
        : components === 4
          ? 'DeviceCMYK'
          : 'DeviceRGB';

    const stream = new COSStream();
    stream.setItem('Type', new COSName('XObject'));
    stream.setItem('Subtype', new COSName('Image'));
    stream.setItem('Width', new COSInteger(width));
    stream.setItem('Height', new COSInteger(height));
    stream.setItem('ColorSpace', new COSName(colorSpace));
    stream.setItem('BitsPerComponent', new COSInteger(8));
    stream.setItem('Filter', new COSName('DCTDecode'));
    stream.setData(bytes);

    const ref = ctx.register(stream);
    return new PDFImage(ref, width, height);
  }

  /** @internal — create a native PNG image XObject */
  static _createNativePng(
    bytes: Uint8Array,
    ctx: NativeDocumentContext,
  ): PDFImage {
    const png = parsePng(bytes);
    const { width, height, colorType, bitDepth } = png;

    // Decompress all IDAT data (try full zlib first, fall back to raw deflate
    // for PNGs with corrupt Adler-32 checksums)
    let rawData: Uint8Array;
    try {
      rawData = pako.inflate(png.idatData);
    } catch {
      // Skip 2-byte zlib header, strip 4-byte Adler-32 checksum
      rawData = pako.inflateRaw(png.idatData.slice(2, png.idatData.length - 4));
    }

    // Calculate row metrics
    const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 6 ? 4 : 3;
    const hasAlpha = colorType === 4 || colorType === 6;
    const colorChannels = hasAlpha ? channels - 1 : channels;
    const bytesPerPixel = channels * (bitDepth / 8);
    const rowBytes = Math.ceil(width * bytesPerPixel) + 1; // +1 for filter byte

    if (hasAlpha) {
      // Split RGB and alpha channels
      return PDFImage._createPngWithAlpha(
        rawData, width, height, colorChannels, bitDepth, rowBytes, bytesPerPixel, ctx,
      );
    }

    // No alpha — use IDAT data directly with PNG Predictor
    const colorSpace = colorChannels === 1 ? 'DeviceGray' : 'DeviceRGB';
    const stream = new COSStream();
    stream.setItem('Type', new COSName('XObject'));
    stream.setItem('Subtype', new COSName('Image'));
    stream.setItem('Width', new COSInteger(width));
    stream.setItem('Height', new COSInteger(height));
    stream.setItem('ColorSpace', new COSName(colorSpace));
    stream.setItem('BitsPerComponent', new COSInteger(bitDepth));
    stream.setItem('Filter', new COSName('FlateDecode'));

    const decodeParms = new COSDictionary();
    decodeParms.setDirect(true);
    decodeParms.setItem('Predictor', new COSInteger(15));
    decodeParms.setItem('Columns', new COSInteger(width));
    decodeParms.setItem('Colors', new COSInteger(colorChannels));
    decodeParms.setItem('BitsPerComponent', new COSInteger(bitDepth));
    stream.setItem('DecodeParms', decodeParms);

    // Recompress the decompressed data (already has PNG filter bytes)
    stream.setData(pako.deflate(rawData));

    const ref = ctx.register(stream);
    return new PDFImage(ref, width, height);
  }

  /** @internal — split PNG with alpha into image + SMask */
  private static _createPngWithAlpha(
    rawData: Uint8Array,
    width: number,
    height: number,
    colorChannels: number,
    bitDepth: number,
    rowBytes: number,
    bytesPerPixel: number,
    ctx: NativeDocumentContext,
  ): PDFImage {
    const colorBpp = colorChannels * (bitDepth / 8);
    const alphaBpp = bitDepth / 8;

    // Allocate output buffers (with filter bytes)
    const colorRowBytes = 1 + width * colorBpp;
    const alphaRowBytes = 1 + width * alphaBpp;
    const colorData = new Uint8Array(colorRowBytes * height);
    const alphaData = new Uint8Array(alphaRowBytes * height);

    for (let row = 0; row < height; row++) {
      const srcOffset = row * rowBytes;
      const filterByte = rawData[srcOffset];

      const colorRowOffset = row * colorRowBytes;
      const alphaRowOffset = row * alphaRowBytes;

      // Copy filter byte to both output streams
      colorData[colorRowOffset] = filterByte;
      alphaData[alphaRowOffset] = filterByte;

      for (let x = 0; x < width; x++) {
        const pixelOffset = srcOffset + 1 + x * bytesPerPixel;
        const colorDstOffset = colorRowOffset + 1 + x * colorBpp;
        const alphaDstOffset = alphaRowOffset + 1 + x * alphaBpp;

        // Copy color channels
        for (let c = 0; c < colorBpp; c++) {
          colorData[colorDstOffset + c] = rawData[pixelOffset + c];
        }
        // Copy alpha channel(s)
        for (let a = 0; a < alphaBpp; a++) {
          alphaData[alphaDstOffset + a] = rawData[pixelOffset + colorBpp + a];
        }
      }
    }

    // Create SMask (alpha channel as separate image)
    const smaskStream = new COSStream();
    smaskStream.setItem('Type', new COSName('XObject'));
    smaskStream.setItem('Subtype', new COSName('Image'));
    smaskStream.setItem('Width', new COSInteger(width));
    smaskStream.setItem('Height', new COSInteger(height));
    smaskStream.setItem('ColorSpace', new COSName('DeviceGray'));
    smaskStream.setItem('BitsPerComponent', new COSInteger(bitDepth));
    smaskStream.setItem('Filter', new COSName('FlateDecode'));

    const smaskParms = new COSDictionary();
    smaskParms.setDirect(true);
    smaskParms.setItem('Predictor', new COSInteger(15));
    smaskParms.setItem('Columns', new COSInteger(width));
    smaskParms.setItem('Colors', new COSInteger(1));
    smaskParms.setItem('BitsPerComponent', new COSInteger(bitDepth));
    smaskStream.setItem('DecodeParms', smaskParms);
    smaskStream.setData(pako.deflate(alphaData));

    const smaskRef = ctx.register(smaskStream);

    // Create main image
    const colorSpace = colorChannels === 1 ? 'DeviceGray' : 'DeviceRGB';
    const stream = new COSStream();
    stream.setItem('Type', new COSName('XObject'));
    stream.setItem('Subtype', new COSName('Image'));
    stream.setItem('Width', new COSInteger(width));
    stream.setItem('Height', new COSInteger(height));
    stream.setItem('ColorSpace', new COSName(colorSpace));
    stream.setItem('BitsPerComponent', new COSInteger(bitDepth));
    stream.setItem('Filter', new COSName('FlateDecode'));
    stream.setItem('SMask', smaskRef);

    const decodeParms = new COSDictionary();
    decodeParms.setDirect(true);
    decodeParms.setItem('Predictor', new COSInteger(15));
    decodeParms.setItem('Columns', new COSInteger(width));
    decodeParms.setItem('Colors', new COSInteger(colorChannels));
    decodeParms.setItem('BitsPerComponent', new COSInteger(bitDepth));
    stream.setItem('DecodeParms', decodeParms);
    stream.setData(pako.deflate(colorData));

    const ref = ctx.register(stream);
    return new PDFImage(ref, width, height);
  }
}

// ---------------------------------------------------------------------------
// JPEG header parser — extract width, height, components from SOF marker
// ---------------------------------------------------------------------------

function parseJpegHeader(bytes: Uint8Array): {
  width: number;
  height: number;
  components: number;
} {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error('Not a valid JPEG file (missing SOI marker)');
  }

  let offset = 2;
  while (offset < bytes.length - 1) {
    if (bytes[offset] !== 0xff) {
      throw new Error(`Invalid JPEG marker at offset ${offset}`);
    }
    const marker = bytes[offset + 1];

    // SOF markers (SOF0-SOF15, excluding SOF4 = DHT)
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
      const components = bytes[offset + 9];
      return { width, height, components };
    }

    // Skip this segment
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
    } else {
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      offset += 2 + length;
    }
  }

  throw new Error('JPEG SOF marker not found');
}

// ---------------------------------------------------------------------------
// PNG parser — extract header + concatenated IDAT data
// ---------------------------------------------------------------------------

interface PngInfo {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  idatData: Uint8Array;
}

function parsePng(bytes: Uint8Array): PngInfo {
  // PNG signature
  if (
    bytes[0] !== 137 ||
    bytes[1] !== 80 ||
    bytes[2] !== 78 ||
    bytes[3] !== 71
  ) {
    throw new Error('Not a valid PNG file (missing signature)');
  }

  let offset = 8; // skip signature
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idatChunks: Uint8Array[] = [];

  while (offset < bytes.length) {
    const length =
      (bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3];
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7],
    );

    if (type === 'IHDR') {
      width =
        (bytes[offset + 8] << 24) |
        (bytes[offset + 9] << 16) |
        (bytes[offset + 10] << 8) |
        bytes[offset + 11];
      height =
        (bytes[offset + 12] << 24) |
        (bytes[offset + 13] << 16) |
        (bytes[offset + 14] << 8) |
        bytes[offset + 15];
      bitDepth = bytes[offset + 16];
      colorType = bytes[offset + 17];
    } else if (type === 'IDAT') {
      idatChunks.push(bytes.slice(offset + 8, offset + 8 + length));
    } else if (type === 'IEND') {
      break;
    }

    offset += 12 + length; // 4 (length) + 4 (type) + data + 4 (crc)
  }

  // Concatenate IDAT chunks
  const totalLength = idatChunks.reduce((sum, c) => sum + c.length, 0);
  const idatData = new Uint8Array(totalLength);
  let pos = 0;
  for (const chunk of idatChunks) {
    idatData.set(chunk, pos);
    pos += chunk.length;
  }

  return { width, height, bitDepth, colorType, idatData };
}
