import { expect, test, type Page } from '@playwright/test';
import { PAGE_DIM_ID } from '../../src/game/view/pageDim';
import { openGame } from './helpers';
import { clickHowTo, expectPaused, pauseWith } from './pauseHelpers';
import { activeScenes } from './roundHelpers';

/*
 * A dialog's veil covers the whole window, not only the canvas: the page element around the canvas
 * (the letterbox bars and the safe area) is dimmed while the pause overlay or How to play is open.
 */

/** The page veil: shown or not, laid over the canvas or not, and the alpha of its tint. */
async function pageDim(page: Page) {
  return page.evaluate((id) => {
    const element = document.getElementById(id);
    if (!element) return null;
    const box = element.getBoundingClientRect();
    const canvas = document.querySelector('canvas')!.getBoundingClientRect();
    const style = getComputedStyle(element);
    const alpha = /rgba\([^)]*,\s*([\d.]+)\)/.exec(style.boxShadow)?.[1];
    return {
      shown: style.display !== 'none',
      overCanvas:
        Math.abs(box.left - canvas.left) < 1 &&
        Math.abs(box.top - canvas.top) < 1 &&
        Math.abs(box.width - canvas.width) < 1 &&
        Math.abs(box.height - canvas.height) < 1,
      alpha: alpha === undefined ? 0 : Number(alpha),
    };
  }, PAGE_DIM_ID);
}

test('the pause overlay and How to play dim the page around the canvas too', async ({ page }) => {
  // A window wider than 16:9, so there are letterbox bars beside the canvas.
  await page.setViewportSize({ width: 1600, height: 720 });
  const errors = await openGame(page, '?seed=7');
  expect((await pageDim(page))?.shown ?? false).toBe(false);

  await pauseWith(page);
  const paused = await pageDim(page);
  expect(paused).toMatchObject({ shown: true, overCanvas: true });

  // How to play over the pause overlay dims once more, inside the canvas and out.
  await clickHowTo(page);
  await expect.poll(() => activeScenes(page)).toEqual(['HowTo']);
  await expect.poll(async () => (await pageDim(page))!.alpha).toBeGreaterThan(paused!.alpha);

  await page.keyboard.press('Escape');
  await expect.poll(() => activeScenes(page)).toEqual(['Pause']);
  await expect.poll(async () => (await pageDim(page))!.alpha).toBeCloseTo(paused!.alpha, 2);

  await page.keyboard.press('Escape');
  await expectPaused(page, false);
  await expect.poll(async () => (await pageDim(page))!.shown).toBe(false);
  expect(errors).toEqual([]);
});
