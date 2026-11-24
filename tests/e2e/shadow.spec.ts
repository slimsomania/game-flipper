import { expect, test, type Page } from '@playwright/test';
import { gameState, openGame, stepFrames, stepUntilOutcome } from './helpers';
import { BOTTLE_HEIGHT } from '../../src/core/bottleShape';
import { PIXELS_PER_METER } from '../../src/core/constants';

/*
 * The soft shadow under the bottle (F031): widest and darkest with the bottle at rest on the table,
 * smaller and fainter near the top of a flight, and as long as the bottle seen from above. Read from the hook `shadow()`, not from pixels.
 */

const shadow = (page: Page) => page.evaluate(() => window.__FLIPPER__!.shadow());

test('the shadow is deeper and darker at rest than high in a flight', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());
  await page.waitForFunction(() => window.__FLIPPER__!.shadow() !== null);
  const held = await shadow(page);
  expect(held!.width).toBeGreaterThan(0);
  expect(held!.depth).toBeGreaterThan(0);
  expect(held!.alpha).toBeGreaterThan(0);

  await page.evaluate(() => {
    window.__FLIPPER__!.lockWater(0.5);
    window.__FLIPPER__!.throwBottle(36);
  });
  // Step until the bottle is at its highest over the table.
  let state = await gameState(page);
  let highest = state.bottle.y;
  for (let i = 0; i < 120; i++) {
    state = await stepFrames(page, 1);
    highest = Math.min(highest, state.bottle.y);
    if (state.bottle.y > highest + 0.05) break;
  }
  await page.waitForFunction(() => window.__FLIPPER__!.shadow() !== null);
  const high = await shadow(page);
  expect(high!.alpha).toBeGreaterThanOrEqual(0);

  // Now play the throw to its outcome: the bottle rests on the table.
  const end = await stepUntilOutcome(page);
  expect(end.outcome).not.toBeNull();
  await stepFrames(page, 1);
  await page.waitForFunction(() => window.__FLIPPER__!.shadow() !== null);
  const rest = await shadow(page);
  // Its length follows the angle (the bottle seen from above); its depth follows the height only.
  expect(rest!.depth).toBeGreaterThan(high!.depth);
  expect(rest!.alpha).toBeGreaterThan(high!.alpha);
  expect(rest!.depth).toBeGreaterThan(held!.depth);
  expect(rest!.alpha).toBeGreaterThan(held!.alpha);
  expect(errors).toEqual([]);
});

test('a bottle lying on its side casts its shadow along its whole length', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());
  await page.waitForFunction(() => window.__FLIPPER__!.shadow() !== null);
  const upright = await shadow(page);

  // 50% water at power 75 lands the bottle on its side (seed 7).
  await page.evaluate(() => {
    window.__FLIPPER__!.lockWater(0.5);
    window.__FLIPPER__!.throwBottle(75);
  });
  const end = await stepUntilOutcome(page);
  expect(end.outcome!.reason).toBe('side');
  const tilt = Math.abs(Math.sin(end.bottle.angle));
  expect(tilt).toBeGreaterThan(0.9);
  await stepFrames(page, 1);
  await page.waitForFunction(() => window.__FLIPPER__!.shadow() !== null);
  const side = await shadow(page);
  // The bottle is about 1.85 times as long as it is wide: so is its footprint on the table.
  expect(side!.width).toBeGreaterThan(upright!.width * 1.4);
  // And the shadow sits under the bottle's middle, not under its base.
  const state = await gameState(page);
  const middle = state.bottle.x + Math.sin(state.bottle.angle) * (BOTTLE_HEIGHT / 2);
  expect(Math.abs(side!.x / PIXELS_PER_METER - middle)).toBeLessThan(0.1);
  expect(errors).toEqual([]);
});
