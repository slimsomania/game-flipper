import { expect, test } from '@playwright/test';
import { gameState, openGame, stepFrames } from './helpers';

test('boots to the menu without errors', async ({ page }) => {
  const errors = await openGame(page);
  await expect(page.locator('canvas')).toBeVisible();
  expect(await page.evaluate(() => window.__FLIPPER__!.activeScenes())).toContain('Menu');
  expect(errors).toEqual([]);
});

test('SPACE starts the game; the placeholder bottle falls onto the table and settles', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__FLIPPER__!.activeScenes().includes('Game'));

  const start = await gameState(page);
  const end = await stepFrames(page, 600); // 10 simulated seconds

  expect(end.seed).toBe(7);
  expect(end.tick).toBeGreaterThan(start.tick);
  expect(end.bottle.y).toBeGreaterThan(start.bottle.y);
  expect(Math.hypot(end.bottle.vx, end.bottle.vy)).toBeLessThan(0.01);
  expect(errors).toEqual([]);
});
