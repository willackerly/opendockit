/**
 * fill-stroke-path.test.ts — Verifies that fill+stroke operators (B, B*, b, b*)
 * correctly produce both fill and stroke on the canvas, and that pending clips
 * are still applied after the combined operation.
 */

import { describe, it, expect } from 'vitest';
import { createCanvas } from 'canvas';
import { NativeCanvasGraphics } from '../canvas-graphics.js';
import { OPS } from '../ops.js';
import { OperatorList } from '../operator-list.js';

/**
 * Build an OperatorList that draws a rectangle then applies
 * the given path-painting operator.
 */
function makeOpList(paintOp: number): OperatorList {
  const opList = new OperatorList();

  opList.addOp(OPS.save);

  // Set fill color to red
  opList.addOpArgs(OPS.setFillRGBColor, [1, 0, 0]);

  // Set stroke color to blue
  opList.addOpArgs(OPS.setStrokeRGBColor, [0, 0, 1]);

  // Set line width so stroke is visible
  opList.addOpArgs(OPS.setLineWidth, [4]);

  // Draw a rectangle: x=10, y=10, w=80, h=80
  opList.addOpArgs(OPS.rectangle, [10, 10, 80, 80]);

  // Apply the paint operator
  opList.addOp(paintOp);

  opList.addOp(OPS.restore);

  return opList;
}

/**
 * Build an OperatorList where W (clip) + fillStroke are used together.
 * PDF pattern: rect(50x50) -> W -> B
 * This clips to the 50x50 rect AND fill+strokes it. Then we draw a
 * green 100x100 fill — it should be clipped to 50x50.
 */
function makeOpListWithClip(paintOp: number): OperatorList {
  const opList = new OperatorList();

  opList.addOp(OPS.save);

  // Set colors
  opList.addOpArgs(OPS.setFillRGBColor, [1, 0, 0]);
  opList.addOpArgs(OPS.setStrokeRGBColor, [0, 0, 1]);
  opList.addOpArgs(OPS.setLineWidth, [2]);

  // Draw 50x50 rect, set clip, then fillStroke — consumes the clip
  opList.addOpArgs(OPS.rectangle, [0, 0, 50, 50]);
  opList.addOp(OPS.clip);
  opList.addOp(paintOp);

  // Now draw green fill over 100x100 — should be clipped to 50x50
  opList.addOpArgs(OPS.setFillRGBColor, [0, 1, 0]);
  opList.addOpArgs(OPS.rectangle, [0, 0, 100, 100]);
  opList.addOp(OPS.fill);

  opList.addOp(OPS.restore);

  return opList;
}

/**
 * Check if any pixel in the given scan area matches the predicate.
 */
function hasPixelMatching(
  data: Uint8ClampedArray,
  width: number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  predicate: (r: number, g: number, b: number, a: number) => boolean,
): boolean {
  for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) {
      const idx = (y * width + x) * 4;
      if (predicate(data[idx], data[idx + 1], data[idx + 2], data[idx + 3])) {
        return true;
      }
    }
  }
  return false;
}

const isBlue = (r: number, _g: number, b: number, a: number) =>
  r < 50 && b > 150 && a > 100;

describe('fillStroke path preservation', () => {
  it('fillStroke (B) produces both fill and stroke', () => {
    const canvas = createCanvas(100, 100);
    const ctx = canvas.getContext('2d');
    const renderer = new NativeCanvasGraphics(ctx);
    const opList = makeOpList(OPS.fillStroke);

    renderer.execute(opList);

    const data = ctx.getImageData(0, 0, 100, 100).data;

    // Center of the rectangle (50, 50) should be filled red
    // PDF y=50 -> canvas y = 100-50 = 50 (if there's a Y-flip transform)
    // But without viewport transform, PDF coords map directly.
    // The renderer just uses raw coords from the OperatorList.
    const cx = 50, cy = 50;
    const centerIdx = (cy * 100 + cx) * 4;
    expect(data[centerIdx]).toBeGreaterThan(200); // R
    expect(data[centerIdx + 3]).toBeGreaterThan(200); // A (visible)

    // Edge of the rectangle should have blue stroke pixels.
    // Check along the top edge y ~ 10, within the stroke width band.
    const foundBlueStroke = hasPixelMatching(data, 100, 10, 90, 8, 12, isBlue);
    expect(foundBlueStroke).toBe(true);
  });

  it('eoFillStroke (B*) produces both fill and stroke', () => {
    const canvas = createCanvas(100, 100);
    const ctx = canvas.getContext('2d');
    const renderer = new NativeCanvasGraphics(ctx);
    const opList = makeOpList(OPS.eoFillStroke);

    renderer.execute(opList);

    const data = ctx.getImageData(0, 0, 100, 100).data;

    // Center should be filled
    const cx = 50, cy = 50;
    const centerIdx = (cy * 100 + cx) * 4;
    expect(data[centerIdx + 3]).toBeGreaterThan(200);

    // Should have stroke pixels along edges
    const foundStroke = hasPixelMatching(data, 100, 10, 90, 8, 12, isBlue);
    expect(foundStroke).toBe(true);
  });

  it('closeFillStroke (b) produces both fill and stroke', () => {
    const canvas = createCanvas(100, 100);
    const ctx = canvas.getContext('2d');
    const renderer = new NativeCanvasGraphics(ctx);
    const opList = makeOpList(OPS.closeFillStroke);

    renderer.execute(opList);

    const data = ctx.getImageData(0, 0, 100, 100).data;

    // Center should be filled red
    const cx = 50, cy = 50;
    const centerIdx = (cy * 100 + cx) * 4;
    expect(data[centerIdx]).toBeGreaterThan(200);
    expect(data[centerIdx + 3]).toBeGreaterThan(200);

    // Should have blue stroke
    const foundStroke = hasPixelMatching(data, 100, 10, 90, 8, 12, isBlue);
    expect(foundStroke).toBe(true);
  });

  it('closeEOFillStroke (b*) produces both fill and stroke', () => {
    const canvas = createCanvas(100, 100);
    const ctx = canvas.getContext('2d');
    const renderer = new NativeCanvasGraphics(ctx);
    const opList = makeOpList(OPS.closeEOFillStroke);

    renderer.execute(opList);

    const data = ctx.getImageData(0, 0, 100, 100).data;

    // Center should be filled
    const cx = 50, cy = 50;
    const centerIdx = (cy * 100 + cx) * 4;
    expect(data[centerIdx + 3]).toBeGreaterThan(200);

    // Should have stroke
    const foundStroke = hasPixelMatching(data, 100, 10, 90, 8, 12, isBlue);
    expect(foundStroke).toBe(true);
  });

  it('pending clip is applied after fillStroke', () => {
    const canvas = createCanvas(100, 100);
    const ctx = canvas.getContext('2d');
    const renderer = new NativeCanvasGraphics(ctx);
    const opList = makeOpListWithClip(OPS.fillStroke);

    renderer.execute(opList);

    const data = ctx.getImageData(0, 0, 100, 100).data;

    // After the clip (50x50 from origin), the green fill at (75, 75)
    // should be clipped since it's outside x=[0,50], y=[0,50].
    const outsideIdx = (75 * 100 + 75) * 4;
    const isGreen =
      data[outsideIdx] < 50 &&
      data[outsideIdx + 1] > 150 &&
      data[outsideIdx + 2] < 50 &&
      data[outsideIdx + 3] > 100;
    expect(isGreen).toBe(false);
  });
});
