import type { Page } from '@playwright/test';

/**
 * Play in real time for `ms`, throwing whenever a bottle is in the hand. A result is skipped only
 * once its slow-motion replay has played (or after 6 s without one), so replays really play.
 * Returns whether a replay was playing at some point.
 */
export async function playRealTime(page: Page, ms: number): Promise<boolean> {
  return page.evaluate(async (duration) => {
    const api = window.__FLIPPER__!;
    const end = performance.now() + duration;
    let replayed = false;
    let sawReplay = false;
    let resultSince = 0;
    while (performance.now() < end) {
      const state = api.state();
      if (state?.phase === 'aiming') {
        sawReplay = false;
        resultSince = 0;
        api.throwBottle(60 + Math.random() * 30);
      } else if (state?.phase === 'result') {
        if (resultSince === 0) resultSince = performance.now();
        if (state.replay !== null) {
          replayed = true;
          sawReplay = true;
        } else if (sawReplay || performance.now() - resultSince > 6000) {
          api.skip();
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return replayed;
  }, ms);
}

/**
 * Play on until the next throw has just been made, so the measured window that follows starts
 * with a throw and always has room for its flight and replay, however slow the frames are.
 */
async function playUntilThrow(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const api = window.__FLIPPER__!;
    let resultSince = 0;
    for (;;) {
      const state = api.state();
      if (state?.phase === 'aiming') {
        api.throwBottle(60 + Math.random() * 30);
        return;
      }
      if (state?.phase === 'result') {
        if (resultSince === 0) resultSince = performance.now();
        if (state.replay !== null || performance.now() - resultSince > 6000) api.skip();
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  });
}

export interface FrameMeasure {
  frames: number;
  averageMs: number;
  /** Frames per second from requestAnimationFrame over the same window. */
  fps: number;
  /** True if the replay played at some point in the window. */
  replayed: boolean;
}

/**
 * The average whole-frame ms over `ms` of real-time play (after a short warm-up), with the
 * replay on: nothing is skipped except the results a throw leaves (the play loop's own skip).
 */
export async function measureFrameTime(page: Page, ms: number): Promise<FrameMeasure> {
  await playRealTime(page, 1000);
  await playUntilThrow(page);
  await page.evaluate(() => {
    window.__FLIPPER__!.resetFrameTime();
    const w = window as unknown as { __raf: number };
    w.__raf = 0;
    const tick = (): void => {
      w.__raf++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const replayed = await playRealTime(page, ms);
  const cost = await page.evaluate(() => window.__FLIPPER__!.frameTime());
  const raf = await page.evaluate(() => (window as unknown as { __raf: number }).__raf);
  return { ...cost, fps: raf / (ms / 1000), replayed };
}
