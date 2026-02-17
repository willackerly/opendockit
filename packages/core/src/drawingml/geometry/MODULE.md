# Module: Geometry Engine (`@opendockit/core/drawingml/geometry`)

**Purpose:** Evaluate OOXML preset and custom shape geometry formulas, produce Canvas2D-ready path data. Pure math — no format dependency.

**Tier:** Fan-out 1 for evaluator + preset data (depends only on Units). Fan-out 2 for path builder + custom geometry.

**Files:**

| File | Purpose | Dependencies | Independent? |
|------|---------|-------------|-------------|
| `shape-guide-eval.ts` | Formula evaluator for shape guides | `../../units/` (angles) | Yes |
| `preset-geometries.ts` | Data file: all 200+ preset shape definitions | None (pure data) | Yes — can start Day 1 |
| `path-builder.ts` | Convert evaluated guides + path commands → Canvas2D path | `shape-guide-eval.ts` | Depends on evaluator |
| `custom-geometry.ts` | Parse `a:custGeom` XML → path data | `../../xml/`, `shape-guide-eval.ts` | Depends on evaluator + XML |
| `index.ts` | Barrel export | — | — |

**Shape Guide Formula Language:**

Operators: `val`, `*/` (multiply-divide), `+-` (add-subtract), `+/` (add-divide), `?:` (conditional), `abs`, `at2` (atan2), `cat2`, `cos`, `max`, `min`, `mod` (sqrt(a²+b²+c²)), `pin` (clamp), `sat2`, `sin`, `sqrt`, `tan`

Built-in variables: `w`, `h`, `wd2`..`wd12`, `hd2`..`hd12`, `l`, `t`, `r`, `b`, `ls`, `ss`, `cd2`, `cd4`, `cd8`, `3cd4`, `3cd8`, `5cd8`, `7cd8`

Angles are in 60000ths of a degree (5400000 = 90°).

Path commands: `moveTo`, `lnTo`, `arcTo`, `cubicBezTo`, `quadBezTo`, `close`

**Preset geometry data structure:**
```typescript
interface PresetGeometry {
  name: string;              // e.g., 'rect', 'roundRect', 'ellipse'
  avLst: AdjustValue[];      // default handle positions
  gdLst: ShapeGuide[];       // formula list
  pathLst: ShapePath[];      // drawing paths
  cxnLst?: ConnectionSite[]; // connector sites
  rect?: TextRect;           // text rectangle within shape
}
```

**Phased approach:** Start with top-40 most common shapes (covers ~95% of real slides), then batch-implement the rest. Each preset is an isolated data definition — trivially parallelizable.

**Key reference:** `docs/architecture/OOXML_RENDERER.md` Part 3.5, `docs/architecture/PPTX_SLIDEKIT.md` "3.3 Preset Geometry Engine"

**Testing:** Evaluate each preset geometry at various widths/heights. Verify path output matches expected coordinates. Visual regression for rendered shapes.
