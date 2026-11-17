import { defineConfig, devices } from '@playwright/test';

// E2E tests get their own dev server on a fixed port, so they never collide with `npm run dev` (5173).
const PORT = 5199;
const PROD_PORT = 5197;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${PORT}`,
    // Desktop landscape viewport, the same size as the game's 1280×720 logical canvas.
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: `npx vite --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // The same source served as a production build would be (import.meta.env.DEV is false), for
      // the tests that check what a player's page does without ?debug or ?testhooks.
      command: `npx vite --port ${PROD_PORT} --strictPort`,
      env: { NODE_ENV: 'production' },
      url: `http://localhost:${PROD_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
