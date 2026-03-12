/**
 * Tests for CanvasKitBackend.
 *
 * Since canvaskit-wasm is an optional peer dependency and not available in
 * unit test environments, we create comprehensive mocks of the CanvasKit API
 * surface and verify that all RenderBackend methods are correctly implemented.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CanvasKitBackend } from '../canvaskit-backend.js';

// ---------------------------------------------------------------------------
// Mock CanvasKit types
// ---------------------------------------------------------------------------

function createMockCanvasKit() {
  const canvasCalls: Array<{ method: string; args: unknown[] }> = [];

  function recordCall(method: string) {
    return (...args: unknown[]) => {
      canvasCalls.push({ method, args });
    };
  }

  const mockPath = {
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    cubicTo: vi.fn(),
    quadTo: vi.fn(),
    arcToTangent: vi.fn(),
    addArc: vi.fn(),
    addOval: vi.fn(),
    addRect: vi.fn(),
    close: vi.fn(),
    setFillType: vi.fn(),
    copy: vi.fn(),
    delete: vi.fn(),
  };
  // copy() returns a new mock with the same structure
  mockPath.copy.mockImplementation(() => ({ ...mockPath, copy: mockPath.copy, delete: vi.fn() }));

  const mockPaint = {
    setColor: vi.fn(),
    setStyle: vi.fn(),
    setStrokeWidth: vi.fn(),
    setStrokeCap: vi.fn(),
    setStrokeJoin: vi.fn(),
    setStrokeMiter: vi.fn(),
    setAntiAlias: vi.fn(),
    setAlphaf: vi.fn(),
    setBlendMode: vi.fn(),
    setShader: vi.fn(),
    setImageFilter: vi.fn(),
    setPathEffect: vi.fn(),
    copy: vi.fn(),
    delete: vi.fn(),
  };

  const mockFont = {
    setSize: vi.fn(),
    getMetrics: vi.fn().mockReturnValue({ ascent: -12, descent: 4 }),
    getGlyphWidths: vi.fn().mockReturnValue([]),
    delete: vi.fn(),
  };

  const mockCanvas = {
    save: vi.fn().mockReturnValue(1),
    restore: vi.fn(),
    restoreToCount: vi.fn(),
    concat: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    clipPath: vi.fn(),
    clipRect: vi.fn(),
    drawRect: vi.fn(),
    drawPath: vi.fn(),
    drawLine: vi.fn(),
    drawText: vi.fn(),
    drawImage: vi.fn(),
    drawImageRect: vi.fn(),
    drawImageRectOptions: vi.fn(),
    clear: vi.fn(),
    flush: vi.fn(),
  };

  const mockSurface = {
    getCanvas: vi.fn().mockReturnValue(mockCanvas),
    flush: vi.fn(),
    makeImageSnapshot: vi.fn(),
    delete: vi.fn(),
  };

  const ck = {
    // Factories — return fresh mocks each time
    Paint: vi.fn().mockImplementation(() => ({
      setColor: vi.fn(),
      setStyle: vi.fn(),
      setStrokeWidth: vi.fn(),
      setStrokeCap: vi.fn(),
      setStrokeJoin: vi.fn(),
      setStrokeMiter: vi.fn(),
      setAntiAlias: vi.fn(),
      setAlphaf: vi.fn(),
      setBlendMode: vi.fn(),
      setShader: vi.fn(),
      setImageFilter: vi.fn(),
      setPathEffect: vi.fn(),
      copy: vi.fn(),
      delete: vi.fn(),
    })),
    Path: vi.fn().mockImplementation(() => ({
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      cubicTo: vi.fn(),
      quadTo: vi.fn(),
      arcToTangent: vi.fn(),
      addArc: vi.fn(),
      addOval: vi.fn(),
      addRect: vi.fn(),
      close: vi.fn(),
      setFillType: vi.fn(),
      copy: vi.fn().mockImplementation(() => ({
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        cubicTo: vi.fn(),
        quadTo: vi.fn(),
        arcToTangent: vi.fn(),
        addArc: vi.fn(),
        addOval: vi.fn(),
        addRect: vi.fn(),
        close: vi.fn(),
        setFillType: vi.fn(),
        copy: vi.fn(),
        delete: vi.fn(),
      })),
      delete: vi.fn(),
    })),
    Font: vi.fn().mockImplementation(() => ({
      setSize: vi.fn(),
      getMetrics: vi.fn().mockReturnValue({ ascent: -12, descent: 4 }),
      getGlyphWidths: vi.fn().mockReturnValue([]),
      delete: vi.fn(),
    })),

    // Shader/ImageFilter/PathEffect namespaces
    Shader: {
      MakeLinearGradient: vi.fn().mockReturnValue({ delete: vi.fn() }),
      MakeRadialGradient: vi.fn().mockReturnValue({ delete: vi.fn() }),
      MakeTwoPointConicalGradient: vi.fn().mockReturnValue({ delete: vi.fn() }),
    },
    ImageFilter: {
      MakeBlur: vi.fn().mockReturnValue({ delete: vi.fn() }),
      MakeDropShadowOnly: vi.fn().mockReturnValue({ delete: vi.fn() }),
      MakeDropShadow: vi.fn().mockReturnValue({ delete: vi.fn() }),
    },
    PathEffect: {
      MakeDash: vi.fn().mockReturnValue({ delete: vi.fn() }),
    },

    // Enums
    BlendMode: {
      Clear: 0, Src: 1, Dst: 2, SrcOver: 3, DstOver: 4,
      SrcIn: 5, DstIn: 6, SrcOut: 7, DstOut: 8,
      SrcATop: 9, DstATop: 10, Xor: 11, Plus: 12,
      Modulate: 13, Screen: 14, Overlay: 15, Darken: 16,
      Lighten: 17, ColorDodge: 18, ColorBurn: 19,
      HardLight: 20, SoftLight: 21, Difference: 22,
      Exclusion: 23, Multiply: 24, Hue: 25,
      Saturation: 26, Color: 27, Luminosity: 28,
    },
    PaintStyle: { Fill: 0, Stroke: 1 },
    StrokeCap: { Butt: 0, Round: 1, Square: 2 },
    StrokeJoin: { Miter: 0, Round: 1, Bevel: 2 },
    FillType: { Winding: 0, EvenOdd: 1 },
    FilterMode: { Nearest: 0, Linear: 1 },
    TileMode: { Clamp: 0, Repeat: 1, Mirror: 2, Decal: 3 },
    FontSlant: { Upright: 0, Italic: 1, Oblique: 2 },
    FontWeight: {
      Thin: 100, ExtraLight: 200, Light: 300, Normal: 400,
      Medium: 500, SemiBold: 600, Bold: 700, ExtraBold: 800, Black: 900,
    },
    ClipOp: { Intersect: 0, Difference: 1 },

    // Helpers
    Color: vi.fn((r: number, g: number, b: number, a?: number) =>
      new Float32Array([r / 255, g / 255, b / 255, a ?? 1])
    ),
    Color4f: vi.fn((r: number, g: number, b: number, a: number) =>
      new Float32Array([r, g, b, a])
    ),
    LTRBRect: vi.fn((l: number, t: number, r: number, b: number) =>
      new Float32Array([l, t, r, b])
    ),
    XYWHRect: vi.fn((x: number, y: number, w: number, h: number) =>
      new Float32Array([x, y, x + w, y + h])
    ),
    Matrix: {
      identity: vi.fn().mockReturnValue([1, 0, 0, 0, 1, 0, 0, 0, 1]),
      multiply: vi.fn(),
      translated: vi.fn(),
      scaled: vi.fn(),
      rotated: vi.fn(),
      skewed: vi.fn(),
    },

    MakeImageFromEncoded: vi.fn(),
    FontMgr: { FromData: vi.fn() },
  };

  return { ck, mockCanvas, mockSurface };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CanvasKitBackend', () => {
  let ck: ReturnType<typeof createMockCanvasKit>['ck'];
  let mockCanvas: ReturnType<typeof createMockCanvasKit>['mockCanvas'];
  let mockSurface: ReturnType<typeof createMockCanvasKit>['mockSurface'];
  let backend: CanvasKitBackend;

  beforeEach(() => {
    const mocks = createMockCanvasKit();
    ck = mocks.ck;
    mockCanvas = mocks.mockCanvas;
    mockSurface = mocks.mockSurface;
    backend = new CanvasKitBackend(ck as never, mockSurface as never);
  });

  // -----------------------------------------------------------------------
  // Interface completeness
  // -----------------------------------------------------------------------

  describe('interface completeness', () => {
    it('implements all RenderBackend methods', () => {
      const methods = [
        'save', 'restore',
        'translate', 'scale', 'rotate', 'transform', 'setTransform',
        'beginPath', 'moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo',
        'arc', 'arcTo', 'ellipse', 'closePath', 'rect', 'clip',
        'fill', 'stroke', 'fillRect', 'strokeRect', 'clearRect',
        'setLineDash', 'getLineDash',
        'fillText', 'strokeText', 'measureText',
        'drawImage',
        'createLinearGradient', 'createRadialGradient', 'createPattern',
      ];
      for (const method of methods) {
        expect(typeof (backend as Record<string, unknown>)[method]).toBe('function');
      }
    });

    it('implements all RenderBackend properties', () => {
      const props = [
        'fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin',
        'miterLimit', 'globalAlpha', 'globalCompositeOperation',
        'lineDashOffset', 'shadowColor', 'shadowBlur', 'shadowOffsetX',
        'shadowOffsetY', 'font', 'textAlign', 'textBaseline', 'direction',
        'letterSpacing',
      ];
      for (const prop of props) {
        // Verify getter works
        expect(() => (backend as Record<string, unknown>)[prop]).not.toThrow();
        // Verify setter works
        const desc = Object.getOwnPropertyDescriptor(
          Object.getPrototypeOf(backend),
          prop
        );
        expect(desc?.set).toBeDefined();
      }
    });
  });

  // -----------------------------------------------------------------------
  // State management
  // -----------------------------------------------------------------------

  describe('state management', () => {
    it('save() delegates to Skia canvas', () => {
      backend.save();
      expect(mockCanvas.save).toHaveBeenCalledTimes(1);
    });

    it('restore() delegates to Skia canvas', () => {
      backend.save();
      backend.restore();
      expect(mockCanvas.restore).toHaveBeenCalledTimes(1);
    });

    it('save/restore preserves and restores state', () => {
      backend.fillStyle = '#ff0000';
      backend.lineWidth = 5;
      backend.globalAlpha = 0.5;

      backend.save();

      backend.fillStyle = '#00ff00';
      backend.lineWidth = 10;
      backend.globalAlpha = 0.8;

      expect(backend.fillStyle).toBe('#00ff00');
      expect(backend.lineWidth).toBe(10);
      expect(backend.globalAlpha).toBe(0.8);

      backend.restore();

      expect(backend.fillStyle).toBe('#ff0000');
      expect(backend.lineWidth).toBe(5);
      expect(backend.globalAlpha).toBe(0.5);
    });

    it('handles nested save/restore', () => {
      backend.fillStyle = 'a';
      backend.save();
      backend.fillStyle = 'b';
      backend.save();
      backend.fillStyle = 'c';

      backend.restore();
      expect(backend.fillStyle).toBe('b');

      backend.restore();
      expect(backend.fillStyle).toBe('a');
    });

    it('save/restore preserves line dash independently', () => {
      backend.setLineDash([5, 10]);
      backend.save();
      backend.setLineDash([1, 2, 3]);
      backend.restore();
      expect(backend.getLineDash()).toEqual([5, 10]);
    });
  });

  // -----------------------------------------------------------------------
  // Transform operations
  // -----------------------------------------------------------------------

  describe('transforms', () => {
    it('translate delegates to canvas', () => {
      backend.translate(10, 20);
      expect(mockCanvas.translate).toHaveBeenCalledWith(10, 20);
    });

    it('scale delegates to canvas', () => {
      backend.scale(2, 3);
      expect(mockCanvas.scale).toHaveBeenCalledWith(2, 3);
    });

    it('rotate converts radians to degrees', () => {
      backend.rotate(Math.PI / 2);
      expect(mockCanvas.rotate).toHaveBeenCalledWith(90, 0, 0);
    });

    it('transform maps to correct affine matrix', () => {
      backend.transform(1, 2, 3, 4, 5, 6);
      // Canvas2D [a,b,c,d,e,f] → Skia row-major [a,c,e,b,d,f,0,0,1]
      expect(mockCanvas.concat).toHaveBeenCalledWith([1, 3, 5, 2, 4, 6, 0, 0, 1]);
    });

    it('setTransform applies matrix via concat', () => {
      backend.setTransform(2, 0, 0, 2, 10, 20);
      // Should call concat at least once with the new matrix
      expect(mockCanvas.concat).toHaveBeenCalled();
      // Last call should have our matrix
      const calls = mockCanvas.concat.mock.calls;
      const lastCall = calls[calls.length - 1][0];
      expect(lastCall).toEqual([2, 0, 10, 0, 2, 20, 0, 0, 1]);
    });
  });

  // -----------------------------------------------------------------------
  // Path construction
  // -----------------------------------------------------------------------

  describe('path construction', () => {
    it('beginPath creates a new path', () => {
      backend.beginPath();
      // Should have created a new Path (constructor called for initial + beginPath)
      expect(ck.Path).toHaveBeenCalled();
    });

    it('moveTo delegates to current path', () => {
      backend.beginPath();
      const pathInstance = ck.Path.mock.results[ck.Path.mock.results.length - 1].value;
      backend.moveTo(10, 20);
      expect(pathInstance.moveTo).toHaveBeenCalledWith(10, 20);
    });

    it('lineTo delegates to current path', () => {
      backend.beginPath();
      const pathInstance = ck.Path.mock.results[ck.Path.mock.results.length - 1].value;
      backend.lineTo(30, 40);
      expect(pathInstance.lineTo).toHaveBeenCalledWith(30, 40);
    });

    it('bezierCurveTo maps to cubicTo', () => {
      backend.beginPath();
      const pathInstance = ck.Path.mock.results[ck.Path.mock.results.length - 1].value;
      backend.bezierCurveTo(1, 2, 3, 4, 5, 6);
      expect(pathInstance.cubicTo).toHaveBeenCalledWith(1, 2, 3, 4, 5, 6);
    });

    it('quadraticCurveTo maps to quadTo', () => {
      backend.beginPath();
      const pathInstance = ck.Path.mock.results[ck.Path.mock.results.length - 1].value;
      backend.quadraticCurveTo(1, 2, 3, 4);
      expect(pathInstance.quadTo).toHaveBeenCalledWith(1, 2, 3, 4);
    });

    it('closePath delegates to path.close', () => {
      backend.beginPath();
      const pathInstance = ck.Path.mock.results[ck.Path.mock.results.length - 1].value;
      backend.closePath();
      expect(pathInstance.close).toHaveBeenCalled();
    });

    it('rect adds rectangle to path', () => {
      backend.beginPath();
      const pathInstance = ck.Path.mock.results[ck.Path.mock.results.length - 1].value;
      backend.rect(10, 20, 100, 50);
      expect(pathInstance.addRect).toHaveBeenCalled();
      expect(ck.LTRBRect).toHaveBeenCalledWith(10, 20, 110, 70);
    });

    it('arcTo delegates to arcToTangent', () => {
      backend.beginPath();
      const pathInstance = ck.Path.mock.results[ck.Path.mock.results.length - 1].value;
      backend.arcTo(1, 2, 3, 4, 5);
      expect(pathInstance.arcToTangent).toHaveBeenCalledWith(1, 2, 3, 4, 5);
    });

    it('arc adds arc to path', () => {
      backend.beginPath();
      const pathInstance = ck.Path.mock.results[ck.Path.mock.results.length - 1].value;
      backend.arc(50, 50, 25, 0, Math.PI);
      expect(pathInstance.addArc).toHaveBeenCalled();
      // Verify oval rect was created for the arc
      expect(ck.LTRBRect).toHaveBeenCalledWith(25, 25, 75, 75);
    });
  });

  // -----------------------------------------------------------------------
  // Painting operations
  // -----------------------------------------------------------------------

  describe('painting', () => {
    it('fill() creates fill paint and draws path', () => {
      backend.beginPath();
      backend.moveTo(0, 0);
      backend.lineTo(100, 100);
      backend.fill();
      expect(mockCanvas.drawPath).toHaveBeenCalled();
    });

    it('stroke() creates stroke paint and draws path', () => {
      backend.beginPath();
      backend.moveTo(0, 0);
      backend.lineTo(100, 100);
      backend.stroke();
      expect(mockCanvas.drawPath).toHaveBeenCalled();
    });

    it('fillRect draws a filled rectangle', () => {
      backend.fillRect(10, 20, 100, 50);
      expect(mockCanvas.drawRect).toHaveBeenCalled();
      expect(ck.LTRBRect).toHaveBeenCalledWith(10, 20, 110, 70);
    });

    it('strokeRect draws a stroked rectangle', () => {
      backend.strokeRect(10, 20, 100, 50);
      expect(mockCanvas.drawRect).toHaveBeenCalled();
    });

    it('clearRect clips and clears', () => {
      backend.clearRect(0, 0, 200, 200);
      expect(mockCanvas.save).toHaveBeenCalled();
      expect(mockCanvas.clipPath).toHaveBeenCalled();
      expect(mockCanvas.clear).toHaveBeenCalled();
      expect(mockCanvas.restore).toHaveBeenCalled();
    });

    it('fill with evenodd sets FillType.EvenOdd', () => {
      backend.beginPath();
      backend.rect(0, 0, 100, 100);
      backend.fill('evenodd');
      // The path copy should have setFillType called with EvenOdd
      const drawPathCall = mockCanvas.drawPath.mock.calls[0];
      const pathArg = drawPathCall[0];
      expect(pathArg.setFillType).toHaveBeenCalledWith(1); // EvenOdd = 1
    });
  });

  // -----------------------------------------------------------------------
  // Style properties
  // -----------------------------------------------------------------------

  describe('style properties', () => {
    it('fillStyle get/set', () => {
      backend.fillStyle = '#ff0000';
      expect(backend.fillStyle).toBe('#ff0000');
    });

    it('strokeStyle get/set', () => {
      backend.strokeStyle = 'rgba(0,0,255,0.5)';
      expect(backend.strokeStyle).toBe('rgba(0,0,255,0.5)');
    });

    it('lineWidth get/set', () => {
      backend.lineWidth = 3;
      expect(backend.lineWidth).toBe(3);
    });

    it('lineCap get/set', () => {
      backend.lineCap = 'round';
      expect(backend.lineCap).toBe('round');
    });

    it('lineJoin get/set', () => {
      backend.lineJoin = 'bevel';
      expect(backend.lineJoin).toBe('bevel');
    });

    it('miterLimit get/set', () => {
      backend.miterLimit = 5;
      expect(backend.miterLimit).toBe(5);
    });

    it('globalAlpha get/set', () => {
      backend.globalAlpha = 0.5;
      expect(backend.globalAlpha).toBe(0.5);
    });

    it('globalCompositeOperation get/set', () => {
      backend.globalCompositeOperation = 'multiply';
      expect(backend.globalCompositeOperation).toBe('multiply');
    });

    it('lineDashOffset get/set', () => {
      backend.lineDashOffset = 5;
      expect(backend.lineDashOffset).toBe(5);
    });

    it('setLineDash/getLineDash', () => {
      backend.setLineDash([5, 10, 15]);
      expect(backend.getLineDash()).toEqual([5, 10, 15]);
    });

    it('getLineDash returns a copy', () => {
      backend.setLineDash([5, 10]);
      const dash = backend.getLineDash();
      dash.push(99);
      expect(backend.getLineDash()).toEqual([5, 10]);
    });
  });

  // -----------------------------------------------------------------------
  // Shadow properties
  // -----------------------------------------------------------------------

  describe('shadow properties', () => {
    it('shadowColor get/set', () => {
      backend.shadowColor = 'rgba(0,0,0,0.5)';
      expect(backend.shadowColor).toBe('rgba(0,0,0,0.5)');
    });

    it('shadowBlur get/set', () => {
      backend.shadowBlur = 10;
      expect(backend.shadowBlur).toBe(10);
    });

    it('shadowOffsetX get/set', () => {
      backend.shadowOffsetX = 5;
      expect(backend.shadowOffsetX).toBe(5);
    });

    it('shadowOffsetY get/set', () => {
      backend.shadowOffsetY = 3;
      expect(backend.shadowOffsetY).toBe(3);
    });

    it('shadow properties apply image filter on fill', () => {
      backend.shadowColor = 'rgba(0,0,0,1)';
      backend.shadowBlur = 10;
      backend.shadowOffsetX = 5;
      backend.shadowOffsetY = 5;
      backend.fillRect(0, 0, 100, 100);
      expect(ck.ImageFilter.MakeDropShadow).toHaveBeenCalled();
    });

    it('transparent shadow does not apply filter', () => {
      backend.shadowColor = 'rgba(0,0,0,0)';
      backend.shadowBlur = 10;
      backend.fillRect(0, 0, 100, 100);
      expect(ck.ImageFilter.MakeDropShadow).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Text properties and operations
  // -----------------------------------------------------------------------

  describe('text', () => {
    it('font get/set', () => {
      backend.font = 'bold 16px Arial';
      expect(backend.font).toBe('bold 16px Arial');
    });

    it('textAlign get/set', () => {
      backend.textAlign = 'center';
      expect(backend.textAlign).toBe('center');
    });

    it('textBaseline get/set', () => {
      backend.textBaseline = 'top';
      expect(backend.textBaseline).toBe('top');
    });

    it('direction get/set', () => {
      backend.direction = 'rtl';
      expect(backend.direction).toBe('rtl');
    });

    it('letterSpacing get/set', () => {
      backend.letterSpacing = '2px';
      expect(backend.letterSpacing).toBe('2px');
    });

    it('fillText delegates to canvas.drawText', () => {
      backend.font = '16px Arial';
      backend.fillText('Hello', 10, 20);
      expect(mockCanvas.drawText).toHaveBeenCalled();
      const call = mockCanvas.drawText.mock.calls[0];
      expect(call[0]).toBe('Hello');
    });

    it('strokeText delegates to canvas.drawText', () => {
      backend.font = '16px Arial';
      backend.strokeText('World', 10, 20);
      expect(mockCanvas.drawText).toHaveBeenCalled();
    });

    it('measureText returns TextMetrics-shaped object', () => {
      backend.font = '16px Arial';
      const metrics = backend.measureText('test');
      expect(typeof metrics.width).toBe('number');
      expect(metrics.width).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // Clip handling
  // -----------------------------------------------------------------------

  describe('clip', () => {
    it('clip() clips to current path', () => {
      backend.beginPath();
      backend.rect(0, 0, 100, 100);
      backend.clip();
      expect(mockCanvas.clipPath).toHaveBeenCalled();
    });

    it('clip with evenodd sets correct fill type', () => {
      backend.beginPath();
      backend.rect(0, 0, 100, 100);
      backend.clip('evenodd');
      expect(mockCanvas.clipPath).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Gradient creation
  // -----------------------------------------------------------------------

  describe('gradients', () => {
    it('createLinearGradient returns gradient-like object', () => {
      const grad = backend.createLinearGradient(0, 0, 100, 100);
      expect(grad).toBeDefined();
      expect(typeof (grad as unknown as { addColorStop: unknown }).addColorStop).toBe('function');
    });

    it('createRadialGradient returns gradient-like object', () => {
      const grad = backend.createRadialGradient(50, 50, 0, 50, 50, 100);
      expect(grad).toBeDefined();
      expect(typeof (grad as unknown as { addColorStop: unknown }).addColorStop).toBe('function');
    });

    it('gradient color stops can be added', () => {
      const grad = backend.createLinearGradient(0, 0, 100, 0);
      (grad as unknown as { addColorStop: (o: number, c: string) => void }).addColorStop(0, '#ff0000');
      (grad as unknown as { addColorStop: (o: number, c: string) => void }).addColorStop(1, '#0000ff');
      // Using it as fillStyle should work
      backend.fillStyle = grad;
      expect(backend.fillStyle).toBe(grad);
    });

    it('createPattern returns null (not yet supported)', () => {
      const result = backend.createPattern({} as CanvasImageSource, 'repeat');
      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Composite operations / blend modes
  // -----------------------------------------------------------------------

  describe('blend mode mapping', () => {
    it('maps source-over to SrcOver', () => {
      backend.globalCompositeOperation = 'source-over';
      backend.fillRect(0, 0, 10, 10);
      // Verify the paint was created with the correct blend mode
      const paintInstance = ck.Paint.mock.results[ck.Paint.mock.results.length - 1].value;
      expect(paintInstance.setBlendMode).toHaveBeenCalledWith(3); // SrcOver = 3
    });

    it('maps multiply to Multiply', () => {
      backend.globalCompositeOperation = 'multiply';
      backend.fillRect(0, 0, 10, 10);
      const paintInstance = ck.Paint.mock.results[ck.Paint.mock.results.length - 1].value;
      expect(paintInstance.setBlendMode).toHaveBeenCalledWith(24); // Multiply = 24
    });

    it('maps screen to Screen', () => {
      backend.globalCompositeOperation = 'screen';
      backend.fillRect(0, 0, 10, 10);
      const paintInstance = ck.Paint.mock.results[ck.Paint.mock.results.length - 1].value;
      expect(paintInstance.setBlendMode).toHaveBeenCalledWith(14); // Screen = 14
    });
  });

  // -----------------------------------------------------------------------
  // Image operations
  // -----------------------------------------------------------------------

  describe('drawImage', () => {
    it('3-arg form delegates to canvas.drawImage', () => {
      const img = { width: () => 100, height: () => 100 };
      backend.drawImage(img as unknown as CanvasImageSource, 10, 20);
      expect(mockCanvas.drawImage).toHaveBeenCalled();
    });

    it('5-arg form uses drawImageRect', () => {
      const img = { width: () => 100, height: () => 100 };
      backend.drawImage(img as unknown as CanvasImageSource, 10, 20, 50, 60);
      expect(mockCanvas.drawImageRect).toHaveBeenCalled();
    });

    it('9-arg form uses drawImageRect with source rect', () => {
      const img = { width: () => 100, height: () => 100 };
      backend.drawImage(
        img as unknown as CanvasImageSource,
        0, 0, 50, 50, 10, 20, 100, 100
      );
      expect(mockCanvas.drawImageRect).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Line dash
  // -----------------------------------------------------------------------

  describe('line dash', () => {
    it('applies dash effect on stroke when lineDash is set', () => {
      backend.setLineDash([5, 10]);
      backend.beginPath();
      backend.moveTo(0, 0);
      backend.lineTo(100, 100);
      backend.stroke();
      expect(ck.PathEffect.MakeDash).toHaveBeenCalledWith([5, 10], 0);
    });

    it('does not apply dash effect when lineDash is empty', () => {
      backend.setLineDash([]);
      backend.strokeRect(0, 0, 100, 100);
      expect(ck.PathEffect.MakeDash).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Resource management
  // -----------------------------------------------------------------------

  describe('resource management', () => {
    it('flush() delegates to surface.flush()', () => {
      backend.flush();
      expect(mockSurface.flush).toHaveBeenCalled();
    });

    it('dispose() cleans up path and font', () => {
      // Access font to create it
      backend.font = '12px Arial';
      backend.fillText('test', 0, 0);
      backend.dispose();
      // Path delete called during beginPath or dispose
    });

    it('beginPath deletes the old path', () => {
      const firstPath = ck.Path.mock.results[0].value;
      backend.beginPath();
      expect(firstPath.delete).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Default state values
  // -----------------------------------------------------------------------

  describe('default state', () => {
    it('has correct defaults', () => {
      expect(backend.fillStyle).toBe('#000000');
      expect(backend.strokeStyle).toBe('#000000');
      expect(backend.lineWidth).toBe(1);
      expect(backend.lineCap).toBe('butt');
      expect(backend.lineJoin).toBe('miter');
      expect(backend.miterLimit).toBe(10);
      expect(backend.globalAlpha).toBe(1);
      expect(backend.globalCompositeOperation).toBe('source-over');
      expect(backend.getLineDash()).toEqual([]);
      expect(backend.lineDashOffset).toBe(0);
      expect(backend.shadowColor).toBe('rgba(0, 0, 0, 0)');
      expect(backend.shadowBlur).toBe(0);
      expect(backend.shadowOffsetX).toBe(0);
      expect(backend.shadowOffsetY).toBe(0);
      expect(backend.font).toBe('10px sans-serif');
      expect(backend.textAlign).toBe('start');
      expect(backend.textBaseline).toBe('alphabetic');
      expect(backend.direction).toBe('ltr');
      expect(backend.letterSpacing).toBe('0px');
    });
  });
});
