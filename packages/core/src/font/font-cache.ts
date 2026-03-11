/**
 * Two-level font cache: in-memory Map + browser CacheStorage.
 *
 * Memory is checked first (instant). CacheStorage is checked second
 * (persists across page loads). No external dependencies.
 */

export class FontCache {
  private _memory = new Map<string, ArrayBuffer>();
  private _cacheName: string;
  private _persistEnabled: boolean;

  constructor(cacheName = 'opendockit-fonts-v1', persist = true) {
    this._cacheName = cacheName;
    this._persistEnabled = persist && typeof caches !== 'undefined';
  }

  /** Generate cache key from family + weight + style. */
  private _key(family: string, weight: number, style: string): string {
    return `${family.toLowerCase()}|${weight}|${style}`;
  }

  /** Check memory cache. Returns null on miss. */
  get(family: string, weight: number, style: string): ArrayBuffer | null {
    return this._memory.get(this._key(family, weight, style)) ?? null;
  }

  /** Store in memory and optionally in CacheStorage. */
  async put(
    family: string,
    weight: number,
    style: string,
    data: ArrayBuffer,
    url?: string,
  ): Promise<void> {
    this._memory.set(this._key(family, weight, style), data);

    if (this._persistEnabled && url) {
      try {
        const cache = await caches.open(this._cacheName);
        await cache.put(
          url,
          new Response(data, {
            headers: { 'Content-Type': 'font/woff2' },
          }),
        );
      } catch {
        // CacheStorage unavailable or quota exceeded — silently skip
      }
    }
  }

  /** Check CacheStorage for a previously cached URL. */
  async getFromPersist(url: string): Promise<ArrayBuffer | null> {
    if (!this._persistEnabled) return null;
    try {
      const cache = await caches.open(this._cacheName);
      const response = await cache.match(url);
      return response ? response.arrayBuffer() : null;
    } catch {
      return null;
    }
  }
}
