/**
 * Geometry Path Builder.
 *
 * Converts evaluated preset and custom geometry definitions into Canvas2D
 * Path2D objects. Handles guide resolution, coordinate scaling, and all
 * OOXML path command types (moveTo, lnTo, cubicBezTo, quadBezTo, arcTo, close).
 *
 * Note: Path2D is a browser API. In Node.js (test) environments where
 * Path2D is not available, build functions return null.
 *
 * Reference: ECMA-376 5th Edition, Part 1, 20.1.9 (Shape Definitions)
 */

import type { CustomGeometryIR, PathCommandIR } from '../../ir/index.js';
import type { GuideContext } from './shape-guide-eval.js';
import { createGuideContext, evaluateGuides, evaluateFormula } from './shape-guide-eval.js';
import { getPresetGeometry } from './preset-geometries.js';
import type { PresetPathCommand } from './preset-geometries.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a Canvas2D Path2D from a preset geometry definition.
 *
 * Evaluates guides at the given width/height, then traces paths.
 * Returns null if the preset is not found or Path2D is not available.
 *
 * @param presetName Preset shape name, e.g. "rect", "roundRect", "ellipse"
 * @param width Shape width in px (already converted from EMU)
 * @param height Shape height in px (already converted from EMU)
 * @param adjustValues Optional adjust value overrides
 * @returns A completed Path2D, or null if unavailable
 */
export function buildPresetPath(
  presetName: string,
  width: number,
  height: number,
  adjustValues?: Record<string, number>
): Path2D | null {
  if (typeof Path2D === 'undefined') {
    return null;
  }

  const preset = getPresetGeometry(presetName);
  if (!preset) {
    return null;
  }

  // Merge adjust values: preset defaults, then user overrides
  const mergedAdjust: Record<string, number> = {};
  for (const av of preset.avLst) {
    const val = evaluateFormula(av.fmla, createGuideContext(width, height));
    mergedAdjust[av.name] = val;
  }
  if (adjustValues) {
    for (const [name, value] of Object.entries(adjustValues)) {
      mergedAdjust[name] = value;
    }
  }

  // Create guide context and evaluate guide list
  const ctx = createGuideContext(width, height, mergedAdjust);
  evaluateGuides(preset.gdLst, ctx);

  // Build Path2D from all paths in the preset
  const path2d = new Path2D();

  for (const presetPath of preset.pathLst) {
    tracePresetPath(path2d, presetPath.commands, ctx, presetPath.w, presetPath.h, width, height);
  }

  return path2d;
}

/**
 * Build a Canvas2D Path2D from a custom geometry IR.
 *
 * Returns null if Path2D is not available.
 *
 * @param geometry Custom geometry IR with guides and paths
 * @param width Shape width in px
 * @param height Shape height in px
 * @returns A completed Path2D, or null if unavailable
 */
export function buildCustomPath(
  geometry: CustomGeometryIR,
  width: number,
  height: number
): Path2D | null {
  if (typeof Path2D === 'undefined') {
    return null;
  }

  // Create guide context — custom geometry guides include both avLst and gdLst
  // The guides array from the IR already combines them in order
  const ctx = createGuideContext(width, height);
  evaluateGuides(
    geometry.guides.map((g) => ({ name: g.name, fmla: g.formula })),
    ctx
  );

  const path2d = new Path2D();

  for (const shapePath of geometry.paths) {
    traceCustomPath(
      path2d,
      shapePath.commands,
      ctx,
      shapePath.width,
      shapePath.height,
      width,
      height
    );
  }

  return path2d;
}

/**
 * Trace preset path commands onto a Path2D, resolving formula references
 * through the guide context.
 *
 * Preset path commands use string references for coordinates that must
 * be resolved through the guide context.
 *
 * @param path2d The Path2D to draw onto
 * @param commands Preset path commands with string references
 * @param ctx Guide context for resolving references
 * @param pathWidth Path coordinate space width (undefined = shape width)
 * @param pathHeight Path coordinate space height (undefined = shape height)
 * @param shapeWidth Actual shape width in px
 * @param shapeHeight Actual shape height in px
 */
