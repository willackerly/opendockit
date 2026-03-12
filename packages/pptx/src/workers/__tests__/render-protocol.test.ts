import { describe, it, expect } from 'vitest';
import type {
  MainToWorkerMessage,
  WorkerToMainMessage,
  SerializedSlideData,
  ViewportRect,
  InitMessage,
  RenderMessage,
  ResizeMessage,
  DisposeMessage,
  ReadyMessage,
  RenderedMessage,
  ErrorMessage,
} from '../render-protocol.js';

// ---------------------------------------------------------------------------
// Helpers — minimal IR fixtures for type-safe slide data
// ---------------------------------------------------------------------------

function minimalSlideData(): SerializedSlideData {
  return {
    enrichedSlide: {
      slide: {
        partUri: '/ppt/slides/slide1.xml',
        elements: [],
        layoutPartUri: '/ppt/slideLayouts/slideLayout1.xml',
        masterPartUri: '/ppt/slideMasters/slideMaster1.xml',
      },
      layout: {
        partUri: '/ppt/slideLayouts/slideLayout1.xml',
        elements: [],
        masterPartUri: '/ppt/slideMasters/slideMaster1.xml',
      },
      master: {
        partUri: '/ppt/slideMasters/slideMaster1.xml',
        elements: [],
        colorMap: { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' },
      },
    },
    theme: {
      name: 'Office Theme',
      colorScheme: {
        name: 'Office',
        dk1: '#000000',
        lt1: '#ffffff',
        dk2: '#1f497d',
        lt2: '#eeece1',
        accent1: '#4f81bd',
        accent2: '#c0504d',
        accent3: '#9bbb59',
        accent4: '#8064a2',
        accent5: '#4bacc6',
        accent6: '#f79646',
        hlink: '#0000ff',
        folHlink: '#800080',
      },
      fontScheme: {
        name: 'Office',
        majorFont: { latin: 'Calibri Light', ea: '', cs: '' },
        minorFont: { latin: 'Calibri', ea: '', cs: '' },
      },
      formatScheme: {
        name: 'Office',
        fillStyles: [],
        lineStyles: [],
        effectStyles: [],
        bgFillStyles: [],
      },
    },
    width: 9144000,
    height: 6858000,
  };
}

describe('render-protocol', () => {
  // -------------------------------------------------------------------------
  // MainToWorkerMessage discrimination
  // -------------------------------------------------------------------------

  describe('MainToWorkerMessage', () => {
    it('discriminates init message', () => {
      const msg: MainToWorkerMessage = {
        type: 'init',
        canvas: {} as OffscreenCanvas,
        slideWidth: 1920,
        slideHeight: 1080,
      };
      expect(msg.type).toBe('init');
      if (msg.type === 'init') {
        expect(msg.slideWidth).toBe(1920);
        expect(msg.slideHeight).toBe(1080);
        expect(msg.canvas).toBeDefined();
      }
    });

    it('discriminates render message with enriched slide data', () => {
      const slideData = minimalSlideData();
      const msg: MainToWorkerMessage = {
        type: 'render',
        slideData,
      };
      expect(msg.type).toBe('render');
      if (msg.type === 'render') {
        expect(msg.slideData.enrichedSlide.slide.elements).toHaveLength(0);
        expect(msg.slideData.theme.name).toBe('Office Theme');
        expect(msg.slideData.width).toBe(9144000);
        expect(msg.viewportRect).toBeUndefined();
      }
    });

    it('discriminates render message with viewport', () => {
      const msg: MainToWorkerMessage = {
        type: 'render',
        slideData: minimalSlideData(),
        viewportRect: { x: 10, y: 20, width: 50, height: 50 },
      };
      if (msg.type === 'render') {
        expect(msg.viewportRect).toEqual({ x: 10, y: 20, width: 50, height: 50 });
      }
    });

    it('discriminates resize message', () => {
      const msg: MainToWorkerMessage = { type: 'resize', width: 800, height: 600 };
      expect(msg.type).toBe('resize');
      if (msg.type === 'resize') {
        expect(msg.width).toBe(800);
        expect(msg.height).toBe(600);
      }
    });

    it('discriminates dispose message', () => {
      const msg: MainToWorkerMessage = { type: 'dispose' };
      expect(msg.type).toBe('dispose');
    });
  });

  // -------------------------------------------------------------------------
  // WorkerToMainMessage discrimination
  // -------------------------------------------------------------------------

  describe('WorkerToMainMessage', () => {
    it('discriminates ready message', () => {
      const msg: WorkerToMainMessage = { type: 'ready' };
      expect(msg.type).toBe('ready');
    });

    it('discriminates rendered message', () => {
      const msg: WorkerToMainMessage = { type: 'rendered', frameId: 42, duration: 16.5 };
      expect(msg.type).toBe('rendered');
      if (msg.type === 'rendered') {
        expect(msg.frameId).toBe(42);
        expect(msg.duration).toBe(16.5);
      }
    });

    it('discriminates error message', () => {
      const msg: WorkerToMainMessage = { type: 'error', message: 'Canvas context lost' };
      expect(msg.type).toBe('error');
      if (msg.type === 'error') {
        expect(msg.message).toBe('Canvas context lost');
      }
    });
  });

  // -------------------------------------------------------------------------
  // SerializedSlideData
  // -------------------------------------------------------------------------

  describe('SerializedSlideData', () => {
    it('requires enrichedSlide, theme, width, and height', () => {
      const data = minimalSlideData();
      expect(data.enrichedSlide.slide.elements).toEqual([]);
      expect(data.width).toBe(9144000);
      expect(data.height).toBe(6858000);
      expect(data.colorMap).toBeUndefined();
    });

    it('accepts optional colorMap', () => {
      const data = minimalSlideData();
      data.colorMap = { bg1: 'lt1', tx1: 'dk1' };
      expect(data.colorMap).toEqual({ bg1: 'lt1', tx1: 'dk1' });
    });

    it('accepts optional slideNumber', () => {
      const data = minimalSlideData();
      data.slideNumber = 3;
      expect(data.slideNumber).toBe(3);
    });

    it('accepts optional mediaBuffers', () => {
      const data = minimalSlideData();
      const buf = new ArrayBuffer(100);
      data.mediaBuffers = { '/ppt/media/image1.png': buf };
      expect(data.mediaBuffers['/ppt/media/image1.png']).toBe(buf);
    });

    it('carries the full enriched slide chain', () => {
      const data = minimalSlideData();
      const { slide, layout, master } = data.enrichedSlide;
      expect(slide.partUri).toBe('/ppt/slides/slide1.xml');
      expect(layout.partUri).toBe('/ppt/slideLayouts/slideLayout1.xml');
      expect(master.partUri).toBe('/ppt/slideMasters/slideMaster1.xml');
      expect(master.colorMap).toEqual({
        bg1: 'lt1',
        tx1: 'dk1',
        bg2: 'lt2',
        tx2: 'dk2',
      });
    });
  });

  // -------------------------------------------------------------------------
  // ViewportRect
  // -------------------------------------------------------------------------

  describe('ViewportRect', () => {
    it('has required x, y, width, height fields', () => {
      const rect: ViewportRect = { x: 0, y: 0, width: 1920, height: 1080 };
      expect(rect.x).toBe(0);
      expect(rect.y).toBe(0);
      expect(rect.width).toBe(1920);
      expect(rect.height).toBe(1080);
    });

    it('supports negative coordinates (scrolled viewport)', () => {
      const rect: ViewportRect = { x: -100, y: -50, width: 800, height: 600 };
      expect(rect.x).toBe(-100);
      expect(rect.y).toBe(-50);
    });
  });

  // -------------------------------------------------------------------------
  // Type-level completeness
  // -------------------------------------------------------------------------

  describe('type-level checks', () => {
    it('all MainToWorkerMessage types can be switch-exhausted', () => {
      const messages: MainToWorkerMessage[] = [
        { type: 'init', canvas: {} as OffscreenCanvas, slideWidth: 0, slideHeight: 0 },
        { type: 'render', slideData: minimalSlideData() },
        { type: 'resize', width: 0, height: 0 },
        { type: 'dispose' },
      ];

      const types = messages.map((m) => m.type);
      expect(types).toEqual(['init', 'render', 'resize', 'dispose']);
    });

    it('all WorkerToMainMessage types can be switch-exhausted', () => {
      const messages: WorkerToMainMessage[] = [
        { type: 'ready' },
        { type: 'rendered', frameId: 1, duration: 0 },
        { type: 'error', message: '' },
      ];

      const types = messages.map((m) => m.type);
      expect(types).toEqual(['ready', 'rendered', 'error']);
    });

    it('individual message interfaces are exported and usable', () => {
      // Verify each named interface can be independently typed
      const init: InitMessage = {
        type: 'init',
        canvas: {} as OffscreenCanvas,
        slideWidth: 1,
        slideHeight: 1,
      };
      const render: RenderMessage = {
        type: 'render',
        slideData: minimalSlideData(),
      };
      const resize: ResizeMessage = { type: 'resize', width: 1, height: 1 };
      const dispose: DisposeMessage = { type: 'dispose' };
      const ready: ReadyMessage = { type: 'ready' };
      const rendered: RenderedMessage = { type: 'rendered', frameId: 1, duration: 0 };
      const error: ErrorMessage = { type: 'error', message: 'x' };

      expect(init.type).toBe('init');
      expect(render.type).toBe('render');
      expect(resize.type).toBe('resize');
      expect(dispose.type).toBe('dispose');
      expect(ready.type).toBe('ready');
      expect(rendered.type).toBe('rendered');
      expect(error.type).toBe('error');
    });
  });
});
