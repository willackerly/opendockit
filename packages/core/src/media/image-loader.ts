/**
 * Image loading utilities.
 *
 * Provides environment-aware image decoding:
 * - Browsers: creates ImageBitmap (preferred) or falls back to HTMLImageElement.
 * - Node.js / test: returns the raw Uint8Array unchanged.
 *
 * Also provides MIME-type detection from magic bytes and a convenience
 * function that combines loading with caching.
 */

import type { CachedMedia } from './media-cache.js';
import { MediaCache } from './media-cache.js';

// ---------------------------------------------------------------------------
// Image type detection
// ---------------------------------------------------------------------------

/**
 * Detect image MIME type from magic bytes.
 * Returns undefined if the format is not recognized.
 */
export function detectImageType(data: Uint8Array): string | undefined {
  if (data.length < 4) return undefined;

  // JPEG: FF D8 FF
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 (0x89 P N G)
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return 'image/png';
  }

  // GIF: 47 49 46 (G I F)
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) {
    return 'image/gif';
  }

  // BMP: 42 4D (B M)
  if (data[0] === 0x42 && data[1] === 0x4d) {
    return 'image/bmp';
  }

  // TIFF: 49 49 (little-endian) or 4D 4D (big-endian)
  if ((data[0] === 0x49 && data[1] === 0x49) || (data[0] === 0x4d && data[1] === 0x4d)) {
    return 'image/tiff';
  }

  // WMF: D7 CD C6 9A
  if (
    data.length >= 4 &&
    data[0] === 0xd7 &&
    data[1] === 0xcd &&
    data[2] === 0xc6 &&
    data[3] === 0x9a
  ) {
    return 'image/x-wmf';
  }

  // WEBP: starts with RIFF....WEBP
  if (data.length >= 12) {
    if (
      data[0] === 0x52 && // R
      data[1] === 0x49 && // I
      data[2] === 0x46 && // F
      data[3] === 0x46 && // F
      data[8] === 0x57 && // W
      data[9] === 0x45 && // E
      data[10] === 0x42 && // B
      data[11] === 0x50 // P
    ) {
      return 'image/webp';
    }
  }

  // EMF: starts with 01 00 00 00, then bytes 40-43 should be " EMF" (0x20 0x45 0x4D 0x46)
  if (
    data.length >= 44 &&
    data[0] === 0x01 &&
    data[1] === 0x00 &&
    data[2] === 0x00 &&
    data[3] === 0x00 &&
    data[40] === 0x20 &&
    data[41] === 0x45 &&
    data[42] === 0x4d &&
    data[43] === 0x46
  ) {
    return 'image/x-emf';
  }

  // SVG: starts with <?xml or <svg (check as text)
  if (data.length >= 5) {
    const head = String.fromCharCode(...data.slice(0, Math.min(256, data.length)));
    const trimmed = head.trimStart();
    if (trimmed.startsWith('<?xml') || trimmed.startsWith('<svg')) {
      return 'image/svg+xml';
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Image decoding
// ---------------------------------------------------------------------------

/**
 * Decode image bytes into a renderable image object.
 *
 * - **Browser with createImageBitmap:** Creates an ImageBitmap (preferred,
 *   off-main-thread decoding).
 * - **Browser without createImageBitmap:** Falls back to HTMLImageElement
 *   via a Blob URL.
 * - **Node.js / test:** Returns the raw Uint8Array (no browser APIs).
 */
export async function decodeImage(data: Uint8Array, mimeType?: string): Promise<CachedMedia> {
  const resolvedMime = mimeType ?? detectImageType(data) ?? 'application/octet-stream';

  // Check for browser environment: createImageBitmap
  if (typeof createImageBitmap === 'function' && typeof Blob === 'function') {
    const blob = new Blob([data as BlobPart], { type: resolvedMime });
    return createImageBitmap(blob);
  }

  // Fallback: HTMLImageElement via Blob URL (older browsers)
  if (
    typeof Blob === 'function' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function' &&
    typeof Image === 'function'
  ) {
    const blob = new Blob([data as BlobPart], { type: resolvedMime });
    const url = URL.createObjectURL(blob);
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`Failed to decode image (${resolvedMime})`));
      };
      img.src = url;
    });
  }

  // Node.js / test environment: return raw bytes
  return data;
}

// ---------------------------------------------------------------------------
// Load + cache
// ---------------------------------------------------------------------------

/**
 * Load and cache an image from raw bytes.
 *
 * If the image is already cached under `partUri`, the cached value is
 * returned immediately without re-decoding.
 */
export async function loadAndCacheImage(
  partUri: string,
  data: Uint8Array,
  cache: MediaCache,
  mimeType?: string
): Promise<CachedMedia> {
  const cached = cache.get(partUri);
  if (cached !== undefined) {
    return cached;
  }

  const decoded = await decodeImage(data, mimeType);
  cache.set(partUri, decoded, data.byteLength);
  return decoded;
}