export function tracePresetPath(
  path2d: Path2D,
  commands: PresetPathCommand[],
  ctx: GuideContext,
  pathWidth: number | undefined,
  pathHeight: number | undefined,
  shapeWidth: number,
  shapeHeight: number
): void {
  // Coordinate scaling: if the path defines its own coordinate space,
  // scale from path coords to shape coords
  const scaleX = pathWidth !== undefined && pathWidth > 0 ? shapeWidth / pathWidth : 1;
  const scaleY = pathHeight !== undefined && pathHeight > 0 ? shapeHeight / pathHeight : 1;

  /** Resolve a string reference to a numeric value, then scale. */
  const resolveX = (ref: string): number => resolveRef(ref, ctx) * scaleX;
  const resolveY = (ref: string): number => resolveRef(ref, ctx) * scaleY;

  // Track current point for arcTo calculations
  let curX = 0;
  let curY = 0;

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'moveTo': {
        const x = resolveX(cmd.x);
        const y = resolveY(cmd.y);
        path2d.moveTo(x, y);
        curX = x;
        curY = y;
        break;
      }

      case 'lnTo': {
        const x = resolveX(cmd.x);
        const y = resolveY(cmd.y);
        path2d.lineTo(x, y);
        curX = x;
        curY = y;
        break;
      }

      case 'cubicBezTo': {
        if (cmd.pts.length >= 3) {
          const x1 = resolveX(cmd.pts[0].x);
          const y1 = resolveY(cmd.pts[0].y);
          const x2 = resolveX(cmd.pts[1].x);
          const y2 = resolveY(cmd.pts[1].y);
          const x = resolveX(cmd.pts[2].x);
          const y = resolveY(cmd.pts[2].y);
          path2d.bezierCurveTo(x1, y1, x2, y2, x, y);
          curX = x;
          curY = y;
        }
        break;
      }

      case 'quadBezTo': {
        if (cmd.pts.length >= 2) {
          const x1 = resolveX(cmd.pts[0].x);
          const y1 = resolveY(cmd.pts[0].y);
          const x = resolveX(cmd.pts[1].x);
          const y = resolveY(cmd.pts[1].y);
          path2d.quadraticCurveTo(x1, y1, x, y);
          curX = x;
          curY = y;
        }
        break;
      }

      case 'arcTo': {
        const wR = resolveRef(cmd.wR, ctx) * scaleX;
        const hR = resolveRef(cmd.hR, ctx) * scaleY;
        const stAngOoxml = resolveRef(cmd.stAng, ctx);
        const swAngOoxml = resolveRef(cmd.swAng, ctx);

        // OOXML angles are in 60,000ths of a degree
        const stAngRad = (stAngOoxml / 60000) * (Math.PI / 180);
        const swAngRad = (swAngOoxml / 60000) * (Math.PI / 180);

        if (wR > 0 && hR > 0 && Math.abs(swAngRad) > 1e-10) {
          // Compute ellipse center from current point, radii, and start angle
          const cx = curX - wR * Math.cos(stAngRad);
          const cy = curY - hR * Math.sin(stAngRad);

          const endAngle = stAngRad + swAngRad;
          const counterclockwise = swAngRad < 0;

          path2d.ellipse(cx, cy, wR, hR, 0, stAngRad, endAngle, counterclockwise);

          // Update current point to the end of the arc
          curX = cx + wR * Math.cos(endAngle);
          curY = cy + hR * Math.sin(endAngle);
        }
        break;
      }

      case 'close': {
        path2d.closePath();
        break;
      }
    }
  }
}

/**
 * Trace custom geometry path commands (IR format) onto a Path2D.
 *
 * Custom path commands use numeric coordinates that may need scaling
 * from path coordinate space to shape coordinate space.
 *
 * @param path2d The Path2D to draw onto
 * @param commands IR path commands with numeric coordinates
 * @param _ctx Guide context (reserved for future formula-based custom coords)
 * @param pathWidth Path coordinate space width (undefined = shape width)
 * @param pathHeight Path coordinate space height (undefined = shape height)
 * @param shapeWidth Actual shape width in px
 * @param shapeHeight Actual shape height in px
 */
export function traceCustomPath(
  path2d: Path2D,
  commands: PathCommandIR[],
  _ctx: GuideContext,
  pathWidth: number | undefined,
  pathHeight: number | undefined,
  shapeWidth: number,
  shapeHeight: number
): void {
  const scaleX = pathWidth !== undefined && pathWidth > 0 ? shapeWidth / pathWidth : 1;
  const scaleY = pathHeight !== undefined && pathHeight > 0 ? shapeHeight / pathHeight : 1;

  let curX = 0;
  let curY = 0;

  for (const cmd of commands) {
    switch (cmd.kind) {
      case 'moveTo': {
        const x = cmd.x * scaleX;
        const y = cmd.y * scaleY;
        path2d.moveTo(x, y);
        curX = x;
        curY = y;
        break;
      }

      case 'lineTo': {
        const x = cmd.x * scaleX;
        const y = cmd.y * scaleY;
        path2d.lineTo(x, y);
        curX = x;
        curY = y;
        break;
      }

      case 'cubicBezierTo': {
        const x1 = cmd.x1 * scaleX;
        const y1 = cmd.y1 * scaleY;
        const x2 = cmd.x2 * scaleX;
        const y2 = cmd.y2 * scaleY;
        const x = cmd.x * scaleX;
        const y = cmd.y * scaleY;
        path2d.bezierCurveTo(x1, y1, x2, y2, x, y);
        curX = x;
        curY = y;
        break;
      }

      case 'quadBezierTo': {
        const x1 = cmd.x1 * scaleX;
        const y1 = cmd.y1 * scaleY;
        const x = cmd.x * scaleX;
        const y = cmd.y * scaleY;
        path2d.quadraticCurveTo(x1, y1, x, y);
        curX = x;
        curY = y;
        break;
      }

      case 'arcTo': {
        const wR = cmd.wR * scaleX;
        const hR = cmd.hR * scaleY;
        // Custom geometry IR angles are already in degrees (parsed via parseAngle)
        const stAngRad = (cmd.startAngle * Math.PI) / 180;
        const swAngRad = (cmd.sweepAngle * Math.PI) / 180;

        if (wR > 0 && hR > 0 && Math.abs(swAngRad) > 1e-10) {
          const cx = curX - wR * Math.cos(stAngRad);
          const cy = curY - hR * Math.sin(stAngRad);

          const endAngle = stAngRad + swAngRad;
          const counterclockwise = swAngRad < 0;

          path2d.ellipse(cx, cy, wR, hR, 0, stAngRad, endAngle, counterclockwise);

          curX = cx + wR * Math.cos(endAngle);
          curY = cy + hR * Math.sin(endAngle);
        }
        break;
      }

      case 'close': {
        path2d.closePath();
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a string reference to a numeric value.
 *
 * If the string is a numeric literal, parse it directly.
 * Otherwise, look it up in the guide context.
 */
function resolveRef(ref: string, ctx: GuideContext): number {
  const num = Number(ref);
  if (!isNaN(num) && ref.trim() !== '') {
    return num;
  }
  return ctx.get(ref);
}
