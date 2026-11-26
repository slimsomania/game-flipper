import { expect, test } from '@playwright/test';
import { GAME_WIDTH } from '../../../src/core/constants';
import { pushTuningFor } from '../../../src/core/mouseControl';
import { pushPower } from '../../../src/core/push';
import { DEFAULT_TUNING } from '../../../src/core/tuning';
import { gameState, openGame, openTitle, stepUntilOutcome } from '../helpers';
import { above, gamePoint } from '../mouseHelpers';
import { PHONE_VIEWPORT } from '../phoneDevice';
import { bottleCenterOnPage, dragTouchInPage, sendTouch } from './touchHelpers';

// F037: the game on an emulated 6-inch phone held sideways, played with a finger.

test('boots to the Title with no console errors; the canvas is 640×360 CSS px, centered', async ({
  page,
}) => {
  const errors = await openTitle(page);
  expect(await page.evaluate(() => window.__FLIPPER__!.activeScenes())).toEqual(['Title']);
  expect(page.viewportSize()).toEqual(PHONE_VIEWPORT);
  expect(await page.evaluate(() => window.devicePixelRatio)).toBe(3);
  expect(await page.evaluate(() => 'ontouchstart' in window)).toBe(true);
  const box = (await page.locator('canvas').boundingBox())!;
  expect(box.width).toBeCloseTo(GAME_WIDTH / 2, 0);
  expect(box.height).toBeCloseTo(360, 0);
  expect(box.x).toBeCloseTo((PHONE_VIEWPORT.width - box.width) / 2, 0);
  expect(box.y).toBeCloseTo(0, 0);
  expect(errors).toEqual([]);
});

test('a finger pushed up 50 CSS px in 100 ms on the bottle throws with source touch', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause()); // no idle fade between the events and the read
  const at = await bottleCenterOnPage(page);
  const start = await gameState(page);

  await dragTouchInPage(page, { at, rise: 50, ms: 100, end: 'hold' });
  const held = await gameState(page);
  expect(held.dragging).toBe(true);
  expect(held.phase).toBe('aiming');
  // The bar follows the live push: 100 game px up in 100 ms.
  const live = pushPower(
    Array.from({ length: 11 }, (_, i) => ({ t: i / 100, y: 400 - (100 * i) / 10 })),
    pushTuningFor(DEFAULT_TUNING, 'touch'), // F045: a finger reads its own numbers
  );
  expect(live).toBeGreaterThan(0);
  expect(held.power).toBeCloseTo(live, 0);
  expect(held.power).not.toBe(start.power);

  await sendTouch(page, [{ type: 'end', x: at.x, y: at.y - 50, after: 0 }]);
  const after = await gameState(page);
  expect(after.dragging).toBe(false);
  expect(after.phase).toBe('flying');
  expect(after.lastThrow!.source).toBe('touch');
  expect(after.lastThrow!.power).toBeGreaterThan(0);
  expect(after.lastThrow!.power).toBeCloseTo(held.power, 0);
  expect(after.power).toBe(after.lastThrow!.power);
  expect(errors).toEqual([]);
});

// F048: a quick still tap on the bottle now throws at the bar's power (powerBarTouch.spec.ts); a
// touch away from it, or a held one that does not move, still throws nothing.
test('a touch away from the bottle, or a held touch on it that does not move, throws nothing', async ({
  page,
}) => {
  await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());
  const bottle = await bottleCenterOnPage(page);
  const away = await gamePoint(page, 1000, 600);

  await dragTouchInPage(page, { at: away, rise: 50, ms: 100, end: 'release' });
  let s = await gameState(page);
  expect(s.dragging).toBe(false);
  expect(s.phase).toBe('aiming');
  expect(s.lastThrow).toBeNull();

  await dragTouchInPage(page, { at: bottle, rise: 0, ms: 600, end: 'release' });
  s = await gameState(page);
  expect(s.dragging).toBe(false);
  expect(s.phase).toBe('aiming');
  expect(s.lastThrow).toBeNull();
});

test('a touch during a result skips it', async ({ page }) => {
  await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());
  await page.evaluate(() => window.__FLIPPER__!.throwBottle(50));
  await stepUntilOutcome(page);
  expect((await gameState(page)).phase).toBe('result');

  const somewhere = above(await gamePoint(page, 640, 360), 0);
  await dragTouchInPage(page, { at: somewhere, rise: 0, ms: 50, end: 'release' });
  await expect.poll(async () => (await gameState(page)).phase).toBe('aiming');
});
