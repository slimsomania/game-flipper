import { expect, test } from '@playwright/test';
import { TITLE_LAYOUT } from '../../src/game/view/titleLayout';
import { FLIPPED } from '../shared';
import { gameState, openGame, powerOf, settleInput, visibleTexts } from './helpers';
import { MUTED, ON, clickMuteButton, muteState } from './muteHelpers';
import {
  clickAt,
  clickQuit,
  clickRestart,
  clickResume,
  expectPaused,
  isPaused,
  pauseWith,
  runClock,
} from './pauseHelpers';
import { activeScenes, land, next } from './roundHelpers';

/*
 * The pause overlay (F019), its buttons: Resume goes on with the same round, Restart starts a new
 * round (throw 1, no points) that is running, and Quit to title ends the round and opens the Title
 * scene. The speaker button and M work on the overlay too.
 */

/** Play two throws (one point each) and wait on throw 3, with the real clock running. */
async function playTwoThrows(page: Parameters<typeof land>[0]): Promise<void> {
  await land(page, FLIPPED);
  await next(page);
  await land(page, FLIPPED);
  await next(page);
  await runClock(page);
  expect(await gameState(page)).toMatchObject({ throwNumber: 3, score: 2, phase: 'aiming' });
}

test.describe('Resume', () => {
  test('goes on with the same round, exactly as it was', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await land(page, FLIPPED);
    await next(page); // throw 2, clock stopped so the state is exact
    const before = await gameState(page);

    await pauseWith(page);
    await clickResume(page);
    await expectPaused(page, false);
    await expect.poll(() => activeScenes(page)).toEqual(['Game']);
    expect(await gameState(page)).toEqual(before);
    expect(before).toMatchObject({ throwNumber: 2, score: 1 });
    expect(errors).toEqual([]);
  });

  test('leaves a running game running: the clock steps the simulation again', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await pauseWith(page);
    await clickResume(page);
    await expectPaused(page, false);

    const { tick } = await gameState(page);
    await expect.poll(async () => (await gameState(page)).tick).toBeGreaterThan(tick);
    const power = await powerOf(page);
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => powerOf(page)).toBe(power + 1);
    expect(errors).toEqual([]);
  });
});

test.describe('Restart', () => {
  test('starts a fresh, unpaused round: throw 1, no points', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await playTwoThrows(page);

    await pauseWith(page);
    await clickRestart(page);
    await expectPaused(page, false);
    await expect.poll(() => activeScenes(page)).toEqual(['Game']);
    expect(await gameState(page)).toMatchObject({
      phase: 'aiming',
      throwNumber: 1,
      score: 0,
      landings: 0,
      streak: 0,
      outcome: null,
      dragging: false,
    });

    // Unpaused: the simulation steps again and Space throws.
    const { tick } = await gameState(page);
    await expect.poll(async () => (await gameState(page)).tick).toBeGreaterThan(tick);
    await page.keyboard.press('Space');
    await expect.poll(async () => (await gameState(page)).phase).not.toBe('aiming');
    expect(await gameState(page)).toMatchObject({ throwNumber: 1 });
    expect(errors).toEqual([]);
  });

  test('drops a bottle that is in the air', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await page.evaluate(() => {
      const hooks = window.__FLIPPER__!;
      hooks.pause();
      hooks.throwBottle(70);
      hooks.step(15);
    });
    expect((await gameState(page)).phase).toBe('flying');
    await runClock(page);

    await pauseWith(page);
    await clickRestart(page);
    await expectPaused(page, false);
    await expect.poll(async () => (await gameState(page)).phase).toBe('aiming');
    expect(await gameState(page)).toMatchObject({ throwNumber: 1, score: 0, landings: 0 });
    expect(errors).toEqual([]);
  });

  test('can be followed by a pause again', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await pauseWith(page);
    await clickRestart(page);
    await expectPaused(page, false);
    await pauseWith(page, 'KeyP');
    await clickResume(page);
    await expectPaused(page, false);
    expect(errors).toEqual([]);
  });
});

test.describe('Quit to title', () => {
  test('ends the round and opens the Title scene', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await playTwoThrows(page);

    await pauseWith(page);
    await clickQuit(page);
    await expect.poll(() => activeScenes(page)).toEqual(['Title']);
    expect(await isPaused(page)).toBe(false);
    expect(await page.evaluate(() => window.__FLIPPER__!.state())).toBeNull();
    // The round in progress was not finished, so it is not scored: the best is still 0.
    const texts = await visibleTexts(page);
    expect(texts).toEqual(expect.arrayContaining(['Flipper', 'Play', 'Best: 0']));
    expect(errors).toEqual([]);
  });

  test('then Play starts a new game that can be paused again', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await playTwoThrows(page);
    await pauseWith(page);
    await clickQuit(page);
    await expect.poll(() => activeScenes(page)).toEqual(['Title']);

    await clickAt(page, TITLE_LAYOUT.play);
    await expect.poll(() => activeScenes(page)).toEqual(['Game']);
    expect(await gameState(page)).toMatchObject({ throwNumber: 1, score: 0, throws: 0 });
    await pauseWith(page);
    await page.keyboard.press('Escape');
    await expectPaused(page, false);
    expect(errors).toEqual([]);
  });
});

test.describe('the mute control on the overlay', () => {
  test('the speaker button and M work while paused, and the game shows the same after the resume', async ({
    page,
  }) => {
    const errors = await openGame(page, '?seed=7');
    await pauseWith(page);
    expect(await muteState(page)).toEqual(ON);

    await clickMuteButton(page);
    await expect.poll(() => muteState(page)).toEqual(MUTED);
    expect(await isPaused(page)).toBe(true);
    await page.keyboard.press('KeyM');
    await expect.poll(() => muteState(page)).toEqual(ON);
    await clickMuteButton(page);
    await expect.poll(() => muteState(page)).toEqual(MUTED);

    await page.keyboard.press('Escape');
    await expectPaused(page, false);
    await settleInput(page);
    // The Game scene's own button, which was deaf while paused, shows the setting made meanwhile.
    expect(await muteState(page)).toEqual(MUTED);
    expect(errors).toEqual([]);
  });
});
