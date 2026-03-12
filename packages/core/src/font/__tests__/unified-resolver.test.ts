import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FontResolver } from '../font-resolver.js';

// Mock loadFont — FontFace API is unavailable in Node.js
vi.mock('../font-loader.js', () => ({
  loadFont: vi.fn().mockResolvedValue(true),
}));

vi.mock('../cdn-fetcher.js', () => ({
  fetchFromFontsource: vi.fn().mockResolvedValue(null),
  fetchFromGoogleFonts: vi.fn().mockResolvedValue(false),
}));

describe('FontResolver — unified pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── registerExtractedFont ─────────────────────────────────────────────

  describe('registerExtractedFont', () => {
    it('registers a font and hasFont() returns true', async () => {
      const resolver = new FontResolver();
      const data = new ArrayBuffer(64);

      const result = await resolver.registerExtractedFont('TestFont', data);
      expect(result).toBe(true);
      expect(resolver.hasFont('TestFont')).toBe(true);
    });

    it('registered font appears in getStatus with embedded source', async () => {
      const resolver = new FontResolver();
      const data = new ArrayBuffer(64);

      await resolver.registerExtractedFont('EmbeddedFont', data, 400, 'normal');

      const status = resolver.getStatus();
      const entry = status.get('embeddedfont|400|normal');
      expect(entry).toBeDefined();
      expect(entry!.resolved).toBe(true);
      expect(entry!.source).toBe('embedded');
    });

    it('accepts Uint8Array as well as ArrayBuffer', async () => {
      const resolver = new FontResolver();
      const data = new Uint8Array([0, 1, 2, 3]);

      const result = await resolver.registerExtractedFont('ByteFont', data);
      expect(result).toBe(true);
      expect(resolver.hasFont('ByteFont')).toBe(true);
    });

    it('skips re-registration if already registered', async () => {
      const resolver = new FontResolver();
      const data = new ArrayBuffer(64);

      await resolver.registerExtractedFont('DupeFont', data);
      // Second call should return true immediately
      const result = await resolver.registerExtractedFont('DupeFont', data);
      expect(result).toBe(true);
    });

    it('registers with custom weight and style', async () => {
      const resolver = new FontResolver();
      const data = new ArrayBuffer(64);

      await resolver.registerExtractedFont('BoldFont', data, 700, 'italic');

      const status = resolver.getStatus();
      const entry = status.get('boldfont|700|italic');
      expect(entry).toBeDefined();
      expect(entry!.resolved).toBe(true);
    });
  });

  // ── hasFont ───────────────────────────────────────────────────────────

  describe('hasFont', () => {
    it('returns false for unregistered family', () => {
      const resolver = new FontResolver();
      expect(resolver.hasFont('NoSuchFont')).toBe(false);
    });

    it('is case-insensitive on family name', async () => {
      const resolver = new FontResolver();
      await resolver.registerExtractedFont('CaseSensitive', new ArrayBuffer(8));

      expect(resolver.hasFont('casesensitive')).toBe(true);
      expect(resolver.hasFont('CASESENSITIVE')).toBe(true);
      expect(resolver.hasFont('CaseSensitive')).toBe(true);
    });

    it('returns true when any weight variant is resolved', async () => {
      const resolver = new FontResolver();
      await resolver.registerExtractedFont('MultiWeight', new ArrayBuffer(8), 700);

      // hasFont checks any variant — should find the 700 one
      expect(resolver.hasFont('MultiWeight')).toBe(true);
    });
  });

  // ── getRegisteredFamilies ─────────────────────────────────────────────

  describe('getRegisteredFamilies', () => {
    it('returns empty array initially', () => {
      const resolver = new FontResolver();
      expect(resolver.getRegisteredFamilies()).toEqual([]);
    });

    it('returns registered families', async () => {
      const resolver = new FontResolver();
      await resolver.registerExtractedFont('Alpha', new ArrayBuffer(8));
      await resolver.registerExtractedFont('Beta', new ArrayBuffer(8));
      await resolver.registerExtractedFont('Gamma', new ArrayBuffer(8));

      const families = resolver.getRegisteredFamilies();
      expect(families).toHaveLength(3);
      expect(families).toContain('Alpha');
      expect(families).toContain('Beta');
      expect(families).toContain('Gamma');
    });

    it('deduplicates same family with different weights', async () => {
      const resolver = new FontResolver();
      await resolver.registerExtractedFont('Shared', new ArrayBuffer(8), 400);
      await resolver.registerExtractedFont('Shared', new ArrayBuffer(8), 700);

      const families = resolver.getRegisteredFamilies();
      expect(families).toHaveLength(1);
      expect(families[0]).toBe('Shared');
    });
  });

  // ── Multiple fonts ────────────────────────────────────────────────────

  describe('multiple fonts', () => {
    it('registers several fonts, all accessible', async () => {
      const resolver = new FontResolver();
      const names = ['FontA', 'FontB', 'FontC', 'FontD'];

      for (const name of names) {
        await resolver.registerExtractedFont(name, new ArrayBuffer(8));
      }

      for (const name of names) {
        expect(resolver.hasFont(name)).toBe(true);
      }
      expect(resolver.getRegisteredFamilies()).toHaveLength(4);
    });

    it('same family different weights are both tracked', async () => {
      const resolver = new FontResolver();
      await resolver.registerExtractedFont('Roboto', new ArrayBuffer(8), 400, 'normal');
      await resolver.registerExtractedFont('Roboto', new ArrayBuffer(8), 700, 'normal');
      await resolver.registerExtractedFont('Roboto', new ArrayBuffer(8), 400, 'italic');

      const status = resolver.getStatus();
      expect(status.has('roboto|400|normal')).toBe(true);
      expect(status.has('roboto|700|normal')).toBe(true);
      expect(status.has('roboto|400|italic')).toBe(true);

      // All three resolved
      expect(status.get('roboto|400|normal')!.resolved).toBe(true);
      expect(status.get('roboto|700|normal')!.resolved).toBe(true);
      expect(status.get('roboto|400|italic')!.resolved).toBe(true);
    });
  });
});
