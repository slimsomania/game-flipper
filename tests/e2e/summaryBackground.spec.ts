import { expect, test, type Page } from '@playwright/test';
import { SUMMARY_LAYOUT } from '../../src/game/view/summaryLayout';
import { openGame } from './helpers';
import { gamePoint } from './mouseHelpers';
import { activeScenes } from './roundHelpers';
import { expectBackInGame, playAgainPoint, playToSummary } from './summaryHelpers';

// F050: the summary leaves the camera transparent (the page gradient shows) and hides the paused
// Game scene instead of covering it.

const gameVisible = (page: Page) =>
  page.evaluate(() => window.__FLIPPER__!.phaserGame().scene.getScene('Game').sys.settings.visible);

const summaryCamera = (page: Page) =>
  page.evaluate(() => {
    const camera = window.__FLIPPER__!.phaserGame().scene.getScene('Summary').cameras.main;
    return { transparent: camera.transparent, alpha: camera.alpha };
  });

test('while the summary is open the Game scene is hidden and the camera has no background', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  expect(await gameVisible(page)).toBe(true);
  await playToSummary(page);
  expect(await gameVisible(page)).toBe(false);
  expect((await summaryCamera(page)).transparent).toBe(true);

  const at = await playAgainPoint(page);
  await page.mouse.click(at.x, at.y);
  await expectBackInGame(page);
  expect(await gameVisible(page)).toBe(true);
  expect(errors).toEqual([]);
});

test('Play again with Enter shows the Game scene again', async ({ page }) => {
  await openGame(page, '?seed=7');
  await playToSummary(page);
  await page.keyboard.press('Enter');
  await expectBackInGame(page);
  expect(await gameVisible(page)).toBe(true);
});

test('the Title button leaves a visible Game scene behind for the next round', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  await playToSummary(page);
  const { title } = SUMMARY_LAYOUT;
  const at = await gamePoint(page, title.x, title.y);
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => activeScenes(page)).toEqual(['Title']);
  await page.evaluate(() => window.__FLIPPER__!.startScene('Game'));
  await expect.poll(() => activeScenes(page)).toEqual(['Game']);
  expect(await gameVisible(page)).toBe(true);
  expect(errors).toEqual([]);
});
