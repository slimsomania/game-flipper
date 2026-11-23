import { expect, test, type Page } from '@playwright/test';
import { gameState, openGame, stepFrames, stepUntilOutcome } from './helpers';

/*
 * The soft shadow under the bottle (F031): widest and darkest with the bottle at rest on the table,
 * smaller and fainter near the top of a flight. Read from the hook `shadow()`, not from pixels.
 */

const shadow = (page: Page) => page.evaluate(() => window.__FLIPPER__!.shadow());

test('the shadow is wider and darker at rest than high in a flight', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());
  await page.waitForFunction(() => window.__FLIPPER__!.shadow() !== null);
  const held = await shadow(page);
  expect(held!.width).toBeGreaterThan(0);
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
  expect(rest!.width).toBeGreaterThan(high!.width);
  expect(rest!.alpha).toBeGreaterThan(high!.alpha);
  expect(rest!.width).toBeGreaterThan(held!.width);
  expect(rest!.alpha).toBeGreaterThan(held!.alpha);
  expect(errors).toEqual([]);
});
