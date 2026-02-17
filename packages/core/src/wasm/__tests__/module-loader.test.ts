import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WasmModuleLoader } from '../module-loader.js';
import type { WasmModuleManifest } from '../module-manifest.js';
import type { LoadProgress, ProgressCallback } from '../progress-tracker.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid WASM binary (a module with no exports). */
const MINIMAL_WASM = new Uint8Array([
  0x00,
  0x61,
  0x73,
  0x6d, // magic: \0asm
  0x01,
  0x00,
  0x00,
  0x00, // version: 1
]);

/** A test manifest with a single small module. */
const TEST_MANIFEST: WasmModuleManifest = {
  baseUrl: 'https://cdn.example.com/wasm/',
  modules: [
    {
      id: 'test-mod',
      url: 'test-mod.wasm',
      size: MINIMAL_WASM.byteLength,
      capabilities: ['test-cap'],
      version: '1.0.0',
    },
    {
      id: 'other-mod',
      url: 'other-mod.wasm',
      size: 100,
      capabilities: ['other-cap'],
      version: '2.0.0',
    },
  ],
};

/**
 * Create a mock Response that returns MINIMAL_WASM bytes.
 * Optionally includes a ReadableStream body for progress tracking.
 */
function mockResponse(options?: { withBody?: boolean }): Response {
  const buffer = MINIMAL_WASM.buffer.slice(0);

  if (options?.withBody) {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(buffer));
        controller.close();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'application/wasm' },
    });
  }

  return new Response(buffer, {
    status: 200,
    headers: { 'Content-Type': 'application/wasm' },
  });
}

/** Collect progress events into an array. */
function progressCollector(): {
  events: LoadProgress[];
  callback: ProgressCallback;
} {
  const events: LoadProgress[] = [];
  return {
    events,
    callback: (p: LoadProgress) => events.push({ ...p }),
  };
}

// ---------------------------------------------------------------------------
// Mock management
// ---------------------------------------------------------------------------

let originalFetch: typeof globalThis.fetch;
let originalCaches: typeof globalThis.caches;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  originalCaches = globalThis.caches;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  // Restore caches — may have been deleted for "unavailable" tests.
  if (originalCaches !== undefined) {
    globalThis.caches = originalCaches;
  } else {
    delete (globalThis as Record<string, unknown>).caches;
  }
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

