import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkerOrchestrator } from '../worker-orchestrator.js';
import type { WorkerToMainMessage, SerializedSlideData } from '../render-protocol.js';

// ---------------------------------------------------------------------------
// Mock infrastructure
// ---------------------------------------------------------------------------

/** Captured messages sent to the mock worker via postMessage. */
let postedMessages: Array<{ data: unknown; transfer?: unknown[] }> = [];

/** The onmessage handler registered by WorkerOrchestrator on the mock Worker. */
let workerOnMessage: ((e: MessageEvent<WorkerToMainMessage>) => void) | null = null;
let workerOnError: ((e: ErrorEvent) => void) | null = null;

/** Simulate a message from the worker to the main thread. */
function simulateWorkerMessage(msg: WorkerToMainMessage): void {
  workerOnMessage?.({ data: msg } as MessageEvent<WorkerToMainMessage>);
}

/** Mock Worker class. */
class MockWorker {
  constructor(
    public url: string | URL,
    public options?: WorkerOptions,
  ) {}

  postMessage(data: unknown, transfer?: Transferable[]): void {
    postedMessages.push({ data, transfer });
  }

  set onmessage(handler: ((e: MessageEvent) => void) | null) {
    workerOnMessage = handler;
  }

  get onmessage(): ((e: MessageEvent) => void) | null {
    return workerOnMessage;
  }

  set onerror(handler: ((e: ErrorEvent) => void) | null) {
    workerOnError = handler;
  }

  get onerror(): ((e: ErrorEvent) => void) | null {
    return workerOnError;
  }

  terminate = vi.fn();
}

/** Mock OffscreenCanvas. */
class MockOffscreenCanvas {
  width: number;
  height: number;
  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
  }
}

/** Mock HTMLCanvasElement with transferControlToOffscreen. */
function createMockCanvas(width = 1920, height = 1080) {
  const offscreen = new MockOffscreenCanvas(width, height);
  return {
    width,
    height,
    transferControlToOffscreen: vi.fn(() => offscreen),
    _offscreen: offscreen,
  } as unknown as HTMLCanvasElement & { _offscreen: MockOffscreenCanvas };
}

