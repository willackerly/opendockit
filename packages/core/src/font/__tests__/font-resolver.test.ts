import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FontResolver } from '../font-resolver.js';
import * as fontLoader from '../font-loader.js';
import * as cdnFetcher from '../cdn-fetcher.js';

// Mock loadFont — it uses FontFace API which is unavailable in Node.js
vi.mock('../font-loader.js', () => ({
  loadFont: vi.fn().mockResolvedValue(true),
}));

vi.mock('../cdn-fetcher.js', () => ({
  fetchFromFontsource: vi.fn().mockResolvedValue(null),
  fetchFromGoogleFonts: vi.fn().mockResolvedValue(false),
}));

describe('FontResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── Memory cache ───────────────────────────────────────────────────────

  describe('memory cache', () => {
    it('resolves from memory cache without network', async () => {
      const resolver = new FontResolver();
      // Pre-populate by resolving with a mock CDN hit
      vi.mocked(cdnFetcher.fetchFromFontsource).mockResolvedValueOnce(
        new ArrayBuffer(8),
      );

      const first = await resolver.resolve('Carlito');
      expect(first).toBe(true);

      // Second resolve should hit memory cache — no additional fetch
      vi.mocked(cdnFetcher.fetchFromFontsource).mockClear();
      const second = await resolver.resolve('Carlito');
      expect(second).toBe(true);
      // Already resolved status means it returns before fetching
      expect(cdnFetcher.fetchFromFontsource).not.toHaveBeenCalled();
    });

    it('returns true instantly when already resolved', async () => {
      const resolver = new FontResolver();
      vi.mocked(cdnFetcher.fetchFromFontsource).mockResolvedValueOnce(
        new ArrayBuffer(8),
      );

      await resolver.resolve('Carlito', 400, 'normal');

      // Resolve same key again — uses status cache
      const result = await resolver.resolve('Carlito', 400, 'normal');
      expect(result).toBe(true);
    });
  });

  // ── Offline mode ────────────────────────────────────────────────────────

  describe('offline mode', () => {
    it('returns false in offline mode when font is not cached', async () => {
      const resolver = new FontResolver({ networkMode: 'offline' });
      const result = await resolver.resolve('Carlito');
      expect(result).toBe(false);
      expect(cdnFetcher.fetchFromFontsource).not.toHaveBeenCalled();
      expect(cdnFetcher.fetchFromGoogleFonts).not.toHaveBeenCalled();
    });

    it('does not attempt any CDN fetches in offline mode', async () => {
      const resolver = new FontResolver({ networkMode: 'offline' });
      await resolver.resolve('Roboto');
      await resolver.resolve('Lato');

      expect(cdnFetcher.fetchFromFontsource).not.toHaveBeenCalled();
      expect(cdnFetcher.fetchFromGoogleFonts).not.toHaveBeenCalled();
    });
  });

  // ── Deduplication ─────────────────────────────────────────────────────

  describe('deduplication', () => {
    it('deduplicates concurrent resolves for the same family', async () => {
      const resolver = new FontResolver();
      vi.mocked(cdnFetcher.fetchFromFontsource).mockResolvedValue(
        new ArrayBuffer(8),
      );

      const [a, b, c] = await Promise.all([
        resolver.resolve('Carlito'),
        resolver.resolve('Carlito'),
        resolver.resolve('Carlito'),
      ]);

      expect(a).toBe(true);
      expect(b).toBe(true);
      expect(c).toBe(true);
      // fetchFromFontsource should be called only once due to dedup
      expect(cdnFetcher.fetchFromFontsource).toHaveBeenCalledTimes(1);
    });
  });

  // ── Custom resolveFontURL ─────────────────────────────────────────────

  describe('custom resolveFontURL', () => {
    it('resolves from custom URL resolver', async () => {
      const mockBuffer = new ArrayBuffer(16);
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockBuffer),
        }),
      );

      const resolver = new FontResolver({
        resolveFontURL: (family, weight, style) =>
          `https://fonts.corp.example.com/${family}/${weight}-${style}.woff2`,
      });

      const result = await resolver.resolve('CustomFont', 400, 'normal');
      expect(result).toBe(true);
      expect(fontLoader.loadFont).toHaveBeenCalled();
    });

    it('falls through when custom URL resolver returns null', async () => {
      const resolver = new FontResolver({
        resolveFontURL: () => null,
      });

      const result = await resolver.resolve('UnknownFont');
      expect(result).toBe(false);
    });
  });

  // ── CDN resolution ───────────────────────────────────────────────────

  describe('CDN resolution', () => {
    it('resolves known font from Fontsource CDN', async () => {
      vi.mocked(cdnFetcher.fetchFromFontsource).mockResolvedValueOnce(
        new ArrayBuffer(8),
      );

      const resolver = new FontResolver();
      const result = await resolver.resolve('Carlito');
      expect(result).toBe(true);
      expect(cdnFetcher.fetchFromFontsource).toHaveBeenCalledWith(
        'carlito',
        400,
        'normal',
      );
    });

    it('falls through to Google Fonts when Fontsource fails', async () => {
      vi.mocked(cdnFetcher.fetchFromFontsource).mockResolvedValueOnce(null);
      vi.mocked(cdnFetcher.fetchFromGoogleFonts).mockResolvedValueOnce(true);

      const resolver = new FontResolver();
      const result = await resolver.resolve('Carlito');
      expect(result).toBe(true);
    });

    it('returns false when all sources fail', async () => {
      vi.mocked(cdnFetcher.fetchFromFontsource).mockResolvedValue(null);
      vi.mocked(cdnFetcher.fetchFromGoogleFonts).mockResolvedValue(false);

      const resolver = new FontResolver();
      const result = await resolver.resolve('Carlito');
      expect(result).toBe(false);
    });

    it('registers Office font under substitute name from registry', async () => {
      vi.mocked(cdnFetcher.fetchFromFontsource).mockResolvedValueOnce(
        new ArrayBuffer(8),
      );

      const resolver = new FontResolver();
      await resolver.resolve('calibri');

      // Should register as 'Calibri' (the officeFont from the registry entry)
      expect(fontLoader.loadFont).toHaveBeenCalledWith(
        'Calibri',
        expect.any(ArrayBuffer),
        expect.any(Object),
      );
    });
  });

  // ── isAvailableOffline ────────────────────────────────────────────────

  describe('isAvailableOffline', () => {
    it('returns false when font is not cached or in companion', () => {
      const resolver = new FontResolver();
      expect(resolver.isAvailableOffline('Unknown')).toBe(false);
    });

    it('returns true after font is resolved and cached', async () => {
      vi.mocked(cdnFetcher.fetchFromFontsource).mockResolvedValueOnce(
        new ArrayBuffer(8),
      );

      const resolver = new FontResolver();
      await resolver.resolve('Carlito');

      // The font is now in memory cache
      expect(resolver.isAvailableOffline('Carlito')).toBe(true);
    });
  });

  // ── getStatus ─────────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('returns empty map initially', () => {
      const resolver = new FontResolver();
      expect(resolver.getStatus().size).toBe(0);
    });

    it('records resolution status after resolve', async () => {
      vi.mocked(cdnFetcher.fetchFromFontsource).mockResolvedValueOnce(
        new ArrayBuffer(8),
      );

      const resolver = new FontResolver();
      await resolver.resolve('Carlito', 400, 'normal');

      const status = resolver.getStatus();
      expect(status.size).toBe(1);
      const entry = status.get('carlito|400|normal');
      expect(entry).toBeDefined();
      expect(entry!.resolved).toBe(true);
      expect(entry!.source).toBe('cdn-fontsource');
      expect(entry!.loadTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('records failed resolution status', async () => {
      vi.mocked(cdnFetcher.fetchFromFontsource).mockResolvedValue(null);
      vi.mocked(cdnFetcher.fetchFromGoogleFonts).mockResolvedValue(false);

      const resolver = new FontResolver();
      await resolver.resolve('Carlito');

      const status = resolver.getStatus();
      const entry = status.get('carlito|400|normal');
      expect(entry).toBeDefined();
      expect(entry!.resolved).toBe(false);
    });

    it('returns a copy (not the internal map)', async () => {
      const resolver = new FontResolver();
      const status1 = resolver.getStatus();
      const status2 = resolver.getStatus();
      expect(status1).not.toBe(status2);
    });
  });

  // ── Progress callback ─────────────────────────────────────────────────

  describe('progress callback', () => {
    it('fires onFontProgress with correct events', async () => {
      const events: Array<{ family: string; status: string; source: string }> =
        [];
      vi.mocked(cdnFetcher.fetchFromFontsource).mockResolvedValueOnce(
        new ArrayBuffer(8),
      );

      const resolver = new FontResolver({
        onFontProgress: (event) => {
          events.push({
            family: event.family,
            status: event.status,
            source: event.source,
          });
        },
      });

      await resolver.resolve('Carlito');

      expect(events.length).toBeGreaterThanOrEqual(1);
      const loadedEvent = events.find((e) => e.status === 'loaded');
      expect(loadedEvent).toBeDefined();
      expect(loadedEvent!.source).toBe('cdn-fontsource');
    });

    it('fires failed event when all sources fail in offline mode', async () => {
      const events: Array<{ family: string; status: string; source: string }> =
        [];

      const resolver = new FontResolver({
        networkMode: 'offline',
        onFontProgress: (event) => {
          events.push({
            family: event.family,
            status: event.status,
            source: event.source,
          });
        },
      });

      await resolver.resolve('Carlito');

      const failedEvent = events.find((e) => e.status === 'failed');
      expect(failedEvent).toBeDefined();
    });
  });

  // ── Prefetch ──────────────────────────────────────────────────────────

  describe('prefetch', () => {
    it('resolves multiple families in parallel', async () => {
      vi.mocked(cdnFetcher.fetchFromFontsource).mockResolvedValue(
        new ArrayBuffer(8),
      );

      const resolver = new FontResolver();
      await resolver.prefetch(['Carlito', 'Roboto', 'Lato']);

      expect(resolver.getStatus().size).toBe(3);
    });
  });

  // ── Base URL ──────────────────────────────────────────────────────────

  describe('fontBaseURL', () => {
    it('attempts to load from configured base URL', async () => {
      const mockBuffer = new ArrayBuffer(16);
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockBuffer),
        }),
      );

      const resolver = new FontResolver({
        fontBaseURL: 'https://cdn.example.com/fonts/',
      });

      const result = await resolver.resolve('Carlito');
      expect(result).toBe(true);

      const fetchCalls = vi.mocked(fetch).mock.calls;
      const baseUrlCall = fetchCalls.find(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('cdn.example.com'),
      );
      expect(baseUrlCall).toBeDefined();
    });
  });
});
