import { expect, test } from '@playwright/test';
import { openGame } from './helpers';

// F044: on a desktop (a fine pointer) Backquote works and there is no touch button.
test('desktop has no tuning button; Backquote still opens the panel', async ({ page }) => {
  await openGame(page, '?debug');
  expect(await page.locator('#tuning-toggle').count()).toBe(0);
  await page.keyboard.press('Backquote');
  await expect(page.locator('#tuning-panel')).toBeVisible();
});
