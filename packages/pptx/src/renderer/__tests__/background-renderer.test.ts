/**
 * Unit tests for the background renderer.
 *
 * Uses the mock Canvas2D context from @opendockit/core to verify
 * that backgrounds are rendered correctly without a real browser canvas.
 */

import { describe, expect, it } from 'vitest';
import type { BackgroundIR } from '../../model/index.js';
import type { SolidFillIR, GradientFillIR, PatternFillIR, NoFill } from '@opendockit/core';
import { renderBackground } from '../background-renderer.js';
import { createMockRenderContext, createMockContext } from './mock-canvas.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findFillRectCalls(ctx: ReturnType<typeof createMockContext>) {
  return ctx._calls.filter((c) => c.method === 'fillRect');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('renderBackground', () => {
  it('fills with white when background is undefined', () => {
    const rctx = createMockRenderContext();
    renderBackground(undefined, rctx, 960, 540);

    expect(rctx.ctx.fillStyle).toBe('#FFFFFF');
    const rects = findFillRectCalls(rctx.ctx);
    expect(rects).toHaveLength(1);
    expect(rects[0].args).toEqual([0, 0, 960, 540]);
  });

  it('fills with white when background has no fill', () => {
    const rctx = createMockRenderContext();
    const bg: BackgroundIR = {};
    renderBackground(bg, rctx, 960, 540);

    expect(rctx.ctx.fillStyle).toBe('#FFFFFF');
    const rects = findFillRectCalls(rctx.ctx);
    expect(rects).toHaveLength(1);
  });

  it('fills with white when fill type is "none"', () => {
    const rctx = createMockRenderContext();
    const noFill: NoFill = { type: 'none' };
    const bg: BackgroundIR = { fill: noFill };
    renderBackground(bg, rctx, 960, 540);

    expect(rctx.ctx.fillStyle).toBe('#FFFFFF');
  });

  it('renders solid fill background', () => {
    const rctx = createMockRenderContext();
    const solidFill: SolidFillIR = {
      type: 'solid',
      color: { r: 33, g: 66, b: 99, a: 0.8 },
    };
    const bg: BackgroundIR = { fill: solidFill };
    renderBackground(bg, rctx, 960, 540);

    expect(rctx.ctx.fillStyle).toBe('rgba(33, 66, 99, 0.8)');
    const rects = findFillRectCalls(rctx.ctx);
    expect(rects).toHaveLength(1);
    expect(rects[0].args).toEqual([0, 0, 960, 540]);
  });

  it('renders gradient fill background', () => {
    const rctx = createMockRenderContext();
    const gradFill: GradientFillIR = {
      type: 'gradient',
      kind: 'linear',
      angle: 90,
      stops: [
        { position: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
        { position: 1, color: { r: 0, g: 0, b: 255, a: 1 } },
      ],
    };
    const bg: BackgroundIR = { fill: gradFill };
    renderBackground(bg, rctx, 960, 540);

    // Gradient was created and applied
    expect(rctx.ctx._gradients).toHaveLength(1);
    expect(rctx.ctx._gradients[0].type).toBe('linear');
    expect(rctx.ctx._gradients[0].stops).toHaveLength(2);

    const rects = findFillRectCalls(rctx.ctx);
    expect(rects).toHaveLength(1);
    expect(rects[0].args).toEqual([0, 0, 960, 540]);
  });

  it('renders radial gradient background', () => {
    const rctx = createMockRenderContext();
    const gradFill: GradientFillIR = {
      type: 'gradient',
      kind: 'radial',
      stops: [
        { position: 0, color: { r: 255, g: 255, b: 255, a: 1 } },
        { position: 1, color: { r: 0, g: 0, b: 0, a: 1 } },
      ],
    };
    const bg: BackgroundIR = { fill: gradFill };
    renderBackground(bg, rctx, 800, 600);

    expect(rctx.ctx._gradients).toHaveLength(1);
    expect(rctx.ctx._gradients[0].type).toBe('radial');
  });

  it('renders pattern fill as foreground color', () => {
    const rctx = createMockRenderContext();
    const patternFill: PatternFillIR = {
      type: 'pattern',
      preset: 'pct50',
      foreground: { r: 128, g: 128, b: 128, a: 1 },
      background: { r: 255, g: 255, b: 255, a: 1 },
    };
    const bg: BackgroundIR = { fill: patternFill };
    renderBackground(bg, rctx, 960, 540);

    expect(rctx.ctx.fillStyle).toBe('rgba(128, 128, 128, 1)');
  });

  it('falls back to white for picture fill', () => {
    const rctx = createMockRenderContext();
    const bg: BackgroundIR = {
      fill: {
        type: 'picture',
        imagePartUri: '/ppt/media/image1.png',
      },
    };
    renderBackground(bg, rctx, 960, 540);

    expect(rctx.ctx.fillStyle).toBe('#FFFFFF');
  });

  it('uses the full slide dimensions for fill', () => {
    const rctx = createMockRenderContext();
    const bg: BackgroundIR = {
      fill: {
        type: 'solid',
        color: { r: 100, g: 200, b: 50, a: 1 },
      },
    };
    renderBackground(bg, rctx, 1280, 720);

    const rects = findFillRectCalls(rctx.ctx);
    expect(rects).toHaveLength(1);
    expect(rects[0].args).toEqual([0, 0, 1280, 720]);
  });
});
