import { expect, test, type Page } from '@playwright/test';
import { FLIPPED } from '../shared';
import { gameState, openGame, powerOf, settleInput, startGame, stepUntilOutcome } from './helpers';
import { above, bottleCenter, glide, press } from './mouseHelpers';
import { expectPaused, isPaused, letFramesPass, pauseWith, runClock } from './pauseHelpers';
import { land, next } from './roundHelpers';

/*
 * The pause overlay (F019), what stops: a bottle in flight freezes while the real clock runs on and
 * carries on from the same place at the resume; Space, Up and Down, the wheel, R and a push on the
 * bottle change nothing; and a key or a grab that is still on when the game pauses does not
 * carry over into the resume. "Paused" here is the game's own pause (`gamePaused()`); the hooks'
 * clock is switched back on (`runClock`) wherever a test wants to show that only the pause holds
 * the game still.
 */

const WATER = 0.5;
const POWER = 70;

/** Throw the held bottle at `POWER` (clock stopped, so the flight is where the test puts it) and step into it. */
async function throwAndStep(page: Page, steps: number) {
  return page.evaluate(
    ([water, power, n]) => {
      const hooks = window.__FLIPPER__!;
      hooks.pause();
      hooks.setWater(water);
      hooks.throwBottle(power);
      return hooks.step(n);
    },
    [WATER, POWER, steps],
  );
}

test.describe('a bottle in flight', () => {
  test('freezes while paused, and the flight goes on to an outcome after the resume', async ({
    page,
  }) => {
    const errors = await openGame(page, '?seed=7');
    const flying = await throwAndStep(page, 20);
    expect(flying).toMatchObject({ phase: 'flying', outcome: null });

    await pauseWith(page);
    const frozen = await gameState(page);
    await runClock(page); // the real clock runs, but the game is paused
    await page.waitForTimeout(1000); // a second of real time: nothing may move
    expect(await gameState(page)).toEqual(frozen);

    await page.keyboard.press('Escape');
    await expectPaused(page, false);
    // After the resume the flight goes on from where it was, and is decided.
    await expect.poll(async () => (await gameState(page)).phase).not.toBe('flying');
    expect((await gameState(page)).tick).toBeGreaterThan(frozen.tick);
    expect(errors).toEqual([]);
  });

  test('resumes exactly where it stopped: the same flight, step for step, as one never paused', async ({
    page,
  }) => {
    const errors = await openGame(page, '?seed=7');
    // Stop the clock first and start the game again, so both flights begin at tick 0 (the game
    // above has already stepped a little in real time).
    await page.evaluate(() => window.__FLIPPER__!.pause());
    await startGame(page);

    // The flight with a pause in the middle of it.
    await throwAndStep(page, 25);
    const before = await gameState(page);
    await pauseWith(page);
    expect(await gameState(page)).toEqual(before);
    await page.keyboard.press('Escape');
    await expectPaused(page, false);
    await settleInput(page);
    expect(await gameState(page)).toEqual(before); // nothing moved over the pause and the resume
    const interrupted = await stepUntilOutcome(page);

    // The same throw, from a fresh game with the same seed, never paused.
    await startGame(page);
    await throwAndStep(page, 25);
    const straight = await stepUntilOutcome(page);

    expect(interrupted).toEqual(straight);
    expect(errors).toEqual([]);
  });

  test('a pause during a result holds the result, and the wait carries on after the resume', async ({
    page,
  }) => {
    const errors = await openGame(page, '?seed=7');
    await land(page, FLIPPED);
    await page.evaluate(() => window.__FLIPPER__!.step(30)); // into the result wait
    const waiting = await gameState(page);
    expect(waiting.phase).toBe('result');

    await pauseWith(page);
    await runClock(page);
    await page.waitForTimeout(500);
    expect(await gameState(page)).toEqual(waiting);

    await page.keyboard.press('Escape');
    await expectPaused(page, false);
    await expect.poll(async () => (await gameState(page)).phase).toBe('aiming');
    expect(errors).toEqual([]);
  });
});

test.describe('while paused', () => {
  test('Space, ArrowUp, the wheel, R and a push on the bottle change nothing', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await land(page, FLIPPED);
    await next(page); // throw 2 of the round, one point: R would show
    await runClock(page); // the game's pause is what holds it still, not the test clock
    await pauseWith(page);
    const frozen = await gameState(page);
    expect(frozen).toMatchObject({ phase: 'aiming', throwNumber: 2, score: 1, dragging: false });

    const at = await bottleCenter(page);
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.down('ArrowUp');
    await letFramesPass(page, 12); // a held key would move the bar a lot in this time
    await page.keyboard.up('ArrowUp');
    await page.keyboard.press('KeyR');
    await page.mouse.move(at.x + 500, at.y);
    await page.mouse.wheel(0, -300);
    await page.mouse.wheel(0, 300);
    await press(page, at, false); // the push: press on the bottle, a fast move up, let go
    await glide(page, at, above(at, 220), 80);
    await page.mouse.up();
    await letFramesPass(page, 6);

    expect(await isPaused(page)).toBe(true);
    expect(await gameState(page)).toEqual(frozen); // tick included: nothing stepped either
    expect(errors).toEqual([]);
  });

  test('after the resume the same input works again', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await pauseWith(page);
    await page.keyboard.press('Escape');
    await expectPaused(page, false);

    const start = await powerOf(page);
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => powerOf(page)).toBe(start + 1);
    await page.mouse.wheel(0, -100);
    await expect.poll(() => powerOf(page)).toBeGreaterThan(start + 1);
    await page.keyboard.press('Space');
    await expect.poll(async () => (await gameState(page)).phase).not.toBe('aiming');
    expect(errors).toEqual([]);
  });
});

test.describe('input still on when the game pauses', () => {
  test('a held Up key does not keep raising the power after the resume', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await page.evaluate(() => window.__FLIPPER__!.setPower(10));
    await page.keyboard.down('ArrowUp');
    await expect.poll(() => powerOf(page)).toBeGreaterThan(14); // the hold has begun to move it

    await pauseWith(page);
    await page.keyboard.up('ArrowUp'); // the paused game never hears this
    await page.keyboard.press('Escape');
    await expectPaused(page, false);
    await settleInput(page);

    const resumed = await powerOf(page);
    await letFramesPass(page, 20); // a key still held would move the bar a lot in this time
    expect(await powerOf(page)).toBe(resumed);
    expect(errors).toEqual([]);
  });

  test('a grab on the bottle is dropped by the pause, and the bottle is not thrown', async ({
    page,
  }) => {
    const errors = await openGame(page, '?seed=7');
    const at = await bottleCenter(page);
    await press(page, at); // grabbed
    expect((await gameState(page)).dragging).toBe(true);

    await page.keyboard.press('Escape');
    await expectPaused(page, true);
    expect((await gameState(page)).dragging).toBe(false);
    await page.mouse.up(); // let go while paused
    await page.keyboard.press('Escape');
    await expectPaused(page, false);
    await settleInput(page);

    expect(await gameState(page)).toMatchObject({
      phase: 'aiming',
      throws: 0,
      throwNumber: 1,
      dragging: false,
    });
    // The bottle can be grabbed again.
    await press(page, at);
    await page.mouse.up();
    expect(errors).toEqual([]);
  });
});
