import { expect, test, type Page } from '@playwright/test';
import {
  buttonNamed,
  cardOpen,
  enterFullscreenOutside,
  fsCalls,
  fsOnRoot,
  stubFullscreen,
} from '../fullscreenHelpers';
import { gameState, openGame } from '../helpers';
import { gamePoint } from '../mouseHelpers';
import { playAgainPoint, playToSummary } from '../summaryHelpers';
import { bottleCenterOnPage, dragTouchInPage } from './touchHelpers';

// F046 on a phone: a thumb-sized button that doesn't overlap its neighbours, the home-screen card
// where fullscreen is unsupported (iPhone), and Play again asking for fullscreen.

async function tapGame(page: Page, spot: { x: number; y: number }): Promise<void> {
  const at = await gamePoint(page, spot.x, spot.y);
  await page.touchscreen.tap(at.x, at.y);
}

async function cssScale(page: Page): Promise<number> {
  const box = await page.locator('canvas').boundingBox();
  return box!.width / 1280;
}

test('the button is thumb-sized, clear of its neighbours, and a tap asks for fullscreen once', async ({
  page,
}) => {
  await stubFullscreen(page, 'ok');
  await openGame(page, '?seed=7');
  const scale = await cssScale(page);
  const button = await buttonNamed(page, 'fullscreenButton');
  expect(button.width * scale).toBeGreaterThanOrEqual(44);
  expect(button.height * scale).toBeGreaterThanOrEqual(44);
  for (const name of ['muteButton', 'pauseButton']) {
    const other = await buttonNamed(page, name);
    const apart =
      Math.abs(button.x - other.x) >= (button.width + other.width) / 2 ||
      Math.abs(button.y - other.y) >= (button.height + other.height) / 2;
    expect(apart, `overlaps ${name}`).toBe(true);
  }
  await tapGame(page, button);
  await expect.poll(() => fsCalls(page)).toEqual({ req: 1, exit: 0 });
  expect(await fsOnRoot(page)).toEqual([true]);
});

test('a Play again tap asks for fullscreen when the page is not fullscreen', async ({ page }) => {
  await stubFullscreen(page, 'ok');
  await openGame(page, '?seed=7');
  await playToSummary(page);
  expect(await fsCalls(page)).toEqual({ req: 0, exit: 0 });
  const at = await playAgainPoint(page);
  await page.touchscreen.tap(at.x, at.y);
  await expect.poll(() => fsCalls(page)).toEqual({ req: 1, exit: 0 });
  expect(await fsOnRoot(page)).toEqual([true]);
  await expect
    .poll(() => page.evaluate(() => window.__FLIPPER__!.activeScenes()))
    .toEqual(['Game']);
});

test('a Play again tap does not ask when the page is already fullscreen', async ({ page }) => {
  await stubFullscreen(page, 'ok');
  await openGame(page, '?seed=7');
  await playToSummary(page);
  await enterFullscreenOutside(page);
  const at = await playAgainPoint(page);
  await page.touchscreen.tap(at.x, at.y);
  await expect
    .poll(() => page.evaluate(() => window.__FLIPPER__!.activeScenes()))
    .toEqual(['Game']);
  expect(await fsCalls(page)).toEqual({ req: 0, exit: 0 });
});

test('with no fullscreen (iPhone) the card blocks the bottle until it is closed', async ({
  page,
}) => {
  await stubFullscreen(page, 'unsupported');
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());
  const button = await buttonNamed(page, 'fullscreenButton');
  await tapGame(page, button);
  await expect.poll(() => cardOpen(page)).toBe(true);
  expect(await fsCalls(page)).toEqual({ req: 0, exit: 0 });
  const texts = (await page.evaluate(() => window.__FLIPPER__!.texts())).join(' ');
  expect(texts).toContain('Share');
  expect(texts).toContain('Add to Home Screen');

  const close = await buttonNamed(page, 'homeCardClose');
  const scale = await cssScale(page);
  expect(close.width * scale).toBeGreaterThanOrEqual(44);
  expect(close.height * scale).toBeGreaterThanOrEqual(44);

  // A finger push on the bottle throws nothing (the tap outside also closes the card).
  const push = async () =>
    dragTouchInPage(page, {
      at: await bottleCenterOnPage(page),
      rise: 60,
      ms: 100,
      end: 'release',
    });
  await push();
  expect(await gameState(page)).toMatchObject({ phase: 'aiming', lastThrow: null });

  // Open it again and close it with the Close button: then a push throws.
  await tapGame(page, button);
  await expect.poll(() => cardOpen(page)).toBe(true);
  await tapGame(page, close);
  await expect.poll(() => cardOpen(page)).toBe(false);
  await push();
  await expect.poll(async () => (await gameState(page)).lastThrow?.source).toBe('touch');
  expect(errors).toEqual([]);
});

test('opening and closing the home-screen card 5 times leaves no listeners behind', async ({
  page,
}) => {
  await stubFullscreen(page, 'unsupported');
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());
  const listeners = () =>
    page.evaluate(() => {
      const events = window.__FLIPPER__!.phaserGame().scene.getScene('Game').events;
      return { pause: events.listenerCount('pause'), shutdown: events.listenerCount('shutdown') };
    });
  const before = await listeners();
  const button = await buttonNamed(page, 'fullscreenButton');
  for (let i = 0; i < 5; i++) {
    await tapGame(page, button);
    await expect.poll(() => cardOpen(page)).toBe(true);
    await tapGame(page, await buttonNamed(page, 'homeCardClose'));
    await expect.poll(() => cardOpen(page)).toBe(false);
  }
  expect(await listeners()).toEqual(before);

  // A pause and a resume afterwards touch no destroyed button.
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__FLIPPER__!.gamePaused())).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__FLIPPER__!.gamePaused())).toBe(false);
  expect(errors).toEqual([]);
});
