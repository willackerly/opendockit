/**
 * Contract tests for CanvasBackend.
 *
 * Verifies that CanvasBackend correctly delegates every method call and
 * property access to the underlying CanvasRenderingContext2D. Uses a
 * spy-based mock to assert delegation without needing a real browser canvas.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { CanvasBackend } from '../canvas-backend.js';

// ---------------------------------------------------------------------------
// Path2D polyfill for Node.js test environment
// ---------------------------------------------------------------------------

/**
 * Minimal Path2D mock for Node.js. The real Path2D is a browser-only global.
 * The CanvasBackend uses a constructor-name-based type guard (isPath2D) that
 * checks `constructor.name === 'Path2D'`, so this mock must be named 'Path2D'.
 */
class Path2D {
  // Minimal stub — enough for delegation tests.
}

beforeAll(() => {
  // Expose as a global so `typeof Path2D !== 'undefined'` and `instanceof` work.
  (globalThis as Record<string, unknown>).Path2D = Path2D;
});

// ---------------------------------------------------------------------------
// Mock Canvas2D Context
// ---------------------------------------------------------------------------

/**
 * Create a mock CanvasRenderingContext2D with vi.fn() spies for all methods
 * and configurable backing values for all properties.
 *
 * Properties are stored in a backing object and accessed through
 * Object.defineProperty so that getter/setter delegation can be tested.
 */
