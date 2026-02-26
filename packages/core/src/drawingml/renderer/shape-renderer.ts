/**
 * Shape renderer — orchestrates DrawingML shape rendering on Canvas2D.
 *
 * This is the main composition layer that coordinates the independent
 * renderers from Fan-Out 2: transform, effects, geometry, fill, line,
 * and text. Each shape follows the rendering pipeline:
 *
 *   save -> transform -> effects -> geometry path -> fill -> line -> cleanup -> text -> restore
 *
 * Also provides {@link renderSlideElement} which dispatches any
 * {@link SlideElementIR} to the appropriate renderer by its `kind`.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 20.1.2 (Shape)
 */

import type {
  DrawingMLShapeIR,
  SlideElementIR,
  TableIR,
  ChartIR,
  UnsupportedIR,
  FillIR,
  LineIR,
  EffectIR,
  ResolvedColor,
} from '../../ir/index.js';
import type { RenderContext } from './render-context.js';
import { emuToScaledPx } from './render-context.js';
import { applyFill } from './fill-renderer.js';
import { applyLine } from './line-renderer.js';
import { buildPresetPaths, buildCustomPath } from '../geometry/path-builder.js';
import type { GeometrySubPath } from '../geometry/path-builder.js';
import { applyEffects } from './effect-renderer.js';
import { renderTextBody, measureTextBodyHeight } from './text-renderer.js';
import { renderPicture } from './picture-renderer.js';
import { renderGroup } from './group-renderer.js';
import { renderTable as renderTableImpl } from './table-renderer.js';
import { renderConnector } from './connector-renderer.js';
import { resolveFormatStyle } from '../../theme/index.js';
import { renderGreyBox } from '../../capability/grey-box.js';

// ---------------------------------------------------------------------------
// Placeholder rendering
// ---------------------------------------------------------------------------

/**
 * Extract position and size in pixels from a transform, returning null
 * if the element has no transform.
 */
function extractTransformPx(
  element: {
    properties: {
      transform?: { position: { x: number; y: number }; size: { width: number; height: number } };
    };
  },
  rctx: RenderContext
): { x: number; y: number; w: number; h: number } | null {
  const transform = element.properties.transform;
  if (!transform) return null;
  return {
    x: emuToScaledPx(transform.position.x, rctx),
    y: emuToScaledPx(transform.position.y, rctx),
    w: emuToScaledPx(transform.size.width, rctx),
    h: emuToScaledPx(transform.size.height, rctx),
  };
}

/**
 * Render a table element using the full table renderer.
 */
function renderTable(table: TableIR, rctx: RenderContext): void {
  renderTableImpl(table, rctx);
}

/**
 * Render a chart element as a grey-box placeholder.
 *
 * Shows "Chart (loading...)" when the chart-render WASM module is being
 * fetched, otherwise shows "Chart" with hatched grey fill.
 */
function renderChart(chart: ChartIR, rctx: RenderContext): void {
  const px = extractTransformPx(chart, rctx);
  if (!px) return;
  const loading = rctx.loadingModuleKinds?.has('chart');
  const label = loading ? 'Chart (loading\u2026)' : 'Chart';
  rctx.diagnostics?.emit({
    category: 'unsupported-element',
    severity: 'warning',
    message: `Chart element rendered as placeholder (type: ${chart.chartType})`,
    context: {
      slideNumber: rctx.slideNumber,
      elementType: 'chart',
    },
  });
  renderGreyBox(
    rctx.ctx as CanvasRenderingContext2D,
    { x: px.x, y: px.y, width: px.w, height: px.h },
    label,
    rctx.dpiScale
  );
}

/**
 * Render an unsupported element as a grey-box placeholder.
 */
function renderUnsupported(element: UnsupportedIR, rctx: RenderContext): void {
  rctx.diagnostics?.emit({
    category: 'unsupported-element',
    severity: 'warning',
    message: `Unsupported element type: ${element.elementType}`,
    context: {
      slideNumber: rctx.slideNumber,
      elementType: element.elementType,
    },
  });
  if (!element.bounds) return;
  const x = emuToScaledPx(element.bounds.x, rctx);
  const y = emuToScaledPx(element.bounds.y, rctx);
  const w = emuToScaledPx(element.bounds.width, rctx);
  const h = emuToScaledPx(element.bounds.height, rctx);
  renderGreyBox(
    rctx.ctx as CanvasRenderingContext2D,
    { x, y, width: w, height: h },
    element.elementType,
    rctx.dpiScale
  );
}

// ---------------------------------------------------------------------------
// Per-path fill mode modification
// ---------------------------------------------------------------------------

/**
 * Modify a fill color for preset geometry sub-path fill modes.
 *
 * OOXML preset shapes can specify per-path fill modes:
 * - `'norm'`: use the shape fill as-is
 * - `'darken'`: darken the fill color (~60% luminance)
 * - `'darkenLess'`: slightly darken (~75% luminance)
 * - `'lighten'`: lighten the fill color (~40% tint toward white)
 * - `'lightenLess'`: slightly lighten (~20% tint toward white)
 */
