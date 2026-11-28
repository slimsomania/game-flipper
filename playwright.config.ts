import { defineConfig, devices } from '@playwright/test';
import { PHONE_DEVICE, PHONE_TEST_DIR } from './tests/e2e/phoneDevice';

// E2E tests get their own servers on fixed ports, so they never collide with `npm run dev` (5173).
const PORT = 5199;
const PROD_PORT = 5197;
// The Vite dev server, only for tests that import source modules into the page (soundRender.spec.ts).
const DEV_SERVER_PORT = 5198;

export default defineConfig({
  testDir: 'tests/e2e',
  // One worker: each test browser runs the game in real time, and on a 4-core laptop two or more at
  // once starve each other's frames (4 workers took 77 min with most tests timing out, vs 25 min).
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  // On GitHub Actions, also report failures as annotations: they show on the run page and in the public API.
  reporter: process.env.GITHUB_ACTIONS ? [['list'], ['github']] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: `**/${PHONE_TEST_DIR}/**`,
      use: {
        ...devices['Desktop Chrome'],
        // Desktop landscape viewport, the same size as the game's 1280×720 logical canvas.
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      // A small phone held sideways, driven by touch (tests/e2e/phoneDevice.ts).
      name: 'phone',
      testDir: `tests/e2e/${PHONE_TEST_DIR}`,
      use: { browserName: 'chromium', ...PHONE_DEVICE },
    },
  ],
  // Both servers serve a fresh `vite build` and never reuse a server already on the port: a leftover
  // one would serve an old build, so the tests would pass or fail on stale code. If a port is taken,
  // stop the process holding it.
  webServer: [
    {
      // The default for every test: a dev-mode build (import.meta.env.DEV, so the test hooks and the
      // tuning panel are on, as on `npm run dev`), bundled. A page loads in ~0.3 s here against
      // ~0.9 s from the Vite dev server's hundreds of unbundled modules, and the suite loads ~500.
      command: `npx vite build --mode development --outDir dist-e2e-dev --emptyOutDir && npx vite preview --outDir dist-e2e-dev --port ${PORT} --strictPort`,
      env: { NODE_ENV: 'development' },
      url: `http://localhost:${PORT}`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      // The real production build (`vite build` output served by `vite preview`), for the tests
      // that check what a player's page does without ?debug or ?testhooks. Built into its own
      // folder so it never clobbers dist/.
      command: `npx vite build --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e --port ${PROD_PORT} --strictPort`,
      env: { NODE_ENV: 'production' },
      url: `http://localhost:${PROD_PORT}`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      // Serves the source as it is on disk, so an existing one is never stale and may be reused.
      command: `npx vite --port ${DEV_SERVER_PORT} --strictPort`,
      url: `http://localhost:${DEV_SERVER_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
