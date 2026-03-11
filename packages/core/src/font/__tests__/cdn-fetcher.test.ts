import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchFromFontsource, fetchFromGoogleFonts } from '../cdn-fetcher.js';

describe('fetchFromFontsource', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('constructs the correct Fontsource CDN URL', async () => {
    const mockBuffer = new ArrayBuffer(8);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockBuffer),
    } as Response);

    await fetchFromFontsource('carlito', 400, 'normal', 'latin');

    expect(fetch).toHaveBeenCalledWith(
      'https://cdn.jsdelivr.net/fontsource/fonts/carlito@latest/latin-400-normal.woff2',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('uses default parameters when not specified', async () => {
    const mockBuffer = new ArrayBuffer(8);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockBuffer),
    } as Response);

    await fetchFromFontsource('roboto');

    expect(fetch).toHaveBeenCalledWith(
      'https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-400-normal.woff2',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('returns ArrayBuffer on successful fetch', async () => {
    const mockBuffer = new ArrayBuffer(16);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockBuffer),
    } as Response);

    const result = await fetchFromFontsource('carlito');
    expect(result).toBe(mockBuffer);
  });

  it('returns null on 404', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    const result = await fetchFromFontsource('nonexistent-font');
    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    const result = await fetchFromFontsource('carlito');
    expect(result).toBeNull();
  });

  it('handles custom subset and weight', async () => {
    const mockBuffer = new ArrayBuffer(8);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockBuffer),
    } as Response);

    await fetchFromFontsource('roboto', 700, 'italic', 'cyrillic');

    expect(fetch).toHaveBeenCalledWith(
      'https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/cyrillic-700-italic.woff2',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});

describe('fetchFromGoogleFonts', () => {
  it('returns false in Node.js (no document)', async () => {
    const result = await fetchFromGoogleFonts('Roboto');
    expect(result).toBe(false);
  });

  it('returns false when weights are specified but no document', async () => {
    const result = await fetchFromGoogleFonts('Lato', [300, 400, 700]);
    expect(result).toBe(false);
  });
});
