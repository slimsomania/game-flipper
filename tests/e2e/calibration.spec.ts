import { expect, test, type Page } from '@playwright/test';
import { findWindows, sweepPowers, widestWindow } from '../../src/core/flipWindow';
import { COLORS } from '../../src/game/theme';
import { openGame, stepUntilOutcome, visibleFlash, visibleTexts } from './helpers';

/*
 * What the player gets from the calibrated throw (F009). The powers below are not written here:
 * they come from a headless sweep of the same game (`flipWindow.ts`), so retuning inside the
 * design's targets needs no change. The unit tests in tests/unit/calibration.test.ts lock the
 * targets themselves; these tests check that the browser game agrees with them.
 */

const WATER = 0.5;
const TWO_PI = 2 * Math.PI;
const windows = findWindows(sweepPowers(WATER));
const single = widestWindow(windows, 1);
const double = widestWindow(windows, 2);

/** Throw a bottle holding `WATER` at `power` and step to the step that decides its outcome. */
async function throwAt(page: Page, power: number) {
  await page.evaluate(() => window.__FLIPPER__!.pause());
  await page.evaluate((water) => window.__FLIPPER__!.setWater(water), WATER);
  await page.evaluate((p) => window.__FLIPPER__!.throwBottle(p), power);
  return stepUntilOutcome(page);
}

test('the 50% bottle has a single-flip window and a double-flip window above it', () => {
  expect(single).not.toBeNull();
  expect(double).not.toBeNull();
  expect(double!.low).toBeGreaterThan(single!.high);
});

for (const [name, turns, message] of [
  ['single', 1, 'Nailed it! +1'],
  ['double', 2, 'Double! +2'],
] as const) {
  test(`a throw at the center of the 50% bottle's ${name}-flip window shows "${message}"`, async ({
    page,
  }) => {
    const flipWindow = turns === 1 ? single! : double!;
    const power = Math.round(flipWindow.center);
    const errors = await openGame(page, '?seed=7');
    const decided = await throwAt(page, power);

    expect(decided.bottle.water).toBe(WATER);
    expect(decided.outcome).toMatchObject({ result: 'success', reason: 'upright', turns });
    expect(decided.outcome?.points).toBe(turns);
    expect(decided.score).toBe(turns);
    const texts = await visibleTexts(page);
    expect(texts).toContain(message);
    expect(texts).toContain(`Score: ${turns}`);
    expect((await visibleFlash(page))?.color).toBe(COLORS.successFlash);
    expect(errors).toEqual([]);
  });
}

test('10 points below the single-flip window the bottle under-rotates, 10 above it over-rotates', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  const below = await throwAt(page, single!.low - 10);
  expect(below.outcome?.result).toBe('fail');
  expect(below.outcome!.rotation).toBeLessThan(TWO_PI);
  expect(below.score).toBe(0);
  await page.evaluate(() => window.__FLIPPER__!.skip());

  const above = await throwAt(page, single!.high + 10);
  expect(above.outcome!.rotation).toBeGreaterThan(TWO_PI);
  // Over the single window it does not score the single flip's point any more.
  expect(await visibleTexts(page)).not.toContain('Nailed it! +1');
  expect(errors).toEqual([]);
});
