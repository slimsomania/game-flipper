/*
 * Helpers for the e2e tests of the pause overlay (`pause.spec.ts`, `pauseFreeze.spec.ts`,
 * `pauseActions.spec.ts`): whether the game is paused (the hook `gamePaused()`, which is the game's own
 * pause, not the hooks' clock `pause()`), pausing with a key, and real clicks on the corner button
 * and on the overlay's buttons.
 *
 * Most of these tests turn the hooks' clock back on (`runClock`) before they pause, because
 * `land()` and `stepUntilOutcome()` stop it: what they want to prove is that the game's pause, not
 * the test clock, is what holds things still.
 */
import { expect, type Page } from '@playwright/test';
import { PAUSE_BUTTON, PAUSE_LAYOUT } from '../../src/game/view/pauseLayout';
import { settleInput } from './helpers';
import { gamePoint } from './mouseHelpers';

/** The game's own pause: the pause overlay is open. */
export const isPaused = (page: Page): Promise<boolean> =>
  page.evaluate(() => window.__FLIPPER__!.gamePaused());

/** Wait for the game to be paused (or not): the overlay opens or closes a frame after the input. */
export const expectPaused = (page: Page, paused: boolean) =>
  expect.poll(() => isPaused(page), { message: `paused: ${paused}` }).toBe(paused);

/** Pause with a key (Esc by default) and wait until the overlay is open. */
export async function pauseWith(page: Page, key = 'Escape'): Promise<void> {
  await page.keyboard.press(key);
  await expectPaused(page, true);
}

/** Turn the hooks' real-time clock on (`land()` and `stepUntilOutcome()` stop it). */
export const runClock = (page: Page) => page.evaluate(() => window.__FLIPPER__!.resume());

/** Click the middle of a button at `spot` (game pixels) with the real mouse. */
export async function clickAt(page: Page, spot: { x: number; y: number }): Promise<void> {
  const { x, y } = await gamePoint(page, spot.x, spot.y);
  await page.mouse.click(x, y);
}

/** The corner button: pause while playing, resume while paused. */
export const clickPauseButton = (page: Page) => clickAt(page, PAUSE_BUTTON);
export const clickResume = (page: Page) => clickAt(page, PAUSE_LAYOUT.resume);
export const clickRestart = (page: Page) => clickAt(page, PAUSE_LAYOUT.restart);
export const clickQuit = (page: Page) => clickAt(page, PAUSE_LAYOUT.quit);

/** The key codes (`keyCode`) of the pause keys, for `keysInOneFrame`. */
export const KEY = { esc: 27, p: 80 } as const;

/**
 * Make keydown events inside the page, one after the other in a single task, so the game reads them
 * in the same frame (Playwright's own key presses take a frame or more each). Phaser sees them as
 * ordinary key presses, and it only looks at the `keyCode`.
 */
export async function keysInOneFrame(page: Page, keyCodes: number[]): Promise<void> {
  await page.evaluate((codes) => {
    for (const keyCode of codes) {
      window.dispatchEvent(new KeyboardEvent('keydown', { keyCode, bubbles: true }));
    }
  }, keyCodes);
}

/** Let about `frames` animation frames go by (two per `settleInput`). */
export async function letFramesPass(page: Page, frames: number): Promise<void> {
  for (let i = 0; i < frames; i += 2) await settleInput(page);
}
