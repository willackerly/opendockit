/**
 * Render a PictureIR element to Canvas2D.
 *
 * Handles image lookup from the media cache, crop/stretch transforms,
 * rotation, and horizontal/vertical flips. When an image is not yet
 * loaded (cache miss), a placeholder rectangle is drawn instead.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 20.1.8.1 (blipFill)
 */

import type { PictureIR } from '../../ir/index.js';
import type { CachedMedia } from '../../media/index.js';
import { calculateCropRect } from '../../media/index.js';
import type { RenderContext } from './render-context.js';
import { emuToScaledPx } from './render-context.js';

/**
 * Type guard: checks whether a CachedMedia value is a drawable image source.
 *
 * Canvas2D's drawImage accepts ImageBitmap and HTMLImageElement but not
 * raw Uint8Array buffers. If we only have raw bytes, we treat the image
 * as not-yet-decoded and fall back to the placeholder.
 */
function isDrawableImage(
  media: CachedMedia
): media is ImageBitmap | HTMLImageElement {
  // In Node/test environments these globals may not exist, so we
  // also accept any object that has a `width` and `height` property
  // (duck-typing for mock images).
  if (media instanceof Uint8Array) return false;
  const obj = media as { width?: number; height?: number };
  return typeof obj.width === 'number' && typeof obj.height === 'number';
}

/**
 * Draw a placeholder rectangle when the image is unavailable.
 */
function drawPlaceholder(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  dx: number,
  dy: number,
  dw: number,
  dh: number
): void {
  ctx.save();
  ctx.fillStyle = '#E0E0E0';
  ctx.fillRect(dx, dy, dw, dh);
  ctx.fillStyle = '#999';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Image', dx + dw / 2, dy + dh / 2);
  ctx.restore();
}

/**
 * Render a picture element to the canvas.
 *
 * Steps:
 * 1. Convert EMU position/size to scaled pixels.
 * 2. Look up the image in the media cache.
 * 3. If missing or undecoded, draw a placeholder.
 * 4. Apply rotation and flip transforms.
 * 5. Calculate source rect (crop) and destination rect.
 * 6. Draw using the 9-argument form of drawImage.
 */
export function renderPicture(pictureIR: PictureIR, rctx: RenderContext): void {
  const { ctx, mediaCache } = rctx;
  const transform = pictureIR.properties.transform;

  if (!transform) return;

  // Convert EMU position and size to scaled pixels.
  const dx = emuToScaledPx(transform.position.x, rctx);
  const dy = emuToScaledPx(transform.position.y, rctx);
  const dw = emuToScaledPx(transform.size.width, rctx);
  const dh = emuToScaledPx(transform.size.height, rctx);

  // Retrieve the image from the cache.
  const media = mediaCache.get(pictureIR.imagePartUri);

  if (!media || !isDrawableImage(media)) {
    drawPlaceholder(ctx, dx, dy, dw, dh);
    return;
  }

  const image = media as CanvasImageSource & {
    width: number;
    height: number;
  };
  const imageWidth = image.width;
  const imageHeight = image.height;

  // Calculate source rectangle (crop).
  let sx = 0;
  let sy = 0;
  let sw = imageWidth;
  let sh = imageHeight;

  if (pictureIR.blipFill?.crop) {
    const crop = calculateCropRect(imageWidth, imageHeight, pictureIR.blipFill.crop);
    sx = crop.sx;
    sy = crop.sy;
    sw = crop.sw;
    sh = crop.sh;
  }

  // Apply transforms (rotation, flip).
  const hasRotation = transform.rotation !== undefined && transform.rotation !== 0;
  const hasFlipH = transform.flipH === true;
  const hasFlipV = transform.flipV === true;
  const needsTransform = hasRotation || hasFlipH || hasFlipV;

  if (needsTransform) {
    ctx.save();

    // Translate to the center of the destination rect for rotation/flip.
    const cx = dx + dw / 2;
    const cy = dy + dh / 2;
    ctx.translate(cx, cy);

    if (hasRotation) {
      const rotRad = (transform.rotation! * Math.PI) / 180;
      ctx.rotate(rotRad);
    }

    if (hasFlipH || hasFlipV) {
      ctx.scale(hasFlipH ? -1 : 1, hasFlipV ? -1 : 1);
    }

    // Draw relative to the center (translate back by half-size).
    ctx.drawImage(image, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  } else {
    ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
  }
}
