import { expect, test } from '@playwright/test';
import { gameState, openGame, stepFrames, visibleTexts } from './helpers';
import {
  above,
  bottleCenter,
  dragInPage,
  draggingNow,
  glide,
  logMouse,
  nextBottle,
  phaseOf,
  powerNow,
  press,
  releaseInPage,
} from './mouseHelpers';

/*
 * The mouse push: what a push throws, and the live value on the power bar. (What throws nothing,
 * the end of a grab outside the usual way, and the cursor are in `mouseNothing.spec.ts`; the two
 * ways of moving the mouse are explained in `mouseHelpers.ts`.)
 */

test('pressing on the bottle, pushing 200 px up in about 100 ms and releasing throws it', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  const log = await logMouse(page);
  const before = await gameState(page);
  expect(before.dragging).toBe(false);
  const bottle = await bottleCenter(page);

  await dragInPage(page, { at: bottle, rise: 200, ms: 100, end: 'release' });

  const thrown = await gameState(page);
  expect(thrown.phase).toBe('flying');
  expect(thrown.dragging).toBe(false);
  expect(thrown.throws).toBe(1);
  expect(thrown.lastThrow).toMatchObject({ source: 'mouse', water: before.bottle.water });
  expect(thrown.lastThrow!.power).toBeGreaterThan(50); // a hard flick: most of the bar
  // The bar holds the push's power after the throw, and the power is the one the push measures.
  expect(thrown.power).toBe(thrown.lastThrow!.power);
  expect(thrown.lastThrow!.power).toBeCloseTo(await log.expectedPower({ release: true }), 6);
  expect(thrown.bottle.vy).toBeLessThan(0);
  expect(errors).toEqual([]);
});

test('the same with the real mouse, at whatever pace the machine manages', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  const log = await logMouse(page);
  const bottle = await bottleCenter(page);

  await press(page, bottle);
  await glide(page, bottle, above(bottle, 200), 100);
  await page.mouse.up();

  await expect.poll(() => phaseOf(page)).toBe('flying');
  const thrown = await gameState(page);
  const expected = await log.expectedPower({ release: true });
  expect(expected).toBeGreaterThan(1);
  expect(thrown.lastThrow).toMatchObject({ source: 'mouse' });
  expect(thrown.lastThrow!.power).toBeCloseTo(expected, 6);
  expect(thrown.power).toBe(thrown.lastThrow!.power);
  expect(thrown.dragging).toBe(false);
  expect(errors).toEqual([]);
});

test('while the button is held, state().power follows the live push and the bar shows it', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  // With the clock stopped the bar only changes with the mouse, so each value can be checked exactly.
  await page.evaluate(() => window.__FLIPPER__!.pause());
  const log = await logMouse(page);
  const bottle = await bottleCenter(page);
  expect(await powerNow(page)).toBe(50);

  await press(page, bottle);
  expect(await powerNow(page)).toBe(0); // the press itself is no push

  const live: number[] = [];
  for (let i = 1; i <= 7; i++) {
    await page.mouse.move(bottle.x, bottle.y - 20 * i);
    const expected = await log.expectedPower();
    await expect.poll(() => powerNow(page)).toBeCloseTo(expected, 6);
    live.push(expected);
    if (i === 4) {
      // The bar's label shows the same number, and the bottle is still in the hand.
      const shown = Math.round(expected);
      await expect.poll(() => visibleTexts(page)).toContain(`${shown}%`);
      expect(await gameState(page)).toMatchObject({ dragging: true, phase: 'aiming' });
    }
  }
  // (Not "each value above the one before": on a slow machine the moves can be more than 150 ms
  // apart, and then each is a push of its own, which is what the game should measure.)
  expect(Math.min(...live)).toBeGreaterThan(5);

  // One more move and straight away the release: it throws with the value of that moment, and the
  // bar keeps it. (Waiting here would make the pointer look stopped, and a stopped pointer throws nothing.)
  await page.mouse.move(bottle.x, bottle.y - 160);
  await page.mouse.up();
  const thrown = await gameState(page);
  const expected = await log.expectedPower({ release: true });
  expect(expected).toBeGreaterThan(1);
  expect(thrown.dragging).toBe(false);
  expect(thrown.lastThrow).toMatchObject({ source: 'mouse' });
  expect(thrown.lastThrow!.power).toBeCloseTo(expected, 6);
  expect(thrown.power).toBe(thrown.lastThrow!.power);
  expect(errors).toEqual([]);
});

