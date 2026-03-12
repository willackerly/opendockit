/**
 * Font configuration types for OpenDocKit rendering.
 *
 * These types define the contract for the FontResolver system,
 * which provides unified font resolution across multiple sources.
 */

/** Configuration passed to FontResolver. */
export interface FontConfig {
  /** Base URL for companion package or self-hosted font files. */
  fontBaseURL?: string;
  /** Eagerly fetch these families before rendering. */
  prefetchFonts?: string[];
  /** Directly register font binaries. */
  fonts?: FontRegistration[];
  /** Network policy: 'online' | 'offline' | 'prefer-offline'. Default: 'online'. */
  networkMode?: 'online' | 'offline' | 'prefer-offline';
  /** Custom font URL resolver for enterprise font servers. */
  resolveFontURL?: (family: string, weight: number, style: string) => string | null;
  /** Use CacheStorage for persistent font caching. Default: true. */
  persistCache?: boolean;
  /** CacheStorage cache name. Default: 'opendockit-fonts-v1'. */
  cacheName?: string;
  /** Progress callback for font loading. */
  onFontProgress?: (event: FontProgressEvent) => void;
  /** Prefer variable font files over static instances. Default: false. */
  preferVariableFonts?: boolean;
}

/** A font binary to register directly. */
export interface FontRegistration {
  family: string;
  src: ArrayBuffer | string;
  weight?: number;
  style?: 'normal' | 'italic';
}

/** Progress event emitted during font resolution. */
export interface FontProgressEvent {
  family: string;
  status: 'loading' | 'loaded' | 'failed';
  source: FontSource;
  elapsed: number;
}

/** Where a font was resolved from. */
export type FontSource =
  | 'user'
  | 'embedded'
  | 'companion'
  | 'base-url'
  | 'cache'
  | 'cdn-fontsource'
  | 'cdn-google'
  | 'system'
  | 'none';

/** Diagnostic info about a resolved font. */
export interface FontResolutionStatus {
  family: string;
  resolved: boolean;
  source: FontSource;
  loadTimeMs: number;
}
