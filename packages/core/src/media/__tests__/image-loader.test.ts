import { describe, it, expect } from 'vitest';
import { detectImageType, decodeImage, loadAndCacheImage } from '../image-loader.js';
import { MediaCache } from '../media-cache.js';

// ---------------------------------------------------------------------------
// detectImageType
// ---------------------------------------------------------------------------

describe('detectImageType', () => {
  it('detects JPEG from magic bytes', () => {
    const data = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    expect(detectImageType(data)).toBe('image/jpeg');
  });

  it('detects PNG from magic bytes', () => {
    const data = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectImageType(data)).toBe('image/png');
  });

  it('detects GIF from magic bytes', () => {
    const data = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    expect(detectImageType(data)).toBe('image/gif');
  });

  it('detects WEBP from RIFF....WEBP header', () => {
    // RIFF????WEBP
    const data = new Uint8Array([
      0x52,
      0x49,
      0x46,
      0x46, // RIFF
      0x00,
      0x00,
      0x00,
      0x00, // file size (placeholder)
      0x57,
      0x45,
      0x42,
      0x50, // WEBP
    ]);
    expect(detectImageType(data)).toBe('image/webp');
  });

  it('detects BMP from magic bytes', () => {
    const data = new Uint8Array([0x42, 0x4d, 0x00, 0x00, 0x00, 0x00]);
    expect(detectImageType(data)).toBe('image/bmp');
  });

  it('detects TIFF (little-endian) from magic bytes', () => {
    const data = new Uint8Array([0x49, 0x49, 0x2a, 0x00]);
    expect(detectImageType(data)).toBe('image/tiff');
  });

  it('detects TIFF (big-endian) from magic bytes', () => {
    const data = new Uint8Array([0x4d, 0x4d, 0x00, 0x2a]);
    expect(detectImageType(data)).toBe('image/tiff');
  });

  it('detects WMF from magic bytes', () => {
    const data = new Uint8Array([0xd7, 0xcd, 0xc6, 0x9a, 0x00, 0x00]);
    expect(detectImageType(data)).toBe('image/x-wmf');
  });

  it('detects SVG from <?xml header', () => {
    const svg = '<?xml version="1.0"?><svg></svg>';
    const data = new TextEncoder().encode(svg);
    expect(detectImageType(data)).toBe('image/svg+xml');
  });

  it('detects SVG from <svg header', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    const data = new TextEncoder().encode(svg);
    expect(detectImageType(data)).toBe('image/svg+xml');
  });

  it('returns undefined for unknown bytes', () => {
    const data = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
    expect(detectImageType(data)).toBeUndefined();
  });

  it('returns undefined for empty data', () => {
    const data = new Uint8Array([]);
    expect(detectImageType(data)).toBeUndefined();
  });

  it('returns undefined for data shorter than 4 bytes', () => {
    const data = new Uint8Array([0xff, 0xd8]);
    expect(detectImageType(data)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// decodeImage (Node.js environment — no browser APIs)
// ---------------------------------------------------------------------------

describe('decodeImage in Node.js', () => {
  it('returns raw Uint8Array when no browser APIs are available', async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const result = await decodeImage(data, 'image/png');
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result).toBe(data);
  });

  it('returns raw Uint8Array without explicit mimeType', async () => {
    const data = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]);
    const result = await decodeImage(data);
    expect(result).toBeInstanceOf(Uint8Array);
  });
});

// ---------------------------------------------------------------------------
// loadAndCacheImage
// ---------------------------------------------------------------------------

describe('loadAndCacheImage', () => {
  it('decodes and caches the image', async () => {
    const cache = new MediaCache();
    const data = new Uint8Array([10, 20, 30]);
    const result = await loadAndCacheImage('/ppt/media/image1.png', data, cache);

    // In Node.js, returns Uint8Array
    expect(result).toBeInstanceOf(Uint8Array);
    expect(cache.has('/ppt/media/image1.png')).toBe(true);
    expect(cache.size).toBe(1);
  });

  it('returns cached value on second call without re-decoding', async () => {
    const cache = new MediaCache();
    const data = new Uint8Array([10, 20, 30]);

    const first = await loadAndCacheImage('/img.png', data, cache);
    const second = await loadAndCacheImage('/img.png', data, cache);

    // Should be the same reference (from cache)
    expect(second).toBe(first);
  });

  it('tracks byte size in cache', async () => {
    const cache = new MediaCache();
    const data = new Uint8Array(256);
    await loadAndCacheImage('/big.png', data, cache);

    expect(cache.totalBytes).toBe(256);
  });
});
