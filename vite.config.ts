import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths, so the built game runs from any folder or static host.
  base: './',
  server: { port: 5173 },
  build: {
    target: 'es2022',
    // Phaser alone is ~1.2 MB minified; that's expected for a game.
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/harness/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/unit/noReplaySetup.ts'],
    allowOnly: false,
  },
});
