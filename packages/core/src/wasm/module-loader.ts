/**
 * On-demand WASM module loader with multi-tier caching.
 *
 * Loading cascade:
 *   1. In-memory cache (Map) — instant, same session
 *   2. Cache API (persistent) — fast, cross-session
 *   3. Network fetch → WebAssembly compile — slow, first load
 *
 * Graceful degradation:
 *   - No Cache API (Node.js, older browsers): skip tier 2
 *   - No WebAssembly.compileStreaming: fall back to compile(arrayBuffer)
 *   - No fetch: throw a clear error
 */

import type { WasmModuleManifest, WasmModuleEntry } from './module-manifest.js';
import { DEFAULT_MANIFEST } from './module-manifest.js';
import type { ProgressCallback } from './progress-tracker.js';
import type { LoadProgress } from './progress-tracker.js';

/** A loaded WASM module ready for use. */
export interface WasmModule {
  /** Module identifier from the manifest. */
  id: string;
  /** The instantiated WebAssembly instance. */
  instance: WebAssembly.Instance;
  /** Convenience reference to instance.exports, typed as callable functions. */
  exports: Record<string, Function>;
}

const DEFAULT_CACHE_NAME = 'opendockit-wasm-v1';

export class WasmModuleLoader {
  private readonly _manifest: WasmModuleManifest;
  private readonly _cacheName: string;
  private readonly _memoryCache = new Map<string, WasmModule>();
  /** Track in-flight loads to prevent duplicate parallel fetches. */
  private readonly _pending = new Map<string, Promise<WasmModule>>();

