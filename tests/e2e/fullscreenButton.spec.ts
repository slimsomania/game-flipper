import { expect, test, type Page } from '@playwright/test';
import { MUTE_BUTTON } from '../../src/game/view/muteLayout';
import {
  buttonNamed,
  cardOpen,
  clickFullscreenButton,
  clickGame,
  enterFullscreenOutside,
  expectIcon,
  fsCalls,
  fsOnRoot,
  leaveFullscreenOutside,
  roundState,
  stubFullscreen,
} from './fullscreenHelpers';
import { openGame, openTitle, gameState } from './helpers';
import { LANDS, throwAndLand } from './muteHelpers';
import { pauseWith } from './pauseHelpers';
import { playToSummary } from './summaryHelpers';

// F046: the fullscreen button and the F key on every screen, with the browser's API stubbed.

type Screen = { name: string; open: (page: Page) => Promise<string[]> };

const SCREENS: Screen[] = [
  { name: 'Title', open: (page) => openTitle(page, '?seed=7') },
  { name: 'Play', open: (page) => openGame(page, '?seed=7') },
  {
    name: 'Pause overlay',
    open: async (page) => {
      const errors = await openGame(page, '?seed=7');
      await pauseWith(page);
      return errors;
    },
  },
  {
    name: 'Round summary',
    open: async (page) => {
      const errors = await openGame(page, '?seed=7');
      await playToSummary(page);
      return errors;
    },
  },
];

/** What the screen is doing, to compare before and after (the sim's round, or the scenes on the Title). */
async function whereWeAre(page: Page) {
  const scenes = await page.evaluate(() => window.__FLIPPER__!.activeScenes());
  const hasSim = await page.evaluate(() => window.__FLIPPER__!.state() !== null);
  return { scenes, round: hasSim ? await roundState(page) : null };
}

for (const screen of SCREENS) {
  test.describe(screen.name, () => {
    test('a click enters fullscreen, a second click leaves it, and nothing else happens', async ({
      page,
    }) => {
      await stubFullscreen(page, 'ok');
      const errors = await screen.open(page);
      const before = await whereWeAre(page);

      await clickFullscreenButton(page);
      await expectIcon(page, true);
      expect(await fsCalls(page)).toEqual({ req: 1, exit: 0 });
      expect(await fsOnRoot(page)).toEqual([true]);
      expect(await whereWeAre(page)).toEqual(before);

      await clickFullscreenButton(page);
      await expectIcon(page, false);
      expect(await fsCalls(page)).toEqual({ req: 1, exit: 1 });
      expect(await whereWeAre(page)).toEqual(before);
      expect(errors).toEqual([]);
    });

    test('F does the same and changes nothing else', async ({ page }) => {
      await stubFullscreen(page, 'ok');
      await screen.open(page);
      const before = await whereWeAre(page);
      await page.keyboard.press('f');
      await expectIcon(page, true);
      expect(await fsCalls(page)).toEqual({ req: 1, exit: 0 });
      expect(await fsOnRoot(page)).toEqual([true]);
      await page.keyboard.press('f');
      await expectIcon(page, false);
      expect(await fsCalls(page)).toEqual({ req: 1, exit: 1 });
      expect(await whereWeAre(page)).toEqual(before);
    });

    test('leaving fullscreen outside the game updates the icon, and the next click enters again', async ({
      page,
    }) => {
      await stubFullscreen(page, 'ok');
      await screen.open(page);
      await clickFullscreenButton(page);
      await expectIcon(page, true);
      await leaveFullscreenOutside(page); // as Esc or F11 do
      await expectIcon(page, false);
      await clickFullscreenButton(page);
      await expectIcon(page, true);
      expect(await fsCalls(page)).toEqual({ req: 2, exit: 0 });
      await leaveFullscreenOutside(page);
      await enterFullscreenOutside(page); // entered another way: the icon follows
      await expectIcon(page, true);
    });

    test('where the browser has no page fullscreen, the button opens the home-screen card', async ({
      page,
    }) => {
      await stubFullscreen(page, 'unsupported');
      const errors = await screen.open(page);
      const before = await whereWeAre(page);
      expect(await cardOpen(page)).toBe(false);

      await clickFullscreenButton(page);
      await expect.poll(() => cardOpen(page)).toBe(true);
      const texts = (await page.evaluate(() => window.__FLIPPER__!.texts())).join(' ');
      expect(texts).toContain('Share');
      expect(texts).toContain('Add to Home Screen');
      expect(await whereWeAre(page)).toEqual(before);
      expect(await fsCalls(page)).toEqual({ req: 0, exit: 0 });

      // Close button
      const close = await buttonNamed(page, 'homeCardClose');
      await clickGame(page, close);
      await expect.poll(() => cardOpen(page)).toBe(false);
      expect(await whereWeAre(page)).toEqual(before);

      // A click outside the card closes it and presses nothing under it (here: the speaker).
      await clickFullscreenButton(page);
      await expect.poll(() => cardOpen(page)).toBe(true);
      const mutedBefore = await page.evaluate(() => window.__FLIPPER__!.muted());
      await clickGame(page, MUTE_BUTTON);
      await expect.poll(() => cardOpen(page)).toBe(false);
      expect(await page.evaluate(() => window.__FLIPPER__!.muted())).toBe(mutedBefore);
      expect(await whereWeAre(page)).toEqual(before);

      // F calls nothing and opens no card.
      await page.keyboard.press('f');
      expect(await cardOpen(page)).toBe(false);
      expect(await fsCalls(page)).toEqual({ req: 0, exit: 0 });
      expect(errors).toEqual([]);
    });
  });
}

test('a click outside the card does not skip the wait of a result', async ({ page }) => {
  await stubFullscreen(page, 'unsupported');
  await openGame(page, '?seed=7');
  await throwAndLand(page, LANDS);
  expect((await gameState(page)).phase).toBe('result');
  await clickFullscreenButton(page);
  await expect.poll(() => cardOpen(page)).toBe(true);
  await clickGame(page, { x: 100, y: 650 });
  await expect.poll(() => cardOpen(page)).toBe(false);
  expect((await gameState(page)).phase).toBe('result');
});

test('while the card is open, Space, Up, the wheel and R change nothing', async ({ page }) => {
  await stubFullscreen(page, 'unsupported');
  await openGame(page, '?seed=7');
  const before = await roundState(page);
  await clickFullscreenButton(page);
  await expect.poll(() => cardOpen(page)).toBe(true);
  await page.keyboard.press('Space');
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowUp');
  await page.mouse.move(640, 360);
  await page.mouse.wheel(0, -200);
  await page.keyboard.press('r');
  await page.waitForTimeout(100);
  expect(await roundState(page)).toEqual(before);
  expect(await cardOpen(page)).toBe(true);
  await clickGame(page, await buttonNamed(page, 'homeCardClose'));
  await expect.poll(() => cardOpen(page)).toBe(false);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await gameState(page)).phase).not.toBe('aiming');
});

test('a rejected requestFullscreen leaves the game working and logs no error', async ({ page }) => {
  await stubFullscreen(page, 'reject');
  const errors = await openGame(page, '?seed=7');
  await clickFullscreenButton(page);
  await page.keyboard.press('f');
  expect((await fsCalls(page)).req).toBe(2);
  await expectIcon(page, false);
  await page.keyboard.press('Space'); // still playing
  await expect.poll(async () => (await gameState(page)).phase).not.toBe('aiming');
  expect(errors).toEqual([]);
});
