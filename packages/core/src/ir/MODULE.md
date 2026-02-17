# Module: IR Types (`@opendockit/core/ir`)

**Purpose:** Define all shared Intermediate Representation types. This is the contract between parsers (which produce IR) and renderers (which consume IR). Every other module depends on these types.

**Tier:** Spine (must be implemented first — blocks everything)

**Inputs:** None (pure type definitions)

**Outputs:**
- `common.ts` — `RgbaColor`, `ResolvedColor`, `BoundingBox`, `Point`, `Size`
- `drawingml-ir.ts` — `ShapePropertiesIR`, `FillIR` (union: `SolidFillIR | GradientFillIR | PatternFillIR | PictureFillIR | NoFill`), `LineIR`, `EffectIR` (union: `OuterShadowIR | InnerShadowIR | GlowIR | ReflectionIR | SoftEdgeIR`), `TransformIR`, `GeometryIR` (union: `PresetGeometryIR | CustomGeometryIR`), `TextBodyIR`, `ParagraphIR`, `RunIR`, `CharacterPropertiesIR`, `PictureIR`, `GroupIR`, `DrawingMLShapeIR`, `BaseElementIR`, `UnsupportedIR`
- `theme-ir.ts` — `ThemeIR`, `ColorScheme`, `FontScheme`, `FormatScheme`
- `chart-ir.ts` — `ChartIR` (stub for now)
- `index.ts` — barrel export

**Dependencies:** None

**Key reference:** `docs/architecture/OOXML_RENDERER.md` Parts 3.2–3.6 contain the exact type shapes with code samples.

**Testing:** No runtime tests needed — these are pure types. TypeScript compiler is the test. Create a `__tests__/ir-smoke.test.ts` that constructs a few IR objects to verify the types are usable.

**Critical rule:** Once committed, these types are the shared contract. Changing them requires coordinating with all downstream agents. Design carefully.
