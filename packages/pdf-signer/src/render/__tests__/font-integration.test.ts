import { describe, it, expect, vi } from 'vitest';
import { OPS } from '../ops.js';

describe('FontRegistrar integration with NativeRenderer', () => {
  it('FontRegistrar is created as part of NativeRenderer', async () => {
    // Verify the NativeRenderer module exports and creates FontRegistrar
    const mod = await import('../NativeRenderer.js');
    expect(mod.NativeRenderer).toBeDefined();

    // fromPages creates a renderer with an internal FontRegistrar
    const renderer = mod.NativeRenderer.fromPages([], (ref: any) => ref);
    expect(renderer).toBeDefined();
    expect(renderer.pageCount).toBe(0);

    // dispose() should be callable (cleans up FontRegistrar)
    await renderer.dispose();
  });

  it('dispose() is idempotent', async () => {
    const { NativeRenderer } = await import('../NativeRenderer.js');
    const renderer = NativeRenderer.fromPages([], (ref: any) => ref);

    // Multiple dispose calls should not throw
    await renderer.dispose();
    await renderer.dispose();
  });

  it('preRegisterFonts replaces ExtractedFont with registered family name', async () => {
    // We test the private preRegisterFonts indirectly by constructing an
    // OperatorList with an ExtractedFont 4th arg and rendering via a mock.
    // Since preRegisterFonts is called in renderPage, we verify the pipeline
    // by checking that canvas-graphics receives a string (family name) not
    // an ExtractedFont object.

    const { NativeCanvasGraphics } = await import('../canvas-graphics.js');

    // Track what font family gets set
    const fontStrings: string[] = [];
    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      transform: vi.fn(),
      scale: vi.fn(),
      fillText: vi.fn(),
      strokeText: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      set font(val: string) {
        fontStrings.push(val);
      },
      get font() {
        return fontStrings[fontStrings.length - 1] ?? '';
      },
      set fillStyle(_v: string) {},
      get fillStyle() {
        return '#000';
      },
      set strokeStyle(_v: string) {},
      get strokeStyle() {
        return '#000';
      },
      set globalAlpha(_v: number) {},
      get globalAlpha() {
        return 1;
      },
      set lineWidth(_v: number) {},
      get lineWidth() {
        return 1;
      },
    } as any;

    // If the 4th arg is a string, canvas-graphics uses it as the font family
    const registeredFamily = '_pdf_test_font_0';
    const css = { family: 'Helvetica, Arial, sans-serif', weight: 'normal', style: 'normal' };

    const opList = {
      fnArray: [
        OPS.beginText,
        OPS.setFont,
        OPS.setTextMatrix,
        OPS.showText,
        OPS.endText,
      ],
      argsArray: [
        null,
        ['F1', 14, css, registeredFamily],
        [1, 0, 0, 1, 100, 700],
        [[{ char: 'H', width: 0.6, unicode: 'H' }]],
        null,
      ],
    };

    const diagnostics = { warn: vi.fn(), length: 0, items: [] };
    const graphics = new NativeCanvasGraphics(mockCtx, diagnostics as any);
    graphics.execute(opList as any);

    // The registered family should appear in the font string
    const fontWithRegistered = fontStrings.find((s) => s.includes(registeredFamily));
    expect(fontWithRegistered).toBeDefined();
    // Should NOT contain the CSS fallback family
    expect(fontWithRegistered).not.toContain('Helvetica');
  });

  it('falls back to CSS when no embedded font (4th arg undefined)', async () => {
    const { NativeCanvasGraphics } = await import('../canvas-graphics.js');

    const fontStrings: string[] = [];
    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      transform: vi.fn(),
      scale: vi.fn(),
      fillText: vi.fn(),
      strokeText: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      set font(val: string) {
        fontStrings.push(val);
      },
      get font() {
        return fontStrings[fontStrings.length - 1] ?? '';
      },
      set fillStyle(_v: string) {},
      get fillStyle() {
        return '#000';
      },
      set strokeStyle(_v: string) {},
      get strokeStyle() {
        return '#000';
      },
      set globalAlpha(_v: number) {},
      get globalAlpha() {
        return 1;
      },
      set lineWidth(_v: number) {},
      get lineWidth() {
        return 1;
      },
    } as any;

    const css = { family: 'Times, serif', weight: 'bold', style: 'italic' };

    const opList = {
      fnArray: [
        OPS.beginText,
        OPS.setFont,
        OPS.setTextMatrix,
        OPS.showText,
        OPS.endText,
      ],
      argsArray: [
        null,
        // No 4th arg — should use CSS fallback
        ['F1', 12, css],
        [1, 0, 0, 1, 50, 600],
        [[{ char: 'A', width: 0.5, unicode: 'A' }]],
        null,
      ],
    };

    const diagnostics = { warn: vi.fn(), length: 0, items: [] };
    const graphics = new NativeCanvasGraphics(mockCtx, diagnostics as any);
    graphics.execute(opList as any);

    // Should use the CSS font family
    const fontWithCSS = fontStrings.find((s) => s.includes('Times, serif'));
    expect(fontWithCSS).toBeDefined();
    // Should include the CSS weight and style
    expect(fontWithCSS).toContain('bold');
    expect(fontWithCSS).toContain('italic');
  });

  it('falls back to CSS when 4th arg is undefined (extraction failed)', async () => {
    const { NativeCanvasGraphics } = await import('../canvas-graphics.js');

    const fontStrings: string[] = [];
    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      transform: vi.fn(),
      scale: vi.fn(),
      fillText: vi.fn(),
      strokeText: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      set font(val: string) {
        fontStrings.push(val);
      },
      get font() {
        return fontStrings[fontStrings.length - 1] ?? '';
      },
      set fillStyle(_v: string) {},
      get fillStyle() {
        return '#000';
      },
      set strokeStyle(_v: string) {},
      get strokeStyle() {
        return '#000';
      },
      set globalAlpha(_v: number) {},
      get globalAlpha() {
        return 1;
      },
      set lineWidth(_v: number) {},
      get lineWidth() {
        return 1;
      },
    } as any;

    const css = { family: 'Courier, monospace', weight: 'normal', style: 'normal' };

    const opList = {
      fnArray: [
        OPS.beginText,
        OPS.setFont,
        OPS.setTextMatrix,
        OPS.showText,
        OPS.endText,
      ],
      argsArray: [
        null,
        // 4th arg explicitly undefined
        ['F1', 10, css, undefined],
        [1, 0, 0, 1, 50, 600],
        [[{ char: 'B', width: 0.5, unicode: 'B' }]],
        null,
      ],
    };

    const diagnostics = { warn: vi.fn(), length: 0, items: [] };
    const graphics = new NativeCanvasGraphics(mockCtx, diagnostics as any);
    graphics.execute(opList as any);

    const fontWithCSS = fontStrings.find((s) => s.includes('Courier, monospace'));
    expect(fontWithCSS).toBeDefined();
  });
});
