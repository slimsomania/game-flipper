import { expect, test, type Page } from '@playwright/test';
import { TITLE_LAYOUT } from '../../src/game/view/titleLayout';
import { openTitle } from './helpers';
import { gamePoint } from './mouseHelpers';

// F040: on desktop neither a click on Play nor Enter asks for fullscreen.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __fs: number };
    w.__fs = 0;
    Element.prototype.requestFullscreen = () => {
      w.__fs++;
      return Promise.resolve();
    };
  });
});

const calls = (page: Page) => page.evaluate(() => (window as unknown as { __fs: number }).__fs);

test('a click on Play does not request fullscreen', async ({ page }) => {
  await openTitle(page, '?seed=7');
  const at = await gamePoint(page, TITLE_LAYOUT.play.x, TITLE_LAYOUT.play.y);
  await page.mouse.click(at.x, at.y);
  await expect
    .poll(() => page.evaluate(() => window.__FLIPPER__!.activeScenes()))
    .toEqual(['Game']);
  expect(await calls(page)).toBe(0);
});

test('Enter does not request fullscreen', async ({ page }) => {
  await openTitle(page, '?seed=7');
  await page.keyboard.press('Enter');
  await expect
    .poll(() => page.evaluate(() => window.__FLIPPER__!.activeScenes()))
    .toEqual(['Game']);
  expect(await calls(page)).toBe(0);
});
