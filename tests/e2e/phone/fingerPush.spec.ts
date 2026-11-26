import { expect, test } from '@playwright/test';
import { gameState, openGame } from '../helpers';
import { bottleCenterOnPage, dragTouchInPage } from './touchHelpers';

// F045: the finger's own push numbers through the real page and its scale. The reference phone is
// 740x360 CSS px at 0.5 CSS px per game px, and about 5.5 CSS px per mm of screen (a typical
// 6-inch phone), so 2 mm is 11 CSS px and 60 mm is 330 CSS px. The events carry virtual time stamps.

const CSS_PX_PER_MM = 5.5;

// F048: 2 mm is within the tap limit. Quick, it is a tap (a throw at the bar's power, not a push);
// slow, it is neither and throws nothing.
test('a quick 2 mm movement is a tap, not a push; a slow one throws nothing', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());
  const at = await bottleCenterOnPage(page);
  await dragTouchInPage(page, { at, rise: 2 * CSS_PX_PER_MM, ms: 600, end: 'release' });
  let state = await gameState(page);
  expect(state.dragging).toBe(false);
  expect(state.phase).toBe('aiming');
  expect(state.lastThrow).toBeNull();

  await dragTouchInPage(page, { at, rise: 2 * CSS_PX_PER_MM, ms: 150, end: 'release' });
  state = await gameState(page);
  expect(state.phase).toBe('flying');
  expect(state.lastThrow).toMatchObject({ source: 'tap', power: 50 });
  expect(errors).toEqual([]);
});

test('a 60 mm push over 150 ms throws power 100, with source touch', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());
  const at = await bottleCenterOnPage(page);
  await dragTouchInPage(page, { at, rise: 60 * CSS_PX_PER_MM, ms: 150, end: 'release' });
  const state = await gameState(page);
  expect(state.phase).toBe('flying');
  expect(state.lastThrow).toMatchObject({ power: 100, source: 'touch' });
  expect(errors).toEqual([]);
});
