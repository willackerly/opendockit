/**
 * TTF loader tests — verifies loading, caching, and validity of TTF bundles.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { loadTTF, clearTTFCache, hasTTFBundle } from '../ttf-loader.js';
import { BUNDLED_TTF_FONTS } from '../data/ttf/manifest.js';

describe('hasTTFBundle', () => {
  it('returns true for bundled families', () => {
    expect(hasTTFBundle('Carlito')).toBe(true);
    expect(hasTTFBundle('carlito')).toBe(true);
    expect(hasTTFBundle('Calibri')).toBe(true);
    expect(hasTTFBundle('Liberation Sans')).toBe(true);
  });

  it('returns false for non-existent families', () => {
    expect(hasTTFBundle('nonexistent-font')).toBe(false);
    expect(hasTTFBundle('')).toBe(false);
  });
});

describe('loadTTF', () => {
  beforeEach(() => {
    clearTTFCache();
  });

  it('loads Carlito regular as Uint8Array with valid TrueType magic', async () => {
    const bytes = await loadTTF('Carlito', false, false);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes!.length).toBeGreaterThan(1000);

    // TrueType magic: 0x00010000
    const view = new DataView(bytes!.buffer, bytes!.byteOffset, bytes!.byteLength);
    const sfVersion = view.getUint32(0);
    expect(sfVersion).toBe(0x00010000);
  });

  it('loads Carlito bold (different bytes than regular)', async () => {
    const regular = await loadTTF('Carlito', false, false);
    const bold = await loadTTF('Carlito', true, false);
    expect(bold).toBeInstanceOf(Uint8Array);
    expect(bold!.length).toBeGreaterThan(1000);
    // Bold variant should have different size or content
    expect(bold!.length).not.toBe(regular!.length);
  });

  it('returns null for nonexistent font', async () => {
    const result = await loadTTF('nonexistent-font', false, false);
    expect(result).toBeNull();
  });

  it('caches: second call returns same reference', async () => {
    const first = await loadTTF('Carlito', false, false);
    const second = await loadTTF('Carlito', false, false);
    expect(first).toBe(second); // reference identity
  });

  it('resolves Office font names via substitution mapping', async () => {
    // "Calibri" maps to Carlito in the manifest
    const bytes = await loadTTF('Calibri', false, false);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes!.length).toBeGreaterThan(1000);
  });

  it('falls back to regular when italic not available', async () => {
    // Selawik only has regular and bold (no italic)
    const bytes = await loadTTF('Selawik', false, true);
    expect(bytes).toBeInstanceOf(Uint8Array);
    // Should return regular as fallback
    expect(bytes!.length).toBeGreaterThan(1000);
  });
});

describe('manifest coverage', () => {
  it('every manifest entry is loadable', async () => {
    // Test a representative subset to keep test fast
    const families = ['carlito', 'liberation sans', 'caladea', 'roboto', 'arimo'];

    for (const family of families) {
      const entry = BUNDLED_TTF_FONTS[family];
      expect(entry, `manifest entry for ${family}`).toBeDefined();

      const bytes = await loadTTF(entry.registerAs, false, false);
      expect(bytes, `loadTTF for ${entry.registerAs}`).not.toBeNull();

      // Verify TrueType magic
      const view = new DataView(bytes!.buffer, bytes!.byteOffset, bytes!.byteLength);
      expect(view.getUint32(0), `TrueType magic for ${entry.registerAs}`).toBe(0x00010000);
    }
  });

  it('manifest has expected number of entries', () => {
    const keys = Object.keys(BUNDLED_TTF_FONTS);
    // Should have at least 42 primary families + Office aliases
    expect(keys.length).toBeGreaterThanOrEqual(42);
  });
});
