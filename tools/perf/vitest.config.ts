import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    benchmark: {
      include: ['benchmarks/**/*.bench.ts'],
    },
  },
  resolve: {
    alias: {
      '@opendockit/core': path.resolve(__dirname, '../../packages/core/src'),
      '@opendockit/pptx': path.resolve(__dirname, '../../packages/pptx/src'),
    },
  },
});
