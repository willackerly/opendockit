# Module: WASM Module Loader (`@opendockit/core/wasm`)

**Purpose:** On-demand loading of WASM rendering accelerators with Cache API persistence and progress tracking.

**Tier:** Phase 3 (not needed until progressive fidelity infrastructure)

**Inputs:** Module IDs (e.g., `'text-layout'`, `'effect-engine'`, `'chart-render'`)

**Outputs:**

- `module-loader.ts` — `WasmModuleLoader` class:
  - `.load(moduleId, onProgress): Promise<WasmModule>`
  - In-memory cache → Cache API → network fetch → `WebAssembly.compileStreaming`
- `module-manifest.ts` — Module metadata (ID → URL, size, capabilities)
- `progress-tracker.ts` — Per-element download progress tracking
- `index.ts` — barrel export

**Dependencies:** None (browser APIs only: Cache API, WebAssembly, fetch)

**Key reference:** `docs/architecture/PPTX_SLIDEKIT.md` "Layer 4: WASM Modules"

**Testing:** Mock fetch + Cache API. Verify caching, progress callbacks, error handling.
