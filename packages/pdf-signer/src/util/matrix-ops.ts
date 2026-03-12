/**
 * Shared 6-element affine matrix utilities for the pdf-signer package.
 *
 * PDF uses a 3x3 matrix represented as [a, b, c, d, e, f]:
 *
 *   | a  b  0 |
 *   | c  d  0 |
 *   | e  f  1 |
 *
 * These helpers are intentionally kept as pdf-signer internal utilities
 * using plain number[] arrays (matching PDF convention), rather than
 * depending on @opendockit/render which uses a different struct format.
 */

/** Returns a fresh identity matrix [1, 0, 0, 1, 0, 0]. */
export function identityMatrix(): number[] {
  return [1, 0, 0, 1, 0, 0];
}

/**
 * Multiply two 6-element affine matrices: result = a * b.
 *
 * Uses PDF's pre-multiply convention where `a` is applied first
 * (i.e., `a` is the "new" transform composed onto `b`).
 */
export function multiplyMatrices(a: number[], b: number[]): number[] {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

/**
 * Transform a point (x, y) by a 6-element affine matrix.
 * Returns [x', y'].
 */
export function transformPoint(
  matrix: number[],
  x: number,
  y: number,
): [number, number] {
  return [
    matrix[0] * x + matrix[2] * y + matrix[4],
    matrix[1] * x + matrix[3] * y + matrix[5],
  ];
}
