import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const coreBase = resolve(__dirname, '../../packages/core/src');
const pptxBase = resolve(__dirname, '../../packages/pptx/src');
const pdfSignerBase = resolve(__dirname, '../../packages/pdf-signer/src');
const elementsBase = resolve(__dirname, '../../packages/elements/src');
const renderBase = resolve(__dirname, '../../packages/render/src');

export default defineConfig({
  root: resolve(__dirname),
  resolve: {
    alias: [
      // @opendockit/core subpath exports
      {
        find: '@opendockit/core/drawingml/renderer',
        replacement: resolve(coreBase, 'drawingml/renderer'),
      },
      {
        find: '@opendockit/core/drawingml',
        replacement: resolve(coreBase, 'drawingml'),
      },
      { find: '@opendockit/core/opc', replacement: resolve(coreBase, 'opc') },
      { find: '@opendockit/core/theme', replacement: resolve(coreBase, 'theme') },
      { find: '@opendockit/core/ir', replacement: resolve(coreBase, 'ir') },
      { find: '@opendockit/core/units', replacement: resolve(coreBase, 'units') },
      { find: '@opendockit/core/capability', replacement: resolve(coreBase, 'capability') },
      { find: '@opendockit/core/font', replacement: resolve(coreBase, 'font') },
      { find: '@opendockit/core/media', replacement: resolve(coreBase, 'media') },
      { find: '@opendockit/core/edit', replacement: resolve(coreBase, 'edit') },
      { find: '@opendockit/core/wasm', replacement: resolve(coreBase, 'wasm') },
      // Base package aliases
      { find: '@opendockit/core', replacement: coreBase },
      { find: '@opendockit/pptx', replacement: pptxBase },
      { find: '@opendockit/elements', replacement: resolve(elementsBase, 'index.ts') },
      { find: '@opendockit/render', replacement: resolve(renderBase, 'index.ts') },
      // pdf-signer subpaths
      {
        find: '@opendockit/pdf-signer/render',
        replacement: resolve(pdfSignerBase, 'render/index.ts'),
      },
      {
        find: '@opendockit/pdf-signer/elements',
        replacement: resolve(pdfSignerBase, 'elements/index.ts'),
      },
      { find: '@opendockit/pdf-signer', replacement: resolve(pdfSignerBase, 'index.ts') },
    ],
  },
  server: {
    port: 5176,
  },
});
