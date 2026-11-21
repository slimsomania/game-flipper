import { expect, test } from '@playwright/test';
import { openGame } from './helpers';

/*
 * The recording of each throw (F026) is available through the test hooks during the result, and is
 * gone when the next bottle appears.
 */

test('the throw is recorded step by step, has a landing clip, and both are cleared for the next bottle', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => {
    window.__FLIPPER__!.pause();
    window.__FLIPPER__!.throwBottle(50);
  });
  expect(await page.evaluate(() => window.__FLIPPER__!.recording().length)).toBe(0);
  for (let i = 0; i < 400; i++) {
    const phase = await page.evaluate(() => window.__FLIPPER__!.step(1)!.phase);
    if (phase === 'result') break;
  }
  const { state, recording, clip } = await page.evaluate(() => ({
    state: window.__FLIPPER__!.state()!,
    recording: window.__FLIPPER__!.recording(),
    clip: window.__FLIPPER__!.landingClip(),
  }));
  expect(state.phase).toBe('result');
  expect(recording.length).toBeGreaterThan(30);
  const last = recording[recording.length - 1];
  expect(last.tick).toBe(state.tick);
  expect(last.x).toBe(state.bottle.x);
  expect(last.y).toBe(state.bottle.y);
  expect(last.angle).toBe(state.bottle.angle);
  expect(clip.length).toBeGreaterThan(0);
  expect(clip.length).toBeLessThanOrEqual(recording.length);

  await page.evaluate(() => window.__FLIPPER__!.skip());
  expect(await page.evaluate(() => window.__FLIPPER__!.recording())).toEqual([]);
  expect(await page.evaluate(() => window.__FLIPPER__!.landingClip())).toEqual([]);
  expect(errors).toEqual([]);
});
