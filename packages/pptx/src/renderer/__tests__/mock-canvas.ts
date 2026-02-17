/**
 * Mock Canvas2D context and RenderContext for PPTX renderer tests.
 *
 * This is a local copy of the core mock-canvas utility, adapted for
 * use in the pptx package tests. Records all Canvas2D method calls
 * so tests can assert the correct API sequence without a real browser.
 */

import type { ThemeIR, ResolvedColor } from '@opendockit/core';
import { MediaCache } from '@opendockit/core/media';
import type { RenderContext } from '@opendockit/core/drawingml/renderer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MockCall {
  method: string;
  args: unknown[];
}

export interface MockGradient {
  type: 'linear' | 'radial';
  args: number[];
  stops: Array<{ offset: number; color: string }>;
}

export type MockContext = CanvasRenderingContext2D & {
  _calls: MockCall[];
  _gradients: MockGradient[];
};

// ---------------------------------------------------------------------------
// Mock Canvas2D Context
// ---------------------------------------------------------------------------

export function createMockContext(): MockContext {
  const calls: MockCall[] = [];
  const gradients: MockGradient[] = [];

  const ctx = {
    // Tracked properties
    fillStyle: '' as string | CanvasGradient,
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt' as CanvasLineCap,
    lineJoin: 'miter' as CanvasLineJoin,
    globalAlpha: 1,
    font: '10px sans-serif',
    textAlign: 'start' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,

    // Shadow properties
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,

    // Drawing methods
    fill: () => calls.push({ method: 'fill', args: [] }),
    stroke: () => calls.push({ method: 'stroke', args: [] }),
    beginPath: () => calls.push({ method: 'beginPath', args: [] }),
    closePath: () => calls.push({ method: 'closePath', args: [] }),
    moveTo: (x: number, y: number) => calls.push({ method: 'moveTo', args: [x, y] }),
    lineTo: (x: number, y: number) => calls.push({ method: 'lineTo', args: [x, y] }),
    ellipse: (
      x: number,
      y: number,
      rx: number,
      ry: number,
      rot: number,
      start: number,
      end: number
    ) => calls.push({ method: 'ellipse', args: [x, y, rx, ry, rot, start, end] }),
    fillRect: (x: number, y: number, w: number, h: number) =>
      calls.push({ method: 'fillRect', args: [x, y, w, h] }),
    strokeRect: (x: number, y: number, w: number, h: number) =>
      calls.push({ method: 'strokeRect', args: [x, y, w, h] }),
    clearRect: (x: number, y: number, w: number, h: number) =>
      calls.push({ method: 'clearRect', args: [x, y, w, h] }),
    fillText: (text: string, x: number, y: number) =>
      calls.push({ method: 'fillText', args: [text, x, y] }),
    drawImage: (...args: unknown[]) => calls.push({ method: 'drawImage', args }),
    scale: (x: number, y: number) => calls.push({ method: 'scale', args: [x, y] }),
    rect: (x: number, y: number, w: number, h: number) =>
      calls.push({ method: 'rect', args: [x, y, w, h] }),
    clip: () => calls.push({ method: 'clip', args: [] }),
    measureText: (text: string) => {
      const ptMatch = ctx.font.match(/([\d.]+)pt/);
      const pxMatch = ctx.font.match(/([\d.]+)px/);
      let sizePx: number;
      if (ptMatch) {
        sizePx = parseFloat(ptMatch[1]) * (96 / 72);
      } else if (pxMatch) {
        sizePx = parseFloat(pxMatch[1]);
      } else {
        sizePx = 10;
      }
      return { width: text.length * sizePx * 0.5 };
    },

    // Dash
    setLineDash: (segments: number[]) => calls.push({ method: 'setLineDash', args: [segments] }),

    // State
    save: () => calls.push({ method: 'save', args: [] }),
    restore: () => calls.push({ method: 'restore', args: [] }),
    translate: (x: number, y: number) => calls.push({ method: 'translate', args: [x, y] }),
    rotate: (angle: number) => calls.push({ method: 'rotate', args: [angle] }),

    // Gradient factories
    createLinearGradient: (x0: number, y0: number, x1: number, y1: number) => {
      const g: MockGradient = { type: 'linear', args: [x0, y0, x1, y1], stops: [] };
      gradients.push(g);
      return {
        addColorStop: (offset: number, color: string) => {
          g.stops.push({ offset, color });
        },
      };
    },
    createRadialGradient: (
      x0: number,
      y0: number,
      r0: number,
      x1: number,
      y1: number,
      r1: number
    ) => {
      const g: MockGradient = {
        type: 'radial',
        args: [x0, y0, r0, x1, y1, r1],
        stops: [],
      };
      gradients.push(g);
      return {
        addColorStop: (offset: number, color: string) => {
          g.stops.push({ offset, color });
        },
      };
    },

    // Internal test accessors
    _calls: calls,
    _gradients: gradients,
  } as unknown as MockContext;

  return ctx;
}

// ---------------------------------------------------------------------------
// Mock RenderContext
// ---------------------------------------------------------------------------

/** Minimal ThemeIR for testing. */
function createMinimalTheme(): ThemeIR {
  const black: ResolvedColor = { r: 0, g: 0, b: 0, a: 1 };
  const white: ResolvedColor = { r: 255, g: 255, b: 255, a: 1 };

  return {
    name: 'Test Theme',
    colorScheme: {
      dk1: black,
      lt1: white,
      dk2: black,
      lt2: white,
      accent1: { r: 79, g: 129, b: 189, a: 1 },
      accent2: { r: 192, g: 80, b: 77, a: 1 },
      accent3: { r: 155, g: 187, b: 89, a: 1 },
      accent4: { r: 128, g: 100, b: 162, a: 1 },
      accent5: { r: 75, g: 172, b: 198, a: 1 },
      accent6: { r: 247, g: 150, b: 70, a: 1 },
      hlink: { r: 0, g: 0, b: 255, a: 1 },
      folHlink: { r: 128, g: 0, b: 128, a: 1 },
    },
    fontScheme: {
      majorLatin: 'Calibri Light',
      minorLatin: 'Calibri',
    },
    formatScheme: {
      fillStyles: [{ type: 'none' }, { type: 'none' }, { type: 'none' }],
      lineStyles: [{}, {}, {}],
      effectStyles: [[], [], []],
      bgFillStyles: [{ type: 'none' }, { type: 'none' }, { type: 'none' }],
    },
  };
}

/**
 * Create a mock RenderContext suitable for unit tests.
 *
 * @param ctxOverride - Optional pre-created mock context.
 * @param dpiScale    - DPI scale factor (default 1).
 */
export function createMockRenderContext(
  ctxOverride?: MockContext,
  dpiScale = 1
): RenderContext & { ctx: MockContext } {
  const ctx = ctxOverride ?? createMockContext();

  return {
    ctx,
    dpiScale,
    theme: createMinimalTheme(),
    mediaCache: new MediaCache(),
    resolveFont: (name: string) => name,
  };
}
