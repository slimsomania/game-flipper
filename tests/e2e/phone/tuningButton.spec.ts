import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_TUNING, type Tuning } from '../../../src/core/tuning';
import { PHONE_VIEWPORT } from '../phoneDevice';
import { openGame } from '../helpers';

// F044: with ?debug on a touch device a corner button opens and closes the tuning panel (there is
// no Backquote on a phone), and the panel is usable at phone size. The production build (port 5197)
// tells "no ?debug" apart: the dev server always installs the panel.

const PROD = 'http://localhost:5197';
const BUTTON = '#tuning-toggle';
const PANEL = '#tuning-panel';
const keys = Object.keys(DEFAULT_TUNING) as (keyof Tuning)[];

async function tap(page: Page, selector: string): Promise<void> {
  const box = (await page.locator(selector).boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

test('with ?debug a tap on the button opens the panel, a field is tapped, changed and applied, the panel scrolls to its last field, a second tap closes it', async ({
  page,
}) => {
  const errors = await openGame(page, '?debug&seed=7');
  await expect(page.locator(BUTTON)).toBeVisible();
  const button = (await page.locator(BUTTON).boundingBox())!;
  expect(button.width).toBeGreaterThanOrEqual(40);
  expect(button.height).toBeGreaterThanOrEqual(40);
  await expect(page.locator(PANEL)).toBeHidden();

  await tap(page, BUTTON);
  await expect(page.locator(PANEL)).toBeVisible();
  // The button stays clear of the panel.
  const panel = (await page.locator(PANEL).boundingBox())!;
  expect(button.x + button.width).toBeLessThanOrEqual(panel.x);

  const first = '#tuning-throwLinearImpulse';
  await page.locator(first).scrollIntoViewIfNeeded();
  await tap(page, first);
  await expect(page.locator(first)).toBeFocused();
  await page.locator(first).fill('12');
  await expect
    .poll(() => page.evaluate(() => window.__FLIPPER__!.tuning().throwLinearImpulse))
    .toBe(12);

  const last = `#tuning-${keys[keys.length - 1]}`;
  await page.locator(last).scrollIntoViewIfNeeded();
  const box = (await page.locator(last).boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(PHONE_VIEWPORT.height);
  expect(await page.locator(PANEL).evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

  await tap(page, BUTTON);
  await expect(page.locator(PANEL)).toBeHidden();
  expect(errors).toEqual([]);
});

test('without ?debug the production build has no button and no panel', async ({ page }) => {
  for (const query of ['/', '/?testhooks']) {
    await page.goto(PROD + query);
    await expect(page.locator('canvas')).toBeVisible();
    expect(await page.locator(BUTTON).count()).toBe(0);
    expect(await page.locator(PANEL).count()).toBe(0);
  }
});

test('with ?debug the production build shows the button', async ({ page }) => {
  await page.goto(`${PROD}/?debug`);
  await expect(page.locator(BUTTON)).toBeVisible();
  await tap(page, BUTTON);
  await expect(page.locator(PANEL)).toBeVisible();
});
