import { expect, test } from '@playwright/test';
import { HAND_X, HAND_Y } from '../../src/core/bottle';
import { DEFAULT_TUNING } from '../../src/core/tuning';
import {
  expectPowerWithLog,
  gameState,
  openGame,
  powerOf,
  recordPowerLog,
  recordKeydownRepeats,
  settleInput,
  stepFrames,
  stepUntilOutcome,
} from './helpers';

const TAP = DEFAULT_TUNING.powerTapStep;
const WHEEL = DEFAULT_TUNING.powerWheelStep;

test('the power bar starts at 50, and a tap on ArrowUp or ArrowDown moves it one step', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());
  expect(await powerOf(page)).toBe(50);
  const log = await recordPowerLog(page);

  await page.keyboard.press('ArrowUp');
  await expectPowerWithLog(page, 50 + TAP, log);
  await page.keyboard.press('ArrowUp');
  await expectPowerWithLog(page, 50 + 2 * TAP, log);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expectPowerWithLog(page, 50 - TAP, log);
  expect(errors).toEqual([]);
});

test('holding ArrowUp for 1 s raises the power by more than 10 points, faster the longer it is held', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());

  await page.keyboard.down('ArrowUp');
  await expect.poll(() => powerOf(page)).toBe(50 + TAP); // the key went down: one tap at once

  const firstHalf = await stepFrames(page, 30);
  const secondHalf = await stepFrames(page, 30);
  const gainFirst = firstHalf.power - (50 + TAP);
  const gainSecond = secondHalf.power - firstHalf.power;
  expect(secondHalf.power - 50).toBeGreaterThan(10); // more than 10 taps' worth
  expect(gainSecond).toBeGreaterThan(gainFirst); // the second half-second moved farther

  await page.keyboard.up('ArrowUp');
  await settleInput(page);
  const released = await stepFrames(page, 60);
  expect(released.power).toBe(secondHalf.power); // nothing moves once the key is up

  // The same, downward.
  await page.keyboard.down('ArrowDown');
  await expect.poll(() => powerOf(page)).toBe(secondHalf.power - TAP);
  const lowered = await stepFrames(page, 60);
  expect(secondHalf.power - lowered.power).toBeGreaterThan(10);
  await page.keyboard.up('ArrowDown');
  expect(errors).toEqual([]);
});

test('a held arrow key moves the bar in real time and stops when released', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');

  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => window.__FLIPPER__!.state()!.power > 70);
  await page.keyboard.up('ArrowUp');
  await settleInput(page);
  const stopped = await powerOf(page);
  await settleInput(page);
  await settleInput(page);
  expect(await powerOf(page)).toBe(stopped);
  expect(errors).toEqual([]);
});

test('auto-repeated arrow keydowns are not extra taps', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());
  const repeats = await recordKeydownRepeats(page);

  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowUp'); // already down: the browser sends repeat: true
  await page.keyboard.down('ArrowUp');
  await settleInput(page);
  expect(await repeats()).toEqual([false, true, true]);
  expect(await powerOf(page)).toBe(50 + TAP);
  await page.keyboard.up('ArrowUp');
  expect(errors).toEqual([]);
});

test('the mouse wheel raises and lowers the power by one step per notch', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());
  await page.mouse.move(640, 360);

  await page.mouse.wheel(0, -100); // one notch up: raises
  await expect.poll(() => powerOf(page)).toBe(50 + WHEEL);
  await page.mouse.wheel(0, -100);
  await expect.poll(() => powerOf(page)).toBe(50 + 2 * WHEEL);
  await page.mouse.wheel(0, 100); // one notch down: lowers
  await page.mouse.wheel(0, 100);
  await page.mouse.wheel(0, 100);
  await expect.poll(() => powerOf(page)).toBe(50 - WHEEL);
  expect(errors).toEqual([]);
});

test('setPower(p) sets the bar, clamps it to 0-100 and ignores a non-number', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  const set = (p: number) => page.evaluate((v) => window.__FLIPPER__!.setPower(v), p);

  expect((await set(20))?.power).toBe(20);
  expect((await set(80))?.power).toBe(80);
  expect((await set(250))?.power).toBe(100);
  expect((await set(-5))?.power).toBe(0);
  expect((await set(33.5))?.power).toBe(33.5);
  expect((await set(Number.NaN))?.power).toBe(33.5);
  expect(errors).toEqual([]);
});

