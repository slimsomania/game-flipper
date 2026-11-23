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

test('with sloshing on, the water stays at the base in the air, shifts as the bottle comes down and lands, and is back at rest', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => {
    window.__FLIPPER__!.pause();
    // A boolean works too (snap passes `true`), and turns sloshing on.
    window.__FLIPPER__!.setTuningValue('sloshing', true);
    window.__FLIPPER__!.setWater(0.3);
    window.__FLIPPER__!.throwBottle(40);
  });
  const trace = await page.evaluate(() => {
    const out: { y: number; offset: number; contact: boolean }[] = [];
    let prevVy = 0;
    let contact = false;
    for (let i = 0; i < 240; i++) {
      const s = window.__FLIPPER__!.step(1)!;
      // Gravity changes vy by about 0.16 m/s per step; a jump of over 1 m/s is the table hit.
      if (Math.abs(s.bottle.vy - prevVy) > 1) contact = true;
      prevVy = s.bottle.vy;
      out.push({ y: s.bottle.y, offset: s.bottle.waterOffset, contact });
    }
    return out;
  });
  // Rising and spinning in the air, the spin pins the water to the base: no shift for a long while.
  expect(trace.slice(0, 50).every((t) => t.offset === 0)).toBe(true);
  // Coming down, landing and tipping move it toward the cap, by a visible amount.
  expect(Math.max(...trace.map((t) => t.offset))).toBeGreaterThan(0.03);
  // After the first table contact there is a step with the water shifted.
  expect(trace.some((t) => t.contact && t.offset > 0)).toBe(true);
  // At rest on the table it is back at the base.
  expect(trace[150].offset).toBe(0);
  expect(errors).toEqual([]);
});
