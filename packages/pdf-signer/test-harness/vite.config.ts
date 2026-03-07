import { defineConfig } from 'vite';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf-8')
);

// Set process title so this server is identifiable in `ps` among multiple agents
process.title = `pdfbox-ts-harness@${pkg.version}`;

export default defineConfig({
  build: {
    target: 'es2020',
  },
  resolve: {
    alias: {
      // Point to TS source so Vite transforms it directly — avoids stale dist issues
      'pdfbox-ts': path.resolve(__dirname, '..', 'src', 'index.ts'),
    },
  },
  server: {
    port: 11173,
    fs: {
      // Allow serving files from project root and parent (for pdfbox-ts source)
      strict: false,
    },
  },
  // Ensure node-forge is properly bundled for browser
  optimizeDeps: {
    include: ['node-forge'],
  },
});
