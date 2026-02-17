/**
 * WASM module metadata types and default manifest.
 *
 * Each entry describes a WASM accelerator module that can be loaded on demand
 * when progressive fidelity requires capabilities beyond pure Canvas2D.
 */

/** Metadata for a single WASM module. */
export interface WasmModuleEntry {
  /** Unique module identifier, e.g. 'text-layout', 'chart-render'. */
  id: string;
  /** Relative URL (appended to manifest baseUrl) for the .wasm file. */
  url: string;
  /** Expected file size in bytes (used for progress tracking). */
  size: number;
  /** Capability tags this module provides, e.g. ['text-autofit', 'text-columns']. */
  capabilities: string[];
  /** Semver string for cache invalidation — changing version busts the cache. */
  version: string;
}

/** A collection of WASM modules and the base URL they are served from. */
export interface WasmModuleManifest {
  /** All available WASM modules. */
  modules: WasmModuleEntry[];
  /** Base URL prefix prepended to each module's relative URL. */
  baseUrl: string;
}

/**
 * Default manifest with entries for all planned WASM accelerator modules.
 * URLs are relative to baseUrl and will resolve once the modules are built.
 */
export const DEFAULT_MANIFEST: WasmModuleManifest = {
  baseUrl: '/wasm/',
  modules: [
    {
      id: 'text-layout',
      url: 'text-layout.wasm',
      size: 200 * 1024,
      capabilities: ['text-autofit', 'text-columns', 'text-overflow'],
      version: '0.0.1',
    },
    {
      id: 'chart-render',
      url: 'chart-render.wasm',
      size: 500 * 1024,
      capabilities: ['chart-bar', 'chart-pie', 'chart-line', 'chart-scatter'],
      version: '0.0.1',
    },
    {
      id: 'effect-engine',
      url: 'effect-engine.wasm',
      size: 300 * 1024,
      capabilities: ['effect-3d', 'effect-reflection', 'effect-artistic'],
      version: '0.0.1',
    },
    {
      id: 'emf-wmf',
      url: 'emf-wmf.wasm',
      size: 150 * 1024,
      capabilities: ['emf-image', 'wmf-image'],
      version: '0.0.1',
    },
    {
      id: 'smartart',
      url: 'smartart.wasm',
      size: 400 * 1024,
      capabilities: ['smartart-layout'],
      version: '0.0.1',
    },
  ],
};
