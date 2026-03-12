/**
 * Unified font resolution pipeline.
 *
 * Tries sources in priority order:
 *   1. Memory cache (instant)
 *   2. Companion package (@opendockit/fonts)
 *   3. App-configured fontBaseURL
 *   4. CacheStorage (persistent)
 *   5. Custom resolveFontURL
 *   6. Fontsource CDN
 *   7. Google Fonts CSS
 *   8. System fallback (return false)
 *
 * No external dependencies. Uses only built-in browser APIs + internal modules.
 */

import { loadFont } from './font-loader.js';
import { FontCache } from './font-cache.js';
import { fetchFromFontsource, fetchFromGoogleFonts } from './cdn-fetcher.js';
import { SUBSTITUTION_REGISTRY } from './substitution-table.js';
import type { SubstitutionEntry } from './substitution-table.js';
import type {
  FontConfig,
  FontSource,
  FontResolutionStatus,
} from './font-config.js';
import {
  isVariableFontFilename,
  styleToVariationAxes,
  variationSettingsCSS,
} from './variable-font.js';
import type { VariationAxes } from './variable-font.js';

/** Companion package shape (dynamic import result). */
interface CompanionModule {
  getBasePath(): string;
  getManifest(): {
    families: Record<
      string,
      {
        displayName: string;
        substituteFor?: string;
        woff2: Record<string, { file: string; size: number }>;
      }
    >;
  };
}

export class FontResolver {
  private _config: FontConfig;
  private _cache: FontCache;
  private _status = new Map<string, FontResolutionStatus>();
  private _companionBasePath: string | null = null;
  private _companionManifest: CompanionModule['getManifest'] extends () => infer R ? R : never =
    null as never;
  private _resolving = new Map<string, Promise<boolean>>();

  constructor(config: FontConfig = {}) {
    this._config = config;
    this._cache = new FontCache(config.cacheName, config.persistCache);
  }

