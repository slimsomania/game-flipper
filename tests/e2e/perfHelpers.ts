import type { Page } from '@playwright/test';

/** Play in real time for `ms`, throwing whenever a bottle is in the hand and skipping each result. */
export async function playRealTime(page: Page, ms: number): Promise<void> {
  await page.evaluate(async (duration) => {
    const api = window.__FLIPPER__!;
    const end = performance.now() + duration;
    while (performance.now() < end) {
      const phase = api.state()?.phase;
      if (phase === 'aiming') api.throwBottle(60 + Math.random() * 30);
      else if (phase === 'result') api.skip();
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }, ms);
}

/** The average update-and-draw ms per frame over `ms` of real-time play (after a short warm-up). */
export async function measureFrameTime(
  page: Page,
  ms: number,
): Promise<{ frames: number; averageMs: number }> {
  await playRealTime(page, 1000);
  await page.evaluate(() => window.__FLIPPER__!.resetFrameTime());
  await playRealTime(page, ms);
  return page.evaluate(() => window.__FLIPPER__!.frameTime());
}
