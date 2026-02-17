/**
 * Group renderer — renders DrawingML group shapes to Canvas2D.
 *
 * A group shape is a container that nests other slide elements. It applies
 * its own transform (position, rotation, flip) and then maps children from
 * the group's child coordinate space into the group's own coordinate space.
 *
 * The child coordinate mapping uses `childOffset` and `childExtent` to
 * define the origin and scale of the nested coordinate system. Children
 * are rendered recursively via {@link renderSlideElement}.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 20.1.2.2.20 (grpSp)
 */

import type { GroupIR } from '../../ir/index.js';
import type { RenderContext } from './render-context.js';
import { emuToScaledPx } from './render-context.js';
import { renderSlideElement } from './shape-renderer.js';

/**
 * Render a group shape by applying the group transform, mapping the
 * child coordinate space, and recursively rendering all children.
 *
 * Algorithm:
 * 1. Save canvas state
 * 2. Apply group transform (translate, rotate, flip)
 * 3. Map child coordinate space (translate by -childOffset, scale to group size)
 * 4. Render each child element via renderSlideElement
 * 5. Restore canvas state
 */
export function renderGroup(group: GroupIR, rctx: RenderContext): void {
  const { ctx } = rctx;
  const transform = group.properties.transform;

  // A group without a transform has no position or size — skip it.
  if (!transform) return;

  const { position, size, rotation, flipH, flipV } = transform;
  const x = emuToScaledPx(position.x, rctx);
  const y = emuToScaledPx(position.y, rctx);
  const w = emuToScaledPx(size.width, rctx);
  const h = emuToScaledPx(size.height, rctx);

  ctx.save();

  // -- Group transform: translate to center, rotate, flip, translate back --
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

  // -- Child coordinate space mapping --
  // Children are positioned in a coordinate space defined by childOffset
  // and childExtent. We need to map that space into the group's actual
  // pixel dimensions.
  const childOffsetX = emuToScaledPx(group.childOffset.x, rctx);
  const childOffsetY = emuToScaledPx(group.childOffset.y, rctx);
  const childExtentW = emuToScaledPx(group.childExtent.width, rctx);
  const childExtentH = emuToScaledPx(group.childExtent.height, rctx);

  if (childExtentW > 0 && childExtentH > 0) {
    // Scale from child coordinate space to group pixel space.
    const scaleX = w / childExtentW;
    const scaleY = h / childExtentH;

    // Shift so that childOffset maps to 0,0.
    ctx.translate(-childOffsetX * scaleX, -childOffsetY * scaleY);
    ctx.scale(scaleX, scaleY);
  }

  // -- Render children --
  for (const child of group.children) {
    renderSlideElement(child, rctx);
  }

  ctx.restore();
}
