import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAliases } from '../shared/vite-aliases.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(__dirname),
  resolve: {
    alias: buildAliases(__dirname, { elements: true, render: true, pdfSigner: true }),
  },
  server: {
    port: 5176,
  },
});
