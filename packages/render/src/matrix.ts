/**
 * 2D affine matrix math for rendering transforms.
 *
 * A 2D affine transform is represented as a 3x3 matrix in column-major order:
 *
 *   | a  c  tx |
 *   | b  d  ty |
 *   | 0  0  1  |
 *
 * This matches the Canvas2D `DOMMatrix` / `setTransform(a, b, c, d, e, f)` convention
 * where `e` = tx and `f` = ty.
 *
 * All operations are immutable — they return new matrices rather than
 * mutating the input.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A 2D affine transform matrix.
 *
 * Stored as the 6 independent values of the 3x3 homogeneous matrix:
 *   | a  c  tx |
 *   | b  d  ty |
 *   | 0  0  1  |
 *
 * This is the same layout as CSS `matrix(a, b, c, d, tx, ty)` and
 * Canvas2D `ctx.setTransform(a, b, c, d, tx, ty)`.
 */
export interface Matrix2D {
  /** X scale / cosine of rotation. */
  a: number;
  /** Y skew / sine of rotation. */
  b: number;
  /** X skew / negative sine of rotation. */
  c: number;
  /** Y scale / cosine of rotation. */
  d: number;
  /** X translation (tx). */
  tx: number;
  /** Y translation (ty). */
  ty: number;
}

/** A 2D point. */
export interface Vec2 {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

/** Return the identity matrix. */
export function identity(): Matrix2D {
  return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
}

/**
 * Create a translation matrix.
 *
 * @param tx - X translation
 * @param ty - Y translation
 */
export function translation(tx: number, ty: number): Matrix2D {
  return { a: 1, b: 0, c: 0, d: 1, tx, ty };
}

/**
 * Create a uniform scale matrix.
 *
 * @param sx - X scale factor
 * @param sy - Y scale factor (defaults to sx for uniform scaling)
 */
export function scaling(sx: number, sy?: number): Matrix2D {
  const s = sy ?? sx;
  return { a: sx, b: 0, c: 0, d: s, tx: 0, ty: 0 };
}

/**
 * Create a rotation matrix.
 *
 * @param angleRad - Rotation angle in radians (clockwise positive in screen space)
 */
export function rotation(angleRad: number): Matrix2D {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return { a: cos, b: sin, c: -sin, d: cos, tx: 0, ty: 0 };
}

/**
 * Create a rotation matrix from degrees.
 *
 * @param angleDeg - Rotation angle in degrees
 */
export function rotationDeg(angleDeg: number): Matrix2D {
  return rotation((angleDeg * Math.PI) / 180);
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/**
 * Multiply two matrices: result = a * b.
 *
 * Represents applying transform `b` first, then `a` (right-to-left composition).
 */
export function multiply(a: Matrix2D, b: Matrix2D): Matrix2D {
  return {
    a: a.a * b.a + a.c * b.b,
    b: a.b * b.a + a.d * b.b,
    c: a.a * b.c + a.c * b.d,
    d: a.b * b.c + a.d * b.d,
    tx: a.a * b.tx + a.c * b.ty + a.tx,
    ty: a.b * b.tx + a.d * b.ty + a.ty,
  };
}

/**
 * Transform a point by a matrix.
 *
 * @param m - Affine transform matrix
 * @param p - Input point
 * @returns Transformed point
 */
export function transformPoint(m: Matrix2D, p: Vec2): Vec2 {
  return {
    x: m.a * p.x + m.c * p.y + m.tx,
    y: m.b * p.x + m.d * p.y + m.ty,
  };
}

/**
 * Transform a vector by a matrix (translation is ignored).
 *
 * Useful for transforming direction vectors or normals.
 *
 * @param m - Affine transform matrix
 * @param v - Input vector
 * @returns Transformed vector
 */
export function transformVector(m: Matrix2D, v: Vec2): Vec2 {
  return {
    x: m.a * v.x + m.c * v.y,
    y: m.b * v.x + m.d * v.y,
  };
}

/**
 * Compute the inverse of a matrix.
 *
 * Returns `undefined` if the matrix is singular (determinant ≈ 0).
 *
 * @param m - Input matrix
 * @returns Inverse matrix, or undefined if non-invertible
 */
export function inverse(m: Matrix2D): Matrix2D | undefined {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-10) {
    return undefined;
  }
  const invDet = 1 / det;
  return {
    a: m.d * invDet,
    b: -m.b * invDet,
    c: -m.c * invDet,
    d: m.a * invDet,
    tx: (m.c * m.ty - m.d * m.tx) * invDet,
    ty: (m.b * m.tx - m.a * m.ty) * invDet,
  };
}

/**
 * Compute the determinant of a matrix.
 */
export function determinant(m: Matrix2D): number {
  return m.a * m.d - m.b * m.c;
}

// ---------------------------------------------------------------------------
// Decomposition
// ---------------------------------------------------------------------------

/**
 * Result of matrix decomposition into translation, rotation, and scale.
 */
export interface MatrixDecomposition {
  /** X translation. */
  tx: number;
  /** Y translation. */
  ty: number;
  /** Rotation angle in radians. */
  rotation: number;
  /** X scale factor. */
  scaleX: number;
  /** Y scale factor. */
  scaleY: number;
}

/**
 * Decompose a matrix into translation, rotation, and scale components.
 *
 * Assumes no shear (valid for typical OOXML transforms which compose
 * translation, rotation, and uniform/non-uniform scale without shear).
 *
 * For matrices with shear, the rotation/scale values are approximations.
 */
export function decompose(m: Matrix2D): MatrixDecomposition {
  const scaleX = Math.sqrt(m.a * m.a + m.b * m.b);
  const scaleY = Math.sqrt(m.c * m.c + m.d * m.d);
  const rotation = Math.atan2(m.b, m.a);

  return {
    tx: m.tx,
    ty: m.ty,
    rotation,
    scaleX,
    scaleY,
  };
}

// ---------------------------------------------------------------------------
// Canvas2D helpers
// ---------------------------------------------------------------------------

/**
 * Create a matrix from Canvas2D `setTransform` parameters.
 *
 * Canvas2D uses `setTransform(a, b, c, d, e, f)` where e=tx, f=ty.
 */
export function fromCanvas2D(a: number, b: number, c: number, d: number, e: number, f: number): Matrix2D {
  return { a, b, c, d, tx: e, ty: f };
}

/**
 * Convert a matrix to Canvas2D `setTransform` parameter tuple.
 *
 * Returns `[a, b, c, d, e, f]` where e=tx, f=ty.
 */
export function toCanvas2D(m: Matrix2D): [number, number, number, number, number, number] {
  return [m.a, m.b, m.c, m.d, m.tx, m.ty];
}

// ---------------------------------------------------------------------------
// Compose helpers
// ---------------------------------------------------------------------------

/**
 * Create a matrix that applies: translate → rotate → scale (in that order).
 *
 * This is the typical OOXML shape transform composition.
 *
 * @param tx - X translation
 * @param ty - Y translation
 * @param angleRad - Rotation in radians
 * @param sx - X scale
 * @param sy - Y scale
 */
export function compose(tx: number, ty: number, angleRad: number, sx: number, sy: number): Matrix2D {
  return multiply(multiply(translation(tx, ty), rotation(angleRad)), scaling(sx, sy));
}
