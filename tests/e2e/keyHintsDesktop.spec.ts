import { expect, test } from '@playwright/test';
import { openGame, openTitle, visibleTexts } from './helpers';
import { playToSummary } from './summaryHelpers';

// F043: with a fine pointer (the desktop project) the keyboard and mouse hints stay.

test('Title keeps its keyboard and mouse hints', async ({ page }) => {
  await openTitle(page, '?seed=7');
  const texts = await visibleTexts(page);
  expect(texts.some((t) => /Space: throw/.test(t) && /wheel/.test(t))).toBe(true);
  expect(texts).toContain('or press Enter or Space');
});

test('Pause keeps its key hint', async ({ page }) => {
  await openGame(page, '?seed=7');
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__FLIPPER__!.gamePaused())).toBe(true);
  expect(await visibleTexts(page)).toContain('Esc or P to resume');
});

test('Summary keeps its key hint', async ({ page }) => {
  await openGame(page, '?seed=7');
  await playToSummary(page);
  expect(await visibleTexts(page)).toContain('or press Enter or Space');
});
