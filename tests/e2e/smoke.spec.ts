import { expect, test } from '@playwright/test';
import { GAME_HEIGHT, GAME_WIDTH } from '../../src/core/constants';
import { TABLE_LEFT_X, TABLE_RIGHT_X, TABLE_TOP_Y } from '../../src/core/table';
import { gameState, openGame, stepFrames } from './helpers';

test('boots straight into the Game scene without errors', async ({ page }) => {
  const errors = await openGame(page);
  await expect(page.locator('canvas')).toBeVisible();

  const scenes = await page.evaluate(() => window.__FLIPPER__!.activeScenes());
  expect(scenes).toContain('Game');
  expect(scenes).not.toContain('Menu');
  expect(errors).toEqual([]);
});

test('the landscape 1280×720 canvas fills the desktop viewport', async ({ page }) => {
  const errors = await openGame(page);

  expect(GAME_WIDTH).toBe(1280);
  expect(GAME_HEIGHT).toBe(720);
  expect(page.viewportSize()).toEqual({ width: 1280, height: 720 });
  const box = await page.locator('canvas').boundingBox();
  expect(box).not.toBeNull();
  expect(Math.round(box!.width)).toBe(1280);
  expect(Math.round(box!.height)).toBe(720);
  expect(errors).toEqual([]);
});

// F002 replaced the placeholder drop (the bottle falling onto the table and settling) with a
// bottle held in the hand, so this checks that the bottle now waits instead of falling.
test('the bottle waits in the hand above the table instead of dropping', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');

  const start = await gameState(page);
  const end = await stepFrames(page, 600); // 10 simulated seconds

  expect(end.seed).toBe(7);
  expect(end.tick).toBeGreaterThan(start.tick);
  expect(end.bottle.y).toBe(start.bottle.y); // has not fallen
  expect(end.bottle.y).toBeLessThan(TABLE_TOP_Y); // still above the table top
  expect(end.bottle.x).toBeGreaterThan(TABLE_LEFT_X);
  expect(end.bottle.x).toBeLessThan(TABLE_RIGHT_X);
  expect(end.bottle.angle).toBe(0);
  expect(Math.hypot(end.bottle.vx, end.bottle.vy)).toBe(0);
  expect(errors).toEqual([]);
});
