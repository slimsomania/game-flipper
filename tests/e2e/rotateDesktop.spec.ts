import { expect, test } from '@playwright/test';
import { openTitle } from './helpers';

// F041: a desktop window taller than wide shows no message and letterboxes as before.
test('a 600x900 desktop window shows no rotate message', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  const errors = await openTitle(page, '?seed=7');
  expect(await page.evaluate(() => window.__FLIPPER__!.rotateMessage())).toBe(false);
  await expect(page.getByText('Turn your phone sideways')).toBeHidden();
  expect(errors).toEqual([]);
});
