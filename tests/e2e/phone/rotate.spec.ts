import { expect, test, type Page } from '@playwright/test';
import { PHONE_VIEWPORT, PORTRAIT_VIEWPORT } from '../phoneDevice';
import { gameState, openGame, openTitle, stepUntilOutcome } from '../helpers';
import { playToSummary } from '../summaryHelpers';
import { clickResume, expectPaused, runClock } from '../pauseHelpers';

// F041: held upright, a phone shows "Turn your phone sideways"; a round under way is paused.

const upright = (page: Page) => page.setViewportSize(PORTRAIT_VIEWPORT);
const sideways = (page: Page) => page.setViewportSize(PHONE_VIEWPORT);
const shows = (page: Page, value: boolean) =>
  expect.poll(() => page.evaluate(() => window.__FLIPPER__!.rotateMessage())).toBe(value);

test('turning upright shows the message over the canvas, turning back hides it', async ({
  page,
}) => {
  const errors = await openTitle(page, '?seed=7');
  await shows(page, false);
  await upright(page);
  await shows(page, true);
  const text = page.getByText('Turn your phone sideways');
  await expect(text).toBeVisible();
  const covered = await page.evaluate(() => {
    // The canvas may still be sized for the old window for a frame, so test against the viewport.
    const canvas = document.querySelector('canvas')!.getBoundingClientRect();
    const box = document.getElementById('rotate-message')!.getBoundingClientRect();
    const x = Math.min(canvas.left + canvas.width / 2, window.innerWidth - 1);
    const top = document.elementFromPoint(x, canvas.top + 10);
    return (
      box.left <= 0 &&
      box.top <= 0 &&
      box.right >= window.innerWidth &&
      box.bottom >= window.innerHeight &&
      !!top?.closest('#rotate-message')
    );
  });
  expect(covered).toBe(true);
  await sideways(page);
  await shows(page, false);
  await expect(text).toBeHidden();
  expect(errors).toEqual([]);
});

test('turning upright mid-flight pauses; Resume carries the same flight to an outcome', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => {
    const hooks = window.__FLIPPER__!;
    hooks.pause();
    hooks.setWater(0.5);
    hooks.throwBottle(70);
    hooks.step(20);
  });
  await runClock(page);
  await upright(page);
  await shows(page, true);
  await expectPaused(page, true);
  const frozen = await gameState(page);
  await page.waitForTimeout(500);
  expect(await gameState(page)).toEqual(frozen);
  await sideways(page);
  await shows(page, false);
  await expectPaused(page, true);
  await expect.poll(() => page.evaluate(() => window.__FLIPPER__!.texts())).toContain('Paused');
  await clickResume(page);
  await expectPaused(page, false);
  expect((await gameState(page))?.phase).toBe('flying');
  expect((await stepUntilOutcome(page)).outcome).not.toBeNull();
  expect(errors).toEqual([]);
});

test('on the Title, turning upright and back changes only the message', async ({ page }) => {
  await openTitle(page, '?seed=7');
  await upright(page);
  await shows(page, true);
  await sideways(page);
  await shows(page, false);
  expect(await page.evaluate(() => window.__FLIPPER__!.activeScenes())).toEqual(['Title']);
  expect(await page.evaluate(() => window.__FLIPPER__!.gamePaused())).toBe(false);
});

test('on the summary, turning upright and back changes only the message', async ({ page }) => {
  await openGame(page, '?seed=7');
  await playToSummary(page);
  const texts = await page.evaluate(() => window.__FLIPPER__!.texts());
  await upright(page);
  await shows(page, true);
  await sideways(page);
  await shows(page, false);
  expect(await page.evaluate(() => window.__FLIPPER__!.activeScenes())).toEqual(['Summary']);
  expect(await page.evaluate(() => window.__FLIPPER__!.gamePaused())).toBe(false);
  expect(await page.evaluate(() => window.__FLIPPER__!.texts())).toEqual(texts);
});

test('a page opened upright shows the message at once, then the Title when turned', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: PORTRAIT_VIEWPORT,
    screen: PORTRAIT_VIEWPORT,
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3,
  });
  const page = await context.newPage();
  const errors = await openTitle(page, '?seed=7');
  await shows(page, true);
  await expect(page.getByText('Turn your phone sideways')).toBeVisible();
  await sideways(page);
  await shows(page, false);
  expect(await page.evaluate(() => window.__FLIPPER__!.activeScenes())).toEqual(['Title']);
  expect(errors).toEqual([]);
  await context.close();
});