  /**
   * Auto-detect the companion package via dynamic import.
   * Safe to call even if `@opendockit/fonts` is not installed.
   */
  async detectCompanion(): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const companionPath = '@opendockit/fonts';
      const companion = (await import(
        /* webpackIgnore: true */ /* @vite-ignore */ companionPath
      )) as CompanionModule;
      this._companionBasePath = companion.getBasePath();
      this._companionManifest = companion.getManifest();
    } catch {
      // Companion package not installed — proceed without it
    }
  }

  /**
   * Resolve and register a font. Tries sources in priority order.
   * Returns true if the font was successfully resolved and registered.
   */
  async resolve(
    family: string,
    weight: number = 400,
    style: string = 'normal',
  ): Promise<boolean> {
    const key = `${family.toLowerCase()}|${weight}|${style}`;

    // Already resolved successfully
    const existing = this._status.get(key);
    if (existing?.resolved) return true;

    // Dedup concurrent resolves for the same family/weight/style
    const inflight = this._resolving.get(key);
    if (inflight) return inflight;

    const promise = this._doResolve(family, weight, style, key);
    this._resolving.set(key, promise);
    try {
      return await promise;
    } finally {
      this._resolving.delete(key);
    }
  }

  /** Prefetch multiple families in parallel. */
  async prefetch(families: string[]): Promise<void> {
    await Promise.all(families.map((f) => this.resolve(f)));
  }

  /** Check if a family is available without network access. */
  isAvailableOffline(family: string): boolean {
    const key = family.toLowerCase();
    if (this._cache.get(family, 400, 'normal')) return true;
    if (this._companionManifest?.families?.[key]) return true;
    return false;
  }

  /** Get resolution status for diagnostics. */
  getStatus(): Map<string, FontResolutionStatus> {
    return new Map(this._status);
  }

  // ── Private ────────────────────────────────────────────────────────────

  private async _doResolve(
    family: string,
    weight: number,
    style: string,
    key: string,
  ): Promise<boolean> {
    const start = typeof performance !== 'undefined' ? performance.now() : 0;
    const offline = this._config.networkMode === 'offline';

    // 1. Memory cache
    const cached = this._cache.get(family, weight, style);
    if (cached) {
      await this._register(family, cached, weight, style);
      this._recordStatus(key, family, true, 'cache', start);
      return true;
    }

    // 2. Companion package
    if (this._companionManifest) {
      const companionResult = await this._loadFromCompanion(
        family,
        weight,
        style,
      );
      if (companionResult) {
        const axes = this._buildVariationAxes(
          companionResult.filename,
          weight,
          style,
        );
        await this._register(family, companionResult.buffer, weight, style, axes);
        await this._cache.put(family, weight, style, companionResult.buffer);
        this._recordStatus(key, family, true, 'companion', start);
        return true;
      }
    }

    // 3. App-configured base URL
    if (this._config.fontBaseURL) {
      const buffer = await this._loadFromBaseURL(family, weight, style);
      if (buffer) {
        await this._register(family, buffer, weight, style);
        await this._cache.put(family, weight, style, buffer);
        this._recordStatus(key, family, true, 'base-url', start);
        return true;
      }
    }

    // 4. CacheStorage (persistent)
    const entry = SUBSTITUTION_REGISTRY[family.toLowerCase()];
    if (entry) {
      const cdnUrl = this._fontsourceUrl(entry, weight, style);
      const persisted = await this._cache.getFromPersist(cdnUrl);
      if (persisted) {
        await this._register(family, persisted, weight, style);
        await this._cache.put(family, weight, style, persisted);
        this._recordStatus(key, family, true, 'cache', start);
        return true;
      }
    }

    // 5. Custom resolveFontURL
    if (this._config.resolveFontURL) {
      const customUrl = this._config.resolveFontURL(family, weight, style);
      if (customUrl) {
        const buffer = await this._fetchUrl(customUrl);
        if (buffer) {
          await this._register(family, buffer, weight, style);
          await this._cache.put(family, weight, style, buffer, customUrl);
          this._recordStatus(key, family, true, 'base-url', start);
          return true;
        }
      }
    }

    // ── Below here requires network ──
    if (offline) {
      this._recordStatus(key, family, false, 'none', start);
      this._emitProgress(family, 'failed', 'none', start);
      return false;
    }

    // 6. Fontsource CDN
    if (entry) {
      this._emitProgress(family, 'loading', 'cdn-fontsource', start);
      const buffer = await fetchFromFontsource(
        entry.fontsourceId,
        weight,
        style,
      );
      if (buffer) {
        const registerName = entry.officeFont || entry.substitute;
        await this._register(registerName, buffer, weight, style);
        const cdnUrl = this._fontsourceUrl(entry, weight, style);
        await this._cache.put(family, weight, style, buffer, cdnUrl);
        this._recordStatus(key, family, true, 'cdn-fontsource', start);
        this._emitProgress(family, 'loaded', 'cdn-fontsource', start);
        return true;
      }
    }

    // 7. Google Fonts CSS API (fallback)
    this._emitProgress(family, 'loading', 'cdn-google', start);
    const ok = await fetchFromGoogleFonts(family);
    if (ok) {
      this._recordStatus(key, family, true, 'cdn-google', start);
      this._emitProgress(family, 'loaded', 'cdn-google', start);
      return true;
    }

    // 8. System fallback
    this._recordStatus(key, family, false, 'system', start);
    this._emitProgress(family, 'failed', 'system', start);
    return false;
  }

  private _fontsourceUrl(
    entry: SubstitutionEntry,
    weight: number,
    style: string,
  ): string {
    return `https://cdn.jsdelivr.net/fontsource/fonts/${entry.fontsourceId}@latest/latin-${weight}-${style}.woff2`;
  }

  private async _loadFromCompanion(
    family: string,
    weight: number,
    style: string,
  ): Promise<{ buffer: ArrayBuffer; filename: string } | null> {
    if (!this._companionManifest || !this._companionBasePath) return null;
    const key = family.toLowerCase();
    const entry = this._companionManifest.families[key];
    if (!entry) return null;

    const variantKey = `latin-${weight}-${style}`;
    const variant = entry.woff2[variantKey];
    if (!variant) return null;

    try {
      const url = new URL(variant.file, this._companionBasePath).href;
      const response = await fetch(url);
      if (!response.ok) return null;
      return { buffer: await response.arrayBuffer(), filename: variant.file };
    } catch {
      return null;
    }
  }

  private async _loadFromBaseURL(
    family: string,
    weight: number,
    style: string,
  ): Promise<ArrayBuffer | null> {
    if (!this._config.fontBaseURL) return null;
    const entry = SUBSTITUTION_REGISTRY[family.toLowerCase()];
    if (!entry) return null;

    const fileName = `${entry.fontsourceId}/latin-${weight}-${style}.woff2`;
    try {
      const url = new URL(`woff2/${fileName}`, this._config.fontBaseURL).href;
      const response = await fetch(url);
      return response.ok ? response.arrayBuffer() : null;
    } catch {
      return null;
    }
  }

  private async _fetchUrl(url: string): Promise<ArrayBuffer | null> {
    try {
      const response = await fetch(url);
      return response.ok ? response.arrayBuffer() : null;
    } catch {
      return null;
    }
  }

  private async _register(
    family: string,
    buffer: ArrayBuffer,
    weight: number,
    style: string,
    variableAxes?: VariationAxes,
  ): Promise<void> {
    const descriptors: Record<string, string> = {};
    if (weight !== 400) descriptors.weight = String(weight);
    if (style !== 'normal') descriptors.style = style;
    if (variableAxes) {
      const settings = variationSettingsCSS(variableAxes);
      if (settings) {
        (descriptors as Record<string, string>).variationSettings = settings;
      }
    }
    await loadFont(family, buffer, descriptors as FontFaceDescriptors);
  }

  private _recordStatus(
    key: string,
    family: string,
    resolved: boolean,
    source: FontSource,
    startMs: number,
  ): void {
    this._status.set(key, {
      family,
      resolved,
      source,
      loadTimeMs:
        typeof performance !== 'undefined' ? performance.now() - startMs : 0,
    });
  }

  /**
   * Build variation axes when preferVariableFonts is enabled and the
   * source filename indicates a variable font.
   */
  private _buildVariationAxes(
    filename: string | undefined,
    weight: number,
    style: string,
  ): VariationAxes | undefined {
    if (!this._config.preferVariableFonts) return undefined;
    if (!filename || !isVariableFontFilename(filename)) return undefined;
    return styleToVariationAxes(weight, style === 'italic');
  }

  private _emitProgress(
    family: string,
    status: 'loading' | 'loaded' | 'failed',
    source: FontSource,
    startMs: number,
  ): void {
    if (this._config.onFontProgress) {
      this._config.onFontProgress({
        family,
        status,
        source,
        elapsed:
          typeof performance !== 'undefined'
            ? performance.now() - startMs
            : 0,
      });
    }
  }
}
