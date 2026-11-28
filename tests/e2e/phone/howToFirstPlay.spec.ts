import { expect, test } from '@playwright/test';
import { TITLE_LAYOUT } from '../../../src/game/view/titleLayout';
import { fsCalls, stubFullscreen } from '../fullscreenHelpers';
import { gameState, openTitle } from '../helpers';
import { gamePoint } from '../mouseHelpers';

// F056 on a phone: the first Play tap opens the card and still asks for fullscreen; a tap outside
// closes it without throwing.
test('the first Play tap opens the card and asks for fullscreen; a tap outside closes it', async ({
  page,
}) => {
  await stubFullscreen(page, 'ok');
  const errors = await openTitle(page, '?seed=7', true);
  const at = await gamePoint(page, TITLE_LAYOUT.play.x, TITLE_LAYOUT.play.y);
  await page.touchscreen.tap(at.x, at.y);
  await expect.poll(() => page.evaluate(() => window.__FLIPPER__!.howToOpen())).toBe(true);
  expect(await fsCalls(page)).toEqual({ req: 1, exit: 0 });

  const outside = await gamePoint(page, 20, 700);
  await page.touchscreen.tap(outside.x, outside.y);
  await expect.poll(() => page.evaluate(() => window.__FLIPPER__!.howToOpen())).toBe(false);
  const state = await gameState(page);
  expect(state.throwNumber).toBe(1);
  expect(state.phase).toBe('aiming');
  expect(state.throws).toBe(0);
  expect(errors).toEqual([]);
});
