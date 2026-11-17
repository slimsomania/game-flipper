import { expect, test, type Page } from '@playwright/test';
import { HAND_X, HAND_Y } from '../../src/core/bottle';
import { PIXELS_PER_METER } from '../../src/core/constants';
import { gameState, openGame, settleInput, stepFrames, stepUntilOutcome } from './helpers';
import {
  above,
  bottleCenter,
  canvasCursor,
  dragInPage,
  draggingNow,
  gamePoint,
  glide,
  logMouse,
  nextBottle,
  phaseOf,
  powerNow,
  press,
  widenViewport,
  type Point,
} from './mouseHelpers';

/*
 * The mouse push, the other side: what throws nothing (a press away from the bottle, a click, a push
 * with no upward movement, a drag while flying, a click during the result), a grab that ends in an
 * unusual way (a release outside the canvas, the window losing focus), and the cursor. What a push
 * throws, and the live bar, are in `mouse.spec.ts`; the two ways of moving the mouse are explained
 * in `mouseHelpers.ts`.
 */

test.describe('presses and releases that throw nothing', () => {
  test('a press away from the bottle, then a push upward, throws nothing and grabs nothing', async ({
    page,
  }) => {
    const errors = await openGame(page, '?seed=7');
    await page.evaluate(() => window.__FLIPPER__!.pause());
    const aiming = await gameState(page);
    const sky = await gamePoint(page, 900, 150);
    const below = await gamePoint(page, 900, 600);

    await press(page, below, false);
    expect(await draggingNow(page)).toBe(false);
    await glide(page, below, above(below, 300), 100);
    await settleInput(page);
    expect(await draggingNow(page)).toBe(false);
    await page.mouse.up();
    await press(page, sky, false);
    await page.mouse.up();
    // The same hard flick, pressed beside the bottle instead of on it.
    await dragInPage(page, { at: await beside(page), rise: 250, ms: 80, end: 'release' });
    await settleInput(page);

    expect(await gameState(page)).toEqual(aiming);
    expect(errors).toEqual([]);
  });

  test('a click on the bottle without moving throws nothing and leaves the bar as it was', async ({
    page,
  }) => {
    const errors = await openGame(page, '?seed=7');
    await page.evaluate(() => {
      window.__FLIPPER__!.pause();
      window.__FLIPPER__!.setPower(62);
    });
    const bottle = await bottleCenter(page);

    await press(page, bottle);
    expect(await powerNow(page)).toBe(0); // while held, the bar is the (still empty) push
    await page.mouse.up();
    await expect.poll(() => draggingNow(page)).toBe(false);

    expect(await gameState(page)).toMatchObject({
      phase: 'aiming',
      throws: 0,
      lastThrow: null,
      power: 62,
    });
    expect(errors).toEqual([]);
  });

  test('a push downward, or a tiny jitter upward, throws nothing', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await page.evaluate(() => window.__FLIPPER__!.pause());
    const bottle = await bottleCenter(page);

    await dragInPage(page, { at: bottle, rise: -200, ms: 100, end: 'release' }); // down
    expect(await gameState(page)).toMatchObject({ phase: 'aiming', throws: 0, power: 50 });

    await dragInPage(page, { at: bottle, rise: 0.3, ms: 60, end: 'release' }); // a third of a pixel up
    expect(await gameState(page)).toMatchObject({
      phase: 'aiming',
      dragging: false,
      throws: 0,
      power: 50,
    });
    expect(errors).toEqual([]);
  });

  test('a drag while the bottle is flying throws nothing and grabs nothing', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await page.evaluate(() => {
      window.__FLIPPER__!.pause();
      window.__FLIPPER__!.throwBottle(50);
    });
    const flying = await stepFrames(page, 5);
    expect(flying.phase).toBe('flying');
    const bottle = await bottleCenter(page); // the flying bottle, where it is now

    await press(page, bottle, false);
    expect(await draggingNow(page)).toBe(false);
    await glide(page, bottle, above(bottle, 200), 100);
    await page.mouse.up();
    await dragInPage(page, { at: bottle, rise: 250, ms: 80, end: 'release' });
    await settleInput(page);

    expect(await gameState(page)).toEqual(flying);
    expect(errors).toEqual([]);
  });

  test('a click during the result still skips it, and the press does not turn into a grab', async ({
    page,
  }) => {
    const errors = await openGame(page, '?seed=7');
    await page.evaluate(() => {
      window.__FLIPPER__!.pause();
      window.__FLIPPER__!.setPower(44);
      window.__FLIPPER__!.throwBottle(44);
    });
    const decided = await stepUntilOutcome(page);
    expect(decided.phase).toBe('result');

    // Click where the next bottle will appear: the press skips, and nothing is grabbed.
    const hand = await gamePoint(page, HAND_X * PIXELS_PER_METER, HAND_Y * PIXELS_PER_METER - 50);
    await press(page, hand, false);
    await expect.poll(() => phaseOf(page)).toBe('aiming');
    expect(await draggingNow(page)).toBe(false);
    await glide(page, hand, above(hand, 200), 100);
    await page.mouse.up();
    await settleInput(page);

    expect(await gameState(page)).toMatchObject({
      phase: 'aiming',
      dragging: false,
      throws: 1,
      power: 44,
      outcome: null,
    });
    expect(errors).toEqual([]);
  });
});