test('Space while aiming throws with the bar value', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());

  // Raise the bar with three taps, then read what it shows: that is what the throw must use.
  const log = await recordPowerLog(page);
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp');
  await expectPowerWithLog(page, 50 + 3 * TAP, log);
  const aiming = await gameState(page);
  expect(aiming).toMatchObject({ phase: 'aiming', lastThrow: null, throws: 0 });

  await page.keyboard.press('Space');
  await expect.poll(async () => (await gameState(page)).phase).toBe('flying');
  const flying = await gameState(page);
  expect(flying.lastThrow).toMatchObject({ power: aiming.power, source: 'keyboard' });
  expect(flying.throws).toBe(1);
  expect(flying.bottle.vy).toBeLessThan(0); // it left the hand
  expect(errors).toEqual([]);
});

test('Space while flying does nothing', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => {
    window.__FLIPPER__!.pause();
    window.__FLIPPER__!.setPower(61);
  });
  await page.keyboard.press('Space');
  await expect.poll(async () => (await gameState(page)).phase).toBe('flying');
  const flying = await stepFrames(page, 10);
  expect(flying.phase).toBe('flying');

  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await settleInput(page);
  expect(await gameState(page)).toEqual(flying); // no second throw, no skip, nothing moved
  expect(errors).toEqual([]);
});

for (const how of ['Space', 'a click'] as const) {
  test(`${how} during the result brings the next bottle`, async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await page.evaluate(() => {
      window.__FLIPPER__!.pause();
      window.__FLIPPER__!.setPower(44);
      window.__FLIPPER__!.throwBottle(44);
    });
    const decided = await stepUntilOutcome(page);
    expect(decided.phase).toBe('result');

    if (how === 'Space') await page.keyboard.press('Space');
    else await page.mouse.click(640, 360);
    await expect.poll(async () => (await gameState(page)).phase).toBe('aiming');

    const next = await gameState(page);
    expect(next).toMatchObject({ outcome: null, throws: 1, power: 44, tick: decided.tick });
    expect(next.bottle.water).not.toBe(decided.bottle.water); // the seed's next bottle
    expect([next.bottle.x, next.bottle.y]).toEqual([HAND_X, HAND_Y]);
    expect(errors).toEqual([]);
  });
}

test('a click while aiming or flying does not throw or skip', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());

  const aiming = await gameState(page);
  await page.mouse.click(900, 150); // open sky, away from the bottle
  await settleInput(page);
  expect(await gameState(page)).toEqual(aiming);

  await page.evaluate(() => window.__FLIPPER__!.throwBottle(50));
  const flying = await stepFrames(page, 10);
  await page.mouse.click(900, 150);
  await settleInput(page);
  expect(await gameState(page)).toEqual(flying);
  expect(errors).toEqual([]);
});

test('auto-repeated Space keydowns are ignored: holding Space through a result never throws', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());
  const repeats = await recordKeydownRepeats(page);

  // Space goes down and stays down: the first keydown throws.
  await page.keyboard.down('Space');
  await expect.poll(async () => (await gameState(page)).phase).toBe('flying');
  const decided = await stepUntilOutcome(page);
  expect(decided).toMatchObject({ phase: 'result', throws: 1 });

  // Still held: repeats arrive during the result and must not skip it.
  await page.keyboard.down('Space');
  await page.keyboard.down('Space');
  await settleInput(page);
  expect(await repeats()).toEqual([false, true, true]);
  expect(await gameState(page)).toEqual(decided);

  // The wait ends by itself and the next bottle appears; more repeats must not throw it.
  const next = await stepFrames(page, 60);
  expect(next).toMatchObject({ phase: 'aiming', throws: 1 });
  await page.keyboard.down('Space');
  await page.keyboard.down('Space');
  await settleInput(page);
  expect(await gameState(page)).toEqual(next);

  // Let go and press again: that is a real press, and it throws.
  await page.keyboard.up('Space');
  await page.keyboard.press('Space');
  await expect.poll(async () => (await gameState(page)).phase).toBe('flying');
  expect((await gameState(page)).throws).toBe(2);
  expect(errors).toEqual([]);
});

test('the power starts at 50 and keeps its value when the next bottle appears', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());
  expect(await powerOf(page)).toBe(50);

  await page.evaluate(() => window.__FLIPPER__!.setPower(72));
  await page.keyboard.press('Space');
  await expect.poll(async () => (await gameState(page)).phase).toBe('flying');
  const decided = await stepUntilOutcome(page);
  expect(decided.power).toBe(72); // throwing doesn't reset the bar

  // The wait runs out by itself...
  const next = await stepFrames(page, 60);
  expect(next).toMatchObject({ phase: 'aiming', power: 72 });

  // ...and a second throw uses the same value without touching the bar.
  await page.keyboard.press('Space');
  await expect.poll(async () => (await gameState(page)).phase).toBe('flying');
  expect((await gameState(page)).lastThrow).toMatchObject({ power: 72 });
  expect(errors).toEqual([]);
});
