/**
 * Download progress tracking for WASM module loading.
 *
 * Consumers pass a ProgressCallback to WasmModuleLoader.load() to receive
 * granular phase and byte-level progress updates.
 */

/** Current loading phase for a WASM module. */
export type LoadPhase = 'cache-check' | 'downloading' | 'compiling' | 'ready' | 'error';

/** Snapshot of a module's loading progress. */
export interface LoadProgress {
  /** Which module this progress event is for. */
  moduleId: string;
  /** Current loading phase. */
  phase: LoadPhase;
  /** Bytes downloaded so far (0 for non-download phases). */
  bytesLoaded: number;
  /** Total expected bytes (from manifest). */
  bytesTotal: number;
  /** Completion percentage 0–100. */
  percent: number;
}

/** Callback invoked as loading progresses. */
export type ProgressCallback = (progress: LoadProgress) => void;
