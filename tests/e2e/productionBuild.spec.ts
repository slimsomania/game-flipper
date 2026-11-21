import { expect, test } from '@playwright/test';
import { TITLE_LAYOUT } from '../../src/game/view/titleLayout';
import { gameState, openTitle, settleInput, visibleTexts } from './helpers';
import { gamePoint } from './mouseHelpers';
import { activeScenes } from './roundHelpers';

/*
 * The build players get: `vite build` output served by `vite preview` (second web server of
 * playwright.config.ts, port 5197). `npm run verify` runs this as part of `npm run test:e2e`.
 */

test.use({ baseURL: 'http://localhost:5197' });

test('without URL flags the page is just the game: no hooks, no panel, no errors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  // Let the boot finish (title scene) before asserting that nothing appeared.
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.__FLIPPER__)).toBeUndefined();
  await page.keyboard.press('Backquote');
  await page.waitForTimeout(300);
  expect(await page.locator('#tuning-panel').count()).toBe(0);
  expect(errors).toEqual([]);
});

test('with ?testhooks: Title shows, Play starts a round, and a Space throw reaches an outcome', async ({
  page,
}) => {
  const errors = await openTitle(page, '?testhooks&seed=7');
  expect(await page.evaluate(() => window.__FLIPPER__!.info().dev)).toBe(false);
  expect(await page.evaluate(() => window.__FLIPPER__!.activeScenes())).toEqual(['Title']);
  expect(await visibleTexts(page)).toContain('Play');

  const at = await gamePoint(page, TITLE_LAYOUT.play.x, TITLE_LAYOUT.play.y);
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => activeScenes(page)).toEqual(['Game']);
  await settleInput(page);
  expect(await gameState(page)).toMatchObject({ phase: 'aiming', throwNumber: 1, outcome: null });

  await page.keyboard.press('Space');
  await expect.poll(async () => (await gameState(page)).phase).toBe('flying');
  await expect
    .poll(async () => (await gameState(page)).outcome, { timeout: 15_000 })
    .not.toBeNull();
  expect((await gameState(page)).throws).toBe(1);
  expect(errors).toEqual([]);
});
