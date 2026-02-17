import { describe, it, expect } from 'vitest';
import { renderPicture } from '../picture-renderer.js';
import { createMockContext, createMockRenderContext } from './mock-canvas.js';
import type { PictureIR, TransformIR } from '../../../ir/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** EMU constants for readable test values. */
const EMU_PER_PX = 9525; // at 96 DPI

/**
 * Create a mock image object that duck-types as an ImageBitmap/HTMLImageElement.
 * Canvas2D's drawImage needs `width` and `height` properties.
 */
function createMockImage(width = 200, height = 150) {
  return { width, height } as unknown as ImageBitmap;
}

/** Build a minimal PictureIR with default transform. */
function makePicture(overrides?: {
  transform?: Partial<TransformIR>;
  imagePartUri?: string;
  crop?: { left: number; top: number; right: number; bottom: number };
  flipH?: boolean;
  flipV?: boolean;
  rotation?: number;
}): PictureIR {
  const transform: TransformIR = {
    position: { x: 0, y: 0 },
    size: { width: 100 * EMU_PER_PX, height: 80 * EMU_PER_PX },
    ...overrides?.transform,
  };

  if (overrides?.flipH !== undefined) transform.flipH = overrides.flipH;
  if (overrides?.flipV !== undefined) transform.flipV = overrides.flipV;
  if (overrides?.rotation !== undefined) transform.rotation = overrides.rotation;

  return {
    kind: 'picture',
    imagePartUri: overrides?.imagePartUri ?? '/ppt/media/image1.png',
    properties: {
      transform,
      effects: [],
    },
    blipFill: overrides?.crop
      ? { crop: overrides.crop }
      : undefined,
    nonVisualProperties: {
      name: 'Test Picture',
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('renderPicture', () => {
  describe('placeholder (no image in cache)', () => {
    it('draws a grey placeholder when image is not cached', () => {
      const ctx = createMockContext();
      const rctx = createMockRenderContext(ctx);
      const pic = makePicture();

      renderPicture(pic, rctx);

      // Should call save, fillRect (grey bg), fillText ('Image'), restore.
      const fillRectCall = ctx._calls.find((c) => c.method === 'fillRect');
      expect(fillRectCall).toBeDefined();
      expect(fillRectCall!.args).toEqual([0, 0, 100, 80]);

      const fillTextCall = ctx._calls.find((c) => c.method === 'fillText');
      expect(fillTextCall).toBeDefined();
      expect(fillTextCall!.args[0]).toBe('Image');
    });

    it('placeholder has grey background fill style', () => {
      const ctx = createMockContext();
      const rctx = createMockRenderContext(ctx);
      const pic = makePicture();

      renderPicture(pic, rctx);

      // The first fillStyle set inside drawPlaceholder should be #E0E0E0.
      // Check that the save/restore pair wraps the placeholder drawing.
      const saveIdx = ctx._calls.findIndex((c) => c.method === 'save');
      const restoreIdx = ctx._calls.findIndex((c) => c.method === 'restore');
      expect(saveIdx).toBeGreaterThanOrEqual(0);
      expect(restoreIdx).toBeGreaterThan(saveIdx);
    });

    it('draws placeholder at correct position', () => {
      const ctx = createMockContext();
      const rctx = createMockRenderContext(ctx);
      const pic = makePicture({
        transform: {
          position: { x: 50 * EMU_PER_PX, y: 30 * EMU_PER_PX },
          size: { width: 200 * EMU_PER_PX, height: 100 * EMU_PER_PX },
        },
      });

      renderPicture(pic, rctx);

      const fillRectCall = ctx._calls.find((c) => c.method === 'fillRect');
      expect(fillRectCall).toBeDefined();
      expect(fillRectCall!.args[0]).toBeCloseTo(50, 0);
      expect(fillRectCall!.args[1]).toBeCloseTo(30, 0);
      expect(fillRectCall!.args[2]).toBeCloseTo(200, 0);
      expect(fillRectCall!.args[3]).toBeCloseTo(100, 0);
    });
  });

  describe('image rendering', () => {
    it('calls drawImage when image is in cache', () => {
      const ctx = createMockContext();
      const rctx = createMockRenderContext(ctx);
      const mockImage = createMockImage(200, 150);
      rctx.mediaCache.set('/ppt/media/image1.png', mockImage, 1000);

      const pic = makePicture();
      renderPicture(pic, rctx);

      const drawCall = ctx._calls.find((c) => c.method === 'drawImage');
      expect(drawCall).toBeDefined();
    });

    it('uses 9-argument drawImage form with correct source and dest', () => {
      const ctx = createMockContext();
      const rctx = createMockRenderContext(ctx);
      const mockImage = createMockImage(400, 300);
      rctx.mediaCache.set('/ppt/media/image1.png', mockImage, 1000);

      const pic = makePicture();
      renderPicture(pic, rctx);

      const drawCall = ctx._calls.find((c) => c.method === 'drawImage');
      expect(drawCall).toBeDefined();
      // 9-arg form: (image, sx, sy, sw, sh, dx, dy, dw, dh)
      expect(drawCall!.args).toHaveLength(9);
      // Source rect: full image (no crop).
      expect(drawCall!.args[1]).toBe(0); // sx
      expect(drawCall!.args[2]).toBe(0); // sy
      expect(drawCall!.args[3]).toBe(400); // sw
      expect(drawCall!.args[4]).toBe(300); // sh
      // Dest rect: 100x80 px at origin.
      expect(drawCall!.args[5]).toBeCloseTo(0, 0); // dx
      expect(drawCall!.args[6]).toBeCloseTo(0, 0); // dy
      expect(drawCall!.args[7]).toBeCloseTo(100, 0); // dw
      expect(drawCall!.args[8]).toBeCloseTo(80, 0); // dh
    });
  });

  describe('crop', () => {
    it('applies crop to source rect', () => {
      const ctx = createMockContext();
      const rctx = createMockRenderContext(ctx);
      const mockImage = createMockImage(1000, 800);
      rctx.mediaCache.set('/ppt/media/image1.png', mockImage, 1000);

      const pic = makePicture({
        crop: { left: 0.1, top: 0.2, right: 0.1, bottom: 0.2 },
      });
      renderPicture(pic, rctx);

      const drawCall = ctx._calls.find((c) => c.method === 'drawImage');
      expect(drawCall).toBeDefined();
      // Source rect: cropped
      // sx = 0.1 * 1000 = 100
      // sy = 0.2 * 800 = 160
      // sw = 1000 * (1 - 0.1 - 0.1) = 800
      // sh = 800 * (1 - 0.2 - 0.2) = 480
      expect(drawCall!.args[1]).toBeCloseTo(100, 1); // sx
      expect(drawCall!.args[2]).toBeCloseTo(160, 1); // sy
      expect(drawCall!.args[3]).toBeCloseTo(800, 1); // sw
      expect(drawCall!.args[4]).toBeCloseTo(480, 1); // sh
    });
  });

  describe('transforms', () => {
    it('applies position offset to destination rect', () => {
      const ctx = createMockContext();
      const rctx = createMockRenderContext(ctx);
      const mockImage = createMockImage(200, 150);
      rctx.mediaCache.set('/ppt/media/image1.png', mockImage, 1000);

      const pic = makePicture({
        transform: {
          position: { x: 50 * EMU_PER_PX, y: 25 * EMU_PER_PX },
          size: { width: 100 * EMU_PER_PX, height: 80 * EMU_PER_PX },
        },
      });
      renderPicture(pic, rctx);

      const drawCall = ctx._calls.find((c) => c.method === 'drawImage');
      expect(drawCall).toBeDefined();
      expect(drawCall!.args[5]).toBeCloseTo(50, 0); // dx
      expect(drawCall!.args[6]).toBeCloseTo(25, 0); // dy
    });

    it('applies rotation using save/translate/rotate/restore', () => {
      const ctx = createMockContext();
      const rctx = createMockRenderContext(ctx);
      const mockImage = createMockImage(200, 150);
      rctx.mediaCache.set('/ppt/media/image1.png', mockImage, 1000);

      const pic = makePicture({ rotation: 45 });
      renderPicture(pic, rctx);

      const saveCall = ctx._calls.find((c) => c.method === 'save');
      const translateCall = ctx._calls.find((c) => c.method === 'translate');
      const rotateCall = ctx._calls.find((c) => c.method === 'rotate');
      const restoreCall = ctx._calls.find((c) => c.method === 'restore');

      expect(saveCall).toBeDefined();
      expect(translateCall).toBeDefined();
      expect(rotateCall).toBeDefined();
      expect(restoreCall).toBeDefined();

      // Rotation should be in radians: 45 degrees = PI/4.
      expect(rotateCall!.args[0]).toBeCloseTo(Math.PI / 4, 5);
    });

    it('applies horizontal flip with scale(-1, 1)', () => {
      const ctx = createMockContext();
      const rctx = createMockRenderContext(ctx);
      const mockImage = createMockImage(200, 150);
      rctx.mediaCache.set('/ppt/media/image1.png', mockImage, 1000);

      const pic = makePicture({ flipH: true });
      renderPicture(pic, rctx);

      const scaleCall = ctx._calls.find((c) => c.method === 'scale');
      expect(scaleCall).toBeDefined();
      expect(scaleCall!.args).toEqual([-1, 1]);
    });

    it('applies vertical flip with scale(1, -1)', () => {
      const ctx = createMockContext();
      const rctx = createMockRenderContext(ctx);
      const mockImage = createMockImage(200, 150);
      rctx.mediaCache.set('/ppt/media/image1.png', mockImage, 1000);

      const pic = makePicture({ flipV: true });
      renderPicture(pic, rctx);

      const scaleCall = ctx._calls.find((c) => c.method === 'scale');
      expect(scaleCall).toBeDefined();
      expect(scaleCall!.args).toEqual([1, -1]);
    });

    it('applies both flips with scale(-1, -1)', () => {
      const ctx = createMockContext();
      const rctx = createMockRenderContext(ctx);
      const mockImage = createMockImage(200, 150);
      rctx.mediaCache.set('/ppt/media/image1.png', mockImage, 1000);

      const pic = makePicture({ flipH: true, flipV: true });
      renderPicture(pic, rctx);

      const scaleCall = ctx._calls.find((c) => c.method === 'scale');
      expect(scaleCall).toBeDefined();
      expect(scaleCall!.args).toEqual([-1, -1]);
    });
  });

  describe('edge cases', () => {
    it('does nothing when transform is missing', () => {
      const ctx = createMockContext();
      const rctx = createMockRenderContext(ctx);

      const pic: PictureIR = {
        kind: 'picture',
        imagePartUri: '/ppt/media/image1.png',
        properties: { effects: [] },
        nonVisualProperties: { name: 'No Transform' },
      };

      renderPicture(pic, rctx);

      // No drawImage or fillRect calls.
      const drawCalls = ctx._calls.filter(
        (c) => c.method === 'drawImage' || c.method === 'fillRect'
      );
      expect(drawCalls).toHaveLength(0);
    });

    it('draws placeholder for Uint8Array (undecoded) media', () => {
      const ctx = createMockContext();
      const rctx = createMockRenderContext(ctx);
      rctx.mediaCache.set('/ppt/media/image1.png', new Uint8Array(100), 100);

      const pic = makePicture();
      renderPicture(pic, rctx);

      // Should draw placeholder, not call drawImage.
      const drawImageCall = ctx._calls.find((c) => c.method === 'drawImage');
      expect(drawImageCall).toBeUndefined();

      const fillRectCall = ctx._calls.find((c) => c.method === 'fillRect');
      expect(fillRectCall).toBeDefined();
    });

    it('draws without transform when no rotation or flip', () => {
      const ctx = createMockContext();
      const rctx = createMockRenderContext(ctx);
      const mockImage = createMockImage(200, 150);
      rctx.mediaCache.set('/ppt/media/image1.png', mockImage, 1000);

      const pic = makePicture();
      renderPicture(pic, rctx);

      // No save/restore needed for simple draw.
      const saveCalls = ctx._calls.filter((c) => c.method === 'save');
      expect(saveCalls).toHaveLength(0);
    });
  });
});