function modifyColor(
  color: ResolvedColor,
  mode: 'darken' | 'darkenLess' | 'lighten' | 'lightenLess'
): ResolvedColor {
  switch (mode) {
    case 'darken':
      return {
        ...color,
        r: Math.round(color.r * 0.6),
        g: Math.round(color.g * 0.6),
        b: Math.round(color.b * 0.6),
      };
    case 'darkenLess':
      return {
        ...color,
        r: Math.round(color.r * 0.75),
        g: Math.round(color.g * 0.75),
        b: Math.round(color.b * 0.75),
      };
    case 'lighten':
      return {
        ...color,
        r: Math.round(color.r + (255 - color.r) * 0.4),
        g: Math.round(color.g + (255 - color.g) * 0.4),
        b: Math.round(color.b + (255 - color.b) * 0.4),
      };
    case 'lightenLess':
      return {
        ...color,
        r: Math.round(color.r + (255 - color.r) * 0.2),
        g: Math.round(color.g + (255 - color.g) * 0.2),
        b: Math.round(color.b + (255 - color.b) * 0.2),
      };
  }
}

/**
 * Apply a fill mode modifier to a FillIR.
 *
 * For 'norm' mode, returns the fill unchanged. For darken/lighten modes,
 * modifies the colors in the fill. Only solid and gradient fills are
 * modified; other fill types are returned unchanged.
 */
function applyFillMode(fill: FillIR, mode: GeometrySubPath['fill']): FillIR {
  if (mode === 'norm' || mode === 'none') return fill;

  const colorMode = mode; // narrowed to 'darken' | 'darkenLess' | 'lighten' | 'lightenLess'

  if (fill.type === 'solid') {
    return { ...fill, color: modifyColor(fill.color, colorMode) };
  }

  if (fill.type === 'gradient') {
    return {
      ...fill,
      stops: fill.stops.map((stop) => ({
        ...stop,
        color: modifyColor(stop.color, colorMode),
      })),
    };
  }

  return fill;
}

// ---------------------------------------------------------------------------
// Style reference resolution
// ---------------------------------------------------------------------------

/**
 * Resolve effective fill for a shape.
 *
 * Inline fill takes precedence over style reference fill. A fill of
 * `{ type: 'none' }` is treated as "no fill specified" for precedence
 * purposes only when a style reference exists — explicit noFill in
 * inline properties is an intentional override.
 */
function resolveEffectiveFill(shape: DrawingMLShapeIR, rctx: RenderContext): FillIR | undefined {
  // Inline fill present — use it
  if (shape.properties.fill) {
    return shape.properties.fill;
  }

  // Fall back to style reference
  if (shape.style?.fillRef && shape.style.fillRef.idx > 0) {
    const resolved = resolveFormatStyle(shape.style.fillRef.idx, 'fill', rctx.theme);
    return resolved as FillIR | undefined;
  }

  return undefined;
}

/**
 * Resolve effective line for a shape.
 *
 * Inline line takes precedence over style reference line.
 */
function resolveEffectiveLine(shape: DrawingMLShapeIR, rctx: RenderContext): LineIR | undefined {
  // Inline line present — use it
  if (shape.properties.line) {
    return shape.properties.line;
  }

  // Fall back to style reference
  if (shape.style?.lnRef && shape.style.lnRef.idx > 0) {
    const resolved = resolveFormatStyle(shape.style.lnRef.idx, 'line', rctx.theme);
    if (resolved) {
      const styleLine = resolved as LineIR;
      // Apply the style reference color if the resolved line has no color
      if (!styleLine.color && shape.style.lnRef.color) {
        return { ...styleLine, color: shape.style.lnRef.color };
      }
      return styleLine;
    }
  }

  return undefined;
}

/**
 * Resolve effective effects for a shape.
 *
 * Inline effects take precedence over style reference effects.
 */
