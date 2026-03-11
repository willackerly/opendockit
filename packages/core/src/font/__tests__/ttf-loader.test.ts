/**
 * TTF loader tests — verifies the public API of the ttf-loader module.
 *
 * After the font delivery redesign, TTF data comes from the @opendockit/fonts
 * companion package. When the companion is not installed (as in CI/unit tests),
 * all load calls return null and hasTTFBundle returns false.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { loadTTF, clearTTFCache, hasTTFBundle } from '../ttf-loader.js';

describe('hasTTFBundle (no companion)', () => {
  it('returns false when companion is not detected', () => {
    expect(hasTTFBundle('Carlito')).toBe(false);
    expect(hasTTFBundle('carlito')).toBe(false);
    expect(hasTTFBundle('Calibri')).toBe(false);
    expect(hasTTFBundle('Liberation Sans')).toBe(false);
  });

  it('returns false for non-existent families', () => {
    expect(hasTTFBundle('nonexistent-font')).toBe(false);
    expect(hasTTFBundle('')).toBe(false);
  });
});

describe('loadTTF (no companion)', () => {
  beforeEach(() => {
    clearTTFCache();
  });

  it('returns null when companion is not installed', async () => {
    const bytes = await loadTTF('Carlito', false, false);
    expect(bytes).toBeNull();
  });

  it('returns null for nonexistent font', async () => {
    const result = await loadTTF('nonexistent-font', false, false);
    expect(result).toBeNull();
  });
});

describe('clearTTFCache', () => {
  it('does not throw', () => {
    expect(() => clearTTFCache()).not.toThrow();
  });
});
