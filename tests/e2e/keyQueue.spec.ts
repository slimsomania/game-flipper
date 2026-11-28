import { expect, test } from '@playwright/test';
import { DEFAULT_TUNING } from '../../src/core/tuning';
import { openGame, powerOf } from './helpers';

// Phaser handles its whole keyboard queue again on every key event, and only empties the queue once
// a frame. With three or more key events in one frame (fast taps, or a slow frame, as on GitHub's
// runners) an older event was handled a second time: three ArrowUp taps raised the power four or
// five steps, and a second M press could undo the first. Each key event must act once.

const TAP = DEFAULT_TUNING.powerTapStep;

/** Send the key events to the window in one task, so they all land within one frame. */
async function sendInOneFrame(page: import('@playwright/test').Page, keys: [string, number][]) {
  await page.evaluate((list) => {
    for (const [type, code] of list) {
      const key = code === 38 ? 'ArrowUp' : code === 40 ? 'ArrowDown' : 'm';
      const event = new KeyboardEvent(type, { key, bubbles: true, cancelable: true });
      Object.defineProperty(event, 'keyCode', { get: () => code });
      Object.defineProperty(event, 'which', { get: () => code });
      window.dispatchEvent(event);
    }
  }, keys);
}

const tap = (code: number): [string, number][] => [
  ['keydown', code],
  ['keyup', code],
];

test('three ArrowUp taps within one frame raise the power exactly three steps', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());
  expect(await powerOf(page)).toBe(50);

  await sendInOneFrame(page, [...tap(38), ...tap(38), ...tap(38)]);
  expect(await powerOf(page)).toBe(50 + 3 * TAP);
  // Later frames don't replay them either.
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  expect(await powerOf(page)).toBe(50 + 3 * TAP);

  await sendInOneFrame(page, [...tap(40), ...tap(40), ...tap(40), ...tap(40)]);
  expect(await powerOf(page)).toBe(50 - TAP);
  expect(errors).toEqual([]);
});

test('M pressed twice within one frame mutes and unmutes, ending where it started', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  const muted = () => page.evaluate(() => window.__FLIPPER__!.muted());
  const before = await muted();
  await sendInOneFrame(page, [...tap(77), ...tap(77)]);
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  expect(await muted()).toBe(before);
  expect(errors).toEqual([]);
});
