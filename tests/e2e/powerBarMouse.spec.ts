import { expect, test } from '@playwright/test';
import { BAR_BOTTOM, BAR_X } from '../../src/game/view/powerBarLayout';
import { gameState, openGame } from './helpers';
import { bottleCenter, dragInPage, gamePoint } from './mouseHelpers';

// F048: on a desktop the mouse cannot drag the power bar, and a click on the bottle throws nothing.

test('a mouse drag on the power bar changes nothing; a quick click on the bottle throws nothing', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());
  await page.evaluate(() => window.__FLIPPER__!.setPower(37));

  const bar = await gamePoint(page, BAR_X, BAR_BOTTOM - 20);
  await dragInPage(page, { at: bar, rise: 150, ms: 100, end: 'release' });
  let s = await gameState(page);
  expect(s.power).toBe(37);
  expect(s.phase).toBe('aiming');
  expect(s.lastThrow).toBeNull();

  await dragInPage(page, { at: await bottleCenter(page), rise: 0, ms: 60, end: 'release' });
  s = await gameState(page);
  expect(s.phase).toBe('aiming');
  expect(s.lastThrow).toBeNull();
  expect(s.power).toBe(37);

  // The keyboard still sets the power and throws.
  await page.keyboard.press('ArrowUp');
  expect((await gameState(page)).power).toBeGreaterThan(37);
  await page.keyboard.press('Space');
  expect((await gameState(page)).lastThrow).toMatchObject({ source: 'keyboard' });
  expect(errors).toEqual([]);
});
