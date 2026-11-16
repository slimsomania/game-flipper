import { expect, test } from '@playwright/test';
import { HAND_X, HAND_Y, drawWaterLevel } from '../../src/core/bottle';
import { createRng } from '../../src/core/rng';
import { DEFAULT_TUNING } from '../../src/core/tuning';
import { gameState, openGame, stepFrames } from './helpers';

test('the bottle starts with a water level on a 5% step between 10% and 90%', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');

  const { bottle } = await gameState(page);
  expect(bottle.water).toBe(drawWaterLevel(createRng(7), DEFAULT_TUNING));
  expect(bottle.water).toBeGreaterThanOrEqual(0.1);
  expect(bottle.water).toBeLessThanOrEqual(0.9);
  const steps = (bottle.water - 0.1) / 0.05;
  expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-9);
  expect(errors).toEqual([]);
});

test('different seeds give different bottles, the same seed gives the same one', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=1');
  const waters: number[] = [];
  for (let seed = 1; seed <= 8; seed++) {
    await page.evaluate((s) => window.__FLIPPER__!.startScene('Game', { seed: s }), seed);
    await page.waitForFunction((s) => window.__FLIPPER__!.state()?.seed === s, seed);
    waters.push((await gameState(page)).bottle.water);
  }
  expect(new Set(waters).size).toBeGreaterThan(1);

  await page.evaluate(() => window.__FLIPPER__!.startScene('Game', { seed: 3 }));
  await page.waitForFunction(() => window.__FLIPPER__!.state()?.seed === 3);
  expect((await gameState(page)).bottle.water).toBe(waters[2]);
  expect(errors).toEqual([]);
});

test('setWater(0.9) changes bottle.water in the snapshot', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');

  expect((await gameState(page)).bottle.water).not.toBe(0.9); // seed 7 doesn't start at 0.9
  const returned = await page.evaluate(() => window.__FLIPPER__!.setWater(0.9));
  expect(returned?.bottle.water).toBe(0.9);
  expect((await gameState(page)).bottle.water).toBe(0.9);

  await page.evaluate(() => window.__FLIPPER__!.setWater(0.1));
  expect((await gameState(page)).bottle.water).toBe(0.1);

  // The extremes draw and simulate without errors: empty and full.
  await page.evaluate(() => window.__FLIPPER__!.setWater(0));
  expect((await gameState(page)).bottle.water).toBe(0);
  await page.evaluate(() => window.__FLIPPER__!.setWater(1));
  expect((await gameState(page)).bottle.water).toBe(1);
  expect(errors).toEqual([]);
});

test('the held bottle stays still at the hand while the water changes', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.setWater(0.9));
  const end = await stepFrames(page, 300);

  expect(end.bottle.water).toBe(0.9);
  expect(end.bottle.x).toBe(HAND_X);
  expect(end.bottle.y).toBe(HAND_Y);
  expect(end.bottle.angle).toBe(0);
  expect(end.bottle.omega).toBe(0);
  expect(errors).toEqual([]);
});
