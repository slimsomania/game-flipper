import { expect, test, type Page } from '@playwright/test';
import { gameState, openGame, stepFrames } from './helpers';

/*
 * The off-screen marker (F034 follow-up): while a thrown bottle is above the top of the screen, an
 * arrow on the top edge shows where it is; it goes away once the bottle is back in view.
 */

const marker = (page: Page) => page.evaluate(() => window.__FLIPPER__!.offscreenMarker());

test('a full-power throw of a nearly empty bottle shows the marker under it, then hides it', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => {
    window.__FLIPPER__!.pause();
    window.__FLIPPER__!.setWater(0.1);
  });
  await page.waitForFunction(() => window.__FLIPPER__!.offscreenMarker() === null);
  await page.evaluate(() => window.__FLIPPER__!.throwBottle(100));

  // Step until the whole bottle is above the screen: its base is more than a bottle's length
  // (1.48 m) above the top edge, so every part of it is, however it is turned.
  let state = await gameState(page);
  for (let i = 0; i < 200 && state.bottle.y >= -1.6; i++) state = await stepFrames(page, 1);
  expect(state.bottle.y).toBeLessThan(-1.6);
  await page.waitForFunction(() => window.__FLIPPER__!.offscreenMarker()?.alpha === 1);
  const shown = await marker(page);
  // Under the bottle: within a bottle's length of its base, in game pixels.
  expect(Math.abs(shown!.x - state.bottle.x * 100)).toBeLessThan(150);

  // Back on the table, the marker is gone.
  for (let i = 0; i < 600 && state.phase === 'flying'; i++) state = await stepFrames(page, 5);
  expect(state.phase).not.toBe('flying');
  await page.waitForFunction(() => window.__FLIPPER__!.offscreenMarker() === null);
  expect(errors).toEqual([]);
});

test('no marker while the bottle is held or after an ordinary throw lands', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());
  expect(await marker(page)).toBeNull();
  await page.evaluate(() => window.__FLIPPER__!.throwBottle(30));
  const landed = await stepFrames(page, 300);
  expect(landed.phase).not.toBe('flying');
  await page.waitForFunction(() => window.__FLIPPER__!.offscreenMarker() === null);
  expect(errors).toEqual([]);
});
