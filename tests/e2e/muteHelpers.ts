/*
 * Helpers for the e2e tests of the mute toggle (`mute.spec.ts`, `muteSound.spec.ts`): what the mute
 * setting and the speaker button show, a real click on the button, the saved entry, and a throw
 * that is sure to land.
 */
import { expect, type Page } from '@playwright/test';
import { findWindows, sweepPowers, widestWindow } from '../../src/core/flipWindow';
import { settleInput, stepUntilOutcome } from './helpers';
import { gamePoint, phaseOf, type Point } from './mouseHelpers';

export const SAVE_KEY = 'flipper.save.v1';

/** The water level the throws below are made at, and a power that lands an upright bottle from it. */
const WATER = 0.5;
export const LANDS = Math.round(widestWindow(findWindows(sweepPowers(WATER)), 1)!.center);
/** Power 0 is a plain drop: the bottle stands up without a turn, a fail ("No flip!"). */
export const DROPS = 0;
/** An empty part of the canvas, in game pixels: not the bottle, the table or the button. */
export const EMPTY = { x: 1000, y: 400 };

export const ON = { muted: false, shownMuted: false };
export const MUTED = { muted: true, shownMuted: true };

/** Set the held bottle's water and the power bar, then throw with a real Space press (clock paused). */
export async function startSpaceThrow(page: Page, power: number): Promise<void> {
  await page.evaluate(
    ([water, p]) => {
      window.__FLIPPER__!.pause();
      window.__FLIPPER__!.setWater(water);
      window.__FLIPPER__!.setPower(p);
    },
    [WATER, power],
  );
  await page.keyboard.press('Space');
  await expect.poll(() => phaseOf(page)).toBe('flying');
}

/** Throw with Space and step to the landing's outcome. */
export async function throwAndLand(page: Page, power: number) {
  await startSpaceThrow(page, power);
  return stepUntilOutcome(page);
}

/** Skip the wait after a result: the next bottle. */
export const skipResult = (page: Page) => page.evaluate(() => window.__FLIPPER__!.skip());

/** The setting, and the icon the button last drew (true: the muted one; null: no button on screen). */
export interface MuteState {
  muted: boolean;
  shownMuted: boolean | null;
}

/** The mute setting and the speaker icon, read after the game has had a frame to draw the latest state. */
export async function muteState(page: Page): Promise<MuteState> {
  await settleInput(page);
  return page.evaluate(() => ({
    muted: window.__FLIPPER__!.muted(),
    shownMuted: window.__FLIPPER__!.muteButton()?.muted ?? null,
  }));
}

/** The speaker button's clickable area, in game pixels, as the game reports it. */
export async function muteButtonBox(page: Page) {
  await settleInput(page);
  const box = await page.evaluate(() => window.__FLIPPER__!.muteButton());
  if (!box) throw new Error('There is no speaker button on screen');
  return box;
}

/** The middle of the speaker button on the page: where a player would click. */
export async function muteButtonPoint(page: Page): Promise<Point> {
  const { x, y } = await muteButtonBox(page);
  return gamePoint(page, x, y);
}

/** Click the speaker button with the real mouse. */
export async function clickMuteButton(page: Page): Promise<void> {
  const { x, y } = await muteButtonPoint(page);
  await page.mouse.click(x, y);
}

/** What is stored under the save key, parsed, or null when there is no entry. */
export async function savedEntry(page: Page): Promise<unknown> {
  const text = await page.evaluate((key) => window.localStorage.getItem(key), SAVE_KEY);
  return text === null ? null : JSON.parse(text);
}

/** Visit the page again: a new game in the same browser, with the same localStorage. */
export async function reload(page: Page): Promise<void> {
  await page.reload();
  await page.waitForFunction(() => window.__FLIPPER__?.ready === true);
}
