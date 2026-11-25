import { expect, test, type Page } from '@playwright/test';
import { clickFullscreenButton, expectIcon } from './fullscreenHelpers';
import { openTitle, startGame } from './helpers';
import { pauseWith } from './pauseHelpers';
import { playToSummary } from './summaryHelpers';

// F047 regression: Chromium reports display-mode fullscreen while the page is fullscreen through
// the Fullscreen API. The button and F must stay on every screen after entering it (real, unstubbed).

const isFs = (page: Page) => page.evaluate(() => document.fullscreenElement !== null);

test('after entering real fullscreen, every screen still has the button and F leaves it', async ({
  page,
}) => {
  await openTitle(page, '?testhooks&seed=7');
  await clickFullscreenButton(page);
  await expect.poll(() => isFs(page)).toBe(true);
  await expectIcon(page, true);

  await startGame(page);
  await expectIcon(page, true);

  await playToSummary(page);
  await expectIcon(page, true);

  await startGame(page);
  await pauseWith(page);
  await expectIcon(page, true);

  await page.keyboard.press('f');
  await expect.poll(() => isFs(page)).toBe(false);
  await expectIcon(page, false);
});
