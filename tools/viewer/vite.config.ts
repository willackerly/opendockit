import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const coreBase = resolve(__dirname, '../../packages/core/src');
const pptxBase = resolve(__dirname, '../../packages/pptx/src');

export default defineConfig({
  root: resolve(__dirname),
  resolve: {
    // Resolve workspace packages to their source for HMR and no pre-build.
    // More specific subpath aliases must come before the base alias.
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
      {
        find: '@opendockit/core/theme',
        replacement: resolve(coreBase, 'theme'),
      },
      { find: '@opendockit/core/ir', replacement: resolve(coreBase, 'ir') },
      {
        find: '@opendockit/core/units',
        replacement: resolve(coreBase, 'units'),
      },
      {
        find: '@opendockit/core/capability',
        replacement: resolve(coreBase, 'capability'),
      },
      {
        find: '@opendockit/core/font',
        replacement: resolve(coreBase, 'font'),
      },
      {
        find: '@opendockit/core/media',
        replacement: resolve(coreBase, 'media'),
      },
      {
        find: '@opendockit/core/wasm',
        replacement: resolve(coreBase, 'wasm'),
      },
      // Base package aliases (must come after subpath aliases)
      { find: '@opendockit/core', replacement: coreBase },
      { find: '@opendockit/pptx', replacement: pptxBase },
    ],
  },
  server: {
    port: 5174,
    open: true,
  },
});
