import { expect, test } from '@playwright/test';
import { DEFAULT_TUNING } from '../../src/core/tuning';

/*
 * The tuning panel in a production build. These tests use the second web server of
 * playwright.config.ts (port 5197), which serves the same source with NODE_ENV=production, so
 * import.meta.env.DEV is false there, as in `npm run build`. The panel must be absent for a player
 * and present with ?debug; ?testhooks alone only exposes window.__FLIPPER__.
 */

test.use({ baseURL: 'http://localhost:5197' });

const STORAGE_KEY = 'flipper.debug.tuning';

test('this server really is a production build (the dev flag is off)', async ({ page }) => {
  await page.goto('/?testhooks');
  await page.waitForFunction(() => window.__FLIPPER__?.ready === true);
  expect(await page.evaluate(() => window.__FLIPPER__!.info().dev)).toBe(false);
});

test('a player’s page has no panel: not with no query, and not with ?testhooks', async ({
  page,
}) => {
  for (const query of ['/', '/?testhooks']) {
    await page.goto(query);
    await expect(page.locator('canvas')).toBeVisible();
    expect(await page.locator('#tuning-panel').count()).toBe(0);
    await page.keyboard.press('Backquote');
    expect(await page.locator('#tuning-panel').count()).toBe(0);
  }
});

test('with ?debug the panel is installed, hidden, and Backquote shows it (no test hooks needed)', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/?debug');
  await expect(page.locator('canvas')).toBeVisible();
  expect(await page.evaluate(() => window.__FLIPPER__)).toBeUndefined();

  await expect(page.locator('#tuning-panel')).toBeHidden();
  expect(await page.locator('#tuning-panel').count()).toBe(1);
  await page.keyboard.press('Backquote');
  await expect(page.locator('#tuning-panel')).toBeVisible();
  await expect(page.locator('.tp-row')).toHaveCount(Object.keys(DEFAULT_TUNING).length);
  await page.keyboard.press('Backquote');
  await expect(page.locator('#tuning-panel')).toBeHidden();
  expect(errors).toEqual([]);
});

test('with ?debug an edit is applied and kept; without it the kept edit is ignored', async ({
  page,
}) => {
  await page.goto('/?debug&testhooks');
  await page.waitForFunction(() => window.__FLIPPER__?.ready === true);
  await page.keyboard.press('Backquote');
  await page.locator('#tuning-throwLinearImpulse').fill('12');
  await expect
    .poll(() => page.evaluate(() => window.__FLIPPER__!.tuning().throwLinearImpulse))
    .toBe(12);
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).not.toBeNull();

  await page.reload();
  await page.waitForFunction(() => window.__FLIPPER__?.ready === true);
  expect(await page.evaluate(() => window.__FLIPPER__!.tuning().throwLinearImpulse)).toBe(12);

  // A player's page (no ?debug) on the same origin must not be changed by the leftover.
  await page.goto('/?testhooks');
  await page.waitForFunction(() => window.__FLIPPER__?.ready === true);
  expect(await page.evaluate(() => window.__FLIPPER__!.tuning())).toEqual(DEFAULT_TUNING);
});

test('without ?debug the hooks still edit the tuning in memory, and write nothing to localStorage', async ({
  page,
}) => {
  await page.goto('/?testhooks');
  await page.waitForFunction(() => window.__FLIPPER__?.ready === true);
  const tuning = await page.evaluate(() => window.__FLIPPER__!.setTuningValue('shellDensity', 1.2));
  expect(tuning?.shellDensity).toBe(1.2);
  expect(await page.evaluate(() => window.__FLIPPER__!.tuning().shellDensity)).toBe(1.2);
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
});