/** A point on the page just beside the held bottle (to the right of it, past the grab padding). */
async function beside(page: Page): Promise<Point> {
  const bottle = await bottleCenter(page);
  return { x: bottle.x + 50 + 12 + 30, y: bottle.y };
}

test.describe('the end of a grab outside the usual way', () => {
  test('releasing outside the canvas ends the grab, and the next press grabs again', async ({
    page,
  }) => {
    const errors = await openGame(page, '?seed=7');
    const margin = await widenViewport(page);
    expect(margin).toBeGreaterThan(50);
    const bottle = await bottleCenter(page);

    await press(page, bottle);
    await glide(page, bottle, above(bottle, 120), 100);
    await page.mouse.move(20, bottle.y - 120); // out into the margin: the game sees no more moves
    await expect.poll(() => powerNow(page)).toBe(0); // so the pointer looks still
    await page.mouse.up();
    await expect.poll(() => draggingNow(page)).toBe(false);
    expect(await gameState(page)).toMatchObject({ phase: 'aiming', throws: 0, power: 50 });

    // Nothing is stuck: the bottle can be grabbed and thrown as usual.
    await dragInPage(page, { at: bottle, rise: 200, ms: 100, end: 'release' });
    const thrown = await gameState(page);
    expect(thrown.phase).toBe('flying');
    expect(thrown.lastThrow).toMatchObject({ source: 'mouse' });
    expect(errors).toEqual([]);
  });

  test('a flick that leaves the canvas and lets go outside throws with what the game saw', async ({
    page,
  }) => {
    const errors = await openGame(page, '?seed=7');
    await widenViewport(page);
    const log = await logMouse(page);
    const bottle = await bottleCenter(page);

    await dragInPage(page, { at: bottle, rise: 250, ms: 80, end: 'releaseOutside' });

    const thrown = await gameState(page);
    expect(thrown.phase).toBe('flying');
    expect(thrown.dragging).toBe(false);
    expect(thrown.lastThrow).toMatchObject({ source: 'mouse' });
    // The release had no position the game could trust (here it is 400 px higher than any move it
    // saw, which would have made 100): the pointer counts as where it was last seen. A few
    // hundredths of a second between the last move and the release can only move this a little.
    const seen = await log.expectedPower();
    expect(seen).toBeGreaterThan(50);
    expect(seen).toBeLessThan(97);
    expect(Math.abs(thrown.lastThrow!.power - seen)).toBeLessThan(2);
    expect(errors).toEqual([]);
  });

  test('the window losing focus drops the grab and gives the bar back', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await page.evaluate(() => {
      window.__FLIPPER__!.pause();
      window.__FLIPPER__!.setPower(58);
    });
    const bottle = await bottleCenter(page);

    await press(page, bottle);
    await page.mouse.move(bottle.x, bottle.y - 80);
    await expect.poll(() => powerNow(page)).not.toBe(58);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect.poll(() => draggingNow(page)).toBe(false);
    expect(await gameState(page)).toMatchObject({ phase: 'aiming', throws: 0, power: 58 });

    await page.mouse.up(); // the release that arrives later changes nothing
    await settleInput(page);
    expect(await gameState(page)).toMatchObject({ phase: 'aiming', throws: 0, power: 58 });
    expect(errors).toEqual([]);
  });
});

test('the cursor is a grab hand over the held bottle and a grabbing hand while dragging', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  const bottle = await bottleCenter(page);
  const sky = await gamePoint(page, 900, 150);
  expect(await canvasCursor(page)).toBe('auto');

  await page.mouse.move(bottle.x, bottle.y);
  await expect.poll(() => canvasCursor(page)).toBe('grab');
  await page.mouse.move(sky.x, sky.y);
  await expect.poll(() => canvasCursor(page)).toBe('auto');
  await page.mouse.move(bottle.x, bottle.y);
  await expect.poll(() => canvasCursor(page)).toBe('grab');

  // While dragging it is the closed hand, wherever the pointer is: even once it has left the bottle.
  await page.mouse.down();
  await expect.poll(() => canvasCursor(page)).toBe('grabbing');
  await page.mouse.move(bottle.x, bottle.y - 300);
  await settleInput(page);
  expect(await canvasCursor(page)).toBe('grabbing');
  await page.mouse.move(bottle.x, bottle.y); // back on the bottle, nothing thrown yet
  await page.mouse.up(); // no push: the grab is dropped and the open hand is back
  await expect.poll(() => draggingNow(page)).toBe(false);
  await expect.poll(() => canvasCursor(page)).toBe('grab');

  // Once the bottle is thrown there is nothing to grab; the next bottle brings the open hand back.
  await dragInPage(page, { at: bottle, rise: 200, ms: 100, end: 'release' });
  expect(await phaseOf(page)).toBe('flying');
  await expect.poll(() => canvasCursor(page)).toBe('auto');
  await nextBottle(page);
  await page.mouse.move(bottle.x, bottle.y);
  await expect.poll(() => canvasCursor(page)).toBe('grab');
  expect(errors).toEqual([]);
});