describe('WasmModuleLoader in-memory cache', () => {
  it('returns the same instance on second load (cache hit)', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve(mockResponse()));

    const loader = new WasmModuleLoader(TEST_MANIFEST);
    const first = await loader.load('test-mod');
    const second = await loader.load('test-mod');

    expect(first).toBe(second);
    // fetch should only be called once
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('isLoaded() returns true after load, false before', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve(mockResponse()));

    const loader = new WasmModuleLoader(TEST_MANIFEST);
    expect(loader.isLoaded('test-mod')).toBe(false);

    await loader.load('test-mod');
    expect(loader.isLoaded('test-mod')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cache API integration
// ---------------------------------------------------------------------------

describe('WasmModuleLoader Cache API', () => {
  it('fetches from Cache API on second instantiation (skip network)', async () => {
    const cacheStore = new Map<string, Response>();
    const mockCache = {
      match: vi.fn((key: string) =>
        Promise.resolve(
          cacheStore.has(key) ? new Response(cacheStore.get(key)!.clone().body) : undefined
        )
      ),
      put: vi.fn((key: string, resp: Response) => {
        cacheStore.set(key, resp);
        return Promise.resolve();
      }),
    };
    globalThis.caches = {
      open: vi.fn(() => Promise.resolve(mockCache)),
      delete: vi.fn(() => Promise.resolve(true)),
      has: vi.fn(() => Promise.resolve(false)),
      keys: vi.fn(() => Promise.resolve([])),
      match: vi.fn(() => Promise.resolve(undefined)),
    } as unknown as CacheStorage;

    globalThis.fetch = vi.fn(() => Promise.resolve(mockResponse()));

    // First loader: fetches from network, stores in Cache API.
    const loader1 = new WasmModuleLoader(TEST_MANIFEST, 'test-cache');
    await loader1.load('test-mod');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(mockCache.put).toHaveBeenCalledTimes(1);

    // Second loader (new instance, no in-memory cache): should hit Cache API.
    globalThis.fetch = vi.fn(() => Promise.resolve(mockResponse()));
    const loader2 = new WasmModuleLoader(TEST_MANIFEST, 'test-cache');
    const mod = await loader2.load('test-mod');

    expect(mod.id).toBe('test-mod');
    expect(globalThis.fetch).not.toHaveBeenCalled(); // no network fetch
    expect(mockCache.match).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Network fetch with progress
// ---------------------------------------------------------------------------

describe('WasmModuleLoader network fetch', () => {
  it('fetches from network and reports progress phases', async () => {
    // Disable Cache API for this test.
    delete (globalThis as Record<string, unknown>).caches;

    globalThis.fetch = vi.fn(() => Promise.resolve(mockResponse({ withBody: true })));

    const loader = new WasmModuleLoader(TEST_MANIFEST);
    const { events, callback } = progressCollector();
    const mod = await loader.load('test-mod', callback);

    expect(mod.id).toBe('test-mod');
    expect(mod.instance).toBeInstanceOf(WebAssembly.Instance);

    // Should have phases: cache-check, downloading, compiling, ready
    const phases = events.map((e) => e.phase);
    expect(phases).toContain('cache-check');
    expect(phases).toContain('downloading');
    expect(phases).toContain('compiling');
    expect(phases).toContain('ready');
  });

  it('throws on HTTP error', async () => {
    delete (globalThis as Record<string, unknown>).caches;
    globalThis.fetch = vi.fn(() => Promise.resolve(new Response(null, { status: 404 })));

    const loader = new WasmModuleLoader(TEST_MANIFEST);
    await expect(loader.load('test-mod')).rejects.toThrow('HTTP 404');
  });
});

// ---------------------------------------------------------------------------
// Graceful degradation — no Cache API
// ---------------------------------------------------------------------------

describe('WasmModuleLoader graceful degradation', () => {
  it('works when Cache API is unavailable', async () => {
    delete (globalThis as Record<string, unknown>).caches;
    globalThis.fetch = vi.fn(() => Promise.resolve(mockResponse()));

    const loader = new WasmModuleLoader(TEST_MANIFEST);
    const mod = await loader.load('test-mod');

    expect(mod.id).toBe('test-mod');
    expect(mod.instance).toBeInstanceOf(WebAssembly.Instance);
  });

  it('throws clear error when fetch is unavailable', async () => {
    delete (globalThis as Record<string, unknown>).caches;
    delete (globalThis as Record<string, unknown>).fetch;

    const loader = new WasmModuleLoader(TEST_MANIFEST);
    await expect(loader.load('test-mod')).rejects.toThrow('fetch() is not available');
  });
});

// ---------------------------------------------------------------------------
// Version-based cache invalidation
// ---------------------------------------------------------------------------

describe('WasmModuleLoader version-based cache invalidation', () => {
  it('uses version in cache key so version bump bypasses stale cache', async () => {
    const matchCalls: string[] = [];
    const putCalls: string[] = [];

    const mockCache = {
      match: vi.fn((key: string) => {
        matchCalls.push(key);
        return Promise.resolve(undefined); // cache miss
      }),
      put: vi.fn((key: string) => {
        putCalls.push(key);
        return Promise.resolve();
      }),
    };
    globalThis.caches = {
      open: vi.fn(() => Promise.resolve(mockCache)),
      delete: vi.fn(() => Promise.resolve(true)),
      has: vi.fn(() => Promise.resolve(false)),
      keys: vi.fn(() => Promise.resolve([])),
      match: vi.fn(() => Promise.resolve(undefined)),
    } as unknown as CacheStorage;

    globalThis.fetch = vi.fn(() => Promise.resolve(mockResponse()));

    const loader = new WasmModuleLoader(TEST_MANIFEST);
    await loader.load('test-mod');

    // Cache key should include the version.
    expect(matchCalls[0]).toBe('test-mod@1.0.0');
    expect(putCalls[0]).toBe('test-mod@1.0.0');

    // Loading a module with a different version uses a different cache key.
    globalThis.fetch = vi.fn(() => Promise.resolve(mockResponse()));
    await loader.load('other-mod');
    expect(matchCalls[1]).toBe('other-mod@2.0.0');
  });
});

// ---------------------------------------------------------------------------
// Error handling — compile failure
// ---------------------------------------------------------------------------

describe('WasmModuleLoader error handling', () => {
  it('throws descriptive error on compile failure', async () => {
    delete (globalThis as Record<string, unknown>).caches;

    // Return invalid WASM bytes to trigger compile error.
    const badBytes = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(badBytes.buffer.slice(0), {
          status: 200,
        })
      )
    );

    const loader = new WasmModuleLoader(TEST_MANIFEST);
    await expect(loader.load('test-mod')).rejects.toThrow('Failed to compile module');
  });

  it('throws for unknown module ID', async () => {
    const loader = new WasmModuleLoader(TEST_MANIFEST);
    await expect(loader.load('nonexistent')).rejects.toThrow("Unknown module 'nonexistent'");
  });
});

// ---------------------------------------------------------------------------
// preload()
// ---------------------------------------------------------------------------

describe('WasmModuleLoader preload', () => {
  it('preloads multiple modules in parallel', async () => {
    delete (globalThis as Record<string, unknown>).caches;
    globalThis.fetch = vi.fn(() => Promise.resolve(mockResponse()));

    const loader = new WasmModuleLoader(TEST_MANIFEST);
    await loader.preload(['test-mod', 'other-mod']);

    expect(loader.isLoaded('test-mod')).toBe(true);
    expect(loader.isLoaded('other-mod')).toBe(true);
  });

  it('preload silently swallows errors for individual modules', async () => {
    delete (globalThis as Record<string, unknown>).caches;
    globalThis.fetch = vi.fn(() => Promise.resolve(new Response(null, { status: 500 })));

    const loader = new WasmModuleLoader(TEST_MANIFEST);
    // Should not throw even though fetch fails.
    await expect(loader.preload(['test-mod', 'other-mod'])).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// clearCache()
// ---------------------------------------------------------------------------

describe('WasmModuleLoader clearCache', () => {
  it('clears in-memory cache so next load re-fetches', async () => {
    delete (globalThis as Record<string, unknown>).caches;
    globalThis.fetch = vi.fn(() => Promise.resolve(mockResponse()));

    const loader = new WasmModuleLoader(TEST_MANIFEST);
    await loader.load('test-mod');
    expect(loader.isLoaded('test-mod')).toBe(true);

    await loader.clearCache();
    expect(loader.isLoaded('test-mod')).toBe(false);

    // Next load should fetch again.
    await loader.load('test-mod');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('deletes Cache API storage when available', async () => {
    const deleteFn = vi.fn(() => Promise.resolve(true));
    globalThis.caches = {
      open: vi.fn(),
      delete: deleteFn,
      has: vi.fn(() => Promise.resolve(false)),
      keys: vi.fn(() => Promise.resolve([])),
      match: vi.fn(() => Promise.resolve(undefined)),
    } as unknown as CacheStorage;

    const loader = new WasmModuleLoader(TEST_MANIFEST, 'my-cache');
    await loader.clearCache();

    expect(deleteFn).toHaveBeenCalledWith('my-cache');
  });

  it('clearCache works when Cache API is unavailable', async () => {
    delete (globalThis as Record<string, unknown>).caches;

    const loader = new WasmModuleLoader(TEST_MANIFEST);
    // Should not throw.
    await expect(loader.clearCache()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Deduplication of concurrent loads
// ---------------------------------------------------------------------------

describe('WasmModuleLoader deduplication', () => {
  it('deduplicates concurrent loads for the same module', async () => {
    delete (globalThis as Record<string, unknown>).caches;
    globalThis.fetch = vi.fn(() => Promise.resolve(mockResponse()));

    const loader = new WasmModuleLoader(TEST_MANIFEST);
    const [a, b] = await Promise.all([loader.load('test-mod'), loader.load('test-mod')]);

    expect(a).toBe(b);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
