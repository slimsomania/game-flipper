import { expect, test, type Page } from '@playwright/test';
import { COLORS } from '../../src/game/theme';
import { PAGE_FLASH_ID } from '../../src/game/view/pageFlash';
import { FLIPPED, SIDE, type PlacedPose } from '../shared';
import { openGame, stepFrames, stepUntilOutcome, visibleFlash } from './helpers';

/** The page flash around the canvas: shown or not, its box against the canvas box, its shadow. */
async function pageFlash(page: Page) {
  return page.evaluate((id) => {
    const element = document.getElementById(id);
    if (!element) return null;
    const box = element.getBoundingClientRect();
    const canvas = document.querySelector('canvas')!.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      shown: style.display !== 'none',
      overCanvas:
        Math.abs(box.left - canvas.left) < 1 &&
        Math.abs(box.top - canvas.top) < 1 &&
        Math.abs(box.width - canvas.width) < 1 &&
        Math.abs(box.height - canvas.height) < 1,
      shadow: style.boxShadow,
    };
  }, PAGE_FLASH_ID);
}

function rgb(color: number): string {
  return `rgba(${(color >> 16) & 0xff}, ${(color >> 8) & 0xff}, ${color & 0xff}`;
}

async function land(page: Page, pose: PlacedPose) {
  await page.evaluate(() => window.__FLIPPER__!.pause());
  await page.evaluate((p) => window.__FLIPPER__!.placeBottle(p), pose);
  return stepUntilOutcome(page);
}

for (const [name, pose, color] of [
  ['success', FLIPPED, COLORS.successFlash],
  ['fail', SIDE, COLORS.failFlash],
] as const) {
  test(`the ${name} flash also tints the page around the canvas, and fades with it`, async ({
    page,
  }) => {
    const errors = await openGame(page, '?seed=7');
    expect((await pageFlash(page))?.shown).toBe(false);

    await land(page, pose);
    expect((await visibleFlash(page))?.color).toBe(color);
    const shown = await pageFlash(page);
    expect(shown).toMatchObject({ shown: true, overCanvas: true });
    expect(shown!.shadow).toContain(rgb(color));

    // Half a second on, both flashes are gone.
    await stepFrames(page, 40);
    expect(await visibleFlash(page)).toBeNull();
    expect((await pageFlash(page))?.shown).toBe(false);
    expect(errors).toEqual([]);
  });
}
