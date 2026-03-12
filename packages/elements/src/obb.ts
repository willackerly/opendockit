/**
 * Oriented Bounding Box (OBB) utilities for precise hit testing
 * of rotated elements.
 */

/**
 * Test if a point (px, py) is inside the oriented bounding box of an element.
 * The element is defined by (x, y, width, height) with rotation in degrees
 * around its center.
 *
 * Algorithm: transform point into element's local coordinate system
 * (translate to center, rotate by -rotation), then check against
 * unrotated rectangle.
 */
export function pointInOBB(
  px: number,
  py: number,
  x: number,
  y: number,
  width: number,
  height: number,
  rotationDeg: number,
): boolean {
  // Element center
  const cx = x + width / 2;
  const cy = y + height / 2;

  // Translate point relative to center
  const dx = px - cx;
  const dy = py - cy;

  // Rotate point by -rotation into local space
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const localX = dx * cos + dy * sin;
  const localY = -dx * sin + dy * cos;

  // Check against unrotated half-extents (inclusive boundary)
  const halfW = width / 2;
  const halfH = height / 2;
  return (
    localX >= -halfW &&
    localX <= halfW &&
    localY >= -halfH &&
    localY <= halfH
  );
}
