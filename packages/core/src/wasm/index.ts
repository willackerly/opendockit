/**
 * WASM module loading infrastructure — on-demand accelerators with
 * multi-tier caching (in-memory → Cache API → network) and progress tracking.
 *
 * Usage:
 *   import { WasmModuleLoader, DEFAULT_MANIFEST } from '@opendockit/core/wasm';
 */

// Loader
export { WasmModuleLoader } from './module-loader.js';
export type { WasmModule } from './module-loader.js';

// Manifest
export { DEFAULT_MANIFEST } from './module-manifest.js';
export type { WasmModuleEntry, WasmModuleManifest } from './module-manifest.js';

// Progress tracking
export type { LoadProgress, LoadPhase, ProgressCallback } from './progress-tracker.js';
