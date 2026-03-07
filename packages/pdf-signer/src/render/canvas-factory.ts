/**
 * Canvas factories for PDF.js rendering in different environments.
 *
 * PDF.js uses a CanvasFactory to create canvases for rendering — both the main
 * render target and internal temporaries (used by paintImageXObject, _scaleImage,
 * etc.). In Node.js, we must provide a factory that uses node-canvas so all
 * canvases come from the same native binding (drawImage InstanceOf check).
 *
 * In the browser, PDF.js uses its built-in DOMCanvasFactory which creates
 * HTMLCanvasElement — no custom factory needed.
 */

interface CanvasAndContext {
  canvas: any;
  context: any;
}

/**
 * Detect if we're running in Node.js (no DOM).
 */
export const isNodeEnvironment =
  typeof (globalThis as any).document === 'undefined' &&
  typeof process !== 'undefined' &&
  process.versions?.node != null;

/**
 * Create a CanvasFactory class for the current environment.
 *
 * In Node.js: uses `canvas` npm package (node-canvas).
 * In Browser: returns undefined (let PDF.js use its built-in DOMCanvasFactory).
 */
export async function createCanvasFactory(): Promise<any | undefined> {
  if (!isNodeEnvironment) {
    return undefined; // browser — PDF.js handles it
  }

  const { createCanvas } = await import('canvas');

  return class NodeCanvasFactory {
    create(width: number, height: number): CanvasAndContext {
      const canvas = createCanvas(width, height);
      return { canvas, context: canvas.getContext('2d') };
    }
    reset(canvasAndContext: CanvasAndContext, width: number, height: number): void {
      canvasAndContext.canvas.width = width;
      canvasAndContext.canvas.height = height;
    }
    destroy(canvasAndContext: CanvasAndContext): void {
      canvasAndContext.canvas.width = 0;
      canvasAndContext.canvas.height = 0;
    }
  };
}

/**
 * Convert a canvas to PNG bytes.
 *
 * In Node.js: uses node-canvas's toBuffer().
 * In Browser: uses canvas.toBlob() → ArrayBuffer.
 */
export async function canvasToPng(canvas: any): Promise<Uint8Array> {
  if (isNodeEnvironment) {
    // node-canvas
    const buf = canvas.toBuffer('image/png');
    return new Uint8Array(buf);
  }

  // Browser — HTMLCanvasElement
  return new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob(
      (blob: Blob | null) => {
        if (!blob) return reject(new Error('Canvas toBlob returned null'));
        blob
          .arrayBuffer()
          .then((ab: ArrayBuffer) => resolve(new Uint8Array(ab)))
          .catch(reject);
      },
      'image/png',
    );
  });
}
