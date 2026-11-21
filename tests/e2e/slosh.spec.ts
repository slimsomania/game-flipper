import { expect, test } from '@playwright/test';
import { gameState, openGame } from './helpers';

/*
 * Sloshing water (F023) is off by default, so the player sees no change. The switch is the tuning
 * field `sloshing`; with it on, the snapshot reports how far the water has slid from the base.
 */

test('with sloshing off (the default) the snapshot reports no water offset in a throw', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => {
    window.__FLIPPER__!.pause();
    window.__FLIPPER__!.setWater(0.1);
    window.__FLIPPER__!.throwBottle(40);
  });
  for (let i = 0; i < 30; i++) {
    const state = await page.evaluate(() => window.__FLIPPER__!.step(3));
    expect(state!.bottle.waterOffset).toBe(0);
  }
  expect(errors).toEqual([]);
});

test('with sloshing on, the water slides toward the cap in a spinning throw and stays within its limit', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => {
    window.__FLIPPER__!.pause();
    window.__FLIPPER__!.setTuningValue('sloshing', 1);
    window.__FLIPPER__!.setWater(0.1);
    window.__FLIPPER__!.throwBottle(40);
  });
  expect((await gameState(page)).bottle.waterOffset).toBe(0);
  let max = 0;
  for (let i = 0; i < 40; i++) {
    const state = await page.evaluate(() => window.__FLIPPER__!.step(3));
    max = Math.max(max, state!.bottle.waterOffset);
    expect(state!.bottle.waterOffset).toBeGreaterThanOrEqual(0);
    expect(state!.bottle.waterOffset).toBeLessThanOrEqual(0.825);
  }
  expect(max).toBeGreaterThan(0.05);
  expect(errors).toEqual([]);
});
