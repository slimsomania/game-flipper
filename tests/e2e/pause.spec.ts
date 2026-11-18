import { expect, test } from '@playwright/test';
import { PAUSE_BUTTON } from '../../src/game/view/pauseLayout';
import { FLIPPED } from '../shared';
import {
  gameState,
  openGame,
  openTitle,
  recordKeydownRepeats,
  settleInput,
  visibleFlash,
  visibleTexts,
} from './helpers';
import { EMPTY, clickMuteButton } from './muteHelpers';
import { canvasCursor, gamePoint } from './mouseHelpers';
import {
  KEY,
  clickAt,
  clickPauseButton,
  expectPaused,
  isPaused,
  keysInOneFrame,
  letFramesPass,
  pauseWith,
} from './pauseHelpers';
import { activeScenes, land } from './roundHelpers';
import { playToSummary } from './summaryHelpers';

/*
 * The pause overlay (F019), opening and closing: Esc, P and the corner button pause and resume, the
 * overlay shows its words and nothing from the game, and a click on the pause or the speaker button
 * is only that, never a throw or a skipped result. What is frozen while paused is in
 * `pauseFreeze.spec.ts`, and the overlay's buttons are in `pauseActions.spec.ts`. The game's own pause
 * is the hook `gamePaused()`; the hooks' `pause()` is only the test clock.
 */

test.describe('Esc, P and the corner button', () => {
  for (const [name, key] of [
    ['Esc', 'Escape'],
    ['P', 'KeyP'],
  ]) {
    test(`${name} pauses and ${name} resumes`, async ({ page }) => {
      const errors = await openGame(page, '?seed=7');
      expect(await isPaused(page)).toBe(false);

      await pauseWith(page, key);
      expect(await activeScenes(page)).toEqual(['Pause']);
      await page.keyboard.press(key);
      await expectPaused(page, false);
      await expect.poll(() => activeScenes(page)).toEqual(['Game']);
      expect(errors).toEqual([]);
    });
  }

  test('Esc pauses and P resumes, and the other way round', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await pauseWith(page, 'Escape');
    await page.keyboard.press('KeyP');
    await expectPaused(page, false);
    await pauseWith(page, 'KeyP');
    await page.keyboard.press('Escape');
    await expectPaused(page, false);
    expect(errors).toEqual([]);
  });

  test('the corner pause button pauses, and the same button resumes', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');

    await clickPauseButton(page);
    await expectPaused(page, true);
    await clickPauseButton(page);
    await expectPaused(page, false);
    await expect.poll(() => activeScenes(page)).toEqual(['Game']);
    expect(errors).toEqual([]);
  });

  test('holding Esc down pauses once: the keyboard repeat does not toggle it again', async ({
    page,
  }) => {
    const errors = await openGame(page, '?seed=7');
    const repeats = await recordKeydownRepeats(page);

    await page.keyboard.down('Escape');
    await expectPaused(page, true);
    await page.keyboard.down('Escape'); // the browser's auto-repeat of the held key
    await page.keyboard.down('Escape');
    await settleInput(page);
    await page.keyboard.up('Escape');
    expect(await repeats()).toEqual([false, true, true]);
    await settleInput(page);
    expect(await isPaused(page)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('Esc and P in the same frame pause once, and stay paused', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    // Both key presses reach the page in one task, so the game reads them in the same frame: the
    // second finds the pause already on its way, and the overlay does not open and shut again.
    await keysInOneFrame(page, [KEY.esc, KEY.p]);
    await expectPaused(page, true);
    await letFramesPass(page, 10);
    expect(await isPaused(page)).toBe(true);
    expect(await activeScenes(page)).toEqual(['Pause']);
    expect(errors).toEqual([]);
  });
});