  constructor(manifest?: WasmModuleManifest, cacheName?: string) {
    this._manifest = manifest ?? DEFAULT_MANIFEST;
    this._cacheName = cacheName ?? DEFAULT_CACHE_NAME;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Load a WASM module by ID. Returns a cached instance if available,
   * otherwise fetches, compiles, and instantiates the module.
   */
  async load(moduleId: string, onProgress?: ProgressCallback): Promise<WasmModule> {
    // Deduplicate concurrent loads for the same module.
    const inflight = this._pending.get(moduleId);
    if (inflight) {
      return inflight;
    }

    const promise = this._loadInternal(moduleId, onProgress);
    this._pending.set(moduleId, promise);

    try {
      return await promise;
    } finally {
      this._pending.delete(moduleId);
    }
  }

  /** Check whether a module is already loaded in memory. */
  isLoaded(moduleId: string): boolean {
    return this._memoryCache.has(moduleId);
  }

  /** Background-preload one or more modules. Errors are silently swallowed. */
  async preload(moduleIds: string[]): Promise<void> {
    await Promise.allSettled(moduleIds.map((id) => this.load(id)));
  }

  /** Clear both in-memory and Cache API caches. */
  async clearCache(): Promise<void> {
    this._memoryCache.clear();

    if (typeof caches !== 'undefined') {
      try {
        await caches.delete(this._cacheName);
      } catch {
        // Cache API may throw in restricted contexts — ignore.
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Internal loading cascade
  // ---------------------------------------------------------------------------

  private async _loadInternal(
    moduleId: string,
    onProgress?: ProgressCallback
  ): Promise<WasmModule> {
    const entry = this._findEntry(moduleId);
    const emit = (p: Partial<LoadProgress>) =>
      onProgress?.({
        moduleId,
        phase: 'cache-check',
        bytesLoaded: 0,
        bytesTotal: entry.size,
        percent: 0,
        ...p,
      });

    // --- Tier 1: in-memory cache ---
    emit({ phase: 'cache-check', percent: 0 });
    const cached = this._memoryCache.get(moduleId);
    if (cached) {
      emit({ phase: 'ready', bytesLoaded: entry.size, percent: 100 });
      return cached;
    }

    // --- Tier 2: Cache API (persistent storage) ---
    const cacheKey = this._cacheKey(entry);
    let wasmBytes: ArrayBuffer | undefined;

    if (typeof caches !== 'undefined') {
      try {
        const cache = await caches.open(this._cacheName);
        const cacheResp = await cache.match(cacheKey);
        if (cacheResp) {
          wasmBytes = await cacheResp.arrayBuffer();
          emit({
            phase: 'compiling',
            bytesLoaded: entry.size,
            percent: 80,
          });
        }
      } catch {
        // Cache API unavailable or errored — continue to network.
      }
    }

    // --- Tier 3: network fetch ---
    if (!wasmBytes) {
      if (typeof fetch === 'undefined') {
        throw new Error(
          `[WasmModuleLoader] fetch() is not available. Cannot load module '${moduleId}'.`
        );
      }

      const url = this._resolveUrl(entry);
      emit({ phase: 'downloading', bytesLoaded: 0, percent: 0 });

      const response = await fetch(url);
      if (!response.ok) {
        emit({ phase: 'error', percent: 0 });
        throw new Error(
          `[WasmModuleLoader] Failed to fetch module '${moduleId}': HTTP ${response.status}`
        );
      }

      wasmBytes = await this._readWithProgress(response, entry.size, moduleId, onProgress);

      // Persist to Cache API for next session.
      if (typeof caches !== 'undefined') {
        try {
          const cache = await caches.open(this._cacheName);
          await cache.put(cacheKey, new Response(wasmBytes.slice(0)));
        } catch {
          // Non-critical — we already have the bytes.
        }
      }
    }

    // --- Compile and instantiate ---
    emit({ phase: 'compiling', bytesLoaded: entry.size, percent: 90 });

    let instance: WebAssembly.Instance;
    try {
      const module = await WebAssembly.compile(wasmBytes);
      instance = await WebAssembly.instantiate(module);
    } catch (err) {
      emit({ phase: 'error', percent: 0 });
      throw new Error(
        `[WasmModuleLoader] Failed to compile module '${moduleId}': ${err instanceof Error ? err.message : String(err)}`
      );
    }

    const wasmModule: WasmModule = {
      id: moduleId,
      instance,
      exports: instance.exports as unknown as Record<string, Function>,
    };

    this._memoryCache.set(moduleId, wasmModule);
    emit({ phase: 'ready', bytesLoaded: entry.size, percent: 100 });
    return wasmModule;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Look up a module entry by ID. Throws if not in the manifest. */
  private _findEntry(moduleId: string): WasmModuleEntry {
    const entry = this._manifest.modules.find((m) => m.id === moduleId);
    if (!entry) {
      throw new Error(
        `[WasmModuleLoader] Unknown module '${moduleId}'. ` +
          `Available: ${this._manifest.modules.map((m) => m.id).join(', ')}`
      );
    }
    return entry;
  }

  /** Build the full URL for a module entry. */
  private _resolveUrl(entry: WasmModuleEntry): string {
    const base = this._manifest.baseUrl.endsWith('/')
      ? this._manifest.baseUrl
      : this._manifest.baseUrl + '/';
    return base + entry.url;
  }

  /** Version-qualified cache key for Cache API storage. */
  private _cacheKey(entry: WasmModuleEntry): string {
    return `${entry.id}@${entry.version}`;
  }

  /**
   * Read a fetch Response body with progress callbacks.
   * Falls back to arrayBuffer() if ReadableStream is unavailable.
   */
  private async _readWithProgress(
    response: Response,
    expectedSize: number,
    moduleId: string,
    onProgress?: ProgressCallback
  ): Promise<ArrayBuffer> {
    // If no progress callback or no streaming body, use the simple path.
    if (!onProgress || !response.body) {
      return response.arrayBuffer();
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytesLoaded = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      bytesLoaded += value.byteLength;

      const percent = Math.min(Math.round((bytesLoaded / expectedSize) * 80), 80);
      onProgress({
        moduleId,
        phase: 'downloading',
        bytesLoaded,
        bytesTotal: expectedSize,
        percent,
      });
    }

    // Merge chunks into a single ArrayBuffer.
    const merged = new Uint8Array(bytesLoaded);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return merged.buffer;
  }
}
