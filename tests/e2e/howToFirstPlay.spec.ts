import { expect, test, type Page } from '@playwright/test';
import { TITLE_LAYOUT } from '../../src/game/view/titleLayout';
import { gameState, openTitle, powerOf, settleInput } from './helpers';
import { bottleCenter, gamePoint, press } from './mouseHelpers';
import { clickQuit, clickRestart, pauseWith } from './pauseHelpers';
import { activeScenes } from './roundHelpers';
import { playToSummary, playAgainPoint } from './summaryHelpers';

/*
 * F056: the How to play card opens by itself at the first Play in this browser, once. It opens over
 * throw 1 (the Game scene, paused) and the save is marked as seen as it opens.
 */

const SAVE_KEY = 'flipper.save.v1';
const isOpen = (page: Page) => page.evaluate(() => window.__FLIPPER__!.howToOpen());
const expectOpen = (page: Page, open: boolean) =>
  expect.poll(() => isOpen(page), { message: `card open: ${open}` }).toBe(open);
const saved = (page: Page) =>
  page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? 'null'), SAVE_KEY);

/** Play on the Title by a click, then wait for the Game scene. */
async function clickPlay(page: Page): Promise<void> {
  const at = await gamePoint(page, TITLE_LAYOUT.play.x, TITLE_LAYOUT.play.y);
  await page.mouse.click(at.x, at.y);
  await page.waitForFunction(() => window.__FLIPPER__!.state() !== null);
}

async function expectThrowOne(page: Page): Promise<void> {
  const state = await gameState(page);
  expect(state.throwNumber).toBe(1);
  expect(state.phase).toBe('aiming');
}

/** Quit to the title through the Pause overlay, then Play again by a click. */
async function quitAndPlay(page: Page): Promise<void> {
  await pauseWith(page);
  await clickQuit(page);
  await expect.poll(() => activeScenes(page)).toEqual(['Title']);
  await clickPlay(page);
  await settleInput(page);
}

test('the first Play opens the card over throw 1, which waits; closing leaves it ready', async ({
  page,
}) => {
  const errors = await openTitle(page, '?seed=7', true);
  expect(await saved(page)).toBeNull();
  await clickPlay(page);
  await expectOpen(page, true);
  await expectThrowOne(page);
  expect((await saved(page)).seenHowTo).toBe(true);

  const before = await gameState(page);
  await page.keyboard.down('Space');
  await page.keyboard.down('ArrowUp');
  const at = await bottleCenter(page);
  await press(page, { x: at.x + 20, y: at.y }, false);
  await page.mouse.move(at.x + 120, at.y - 80);
  await page.waitForTimeout(300);
  await page.mouse.up();
  await page.keyboard.up('Space');
  await page.keyboard.up('ArrowUp');
  await expectOpen(page, true);
  const during = await gameState(page);
  expect(during.tick).toBe(before.tick);
  expect(during.power).toBe(before.power);
  expect(during.throwNumber).toBe(1);
  expect(during.phase).toBe('aiming');

  await page.keyboard.press('Escape');
  await expectOpen(page, false);
  await expectThrowOne(page);
  await page.keyboard.down('Space');
  await expect.poll(() => powerOf(page)).toBeGreaterThan(0);
  await page.keyboard.up('Space');
  await expect.poll(async () => (await gameState(page)).phase).not.toBe('aiming');
  expect(errors).toEqual([]);
});

test('after a reload Play opens no card; neither do Restart, Quit then Play, Play again', async ({
  page,
}) => {
  const errors = await openTitle(page, '?seed=7', true);
  await clickPlay(page);
  await expectOpen(page, true);
  await page.reload();
  await page.waitForFunction(() => window.__FLIPPER__?.ready === true);
  await clickPlay(page);
  await settleInput(page);
  await expectOpen(page, false);
  await expectThrowOne(page);

  await pauseWith(page);
  await clickRestart(page);
  await settleInput(page);
  await expectOpen(page, false);

  await quitAndPlay(page);
  await expectOpen(page, false);

  await playToSummary(page);
  const again = await playAgainPoint(page);
  await page.mouse.click(again.x, again.y);
  await settleInput(page);
  await expectOpen(page, false);
  expect(errors).toEqual([]);
});

test('with storage whose setItem throws, the card opens once per visit', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    };
  });
  await openTitle(page, '?seed=7', true);
  await clickPlay(page);
  await expectOpen(page, true);
  await page.keyboard.press('Escape');
  await expectOpen(page, false);
  await quitAndPlay(page);
  await expectOpen(page, false);
});

test('with no usable storage, the card opens once per visit', async ({ page }) => {
  await page.addInitScript(() => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    Storage.prototype.getItem = blocked;
    Storage.prototype.setItem = blocked;
    Storage.prototype.removeItem = blocked;
  });
  await openTitle(page, '?seed=7', true);
  await clickPlay(page);
  await expectOpen(page, true);
  await page.keyboard.press('Escape');
  await expectOpen(page, false);
  await quitAndPlay(page);
  await expectOpen(page, false);
});

test('the start hook never opens it', async ({ page }) => {
  await openTitle(page, '?seed=7', true);
  await page.evaluate(() => window.__FLIPPER__!.startScene('Game'));
  await page.waitForFunction(() => window.__FLIPPER__!.state() !== null);
  await settleInput(page);
  await expectOpen(page, false);
  expect(await saved(page)).toBeNull();
});