function createSpyContext() {
  const backing = {
    fillStyle: '#000000' as string | CanvasGradient | CanvasPattern,
    strokeStyle: '#000000' as string | CanvasGradient | CanvasPattern,
    lineWidth: 1,
    lineCap: 'butt' as CanvasLineCap,
    lineJoin: 'miter' as CanvasLineJoin,
    miterLimit: 10,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
    lineDashOffset: 0,
    shadowColor: 'rgba(0, 0, 0, 0)',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    font: '10px sans-serif',
    textAlign: 'start' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    direction: 'ltr' as CanvasDirection,
    letterSpacing: '0px',
  };

  const ctx: Record<string, unknown> = {
    // Methods
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    transform: vi.fn(),
    setTransform: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    arc: vi.fn(),
    arcTo: vi.fn(),
    ellipse: vi.fn(),
    closePath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    setLineDash: vi.fn(),
    getLineDash: vi.fn().mockReturnValue([5, 10]),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    measureText: vi.fn().mockReturnValue({
      width: 42,
      actualBoundingBoxRight: 41,
    }),
    drawImage: vi.fn(),
    createLinearGradient: vi.fn().mockReturnValue({
      addColorStop: vi.fn(),
    }),
    createRadialGradient: vi.fn().mockReturnValue({
      addColorStop: vi.fn(),
    }),
    createPattern: vi.fn().mockReturnValue(null),
  };

  // Define properties with getters/setters so we can verify delegation.
  for (const key of Object.keys(backing) as (keyof typeof backing)[]) {
    Object.defineProperty(ctx, key, {
      get: () => backing[key],
      set: (value: unknown) => {
        (backing as Record<string, unknown>)[key] = value;
      },
      enumerable: true,
      configurable: true,
    });
  }

  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    backing,
    spies: ctx as Record<string, ReturnType<typeof vi.fn>>,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CanvasBackend', () => {
  // -----------------------------------------------------------------------
  // State management
  // -----------------------------------------------------------------------

  describe('state management', () => {
    it('delegates save()', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      backend.save();
      expect(spies.save).toHaveBeenCalledOnce();
    });

    it('delegates restore()', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      backend.restore();
      expect(spies.restore).toHaveBeenCalledOnce();
    });
  });

  // -----------------------------------------------------------------------
  // Transform operations
  // -----------------------------------------------------------------------

  describe('transform operations', () => {
    it('delegates translate(x, y)', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      backend.translate(10, 20);
      expect(spies.translate).toHaveBeenCalledWith(10, 20);
    });

    it('delegates scale(sx, sy)', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      backend.scale(2, 3);
      expect(spies.scale).toHaveBeenCalledWith(2, 3);
    });

    it('delegates rotate(radians)', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      backend.rotate(Math.PI / 4);
      expect(spies.rotate).toHaveBeenCalledWith(Math.PI / 4);
    });

    it('delegates transform(a, b, c, d, e, f)', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      backend.transform(1, 0, 0, 1, 50, 50);
      expect(spies.transform).toHaveBeenCalledWith(1, 0, 0, 1, 50, 50);
    });

    it('delegates setTransform(a, b, c, d, e, f)', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      backend.setTransform(1, 0, 0, 1, 0, 0);
      expect(spies.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
    });
  });

  // -----------------------------------------------------------------------
  // Path construction
  // -----------------------------------------------------------------------

  describe('path construction', () => {
    it('delegates beginPath()', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      backend.beginPath();
      expect(spies.beginPath).toHaveBeenCalledOnce();
    });

    it('delegates moveTo(x, y)', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      backend.moveTo(5, 10);
      expect(spies.moveTo).toHaveBeenCalledWith(5, 10);
    });

    it('delegates lineTo(x, y)', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      backend.lineTo(15, 25);
      expect(spies.lineTo).toHaveBeenCalledWith(15, 25);
    });

    it('delegates bezierCurveTo()', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      backend.bezierCurveTo(10, 20, 30, 40, 50, 60);
      expect(spies.bezierCurveTo).toHaveBeenCalledWith(10, 20, 30, 40, 50, 60);
    });

    it('delegates quadraticCurveTo()', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      backend.quadraticCurveTo(10, 20, 30, 40);
      expect(spies.quadraticCurveTo).toHaveBeenCalledWith(10, 20, 30, 40);
    });

    it('delegates arc()', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      backend.arc(50, 50, 25, 0, Math.PI * 2, false);
      expect(spies.arc).toHaveBeenCalledWith(50, 50, 25, 0, Math.PI * 2, false);
    });

    it('delegates arcTo()', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      backend.arcTo(10, 20, 30, 40, 15);
      expect(spies.arcTo).toHaveBeenCalledWith(10, 20, 30, 40, 15);
    });

    it('delegates ellipse()', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      backend.ellipse(100, 200, 50, 30, 0, 0, Math.PI * 2);
      expect(spies.ellipse).toHaveBeenCalledWith(
        100,
        200,
        50,
        30,
        0,
        0,
        Math.PI * 2,
        undefined
      );
    });

    it('delegates closePath()', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      backend.closePath();
      expect(spies.closePath).toHaveBeenCalledOnce();
    });

    it('delegates rect(x, y, w, h)', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      backend.rect(10, 20, 100, 50);
      expect(spies.rect).toHaveBeenCalledWith(10, 20, 100, 50);
    });

    it('delegates clip() with no arguments', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      backend.clip();
      expect(spies.clip).toHaveBeenCalledOnce();
    });

    it('delegates clip() with fill rule', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      backend.clip('evenodd');
      expect(spies.clip).toHaveBeenCalledWith('evenodd');
    });

    it('delegates clip() with Path2D', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      const path = new Path2D();
      backend.clip(path);
      expect(spies.clip).toHaveBeenCalledWith(path);
    });

    it('delegates clip() with Path2D and fill rule', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      const path = new Path2D();
      backend.clip(path, 'evenodd');
      expect(spies.clip).toHaveBeenCalledWith(path, 'evenodd');
    });
  });

  // -----------------------------------------------------------------------
  // Painting operations
  // -----------------------------------------------------------------------

  describe('painting operations', () => {
    it('delegates fill() with no arguments', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      backend.fill();
      expect(spies.fill).toHaveBeenCalledOnce();
    });

    it('delegates fill() with fill rule', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      backend.fill('evenodd');
      expect(spies.fill).toHaveBeenCalledWith('evenodd');
    });

    it('delegates fill() with Path2D', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      const path = new Path2D();
      backend.fill(path);
      expect(spies.fill).toHaveBeenCalledWith(path);
    });

    it('delegates fill() with Path2D and fill rule', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      const path = new Path2D();
      backend.fill(path, 'evenodd');
      expect(spies.fill).toHaveBeenCalledWith(path, 'evenodd');
    });

    it('delegates stroke() with no arguments', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      backend.stroke();
      expect(spies.stroke).toHaveBeenCalledOnce();
    });

    it('delegates stroke() with Path2D', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      const path = new Path2D();
      backend.stroke(path);
      expect(spies.stroke).toHaveBeenCalledWith(path);
    });

    it('delegates fillRect(x, y, w, h)', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      backend.fillRect(0, 0, 200, 100);
      expect(spies.fillRect).toHaveBeenCalledWith(0, 0, 200, 100);
    });

    it('delegates strokeRect(x, y, w, h)', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      backend.strokeRect(5, 5, 90, 90);
      expect(spies.strokeRect).toHaveBeenCalledWith(5, 5, 90, 90);
    });

    it('delegates clearRect(x, y, w, h)', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      backend.clearRect(0, 0, 500, 500);
      expect(spies.clearRect).toHaveBeenCalledWith(0, 0, 500, 500);
    });
  });

  // -----------------------------------------------------------------------
  // Style properties
  // -----------------------------------------------------------------------

  describe('style properties', () => {
    it('delegates fillStyle get/set', () => {
      const { ctx, backing } = createSpyContext();
      const backend = new CanvasBackend(ctx);

      expect(backend.fillStyle).toBe('#000000');
      backend.fillStyle = 'rgba(255, 0, 0, 1)';
      expect(backing.fillStyle).toBe('rgba(255, 0, 0, 1)');
      expect(backend.fillStyle).toBe('rgba(255, 0, 0, 1)');
    });

    it('delegates strokeStyle get/set', () => {
      const { ctx, backing } = createSpyContext();
      const backend = new CanvasBackend(ctx);

      backend.strokeStyle = 'blue';
      expect(backing.strokeStyle).toBe('blue');
      expect(backend.strokeStyle).toBe('blue');
    });

    it('delegates lineWidth get/set', () => {
      const { ctx, backing } = createSpyContext();
      const backend = new CanvasBackend(ctx);

      backend.lineWidth = 3.5;
      expect(backing.lineWidth).toBe(3.5);
      expect(backend.lineWidth).toBe(3.5);
    });

    it('delegates lineCap get/set', () => {
      const { ctx, backing } = createSpyContext();
      const backend = new CanvasBackend(ctx);

      backend.lineCap = 'round';
      expect(backing.lineCap).toBe('round');
      expect(backend.lineCap).toBe('round');
    });

    it('delegates lineJoin get/set', () => {
      const { ctx, backing } = createSpyContext();
      const backend = new CanvasBackend(ctx);

      backend.lineJoin = 'bevel';
      expect(backing.lineJoin).toBe('bevel');
      expect(backend.lineJoin).toBe('bevel');
    });

    it('delegates miterLimit get/set', () => {
      const { ctx, backing } = createSpyContext();
      const backend = new CanvasBackend(ctx);

      backend.miterLimit = 5;
      expect(backing.miterLimit).toBe(5);
      expect(backend.miterLimit).toBe(5);
    });

    it('delegates globalAlpha get/set', () => {
      const { ctx, backing } = createSpyContext();
      const backend = new CanvasBackend(ctx);

      backend.globalAlpha = 0.5;
      expect(backing.globalAlpha).toBe(0.5);
      expect(backend.globalAlpha).toBe(0.5);
    });

    it('delegates globalCompositeOperation get/set', () => {
      const { ctx, backing } = createSpyContext();
      const backend = new CanvasBackend(ctx);

      backend.globalCompositeOperation = 'multiply';
      expect(backing.globalCompositeOperation).toBe('multiply');
      expect(backend.globalCompositeOperation).toBe('multiply');
    });

    it('delegates setLineDash(segments)', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      backend.setLineDash([5, 10, 15]);
      expect(spies.setLineDash).toHaveBeenCalledWith([5, 10, 15]);
    });

    it('delegates getLineDash()', () => {
      const { ctx } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      const result = backend.getLineDash();
      expect(result).toEqual([5, 10]);
    });

    it('delegates lineDashOffset get/set', () => {
      const { ctx, backing } = createSpyContext();
      const backend = new CanvasBackend(ctx);

      backend.lineDashOffset = 7;
      expect(backing.lineDashOffset).toBe(7);
      expect(backend.lineDashOffset).toBe(7);
    });
  });

  // -----------------------------------------------------------------------
  // Shadow properties
  // -----------------------------------------------------------------------

  describe('shadow properties', () => {
    it('delegates shadowColor get/set', () => {
      const { ctx, backing } = createSpyContext();
      const backend = new CanvasBackend(ctx);

      backend.shadowColor = 'rgba(0, 0, 0, 0.5)';
      expect(backing.shadowColor).toBe('rgba(0, 0, 0, 0.5)');
      expect(backend.shadowColor).toBe('rgba(0, 0, 0, 0.5)');
    });

    it('delegates shadowBlur get/set', () => {
      const { ctx, backing } = createSpyContext();
      const backend = new CanvasBackend(ctx);

      backend.shadowBlur = 10;
      expect(backing.shadowBlur).toBe(10);
      expect(backend.shadowBlur).toBe(10);
    });

    it('delegates shadowOffsetX get/set', () => {
      const { ctx, backing } = createSpyContext();
      const backend = new CanvasBackend(ctx);

      backend.shadowOffsetX = 5;
      expect(backing.shadowOffsetX).toBe(5);
      expect(backend.shadowOffsetX).toBe(5);
    });

    it('delegates shadowOffsetY get/set', () => {
      const { ctx, backing } = createSpyContext();
      const backend = new CanvasBackend(ctx);

      backend.shadowOffsetY = -3;
      expect(backing.shadowOffsetY).toBe(-3);
      expect(backend.shadowOffsetY).toBe(-3);
    });
  });

  // -----------------------------------------------------------------------
  // Text properties and operations
  // -----------------------------------------------------------------------

  describe('text properties and operations', () => {
    it('delegates font get/set', () => {
      const { ctx, backing } = createSpyContext();
      const backend = new CanvasBackend(ctx);

      backend.font = 'bold 14px Arial';
      expect(backing.font).toBe('bold 14px Arial');
      expect(backend.font).toBe('bold 14px Arial');
    });

    it('delegates textAlign get/set', () => {
      const { ctx, backing } = createSpyContext();
      const backend = new CanvasBackend(ctx);

      backend.textAlign = 'center';
      expect(backing.textAlign).toBe('center');
      expect(backend.textAlign).toBe('center');
    });

    it('delegates textBaseline get/set', () => {
      const { ctx, backing } = createSpyContext();
      const backend = new CanvasBackend(ctx);

      backend.textBaseline = 'middle';
      expect(backing.textBaseline).toBe('middle');
      expect(backend.textBaseline).toBe('middle');
    });

    it('delegates direction get/set', () => {
      const { ctx, backing } = createSpyContext();
      const backend = new CanvasBackend(ctx);

      backend.direction = 'rtl';
      expect(backing.direction).toBe('rtl');
      expect(backend.direction).toBe('rtl');
    });

    it('delegates letterSpacing get/set', () => {
      const { ctx, backing } = createSpyContext();
      const backend = new CanvasBackend(ctx);

      backend.letterSpacing = '2px';
      expect(backing.letterSpacing).toBe('2px');
      expect(backend.letterSpacing).toBe('2px');
    });

    it('returns default letterSpacing when property is missing', () => {
      const { ctx } = createSpyContext();
      // Remove letterSpacing to simulate older environments
      delete (ctx as Record<string, unknown>).letterSpacing;
      const backend = new CanvasBackend(ctx);
      expect(backend.letterSpacing).toBe('0px');
    });

    it('delegates fillText(text, x, y)', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      backend.fillText('Hello', 10, 20);
      expect(spies.fillText).toHaveBeenCalledWith('Hello', 10, 20);
    });

    it('delegates fillText(text, x, y, maxWidth)', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      backend.fillText('Hello', 10, 20, 100);
      expect(spies.fillText).toHaveBeenCalledWith('Hello', 10, 20, 100);
    });

    it('delegates strokeText(text, x, y)', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      backend.strokeText('World', 30, 40);
      expect(spies.strokeText).toHaveBeenCalledWith('World', 30, 40);
    });

    it('delegates strokeText(text, x, y, maxWidth)', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      backend.strokeText('World', 30, 40, 200);
      expect(spies.strokeText).toHaveBeenCalledWith('World', 30, 40, 200);
    });

    it('delegates measureText(text) and returns TextMetrics', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      const metrics = backend.measureText('Test');
      expect(spies.measureText).toHaveBeenCalledWith('Test');
      expect(metrics.width).toBe(42);
    });
  });

  // -----------------------------------------------------------------------
  // Image operations
  // -----------------------------------------------------------------------

  describe('image operations', () => {
    it('delegates drawImage with 3 arguments (dest position)', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      const fakeImage = {} as CanvasImageSource;
      backend.drawImage(fakeImage, 10, 20);
      expect(spies.drawImage).toHaveBeenCalledWith(fakeImage, 10, 20);
    });

    it('delegates drawImage with 5 arguments (dest rect)', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      const fakeImage = {} as CanvasImageSource;
      backend.drawImage(fakeImage, 10, 20, 100, 50);
      expect(spies.drawImage).toHaveBeenCalledWith(fakeImage, 10, 20, 100, 50);
    });

    it('delegates drawImage with 9 arguments (source + dest rect)', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      const fakeImage = {} as CanvasImageSource;
      backend.drawImage(fakeImage, 0, 0, 50, 50, 10, 20, 100, 100);
      expect(spies.drawImage).toHaveBeenCalledWith(
        fakeImage,
        0,
        0,
        50,
        50,
        10,
        20,
        100,
        100
      );
    });
  });

  // -----------------------------------------------------------------------
  // Gradient and pattern factories
  // -----------------------------------------------------------------------

  describe('gradient and pattern factories', () => {
    it('delegates createLinearGradient()', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      const gradient = backend.createLinearGradient(0, 0, 100, 100);
      expect(spies.createLinearGradient).toHaveBeenCalledWith(0, 0, 100, 100);
      expect(gradient).toBeDefined();
    });

    it('delegates createRadialGradient()', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      const gradient = backend.createRadialGradient(50, 50, 0, 50, 50, 100);
      expect(spies.createRadialGradient).toHaveBeenCalledWith(
        50,
        50,
        0,
        50,
        50,
        100
      );
      expect(gradient).toBeDefined();
    });

    it('delegates createPattern()', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      const fakeImage = {} as CanvasImageSource;
      const pattern = backend.createPattern(fakeImage, 'repeat');
      expect(spies.createPattern).toHaveBeenCalledWith(fakeImage, 'repeat');
      // Our mock returns null, which is a valid return value
      expect(pattern).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Integration-style tests
  // -----------------------------------------------------------------------

  describe('integration scenarios', () => {
    it('supports a typical shape rendering sequence', () => {
      const { ctx, spies, backing } = createSpyContext();
      const backend = new CanvasBackend(ctx);

      // Simulate shape rendering: save, transform, fill, stroke, restore
      backend.save();
      backend.translate(100, 200);
      backend.rotate(Math.PI / 6);
      backend.beginPath();
      backend.rect(0, 0, 50, 30);
      backend.fillStyle = 'rgba(255, 0, 0, 1)';
      backend.fill();
      backend.strokeStyle = 'rgba(0, 0, 0, 1)';
      backend.lineWidth = 2;
      backend.stroke();
      backend.restore();

      expect(spies.save).toHaveBeenCalledOnce();
      expect(spies.translate).toHaveBeenCalledWith(100, 200);
      expect(spies.rotate).toHaveBeenCalledWith(Math.PI / 6);
      expect(spies.beginPath).toHaveBeenCalledOnce();
      expect(spies.rect).toHaveBeenCalledWith(0, 0, 50, 30);
      expect(backing.fillStyle).toBe('rgba(255, 0, 0, 1)');
      expect(spies.fill).toHaveBeenCalledOnce();
      expect(backing.strokeStyle).toBe('rgba(0, 0, 0, 1)');
      expect(backing.lineWidth).toBe(2);
      expect(spies.stroke).toHaveBeenCalledOnce();
      expect(spies.restore).toHaveBeenCalledOnce();
    });

    it('supports a typical text rendering sequence', () => {
      const { ctx, spies, backing } = createSpyContext();
      const backend = new CanvasBackend(ctx);

      backend.save();
      backend.font = 'bold 24px Calibri';
      backend.fillStyle = 'rgba(0, 0, 0, 1)';
      backend.textBaseline = 'alphabetic';
      backend.fillText('Hello World', 50, 100);
      const metrics = backend.measureText('Hello World');
      backend.restore();

      expect(backing.font).toBe('bold 24px Calibri');
      expect(spies.fillText).toHaveBeenCalledWith('Hello World', 50, 100);
      expect(spies.measureText).toHaveBeenCalledWith('Hello World');
      expect(metrics.width).toBe(42);
    });

    it('supports shadow effects', () => {
      const { ctx, backing } = createSpyContext();
      const backend = new CanvasBackend(ctx);

      backend.shadowColor = 'rgba(0, 0, 0, 0.3)';
      backend.shadowBlur = 8;
      backend.shadowOffsetX = 3;
      backend.shadowOffsetY = 4;

      expect(backing.shadowColor).toBe('rgba(0, 0, 0, 0.3)');
      expect(backing.shadowBlur).toBe(8);
      expect(backing.shadowOffsetX).toBe(3);
      expect(backing.shadowOffsetY).toBe(4);

      // Clean up (as effect renderer does)
      backend.shadowColor = 'transparent';
      backend.shadowBlur = 0;
      backend.shadowOffsetX = 0;
      backend.shadowOffsetY = 0;

      expect(backing.shadowColor).toBe('transparent');
      expect(backing.shadowBlur).toBe(0);
    });

    it('supports gradient fill workflow', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);

      const gradient = backend.createLinearGradient(0, 0, 100, 0);
      expect(spies.createLinearGradient).toHaveBeenCalledWith(0, 0, 100, 0);

      backend.fillStyle = gradient;
      backend.fillRect(0, 0, 100, 50);

      expect(spies.fillRect).toHaveBeenCalledWith(0, 0, 100, 50);
    });

    it('supports dash pattern workflow', () => {
      const { ctx, spies, backing } = createSpyContext();
      const backend = new CanvasBackend(ctx);

      backend.setLineDash([4, 3]);
      backend.strokeStyle = 'rgba(0, 0, 0, 1)';
      backend.lineWidth = 1.5;
      backend.lineCap = 'round';
      backend.beginPath();
      backend.moveTo(0, 0);
      backend.lineTo(100, 0);
      backend.stroke();

      expect(spies.setLineDash).toHaveBeenCalledWith([4, 3]);
      expect(backing.strokeStyle).toBe('rgba(0, 0, 0, 1)');
      expect(backing.lineWidth).toBe(1.5);
      expect(backing.lineCap).toBe('round');
    });

    it('supports clipping with Path2D', () => {
      const { ctx, spies } = createSpyContext();
      const backend = new CanvasBackend(ctx);
      const path = new Path2D();

      backend.save();
      backend.clip(path);
      backend.drawImage({} as CanvasImageSource, 0, 0, 100, 100);
      backend.restore();

      expect(spies.clip).toHaveBeenCalledWith(path);
      expect(spies.drawImage).toHaveBeenCalled();
    });
  });
});
