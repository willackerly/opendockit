import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', '__tests__/**/*.test.ts'],
    passWithNoTests: true,
    server: {
      deps: {
        // canvas is a native addon — must not be transformed by Vite
        external: ['canvas'],
      },
    },
  },
});