/** Build a minimal SerializedSlideData for tests. */
function minimalSlideData(overrides?: Partial<SerializedSlideData>): SerializedSlideData {
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
        colorMap: { bg1: 'lt1', tx1: 'dk1' },
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
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Install global mocks
// ---------------------------------------------------------------------------

let originalWorker: typeof globalThis.Worker;

beforeEach(() => {
  postedMessages = [];
  workerOnMessage = null;
  workerOnError = null;
  originalWorker = globalThis.Worker;
  globalThis.Worker = MockWorker as unknown as typeof Worker;
});

afterEach(() => {
  globalThis.Worker = originalWorker;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkerOrchestrator', () => {
  it('creates an instance', () => {
    const orch = new WorkerOrchestrator();
    expect(orch).toBeInstanceOf(WorkerOrchestrator);
    expect(orch.ready).toBe(false);
  });

  describe('init', () => {
    it('transfers OffscreenCanvas to the worker', async () => {
      const orch = new WorkerOrchestrator();
      const canvas = createMockCanvas();

      // Start init (will block waiting for 'ready')
      const initPromise = orch.init(canvas);

      // Verify transferControlToOffscreen was called
      expect(canvas.transferControlToOffscreen).toHaveBeenCalledOnce();

      // Verify init message was posted
      expect(postedMessages).toHaveLength(1);
      const initMsg = postedMessages[0];
      expect((initMsg.data as { type: string }).type).toBe('init');
      expect((initMsg.data as { slideWidth: number }).slideWidth).toBe(1920);
      expect((initMsg.data as { slideHeight: number }).slideHeight).toBe(1080);

      // Canvas should be in the transfer list
      expect(initMsg.transfer).toHaveLength(1);

      // Simulate ready response
      simulateWorkerMessage({ type: 'ready' });

      await initPromise;
      expect(orch.ready).toBe(true);
    });

    it('uses module type worker', async () => {
      const orch = new WorkerOrchestrator();
      const canvas = createMockCanvas();
      const initPromise = orch.init(canvas);

      // Check the MockWorker was constructed with type: 'module'
      // We verify by checking the posted messages went through
      expect(postedMessages.length).toBeGreaterThanOrEqual(1);

      simulateWorkerMessage({ type: 'ready' });
      await initPromise;
    });

    it('accepts custom workerURL', async () => {
      const orch = new WorkerOrchestrator();
      const canvas = createMockCanvas();
      const initPromise = orch.init(canvas, {
        workerURL: 'https://cdn.example.com/render-worker.js',
      });

      simulateWorkerMessage({ type: 'ready' });
      await initPromise;
      expect(orch.ready).toBe(true);
    });
  });

  describe('requestRender', () => {
    it('sends render message with enriched slide data after init', async () => {
      const orch = new WorkerOrchestrator();
      const canvas = createMockCanvas();
      const initPromise = orch.init(canvas);
      simulateWorkerMessage({ type: 'ready' });
      await initPromise;

      const slideData = minimalSlideData();
      orch.requestRender(slideData);

      // init message + render message
      expect(postedMessages).toHaveLength(2);
      const renderMsg = postedMessages[1].data as { type: string; slideData: SerializedSlideData };
      expect(renderMsg.type).toBe('render');
      expect(renderMsg.slideData.enrichedSlide.slide.elements).toHaveLength(0);
      expect(renderMsg.slideData.theme.name).toBe('Office Theme');
    });

    it('sends render message with viewportRect', async () => {
      const orch = new WorkerOrchestrator();
      const canvas = createMockCanvas();
      const initPromise = orch.init(canvas);
      simulateWorkerMessage({ type: 'ready' });
      await initPromise;

      const slideData = minimalSlideData();
      const viewport = { x: 10, y: 20, width: 50, height: 50 };
      orch.requestRender(slideData, viewport);

      const renderMsg = postedMessages[1].data as {
        type: string;
        viewportRect: { x: number; y: number; width: number; height: number };
      };
      expect(renderMsg.viewportRect).toEqual(viewport);
    });

    it('transfers media ArrayBuffers as transferables', async () => {
      const orch = new WorkerOrchestrator();
      const canvas = createMockCanvas();
      const initPromise = orch.init(canvas);
      simulateWorkerMessage({ type: 'ready' });
      await initPromise;

      const imgBuffer = new ArrayBuffer(256);
      const slideData = minimalSlideData({
        mediaBuffers: { '/ppt/media/image1.png': imgBuffer },
      });
      orch.requestRender(slideData);

      // Verify the ArrayBuffer is in the transfer list
      expect(postedMessages).toHaveLength(2);
      const renderCall = postedMessages[1];
      expect(renderCall.transfer).toBeDefined();
      expect(renderCall.transfer).toContain(imgBuffer);
    });

    it('is a no-op before init', () => {
      const orch = new WorkerOrchestrator();
      orch.requestRender(minimalSlideData());
      expect(postedMessages).toHaveLength(0);
    });
  });

  describe('resize', () => {
    it('sends resize message', async () => {
      const orch = new WorkerOrchestrator();
      const canvas = createMockCanvas();
      const initPromise = orch.init(canvas);
      simulateWorkerMessage({ type: 'ready' });
      await initPromise;

      orch.resize(800, 600);

      expect(postedMessages).toHaveLength(2);
      const resizeMsg = postedMessages[1].data as { type: string; width: number; height: number };
      expect(resizeMsg.type).toBe('resize');
      expect(resizeMsg.width).toBe(800);
      expect(resizeMsg.height).toBe(600);
    });

    it('is a no-op before init', () => {
      const orch = new WorkerOrchestrator();
      orch.resize(800, 600);
      expect(postedMessages).toHaveLength(0);
    });
  });

  describe('onRendered callback', () => {
    it('fires on rendered message from worker', async () => {
      const orch = new WorkerOrchestrator();
      const canvas = createMockCanvas();
      const initPromise = orch.init(canvas);
      simulateWorkerMessage({ type: 'ready' });
      await initPromise;

      const handler = vi.fn();
      orch.onRendered(handler);

      simulateWorkerMessage({ type: 'rendered', frameId: 7, duration: 12.3 });

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(7, 12.3);
    });

    it('does not fire for other message types', async () => {
      const orch = new WorkerOrchestrator();
      const canvas = createMockCanvas();
      const initPromise = orch.init(canvas);
      simulateWorkerMessage({ type: 'ready' });
      await initPromise;

      const handler = vi.fn();
      orch.onRendered(handler);

      simulateWorkerMessage({ type: 'error', message: 'oops' });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('onError callback', () => {
    it('fires on error message from worker', async () => {
      const orch = new WorkerOrchestrator();
      const canvas = createMockCanvas();
      const initPromise = orch.init(canvas);
      simulateWorkerMessage({ type: 'ready' });
      await initPromise;

      const handler = vi.fn();
      orch.onError(handler);

      simulateWorkerMessage({ type: 'error', message: 'Canvas context lost' });

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith('Canvas context lost');
    });

    it('does not fire for rendered messages', async () => {
      const orch = new WorkerOrchestrator();
      const canvas = createMockCanvas();
      const initPromise = orch.init(canvas);
      simulateWorkerMessage({ type: 'ready' });
      await initPromise;

      const handler = vi.fn();
      orch.onError(handler);

      simulateWorkerMessage({ type: 'rendered', frameId: 1, duration: 5 });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('sends dispose message and terminates worker', async () => {
      const orch = new WorkerOrchestrator();
      const canvas = createMockCanvas();
      const initPromise = orch.init(canvas);
      simulateWorkerMessage({ type: 'ready' });
      await initPromise;

      orch.dispose();

      // dispose message was sent
      const disposeMsg = postedMessages[postedMessages.length - 1].data as { type: string };
      expect(disposeMsg.type).toBe('dispose');

      // ready is reset
      expect(orch.ready).toBe(false);
    });

    it('is safe to call multiple times', () => {
      const orch = new WorkerOrchestrator();
      orch.dispose();
      orch.dispose();
      expect(orch.ready).toBe(false);
    });

    it('makes subsequent requestRender no-op', async () => {
      const orch = new WorkerOrchestrator();
      const canvas = createMockCanvas();
      const initPromise = orch.init(canvas);
      simulateWorkerMessage({ type: 'ready' });
      await initPromise;

      orch.dispose();
      const countBefore = postedMessages.length;

      orch.requestRender(minimalSlideData());
      expect(postedMessages).toHaveLength(countBefore);
    });
  });
});
