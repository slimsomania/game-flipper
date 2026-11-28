import { expect, test, type Page } from '@playwright/test';
import { HOW_TO_LAYOUT } from '../../src/game/view/howToLayout';
import { gameState, openGame, powerOf, settleInput, startGame, stepUntilOutcome } from './helpers';
import { bottleCenter, press } from './mouseHelpers';
import {
  clickAt,
  clickHowTo,
  clickResume,
  expectPaused,
  isPaused,
  letFramesPass,
  pauseWith,
  runClock,
} from './pauseHelpers';
import { activeScenes, land } from './roundHelpers';
import { playToLastResult, playToSummary } from './summaryHelpers';
import { FLIPPED } from '../shared';

/*
 * The How to play card over the game (F055): opened from the Pause overlay (its button) or with H in
 * play. The game stays paused under it; closing returns to the overlay or straight to play.
 */

const isOpen = (page: Page) => page.evaluate(() => window.__FLIPPER__!.howToOpen());
const expectOpen = (page: Page, open: boolean) =>
  expect.poll(() => isOpen(page), { message: `card open: ${open}` }).toBe(open);

const WATER = 0.5;
const POWER = 70;

/** Throw the held bottle (clock stopped) and step `steps` into the flight. */
const throwAndStep = (page: Page, steps: number) =>
  page.evaluate(
    ([water, power, n]) => {
      const hooks = window.__FLIPPER__!;
      hooks.pause();
      hooks.setWater(water);
      hooks.throwBottle(power);
      return hooks.step(n);
    },
    [WATER, POWER, steps],
  );

test.describe('from the Pause overlay', () => {
  const closers: Record<string, (page: Page) => Promise<void>> = {
    Close: (page) => clickAt(page, HOW_TO_LAYOUT.close),
    'a click outside the card': (page) => clickAt(page, { x: 20, y: 700 }),
    Esc: (page) => page.keyboard.press('Escape'),
    H: (page) => page.keyboard.press('KeyH'),
  };

  for (const [name, close] of Object.entries(closers)) {
    test(`${name} returns to the overlay, and Resume then continues play`, async ({ page }) => {
      const errors = await openGame(page, '?seed=7');
      await throwAndStep(page, 20);
      await pauseWith(page);
      const frozen = await gameState(page);
      expect(await page.evaluate(() => window.__FLIPPER__!.texts())).toContain('How to play');

      await clickHowTo(page);
      await expectOpen(page, true);
      await runClock(page);
      await page.waitForTimeout(300);
      expect(await gameState(page)).toEqual(frozen); // the tick stays the same

      await close(page);
      await expectOpen(page, false);
      await expectPaused(page, true);
      expect(await gameState(page)).toEqual(frozen);

      await clickResume(page);
      await expectPaused(page, false);
      await expect.poll(async () => (await gameState(page)).tick).toBeGreaterThan(frozen.tick);
      expect(errors).toEqual([]);
    });
  }
});

test.describe('H in play', () => {
  test('while aiming, nothing moves under the card and an Up held at H is let go', async ({
    page,
  }) => {
    const errors = await openGame(page, '?seed=7');
    await page.evaluate(() => window.__FLIPPER__!.setPower(10));
    await page.keyboard.down('ArrowUp');
    await expect.poll(() => powerOf(page)).toBeGreaterThan(14);

    await page.keyboard.press('KeyH');
    await expectOpen(page, true);
    await page.keyboard.up('ArrowUp'); // the paused game never hears this
    await runClock(page);
    const frozen = await gameState(page);
    const at = await bottleCenter(page);
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowUp');
    await page.mouse.move(at.x + 400, at.y);
    await press(page, at, false);
    await page.mouse.up();
    await page.waitForTimeout(1000);
    expect(await isOpen(page)).toBe(true);
    expect(await gameState(page)).toEqual(frozen);

    await page.keyboard.press('KeyH');
    await expectOpen(page, false);
    await settleInput(page);
    const resumed = await powerOf(page);
    await letFramesPass(page, 20); // a key still held would move the bar a lot in this time
    expect(await powerOf(page)).toBe(resumed);
    expect(await isPaused(page)).toBe(false);
    expect(errors).toEqual([]);
  });

  test('during a flight the card freezes it, and the flight goes on step for step', async ({
    page,
  }) => {
    const errors = await openGame(page, '?seed=7');
    await page.evaluate(() => window.__FLIPPER__!.pause());
    await startGame(page); // both flights begin at tick 0
    await throwAndStep(page, 25);
    const before = await gameState(page);

    await page.keyboard.press('KeyH');
    await expectOpen(page, true);
    await runClock(page);
    await page.waitForTimeout(1000);
    expect(await gameState(page)).toEqual(before); // tick and pose unchanged
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);
    expect(await gameState(page)).toEqual(before);

    // Stop the test clock again so the resumed flight is stepped by hand, then close the card.
    await page.evaluate(() => window.__FLIPPER__!.pause());
    await page.keyboard.press('KeyH');
    await expectOpen(page, false);
    await settleInput(page);
    expect(await gameState(page)).toEqual(before);
    const interrupted = await stepUntilOutcome(page);

    await startGame(page);
    await page.evaluate(() => window.__FLIPPER__!.pause());
    await throwAndStep(page, 25);
    const straight = await stepUntilOutcome(page);
    expect(interrupted).toEqual(straight);
    expect(errors).toEqual([]);
  });

  test('one Esc closes only the card: the game runs on, not paused', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await page.keyboard.press('KeyH');
    await expectOpen(page, true);
    await page.keyboard.press('Escape');
    await expectOpen(page, false);
    await settleInput(page);
    await settleInput(page);
    expect(await isPaused(page)).toBe(false);
    expect(await activeScenes(page)).toEqual(['Game']);
    expect(errors).toEqual([]);
  });

  test('H on the round summary opens nothing', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await playToSummary(page);
    await page.keyboard.press('KeyH');
    await letFramesPass(page, 6);
    expect(await isOpen(page)).toBe(false);
    expect(await activeScenes(page)).toContain('Summary');
    expect(errors).toEqual([]);
  });

  test('H as the round-over summary is about to open opens nothing', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await playToLastResult(page);
    const phase = await page.evaluate(() => {
      const hooks = window.__FLIPPER__!;
      const state = hooks.skip(); // the round is over; the Game scene opens the summary next frame
      window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 72, bubbles: true }));
      return state?.phase;
    });
    expect(phase).toBe('roundOver');
    await expect.poll(() => activeScenes(page)).toContain('Summary');
    expect(await isOpen(page)).toBe(false);
    expect(errors).toEqual([]);
  });

  test('after a landing, H and the result wait still work normally', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await land(page, FLIPPED);
    await page.keyboard.press('KeyH');
    await expectOpen(page, true);
    await page.keyboard.press('KeyH');
    await expectOpen(page, false);
    expect(errors).toEqual([]);
  });
});
