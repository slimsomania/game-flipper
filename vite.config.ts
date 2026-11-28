import { defineConfig } from 'vitest/config';
import { SITE_URL } from './site.config';

export default defineConfig({
  plugins: [
    {
      // Fills %SITE_URL% in index.html (the link-preview tags need absolute addresses).
      name: 'site-url',
      transformIndexHtml: (html: string) => html.replaceAll('%SITE_URL%', SITE_URL),
    },
  ],
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
    // Files run in parallel workers; on a busy machine a physics-heavy test can exceed the 5 s default.
    testTimeout: 60_000,
  },
});
