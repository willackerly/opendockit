/**
 * LRU cache for loaded media assets.
 *
 * Supports dual eviction limits: maximum entry count and maximum total bytes.
 * All get/set operations are O(1) using a Map for storage (which preserves
 * insertion order) and manual re-insertion to refresh LRU position.
 */

/** Cached media data — may be a decoded image or raw bytes. */
export type CachedMedia = ImageBitmap | HTMLImageElement | Uint8Array;

export interface MediaCacheOptions {
  /** Maximum number of entries to keep in cache. Default: 100 */
  maxEntries?: number;
  /** Maximum total bytes to keep in cache. Default: 50MB */
  maxBytes?: number;
}

interface CacheEntry {
  data: CachedMedia;
  byteSize: number;
}

const DEFAULT_MAX_ENTRIES = 100;
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

export class MediaCache {
  private readonly _maxEntries: number;
  private readonly _maxBytes: number;
  private readonly _entries = new Map<string, CacheEntry>();
  private _totalBytes = 0;

  constructor(options?: MediaCacheOptions) {
    this._maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this._maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
  }

  /**
   * Get a cached entry by part URI.
   * Returns undefined if not cached.
   * Refreshes the entry's LRU position on access.
   */
  get(partUri: string): CachedMedia | undefined {
    const entry = this._entries.get(partUri);
    if (entry === undefined) {
      return undefined;
    }
    // Refresh LRU position: delete and re-insert so it becomes the newest.
    this._entries.delete(partUri);
    this._entries.set(partUri, entry);
    return entry.data;
  }

  /**
   * Store an entry in the cache.
   * Evicts LRU (oldest) entries if limits are exceeded.
   */
  set(partUri: string, data: CachedMedia, byteSize: number): void {
    // If the key already exists, remove it first so byte accounting is correct.
    if (this._entries.has(partUri)) {
      this.delete(partUri);
    }

    // Insert the new entry (becomes the newest / most-recently-used).
    this._entries.set(partUri, { data, byteSize });
    this._totalBytes += byteSize;

    // Evict oldest entries until both limits are satisfied.
    this._evict();
  }

  /** Check if a URI is cached. */
  has(partUri: string): boolean {
    return this._entries.has(partUri);
  }

  /** Remove a specific entry. Returns true if the entry existed. */
  delete(partUri: string): boolean {
    const entry = this._entries.get(partUri);
    if (entry === undefined) {
      return false;
    }
    this._totalBytes -= entry.byteSize;
    this._entries.delete(partUri);
    return true;
  }

  /** Clear all entries. */
  clear(): void {
    this._entries.clear();
    this._totalBytes = 0;
  }

  /** Current number of entries. */
  get size(): number {
    return this._entries.size;
  }

  /** Current total bytes. */
  get totalBytes(): number {
    return this._totalBytes;
  }

  /**
   * Evict oldest (LRU) entries until both maxEntries and maxBytes limits
   * are satisfied. Map iteration order is insertion order, so the first
   * key is always the oldest.
   */
  private _evict(): void {
    while (this._entries.size > this._maxEntries || this._totalBytes > this._maxBytes) {
      // Map.keys().next() gives the oldest entry (first inserted).
      const oldest = this._entries.keys().next();
      if (oldest.done) break;
      this.delete(oldest.value);
    }
  }
}
