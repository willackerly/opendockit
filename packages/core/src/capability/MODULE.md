# Module: Capability Registry (`@opendockit/core/capability`)

**Purpose:** Route each document element to the best available renderer. Generates RenderPlans and CoverageReports. The architectural heart of progressive fidelity.

**Tier:** Phase 2 (depends on IR types + renderer infrastructure existing)

**Inputs:** Arrays of `BaseElementIR` from parsed documents

**Outputs:**

- `registry.ts` — `CapabilityRegistry` class:
  - `.register(entry: RendererRegistration): void`
  - `.route(element: BaseElementIR): RenderVerdict`
  - `.planRender(elements: BaseElementIR[]): RenderPlan`
  - `.generateCoverageReport(elements: BaseElementIR[]): CoverageReport`
- `render-plan.ts` — `RenderPlan` type:
  - `immediate: Array<{ element, renderer }>` — render now with TS
  - `deferred: Array<{ element, moduleId, estimatedBytes }>` — needs WASM
  - `unsupported: Array<{ element, reason }>` — grey box
  - `stats: { total, supported, partial, needsWasm, unsupported }`
- `coverage-report.ts` — `CoverageReport` type with per-element status
- `index.ts` — barrel export

**Dependencies:**

- `../ir/` — `BaseElementIR` and element type unions

**Key reference:** `docs/architecture/OOXML_RENDERER.md` Part 6, `docs/architecture/PPTX_SLIDEKIT.md` "Layer 2: Capability Registry"

**Testing:** Register mock renderers, route test elements, verify plan categorization.