function resolveEffectiveEffects(shape: DrawingMLShapeIR, rctx: RenderContext): EffectIR[] {
  // Inline effects present and non-empty — use them
  if (shape.properties.effects.length > 0) {
    return shape.properties.effects;
  }

  // Fall back to style reference
  if (shape.style?.effectRef && shape.style.effectRef.idx > 0) {
    const resolved = resolveFormatStyle(shape.style.effectRef.idx, 'effect', rctx.theme);
    if (resolved) {
      return resolved as EffectIR[];
    }
  }

  return [];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render a single DrawingML shape to the canvas.
 *
 * Orchestrates the full rendering pipeline:
 * 1. Extract and validate transform
 * 2. Save canvas state
 * 3. Apply transform (translate, rotate, flip)
 * 4. Apply effects (shadow, glow) — merged with style references
 * 5. Build geometry path (preset or default rect)
 * 6. Apply fill — merged with style references
 * 7. Apply line/stroke — merged with style references
 * 8. Call effect cleanup
 * 9. Render text body
 * 10. Restore canvas state
 */
export function renderShape(shape: DrawingMLShapeIR, rctx: RenderContext): void {
  const { ctx } = rctx;
  const transform = shape.properties.transform;

  // No transform means nothing to render — the shape has no position or size.
  if (!transform) return;

  const { position, size, rotation, flipH, flipV } = transform;
  const x = emuToScaledPx(position.x, rctx);
  const y = emuToScaledPx(position.y, rctx);
  const w = emuToScaledPx(size.width, rctx);
  const h = emuToScaledPx(size.height, rctx);

  ctx.save();

  // -- Transform: translate to center, rotate, flip, translate back --
  ctx.translate(x + w / 2, y + h / 2);
  if (rotation) {
    ctx.rotate((rotation * Math.PI) / 180);
  }
  if (flipH) {
    ctx.scale(-1, 1);
  }
  if (flipV) {
    ctx.scale(1, -1);
  }
  ctx.translate(-w / 2, -h / 2);

  // Bounds in the local coordinate space (post-transform origin is at 0,0).
  // Use `let` so spAutoFit can expand height below.
  let bounds = { x: 0, y: 0, width: w, height: h };

  // -- spAutoFit: expand shape height to fit text content --
  // When autoFit is 'spAutoFit', the shape grows vertically to contain all
  // text. Width stays fixed. This must happen BEFORE geometry drawing so that
  // fill/stroke backgrounds also expand.
  if (shape.textBody && shape.textBody.bodyProperties.autoFit === 'spAutoFit') {
    const contentHeight = measureTextBodyHeight(shape.textBody, rctx, w);
    if (contentHeight > bounds.height) {
      bounds = { ...bounds, height: contentHeight };
    }
  }

  // -- Resolve effective properties (inline takes precedence over style refs) --
  const effectiveFill = resolveEffectiveFill(shape, rctx);
  const effectiveLine = resolveEffectiveLine(shape, rctx);
  const effectiveEffects = resolveEffectiveEffects(shape, rctx);

  // -- Effects (applied before drawing) --
  const effectCleanup = applyEffects(effectiveEffects, rctx, bounds);

  // -- Geometry path --
  // Build Path2D(s) from preset or custom geometry definitions.
  // Preset shapes may have multiple sub-paths with different fill modes
  // (e.g. curved arrows have 'norm', 'darken', and 'none' sub-paths).
  const geo = shape.properties.geometry;
  let subPaths: GeometrySubPath[] | null = null;
  let singlePath: Path2D | null = null;

  // Use bounds dimensions for geometry (may differ from w/h when spAutoFit expanded).
  const geoW = bounds.width;
  const geoH = bounds.height;

  if (geo) {
    if (geo.kind === 'preset') {
      subPaths = buildPresetPaths(geo.name, geoW, geoH, geo.adjustValues);
    } else if (geo.kind === 'custom') {
      singlePath = buildCustomPath(geo, geoW, geoH);
    }
  }

  // If we have multi-path geometry with per-path fill/stroke metadata,
  // render each sub-path with its own fill mode and stroke setting.
  if (subPaths && subPaths.length > 0) {
    for (const sp of subPaths) {
      // Apply fill based on sub-path fill mode
      if (sp.fill !== 'none' && effectiveFill) {
        const modifiedFill = applyFillMode(effectiveFill, sp.fill);
        applyFill(modifiedFill, rctx, bounds, sp.path);
      }
      // Apply stroke if this sub-path should be stroked
      if (sp.stroke && effectiveLine) {
        applyLine(effectiveLine, rctx, sp.path);
      }
    }
  } else {
    // Single path or fallback rectangle
    if (!singlePath) {
      ctx.beginPath();
      ctx.rect(0, 0, geoW, geoH);
    }

    if (effectiveFill) {
      applyFill(effectiveFill, rctx, bounds, singlePath ?? undefined);
    }
    if (effectiveLine) {
      applyLine(effectiveLine, rctx, singlePath ?? undefined);
    }
  }

  // -- Effect cleanup --
  effectCleanup();

  // -- Text body --
  if (shape.textBody) {
    renderTextBody(shape.textBody, rctx, bounds);
  }

  ctx.restore();
}

/**
 * Render any slide element by dispatching on its `kind` discriminant.
 *
 * This is the main entry point for rendering a heterogeneous list of
 * slide elements. It checks for dynamically loaded renderers first
 * (e.g., WASM modules that arrived after initial render), then falls
 * back to the built-in TypeScript renderers.
 */
export function renderSlideElement(element: SlideElementIR, rctx: RenderContext): void {
  // Check for a dynamic renderer first (e.g., a WASM-loaded chart renderer).
  const dynamic = rctx.dynamicRenderers?.get(element.kind);
  if (dynamic) {
    dynamic(element, rctx);
    return;
  }

  switch (element.kind) {
    case 'shape':
      renderShape(element, rctx);
      break;
    case 'picture':
      renderPicture(element, rctx);
      break;
    case 'group':
      renderGroup(element, rctx);
      break;
    case 'connector':
      renderConnector(element, rctx);
      break;
    case 'table':
      renderTable(element, rctx);
      break;
    case 'chart':
      renderChart(element, rctx);
      break;
    case 'unsupported':
      renderUnsupported(element, rctx);
      break;
  }
}