test('a push on a precise clock: the bar shows the live value as the push builds up, then holds it', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause()); // no idle steps: the bar stays at the last move's value
  const log = await logMouse(page);
  const bottle = await bottleCenter(page);

  await dragInPage(page, { at: bottle, rise: 40, ms: 50, end: 'hold' });
  const gentle = await powerNow(page);
  expect(gentle).toBeCloseTo(await log.expectedPower(), 6);
  expect(await draggingNow(page)).toBe(true);
  // Put the gentle try down without a throw (a window blur drops the grab) and try again, harder.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect(await gameState(page)).toMatchObject({ dragging: false, throws: 0, power: 50 });

  // A harder push shows more, and the bar's label shows it.
  await dragInPage(page, { at: bottle, rise: 250, ms: 80, end: 'hold' });
  const hard = await powerNow(page);
  expect(hard).toBeCloseTo(await log.expectedPower(), 6);
  expect(hard).toBeGreaterThan(gentle + 30);
  await expect.poll(() => visibleTexts(page)).toContain(`${Math.round(hard)}%`);
  expect(await gameState(page)).toMatchObject({ phase: 'aiming', dragging: true, throws: 0 });
  expect(errors).toEqual([]);
});

test('a fast, long push gives more power than a slow, short one', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  const log = await logMouse(page);
  const bottle = await bottleCenter(page);

  await dragInPage(page, { at: bottle, rise: 300, ms: 80, end: 'release' });
  const fast = (await gameState(page)).lastThrow!;
  expect(fast.source).toBe('mouse');
  expect(fast.power).toBeCloseTo(await log.expectedPower({ release: true }), 6);

  // The next bottle waits in the same place: push slowly and not far.
  await nextBottle(page);
  await dragInPage(page, { at: bottle, rise: 60, ms: 400, end: 'release' });
  const slow = (await gameState(page)).lastThrow!;
  expect(slow.power).toBeCloseTo(await log.expectedPower({ release: true }), 6);

  expect(slow.power).toBeGreaterThan(1);
  expect(fast.power).toBeGreaterThan(slow.power + 30);
  expect(errors).toEqual([]);
});

test('a pointer that stops moving makes the bar fall back to 0, and a release then throws nothing', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause()); // time passes only as the test steps it
  const bottle = await bottleCenter(page);

  await dragInPage(page, { at: bottle, rise: 200, ms: 100, end: 'hold' });
  const pushing = await powerNow(page);
  expect(pushing).toBeGreaterThan(50); // just after the push the bar is high...
  await stepFrames(page, 6); // 100 ms: the start of the push has left the 150 ms window
  const fading = await powerNow(page);
  expect(fading).toBeLessThan(pushing);
  expect(fading).toBeGreaterThan(0);
  await stepFrames(page, 5);
  expect(await powerNow(page)).toBe(0); // ...and held still for 150 ms there is no push left
  expect(await draggingNow(page)).toBe(true);

  // Let go where the pointer rested, 300 ms after it last moved: no push, no throw.
  await releaseInPage(page, above(bottle, 200), 300);
  expect(await draggingNow(page)).toBe(false);
  expect(await gameState(page)).toMatchObject({
    phase: 'aiming',
    throws: 0,
    lastThrow: null,
    power: 50,
  });
  expect(errors).toEqual([]);
});
