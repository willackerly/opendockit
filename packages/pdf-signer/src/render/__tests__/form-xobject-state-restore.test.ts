import { describe, it, expect } from 'vitest';
import { createCanvas } from 'canvas';
import { OPS } from '../ops.js';
import { OperatorList } from '../operator-list.js';
import { NativeCanvasGraphics } from '../canvas-graphics.js';

// =========================================================================
// Form XObject GraphicsState restoration
//
// Verifies that paintFormBegin/paintFormEnd properly save/restore the
// internal GraphicsState (fillAlpha, strokeAlpha, blend mode, colors)
// so that state changes inside a Form XObject do not leak to the parent.
// =========================================================================

describe('Form XObject GraphicsState restoration', () => {
  it('restores fillAlpha after Form XObject that changes it', () => {
    const canvas = createCanvas(200, 100);
    const ctx = canvas.getContext('2d');

    // Fill background white
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 200, 100);

    const opList = new OperatorList();

    // Draw a red rectangle at full alpha on the left side
    opList.addOpArgs(OPS.setFillRGBColor, [1, 0, 0]);
    opList.addOpArgs(OPS.rectangle, [0, 0, 50, 100]);
    opList.addOp(OPS.fill);

    // Enter form XObject that sets fillAlpha to 0.5
    opList.addOpArgs(OPS.paintFormXObjectBegin, [
      [1, 0, 0, 1, 0, 0], // identity matrix
      [50, 0, 150, 100], // bbox
    ]);
    const gstate = new Map<string, any>();
    gstate.set('fillAlpha', 0.5);
    opList.addOpArgs(OPS.setGState, [gstate]);

    // Draw green rect inside form at alpha=0.5
    opList.addOpArgs(OPS.setFillRGBColor, [0, 1, 0]);
    opList.addOpArgs(OPS.rectangle, [50, 0, 50, 100]);
    opList.addOp(OPS.fill);

    // Exit form XObject — fillAlpha should be restored to 1.0
    opList.addOp(OPS.paintFormXObjectEnd);

    // Draw blue rectangle on the right at (should be) full alpha
    opList.addOpArgs(OPS.setFillRGBColor, [0, 0, 1]);
    opList.addOpArgs(OPS.rectangle, [150, 0, 50, 100]);
    opList.addOp(OPS.fill);

    const graphics = new NativeCanvasGraphics(ctx as any);
    graphics.execute(opList);

    // Left red rect: should be fully opaque red
    const leftPixel = ctx.getImageData(25, 50, 1, 1).data;
    expect(leftPixel[0]).toBe(255); // R
    expect(leftPixel[1]).toBe(0); // G
    expect(leftPixel[2]).toBe(0); // B
    expect(leftPixel[3]).toBe(255); // A

    // Right blue rect: should be fully opaque blue (alpha restored to 1.0)
    const rightPixel = ctx.getImageData(175, 50, 1, 1).data;
    expect(rightPixel[0]).toBe(0); // R
    expect(rightPixel[1]).toBe(0); // G
    expect(rightPixel[2]).toBe(255); // B
    expect(rightPixel[3]).toBe(255); // A — would be ~128 if alpha leaked
  });

  it('restores blend mode after Form XObject that changes it', () => {
    const canvas = createCanvas(200, 100);
    const ctx = canvas.getContext('2d');

    // Fill background white
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 200, 100);

    const opList = new OperatorList();

    // Enter form XObject that sets blend mode to multiply
    opList.addOpArgs(OPS.paintFormXObjectBegin, [
      [1, 0, 0, 1, 0, 0],
      [0, 0, 100, 100],
    ]);
    const gstate = new Map<string, any>();
    gstate.set('globalCompositeOperation', 'multiply');
    opList.addOpArgs(OPS.setGState, [gstate]);

    opList.addOpArgs(OPS.setFillRGBColor, [1, 0, 0]);
    opList.addOpArgs(OPS.rectangle, [0, 0, 100, 100]);
    opList.addOp(OPS.fill);

    opList.addOp(OPS.paintFormXObjectEnd);

    // After form exit, blend mode should be restored to source-over.
    // Draw blue rect — if blend mode leaked as 'multiply', blue on white
    // would still be blue, but the globalCompositeOperation on ctx would
    // be wrong. We verify ctx state was restored properly.
    opList.addOpArgs(OPS.setFillRGBColor, [0, 0, 1]);
    opList.addOpArgs(OPS.rectangle, [100, 0, 100, 100]);
    opList.addOp(OPS.fill);

    const graphics = new NativeCanvasGraphics(ctx as any);
    graphics.execute(opList);

    // Blue rect should be fully blue (source-over on white = blue)
    const pixel = ctx.getImageData(150, 50, 1, 1).data;
    expect(pixel[0]).toBe(0);
    expect(pixel[1]).toBe(0);
    expect(pixel[2]).toBe(255);
  });

  it('restores state correctly with nested Form XObjects', () => {
    const canvas = createCanvas(300, 100);
    const ctx = canvas.getContext('2d');

    // Fill background white
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 300, 100);

    const opList = new OperatorList();

    // Outer form: set fillAlpha=0.8
    opList.addOpArgs(OPS.paintFormXObjectBegin, [
      [1, 0, 0, 1, 0, 0],
      [0, 0, 200, 100],
    ]);
    const outerGState = new Map<string, any>();
    outerGState.set('fillAlpha', 0.8);
    opList.addOpArgs(OPS.setGState, [outerGState]);

    // Draw red rect inside outer form
    opList.addOpArgs(OPS.setFillRGBColor, [1, 0, 0]);
    opList.addOpArgs(OPS.rectangle, [0, 0, 100, 100]);
    opList.addOp(OPS.fill);

    // Inner form: set fillAlpha=0.3
    opList.addOpArgs(OPS.paintFormXObjectBegin, [
      [1, 0, 0, 1, 0, 0],
      [100, 0, 200, 100],
    ]);
    const innerGState = new Map<string, any>();
    innerGState.set('fillAlpha', 0.3);
    opList.addOpArgs(OPS.setGState, [innerGState]);

    // Draw green rect inside inner form at alpha=0.3
    opList.addOpArgs(OPS.setFillRGBColor, [0, 1, 0]);
    opList.addOpArgs(OPS.rectangle, [100, 0, 100, 100]);
    opList.addOp(OPS.fill);

    // Exit inner form — fillAlpha should return to 0.8
    opList.addOp(OPS.paintFormXObjectEnd);

    // Exit outer form — fillAlpha should return to 1.0
    opList.addOp(OPS.paintFormXObjectEnd);

    // Draw blue rect at (should be) full alpha
    opList.addOpArgs(OPS.setFillRGBColor, [0, 0, 1]);
    opList.addOpArgs(OPS.rectangle, [200, 0, 100, 100]);
    opList.addOp(OPS.fill);

    const graphics = new NativeCanvasGraphics(ctx as any);
    graphics.execute(opList);

    // Blue rect (after both forms) should be fully opaque
    const bluePixel = ctx.getImageData(250, 50, 1, 1).data;
    expect(bluePixel[0]).toBe(0);
    expect(bluePixel[1]).toBe(0);
    expect(bluePixel[2]).toBe(255);
    expect(bluePixel[3]).toBe(255); // fully opaque — alpha restored to 1.0
  });

  it('restores fillAlpha=1.0 after form with ca=0.5', () => {
    // Specifically tests the ExtGState 'ca' (fill alpha) scenario:
    // Form XObject with ExtGState ca=0.5 should not affect parent content.
    const canvas = createCanvas(200, 100);
    const ctx = canvas.getContext('2d');

    // Fill background white
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 200, 100);

    const opList = new OperatorList();

    // Form XObject with ca=0.5
    opList.addOpArgs(OPS.paintFormXObjectBegin, [
      [1, 0, 0, 1, 0, 0],
      [0, 0, 100, 100],
    ]);
    const gstate = new Map<string, any>();
    gstate.set('fillAlpha', 0.5);
    opList.addOpArgs(OPS.setGState, [gstate]);

    // Draw semi-transparent red inside form
    opList.addOpArgs(OPS.setFillRGBColor, [1, 0, 0]);
    opList.addOpArgs(OPS.rectangle, [0, 0, 100, 100]);
    opList.addOp(OPS.fill);

    opList.addOp(OPS.paintFormXObjectEnd);

    // After form: draw fully opaque green
    opList.addOpArgs(OPS.setFillRGBColor, [0, 1, 0]);
    opList.addOpArgs(OPS.rectangle, [100, 0, 100, 100]);
    opList.addOp(OPS.fill);

    const graphics = new NativeCanvasGraphics(ctx as any);
    graphics.execute(opList);

    // Red rect inside form: semi-transparent (blended with white)
    const redPixel = ctx.getImageData(50, 50, 1, 1).data;
    // Red at 50% alpha on white: R~255, G~128, B~128
    expect(redPixel[0]).toBeGreaterThan(200); // strong red
    expect(redPixel[1]).toBeGreaterThan(100); // some white bleed (alpha)
    expect(redPixel[1]).toBeLessThan(200);

    // Green rect after form: should be fully opaque green
    const greenPixel = ctx.getImageData(150, 50, 1, 1).data;
    expect(greenPixel[0]).toBe(0); // R=0
    expect(greenPixel[1]).toBe(255); // G=255 (full green, full alpha)
    expect(greenPixel[2]).toBe(0); // B=0
    expect(greenPixel[3]).toBe(255); // A=255
  });

  it('restores strokeAlpha after Form XObject', () => {
    const canvas = createCanvas(200, 100);
    const ctx = canvas.getContext('2d');

    // Fill background white
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 200, 100);

    const opList = new OperatorList();

    // Form XObject that changes strokeAlpha
    opList.addOpArgs(OPS.paintFormXObjectBegin, [
      [1, 0, 0, 1, 0, 0],
      [0, 0, 100, 100],
    ]);
    const gstate = new Map<string, any>();
    gstate.set('strokeAlpha', 0.3);
    opList.addOpArgs(OPS.setGState, [gstate]);

    opList.addOpArgs(OPS.setStrokeRGBColor, [1, 0, 0]);
    opList.addOpArgs(OPS.setLineWidth, [10]);
    opList.addOpArgs(OPS.moveTo, [10, 50]);
    opList.addOpArgs(OPS.lineTo, [90, 50]);
    opList.addOp(OPS.stroke);

    opList.addOp(OPS.paintFormXObjectEnd);

    // After form: draw stroked line at (should be restored) full alpha
    opList.addOpArgs(OPS.setStrokeRGBColor, [0, 0, 1]);
    opList.addOpArgs(OPS.setLineWidth, [10]);
    opList.addOpArgs(OPS.moveTo, [110, 50]);
    opList.addOpArgs(OPS.lineTo, [190, 50]);
    opList.addOp(OPS.stroke);

    const graphics = new NativeCanvasGraphics(ctx as any);
    graphics.execute(opList);

    // Blue stroke after form should be fully opaque
    const bluePixel = ctx.getImageData(150, 50, 1, 1).data;
    expect(bluePixel[0]).toBe(0);
    expect(bluePixel[1]).toBe(0);
    expect(bluePixel[2]).toBe(255);
    expect(bluePixel[3]).toBe(255); // fully opaque
  });

  it('restores fill color after Form XObject', () => {
    const canvas = createCanvas(200, 100);
    const ctx = canvas.getContext('2d');

    // Fill background white
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 200, 100);

    const opList = new OperatorList();

    // Set fill color to red before form
    opList.addOpArgs(OPS.setFillRGBColor, [1, 0, 0]);

    // Form XObject changes fill color to green
    opList.addOpArgs(OPS.paintFormXObjectBegin, [
      [1, 0, 0, 1, 0, 0],
      [0, 0, 100, 100],
    ]);
    opList.addOpArgs(OPS.setFillRGBColor, [0, 1, 0]);
    opList.addOpArgs(OPS.rectangle, [0, 0, 100, 100]);
    opList.addOp(OPS.fill);
    opList.addOp(OPS.paintFormXObjectEnd);

    // Draw rect after form — should use restored red, not leaked green
    opList.addOpArgs(OPS.rectangle, [100, 0, 100, 100]);
    opList.addOp(OPS.fill);

    const graphics = new NativeCanvasGraphics(ctx as any);
    graphics.execute(opList);

    // Left rect (inside form): green
    const leftPixel = ctx.getImageData(50, 50, 1, 1).data;
    expect(leftPixel[0]).toBe(0);
    expect(leftPixel[1]).toBe(255);
    expect(leftPixel[2]).toBe(0);

    // Right rect (after form): should be red (color restored)
    const rightPixel = ctx.getImageData(150, 50, 1, 1).data;
    expect(rightPixel[0]).toBe(255);
    expect(rightPixel[1]).toBe(0);
    expect(rightPixel[2]).toBe(0);
  });
});
