/**
 * Image transform utilities for Canvas2D rendering.
 *
 * Converts OOXML crop and fill-rect parameters into pixel-space
 * rectangles suitable for use with CanvasRenderingContext2D.drawImage().
 */

import type { CropRect } from '../ir/index.js';

/**
 * Calculate the source rectangle for a cropped image.
 *
 * CropRect values are fractions (0-1) measured inward from each edge.
 * A crop of { left: 0.1, top: 0.2, right: 0.1, bottom: 0.2 } means
 * 10% trimmed from left/right, 20% trimmed from top/bottom.
 *
 * Returns `{ sx, sy, sw, sh }` in image pixel coordinates, suitable
 * for the source parameters of `drawImage(img, sx, sy, sw, sh, ...)`.
 */
export function calculateCropRect(
  imageWidth: number,
  imageHeight: number,
  crop: CropRect
): { sx: number; sy: number; sw: number; sh: number } {
  const sx = crop.left * imageWidth;
  const sy = crop.top * imageHeight;
  const sw = imageWidth * (1 - crop.left - crop.right);
  const sh = imageHeight * (1 - crop.top - crop.bottom);

  return { sx, sy, sw, sh };
}

/**
 * Calculate the destination rectangle for a stretched/tiled image fill.
 *
 * The optional `fillRect` specifies insets as fractions (0-1) from each
 * edge of the target area, allowing the image to be placed within a
 * sub-region of the target.
 *
 * Returns `{ dx, dy, dw, dh }` in the target coordinate space, suitable
 * for the destination parameters of `drawImage(..., dx, dy, dw, dh)`.
 */
export function calculateStretchRect(
  targetWidth: number,
  targetHeight: number,
  fillRect?: { left: number; top: number; right: number; bottom: number }
): { dx: number; dy: number; dw: number; dh: number } {
  if (!fillRect) {
    return { dx: 0, dy: 0, dw: targetWidth, dh: targetHeight };
  }

  const dx = fillRect.left * targetWidth;
  const dy = fillRect.top * targetHeight;
  const dw = targetWidth * (1 - fillRect.left - fillRect.right);
  const dh = targetHeight * (1 - fillRect.top - fillRect.bottom);

  return { dx, dy, dw, dh };
}