test.describe('the overlay', () => {
  test('shows its title, the three buttons and the key hint, and nothing from the game', async ({
    page,
  }) => {
    const errors = await openGame(page, '?seed=7');
    await pauseWith(page);

    const texts = await visibleTexts(page);
    expect([...texts].sort()).toEqual(
      ['Paused', 'Resume', 'Restart', 'Quit to title', 'Esc or P to resume'].sort(),
    );
    // The veil is not mistaken for the result flash.
    expect(await visibleFlash(page)).toBeNull();
    expect(errors).toEqual([]);
  });

  test('clicking an empty part of the backdrop does nothing', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await pauseWith(page);
    await clickAt(page, EMPTY);
    await settleInput(page);
    expect(await isPaused(page)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('the hand cursor does not stay on the backdrop after the corner button opened it', async ({
    page,
  }) => {
    const errors = await openGame(page, '?seed=7');
    const button = await gamePoint(page, PAUSE_BUTTON.x, PAUSE_BUTTON.y);
    await page.mouse.move(button.x, button.y);
    await expect.poll(() => canvasCursor(page)).toBe('pointer');

    await page.mouse.click(button.x, button.y);
    await expectPaused(page, true);
    const away = await gamePoint(page, EMPTY.x, EMPTY.y);
    await page.mouse.move(away.x, away.y);
    await settleInput(page);
    expect(await canvasCursor(page)).toBe('auto');
    expect(errors).toEqual([]);
  });
});

test.describe('clicking the pause or the speaker button', () => {
  test('in the aiming phase throws nothing', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    const before = await gameState(page);

    await clickPauseButton(page);
    await expectPaused(page, true);
    await clickPauseButton(page);
    await expectPaused(page, false);
    await clickMuteButton(page);
    await settleInput(page);

    const after = await gameState(page);
    expect(after).toMatchObject({ phase: 'aiming', throws: 0, throwNumber: 1, dragging: false });
    expect(after.power).toBe(before.power);
    expect(errors).toEqual([]);
  });

  test('during a result does not skip it, and the result is as it was after resuming', async ({
    page,
  }) => {
    const errors = await openGame(page, '?seed=7');
    await land(page, FLIPPED); // clock stopped, so the state is exact
    const result = await gameState(page);
    expect(result.phase).toBe('result');

    await clickPauseButton(page);
    await expectPaused(page, true);
    await clickPauseButton(page);
    await expectPaused(page, false);
    expect(await gameState(page)).toEqual(result);

    await clickMuteButton(page);
    await settleInput(page);
    expect(await gameState(page)).toEqual(result);
    // A click on an empty spot does skip it, so the result was skippable.
    await clickAt(page, EMPTY);
    await expect.poll(async () => (await gameState(page)).phase).toBe('aiming');
    expect(errors).toEqual([]);
  });

  test('on the last result does not end the round', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await page.evaluate(() => window.__FLIPPER__!.setTuningValue('throwsPerRound', 1));
    await land(page, FLIPPED);
    const result = await gameState(page);
    expect(result).toMatchObject({ phase: 'result', throwNumber: 1 });

    await clickPauseButton(page);
    await expectPaused(page, true);
    await clickPauseButton(page);
    await expectPaused(page, false);
    await settleInput(page);

    expect(await gameState(page)).toEqual(result);
    expect(await activeScenes(page)).toEqual(['Game']);
    expect(errors).toEqual([]);
  });
});

test.describe('where pausing is not offered', () => {
  test('Esc and P do nothing on the title screen', async ({ page }) => {
    const errors = await openTitle(page);
    await page.keyboard.press('Escape');
    await page.keyboard.press('KeyP');
    await settleInput(page);
    expect(await activeScenes(page)).toEqual(['Title']);
    expect(await isPaused(page)).toBe(false);
    expect(errors).toEqual([]);
  });

  test('Esc and P do nothing on the round summary', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await playToSummary(page);
    await page.keyboard.press('Escape');
    await page.keyboard.press('KeyP');
    await settleInput(page);
    expect(await activeScenes(page)).toEqual(['Summary']);
    expect(await isPaused(page)).toBe(false);
    expect(errors).toEqual([]);
  });

  test('a pause key as the round ends does not open the overlay over the summary', async ({
    page,
  }) => {
    const errors = await openGame(page, '?seed=7');
    await page.evaluate(() => window.__FLIPPER__!.setTuningValue('throwsPerRound', 1));
    await land(page, FLIPPED);
    // The last result ends and Esc arrives in the same frame, before the summary has opened.
    await page.evaluate((esc) => {
      window.__FLIPPER__!.skip();
      window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: esc, bubbles: true }));
    }, KEY.esc);
    await expect.poll(() => activeScenes(page)).toEqual(['Summary']);
    await letFramesPass(page, 6);
    expect(await activeScenes(page)).toEqual(['Summary']);
    expect(await isPaused(page)).toBe(false);
    expect(errors).toEqual([]);
  });
});
