import { describe, it, expect } from 'vitest';
import { MediaCache } from '../media-cache.js';

// ---------------------------------------------------------------------------
// Basic operations
// ---------------------------------------------------------------------------

describe('MediaCache basic operations', () => {
  it('returns undefined for a key not in cache', () => {
    const cache = new MediaCache();
    expect(cache.get('/ppt/media/image1.png')).toBeUndefined();
  });

  it('stores and retrieves an entry', () => {
    const cache = new MediaCache();
    const data = new Uint8Array([1, 2, 3]);
    cache.set('/ppt/media/image1.png', data, 3);
    expect(cache.get('/ppt/media/image1.png')).toBe(data);
  });

  it('has() returns true for cached keys', () => {
    const cache = new MediaCache();
    cache.set('/img.png', new Uint8Array([1]), 1);
    expect(cache.has('/img.png')).toBe(true);
    expect(cache.has('/missing.png')).toBe(false);
  });

  it('delete() removes an entry and returns true', () => {
    const cache = new MediaCache();
    const data = new Uint8Array([10, 20]);
    cache.set('/img.png', data, 2);
    expect(cache.delete('/img.png')).toBe(true);
    expect(cache.has('/img.png')).toBe(false);
    expect(cache.get('/img.png')).toBeUndefined();
  });

  it('delete() returns false for non-existent key', () => {
    const cache = new MediaCache();
    expect(cache.delete('/nope.png')).toBe(false);
  });

  it('set() replaces existing entry under the same key', () => {
    const cache = new MediaCache();
    const d1 = new Uint8Array([1]);
    const d2 = new Uint8Array([2, 3]);
    cache.set('/img.png', d1, 1);
    cache.set('/img.png', d2, 2);
    expect(cache.get('/img.png')).toBe(d2);
    expect(cache.size).toBe(1);
    expect(cache.totalBytes).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Size and totalBytes tracking
// ---------------------------------------------------------------------------

describe('MediaCache size and totalBytes', () => {
  it('size and totalBytes start at 0', () => {
    const cache = new MediaCache();
    expect(cache.size).toBe(0);
    expect(cache.totalBytes).toBe(0);
  });

  it('tracks size and totalBytes after insertions', () => {
    const cache = new MediaCache();
    cache.set('/a', new Uint8Array(100), 100);
    cache.set('/b', new Uint8Array(200), 200);
    expect(cache.size).toBe(2);
    expect(cache.totalBytes).toBe(300);
  });

  it('updates totalBytes after deletion', () => {
    const cache = new MediaCache();
    cache.set('/a', new Uint8Array(50), 50);
    cache.set('/b', new Uint8Array(75), 75);
    cache.delete('/a');
    expect(cache.size).toBe(1);
    expect(cache.totalBytes).toBe(75);
  });
});

// ---------------------------------------------------------------------------
// clear()
// ---------------------------------------------------------------------------

describe('MediaCache clear()', () => {
  it('removes all entries and resets totalBytes', () => {
    const cache = new MediaCache();
    cache.set('/a', new Uint8Array(10), 10);
    cache.set('/b', new Uint8Array(20), 20);
    cache.set('/c', new Uint8Array(30), 30);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.totalBytes).toBe(0);
    expect(cache.has('/a')).toBe(false);
    expect(cache.has('/b')).toBe(false);
    expect(cache.has('/c')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// LRU eviction by maxEntries
// ---------------------------------------------------------------------------

describe('MediaCache LRU eviction by maxEntries', () => {
  it('evicts oldest entries when maxEntries is exceeded', () => {
    const cache = new MediaCache({ maxEntries: 3 });

    cache.set('/1', new Uint8Array([1]), 1);
    cache.set('/2', new Uint8Array([2]), 1);
    cache.set('/3', new Uint8Array([3]), 1);
    cache.set('/4', new Uint8Array([4]), 1);
    cache.set('/5', new Uint8Array([5]), 1);

    // /1 and /2 should be evicted (oldest)
    expect(cache.size).toBe(3);
    expect(cache.has('/1')).toBe(false);
    expect(cache.has('/2')).toBe(false);
    expect(cache.has('/3')).toBe(true);
    expect(cache.has('/4')).toBe(true);
    expect(cache.has('/5')).toBe(true);
  });

  it('get() refreshes LRU position so entry is not evicted', () => {
    const cache = new MediaCache({ maxEntries: 3 });

    cache.set('/1', new Uint8Array([1]), 1);
    cache.set('/2', new Uint8Array([2]), 1);
    cache.set('/3', new Uint8Array([3]), 1);

    // Access /1, making it the most recently used
    cache.get('/1');

    // Insert two more — /2 and /3 should be evicted, /1 should survive
    cache.set('/4', new Uint8Array([4]), 1);
    cache.set('/5', new Uint8Array([5]), 1);

    expect(cache.size).toBe(3);
    expect(cache.has('/1')).toBe(true); // refreshed
    expect(cache.has('/2')).toBe(false); // evicted
    expect(cache.has('/3')).toBe(false); // evicted
    expect(cache.has('/4')).toBe(true);
    expect(cache.has('/5')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// LRU eviction by maxBytes
// ---------------------------------------------------------------------------

describe('MediaCache LRU eviction by maxBytes', () => {
  it('evicts oldest entries when maxBytes is exceeded', () => {
    const cache = new MediaCache({ maxBytes: 100 });

    cache.set('/a', new Uint8Array(40), 40);
    cache.set('/b', new Uint8Array(40), 40);
    // Total: 80, under limit

    cache.set('/c', new Uint8Array(40), 40);
    // Total would be 120 > 100, so /a should be evicted → 80

    expect(cache.has('/a')).toBe(false);
    expect(cache.has('/b')).toBe(true);
    expect(cache.has('/c')).toBe(true);
    expect(cache.totalBytes).toBe(80);
  });

  it('evicts multiple entries if necessary to stay under maxBytes', () => {
    const cache = new MediaCache({ maxBytes: 100 });

    cache.set('/a', new Uint8Array(30), 30);
    cache.set('/b', new Uint8Array(30), 30);
    cache.set('/c', new Uint8Array(30), 30);
    // Total: 90, under limit

    // Insert a large entry (80 bytes) → need to evict /a, /b, /c
    // until total <= 100
    cache.set('/big', new Uint8Array(80), 80);

    // /a (30), /b (30), /c (30) all evicted to make room
    // After evicting /a: 60+80=140 > 100 → evict /b: 30+80=110 > 100 → evict /c: 80 <= 100
    expect(cache.has('/a')).toBe(false);
    expect(cache.has('/b')).toBe(false);
    expect(cache.has('/c')).toBe(false);
    expect(cache.has('/big')).toBe(true);
    expect(cache.totalBytes).toBe(80);
  });

  it('get() refreshes LRU position for byte-based eviction', () => {
    const cache = new MediaCache({ maxBytes: 100 });

    cache.set('/a', new Uint8Array(40), 40);
    cache.set('/b', new Uint8Array(40), 40);
    // Total: 80

    // Access /a to make it most recently used
    cache.get('/a');

    // Insert 40 more bytes — /b (oldest) should be evicted, /a stays
    cache.set('/c', new Uint8Array(40), 40);

    expect(cache.has('/a')).toBe(true);
    expect(cache.has('/b')).toBe(false);
    expect(cache.has('/c')).toBe(true);
    expect(cache.totalBytes).toBe(80);
  });
});

// ---------------------------------------------------------------------------
// Default limits
// ---------------------------------------------------------------------------

describe('MediaCache default limits', () => {
  it('defaults to maxEntries=1000 and maxBytes=50MB without options', () => {
    const cache = new MediaCache();
    // We can't directly read the limits, but we can insert 1000 entries
    // without eviction, and the 1001st should evict the oldest.
    for (let i = 0; i < 1000; i++) {
      cache.set(`/img${i}`, new Uint8Array(1), 1);
    }
    expect(cache.size).toBe(1000);

    cache.set('/img1000', new Uint8Array(1), 1);
    expect(cache.size).toBe(1000);
    expect(cache.has('/img0')).toBe(false); // oldest evicted
    expect(cache.has('/img1000')).toBe(true);
  });
});
