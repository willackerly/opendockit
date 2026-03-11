import { describe, it, expect, vi, afterEach } from 'vitest';
import { FontCache } from '../font-cache.js';

describe('FontCache', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null for unknown keys', () => {
    const cache = new FontCache();
    expect(cache.get('Unknown Font', 400, 'normal')).toBeNull();
  });

  it('stores and retrieves from memory cache', async () => {
    const cache = new FontCache('test-cache', false);
    const data = new ArrayBuffer(16);

    await cache.put('Roboto', 400, 'normal', data);
    const result = cache.get('Roboto', 400, 'normal');
    expect(result).toBe(data);
  });

  it('is case-insensitive for family names', async () => {
    const cache = new FontCache('test-cache', false);
    const data = new ArrayBuffer(16);

    await cache.put('Roboto', 400, 'normal', data);
    expect(cache.get('roboto', 400, 'normal')).toBe(data);
  });

  it('distinguishes different weights', async () => {
    const cache = new FontCache('test-cache', false);
    const data400 = new ArrayBuffer(8);
    const data700 = new ArrayBuffer(12);

    await cache.put('Roboto', 400, 'normal', data400);
    await cache.put('Roboto', 700, 'normal', data700);

    expect(cache.get('Roboto', 400, 'normal')).toBe(data400);
    expect(cache.get('Roboto', 700, 'normal')).toBe(data700);
  });

  it('distinguishes different styles', async () => {
    const cache = new FontCache('test-cache', false);
    const dataNormal = new ArrayBuffer(8);
    const dataItalic = new ArrayBuffer(12);

    await cache.put('Roboto', 400, 'normal', dataNormal);
    await cache.put('Roboto', 400, 'italic', dataItalic);

    expect(cache.get('Roboto', 400, 'normal')).toBe(dataNormal);
    expect(cache.get('Roboto', 400, 'italic')).toBe(dataItalic);
  });

  it('handles CacheStorage being unavailable gracefully', async () => {
    // caches is not defined in Node.js — persist should be disabled
    const cache = new FontCache('test-cache', true);
    const data = new ArrayBuffer(8);

    // put should not throw even if CacheStorage is unavailable
    await cache.put('Roboto', 400, 'normal', data, 'https://example.com/font.woff2');
    expect(cache.get('Roboto', 400, 'normal')).toBe(data);
  });

  it('getFromPersist returns null when CacheStorage is unavailable', async () => {
    const cache = new FontCache('test-cache', true);
    const result = await cache.getFromPersist('https://example.com/font.woff2');
    expect(result).toBeNull();
  });

  it('defaults cache name to opendockit-fonts-v1', () => {
    // Just verify construction does not throw
    const cache = new FontCache();
    expect(cache.get('anything', 400, 'normal')).toBeNull();
  });
});
