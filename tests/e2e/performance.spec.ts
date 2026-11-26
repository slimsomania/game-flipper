import { expect, test } from '@playwright/test';
import { openGame } from './helpers';
import { measureFrameTime } from './perfHelpers';

test('the frame-time hook covers the whole frame, up to the end of the render', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7', false);
  const average = async (): Promise<number> => {
    await page.evaluate(() => window.__FLIPPER__!.resetFrameTime());
    await page.waitForFunction(() => window.__FLIPPER__!.frameTime().frames >= 30);
    return page.evaluate(() => window.__FLIPPER__!.frameTime().averageMs);
  };
  const without = await average();
  await page.evaluate(() => {
    const game = window.__FLIPPER__!.phaserGame();
    game.events.on('postrender', () => {
      const end = performance.now() + 5;
      while (performance.now() < end) {
        // busy-wait
      }
    });
  });
  const withWait = await average();
  console.log(
    `whole frame: ${without.toFixed(3)} ms, with a 5 ms postrender wait ${withWait.toFixed(3)} ms`,
  );
  expect(withWait - without).toBeGreaterThanOrEqual(4);
  expect(errors).toEqual([]);
});

test('5 s of real-time play with the replay on averages under 4 ms per whole frame', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7', false);
  const cost = await measureFrameTime(page, 5000);
  console.log(
    `desktop: ${cost.averageMs.toFixed(3)} ms/frame over ${cost.frames} frames, ${cost.fps.toFixed(1)} fps (rAF), replay played: ${cost.replayed}`,
  );
  expect(cost.replayed).toBe(true);
  expect(cost.frames).toBeGreaterThan(100);
  expect(cost.averageMs).toBeLessThan(4);
  expect(errors).toEqual([]);
});

test('after 20 throws the Game scene holds as many objects, tweens and timers as after 1', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7', false);
  const throwOnce = async (): Promise<void> => {
    // Step the simulation by hand (each throw takes about 3 s in real time): the scene still
    // draws, and spawns and removes its objects, once per frame. The replay is on: step into it,
    // let a few frames of it draw, then skip the rest.
    await page.evaluate(() => {
      const api = window.__FLIPPER__!;
      api.pause();
      api.throwBottle(70);
      for (let i = 0; i < 900 && api.state()?.phase === 'flying'; i++) api.step();
      for (let i = 0; i < 600 && api.state()?.phase === 'result' && !api.state()!.replay; i++) {
        api.step();
      }
    });
    await page.waitForFunction(() => window.__FLIPPER__!.state()?.phase === 'result');
    await page.evaluate(() => window.__FLIPPER__!.skip());
    // After the 10th throw the round summary opens: Space plays another round in the same scene.
    await page.waitForFunction(() => {
      const api = window.__FLIPPER__!;
      return api.state()?.phase === 'aiming' || api.activeScenes().includes('Summary');
    });
    if ((await page.evaluate(() => window.__FLIPPER__!.activeScenes())).includes('Summary')) {
      await page.keyboard.press('Space');
      await page.waitForFunction(() => window.__FLIPPER__!.activeScenes().join() === 'Game');
      await page.waitForFunction(() => window.__FLIPPER__!.state()?.phase === 'aiming');
    }
  };
  await throwOnce();
  const after1 = await page.evaluate(() => window.__FLIPPER__!.objectCounts());
  for (let i = 0; i < 19; i++) await throwOnce();
  const after20 = await page.evaluate(() => window.__FLIPPER__!.objectCounts());
  console.log(`after 1: ${JSON.stringify(after1)}, after 20: ${JSON.stringify(after20)}`);
  expect(after1).not.toBeNull();
  expect(Math.abs(after20!.objects - after1!.objects)).toBeLessThanOrEqual(3);
  expect(Math.abs(after20!.tweens - after1!.tweens)).toBeLessThanOrEqual(3);
  expect(Math.abs(after20!.timers - after1!.timers)).toBeLessThanOrEqual(3);
  expect(errors).toEqual([]);
});
