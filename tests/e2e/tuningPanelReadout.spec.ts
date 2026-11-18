import { expect, test, type Page } from '@playwright/test';
import { findWindows, sweepPowers, widestWindow } from '../../src/core/flipWindow';
import { DEFAULT_TUNING } from '../../src/core/tuning';
import { waterSequence } from '../shared';
import { gameState, openGame, reloadGame, stepUntilOutcome } from './helpers';

/*
 * What the tuning panel shows about the game and lets the developer pin down: the water lock, the
 * last throw, and the flip window of the bottle in the hand.
 */

const showPanel = async (page: Page): Promise<void> => {
  await page.keyboard.press('Backquote');
  await expect(page.locator('#tuning-panel')).toBeVisible();
};

/** Throw the held bottle at `power`, step to its outcome and bring the next bottle. */
async function throwAndSkip(page: Page, power = 50) {
  await page.evaluate((p) => {
    window.__FLIPPER__!.pause();
    window.__FLIPPER__!.throwBottle(p);
  }, power);
  const decided = await stepUntilOutcome(page);
  await page.evaluate(() => window.__FLIPPER__!.skip());
  return decided;
}

test.describe('the water lock', () => {
  test('with the water locked at 0.5, the next three bottles all have water 0.5', async ({
    page,
  }) => {
    const errors = await openGame(page, '?seed=7');
    await page.evaluate(() => window.__FLIPPER__!.pause());
    await showPanel(page);
    await page.locator('#tuning-water-level').fill('0.5');
    await page.locator('#tuning-water-lock').check();
    await expect.poll(async () => (await gameState(page)).bottle.water).toBe(0.5);

    for (let i = 0; i < 3; i++) {
      const decided = await throwAndSkip(page);
      expect(decided.lastThrow?.water).toBe(0.5);
      expect((await gameState(page)).bottle.water).toBe(0.5);
    }
    expect(errors).toEqual([]);
  });

  test('without the lock the water follows the seed, and unlocking goes back to it', async ({
    page,
  }) => {
    await openGame(page, '?seed=7');
    await page.evaluate(() => window.__FLIPPER__!.pause());
    const sequence = waterSequence(7, 8);
    expect((await gameState(page)).bottle.water).toBe(sequence[0]);

    await showPanel(page);
    await page.locator('#tuning-water-level').fill('0.5');
    await page.locator('#tuning-water-lock').check();
    await throwAndSkip(page); // the bottle after it is locked (draw 1)
    await page.locator('#tuning-water-lock').uncheck();
    await expect(page.locator('#tuning-water-lock')).not.toBeChecked();
    await throwAndSkip(page); // draw 2: the seed's own sequence again
    expect((await gameState(page)).bottle.water).toBe(sequence[2]);
  });

  test('the lock is kept after a reload, and moving the level moves the lock', async ({ page }) => {
    await openGame(page, '?seed=7');
    await showPanel(page);
    await page.locator('#tuning-water-level').fill('0.3');
    await page.locator('#tuning-water-lock').check();
    await expect.poll(async () => (await gameState(page)).bottle.water).toBe(0.3);
    await page.locator('#tuning-water-level').fill('0.7');
    await expect.poll(async () => (await gameState(page)).bottle.water).toBe(0.7);

    await reloadGame(page);
    expect((await gameState(page)).bottle.water).toBe(0.7);
    await showPanel(page);
    await expect(page.locator('#tuning-water-lock')).toBeChecked();
    await expect(page.locator('#tuning-water-level')).toHaveValue('0.7');
  });

  test('the lockWater hook does what the box does', async ({ page }) => {
    await openGame(page, '?seed=7');
    await showPanel(page);
    expect(await page.evaluate(() => window.__FLIPPER__!.lockWater(0.4))).toBe(0.4);
    await expect(page.locator('#tuning-water-lock')).toBeChecked();
    await expect(page.locator('#tuning-water-level')).toHaveValue('0.4');
    expect((await gameState(page)).bottle.water).toBe(0.4);
    expect(await page.evaluate(() => window.__FLIPPER__!.lockWater(null))).toBeNull();
    await expect(page.locator('#tuning-water-lock')).not.toBeChecked();
  });
});

test('the last throw shows its water, power, outcome and turns, and keeps them after the next bottle comes', async ({
  page,
}) => {
  await openGame(page, '?seed=7');
  await showPanel(page);
  await expect(page.locator('#tuning-last-outcome')).toHaveText('no throw yet');

  await page.evaluate(() => {
    window.__FLIPPER__!.pause();
    window.__FLIPPER__!.setWater(0.5);
    window.__FLIPPER__!.throwBottle(44);
    window.__FLIPPER__!.step(5);
  });
  await expect(page.locator('#tuning-last-outcome')).toHaveText('in the air');

  const decided = await stepUntilOutcome(page);
  const outcome = decided.outcome!;
  await expect(page.locator('#tuning-last-water')).toHaveText('50%');
  await expect(page.locator('#tuning-last-power')).toHaveText('44');
  await expect(page.locator('#tuning-last-outcome')).toHaveText(
    `${outcome.result} (${outcome.reason})`,
  );
  await expect(page.locator('#tuning-last-turns')).toHaveText(String(outcome.turns));

  await page.evaluate(() => window.__FLIPPER__!.skip());
  expect((await gameState(page)).outcome).toBeNull();
  await expect(page.locator('#tuning-last-outcome')).toHaveText(
    `${outcome.result} (${outcome.reason})`,
  );
  await expect(page.locator('#tuning-last-power')).toHaveText('44');
});

test('the flip window button shows the single flip window of the bottle in the hand', async ({
  page,
}) => {
  const water = 0.5;
  const windows = findWindows(sweepPowers(water, DEFAULT_TUNING));
  const single = widestWindow(windows, 1)!;
  const double = widestWindow(windows, 2)!;
  expect(single).not.toBeNull();

  await openGame(page, '?seed=7');
  await page.evaluate((w) => window.__FLIPPER__!.setWater(w), water);
  await showPanel(page);
  await expect(page.locator('#tuning-window')).toHaveText('');

  await page.locator('#tuning-window-button').click();
  const text = page.locator('#tuning-window');
  await expect(text).toContainText('Water 50%');
  await expect(text).toContainText(
    `single flip: power ${single.low} to ${single.high} (center ${single.center}, width ${single.width})`,
  );
  await expect(text).toContainText(`double flip: power ${double.low} to ${double.high}`);

  // The measurement is of the tuning at that moment: an edit clears it instead of leaving it stale.
  await page.locator('#tuning-throwLinearImpulse').fill('11');
  await expect(text).toHaveText('');
});

test('the flip window follows an edited tuning: a stronger spin moves the window', async ({
  page,
}) => {
  await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.setWater(0.5));
  await showPanel(page);
  await page.locator('#tuning-window-button').click();
  const first = await page.locator('#tuning-window').innerText();

  await page.locator('#tuning-throwAngularImpulse').fill('9');
  await page.locator('#tuning-window-button').click();
  const spun = findWindows(sweepPowers(0.5, { ...DEFAULT_TUNING, throwAngularImpulse: 9 }));
  const single = widestWindow(spun, 1);
  const second = await page.locator('#tuning-window').innerText();
  expect(second).not.toBe(first);
  expect(second).toContain(
    single ? `single flip: power ${single.low} to ${single.high}` : 'single flip: none',
  );
});
