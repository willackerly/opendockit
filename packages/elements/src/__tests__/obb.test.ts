import { describe, it, expect } from 'vitest';
import { pointInOBB } from '../obb.js';

describe('pointInOBB', () => {
  // ─── Unrotated (0°) ──────────────────────────────────

  it('returns true for point at center of unrotated rect', () => {
    expect(pointInOBB(50, 50, 0, 0, 100, 100, 0)).toBe(true);
  });

  it('returns false for point outside unrotated rect', () => {
    expect(pointInOBB(150, 50, 0, 0, 100, 100, 0)).toBe(false);
  });

  it('returns true for point on corner of unrotated rect (boundary)', () => {
    expect(pointInOBB(0, 0, 0, 0, 100, 100, 0)).toBe(true);
    expect(pointInOBB(100, 100, 0, 0, 100, 100, 0)).toBe(true);
    expect(pointInOBB(100, 0, 0, 0, 100, 100, 0)).toBe(true);
    expect(pointInOBB(0, 100, 0, 0, 100, 100, 0)).toBe(true);
  });

  // ─── 45° rotated square ──────────────────────────────

  it('returns true for point inside 45° rotated square', () => {
    // 100x100 square at (0,0), rotated 45°. Center is (50,50).
    // The rotated diamond extends from (50-~70.7, 50) to (50+~70.7, 50).
    // Center should be inside.
    expect(pointInOBB(50, 50, 0, 0, 100, 100, 45)).toBe(true);
  });

  it('returns false for point in AABB but outside 45° rotated square', () => {
    // 100x100 square at (0,0), rotated 45°. AABB corners are still reachable
    // by AABB but the actual diamond doesn't reach the original corners.
    // Point (5, 5) is near the original top-left corner — inside AABB but
    // outside the rotated diamond.
    expect(pointInOBB(5, 5, 0, 0, 100, 100, 45)).toBe(false);
    expect(pointInOBB(95, 95, 0, 0, 100, 100, 45)).toBe(false);
    expect(pointInOBB(5, 95, 0, 0, 100, 100, 45)).toBe(false);
    expect(pointInOBB(95, 5, 0, 0, 100, 100, 45)).toBe(false);
  });

  it('returns true for point on edge of 45° rotated square', () => {
    // The diamond tip is at center + halfDiag along axis.
    // For 100x100 at (0,0), center=(50,50), half-diagonal = 50*sqrt(2) ≈ 70.71
    // Top tip of diamond at (50, 50 - 70.71) — but that's outside the OBB.
    // Edge midpoint: for 45° rotation of a square, the midpoint of the top edge
    // in rotated coords maps to... let's just check the diamond vertices.
    // Vertex of the diamond: center + rotation of (50, 0) by 45°
    // = (50, 50) + (50*cos45, 50*sin45) = (50+35.36, 50+35.36) = (85.36, 85.36)
    expect(pointInOBB(85.35, 85.35, 0, 0, 100, 100, 45)).toBe(true);
  });

  // ─── 90° rotation ────────────────────────────────────

  it('90° rotation: asymmetric rect swaps dimensions effectively', () => {
    // 200x50 rect at (0,0), rotated 90°. Center is (100, 25).
    // After 90° rotation, the rect is effectively 50 wide and 200 tall,
    // centered at (100, 25). So it spans x=[75,125], y=[-75, 125].
    // Point (100, 100) should be inside the rotated rect.
    expect(pointInOBB(100, 100, 0, 0, 200, 50, 90)).toBe(true);
    // Point (50, 25) was inside the unrotated rect but is now outside.
    expect(pointInOBB(50, 25, 0, 0, 200, 50, 90)).toBe(false);
  });

  // ─── 180° rotation ───────────────────────────────────

  it('180° rotation: same as 0° for symmetric rect', () => {
    // Symmetric 100x100 square — 180° should behave identically to 0°.
    expect(pointInOBB(50, 50, 0, 0, 100, 100, 180)).toBe(true);
    // Slightly inside the corner (exact corner may have FP rounding)
    expect(pointInOBB(1, 1, 0, 0, 100, 100, 180)).toBe(true);
    expect(pointInOBB(99, 99, 0, 0, 100, 100, 180)).toBe(true);
    expect(pointInOBB(150, 50, 0, 0, 100, 100, 180)).toBe(false);
  });

  // ─── Non-square rotated rect ─────────────────────────

  it('rotation with non-square rect: verify diamond-shaped OBB', () => {
    // 200x20 narrow horizontal rect at (0,0), rotated 45°.
    // Center is (100, 10). The OBB is a narrow diamond tilted 45°.
    // Center should be inside.
    expect(pointInOBB(100, 10, 0, 0, 200, 20, 45)).toBe(true);
    // A point far along the diagonal of the tilted rect should be inside.
    // Rotated corner: center + rotate(100, 0, 45°) = (100, 10) + (70.7, 70.7)
    // = (170.7, 80.7) — this is a vertex of the OBB.
    expect(pointInOBB(170, 80, 0, 0, 200, 20, 45)).toBe(true);
    // A point perpendicular to the narrow dimension should be outside.
    expect(pointInOBB(100, 50, 0, 0, 200, 20, 45)).toBe(false);
  });

  // ─── Zero-size element ────────────────────────────────

  it('zero-size element: only exact center point hits', () => {
    expect(pointInOBB(10, 20, 10, 20, 0, 0, 0)).toBe(true);
    expect(pointInOBB(10.001, 20, 10, 20, 0, 0, 0)).toBe(false);
    expect(pointInOBB(10, 20.001, 10, 20, 0, 0, 0)).toBe(false);
  });

  it('zero-size element with rotation: only exact center point hits', () => {
    expect(pointInOBB(10, 20, 10, 20, 0, 0, 45)).toBe(true);
    expect(pointInOBB(10.001, 20, 10, 20, 0, 0, 45)).toBe(false);
  });

  // ─── Negative rotation ───────────────────────────────

  it('negative rotation works correctly', () => {
    // -45° should mirror 45° behavior
    expect(pointInOBB(50, 50, 0, 0, 100, 100, -45)).toBe(true);
    expect(pointInOBB(5, 5, 0, 0, 100, 100, -45)).toBe(false);
  });

  // ─── Non-origin position ─────────────────────────────

  it('works with non-origin element position', () => {
    // 100x100 square at (200, 300), rotated 45°
    expect(pointInOBB(250, 350, 200, 300, 100, 100, 45)).toBe(true);
    expect(pointInOBB(205, 305, 200, 300, 100, 100, 45)).toBe(false);
  });
});
