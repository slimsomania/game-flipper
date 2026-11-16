import { expect, test } from '@playwright/test';
import { HAND_X, HAND_Y } from '../../src/core/bottle';
import { BOTTLE_HEIGHT } from '../../src/core/bottleShape';
import { Simulation } from '../../src/core/simulation';
import { TABLE_LEFT_X, TABLE_RIGHT_X, TABLE_TOP_Y } from '../../src/core/table';
import { gameState, openGame, stepFrames } from './helpers';

test('the game starts in the aiming phase with no throw recorded', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');

  const state = await gameState(page);
  expect(state.phase).toBe('aiming');
  expect(state.lastThrow).toBeNull();
  expect(errors).toEqual([]);
});

test('throwBottle(50) launches the bottle: it rises above its start, then comes down onto the table', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => {
    window.__FLIPPER__!.pause();
    window.__FLIPPER__!.setWater(0.5);
  });
  const before = await gameState(page);
  expect([before.bottle.x, before.bottle.y]).toEqual([HAND_X, HAND_Y]);

  const thrown = await page.evaluate(() => window.__FLIPPER__!.throwBottle(50));
  expect(thrown?.phase).toBe('flying');
  expect(thrown?.lastThrow).toEqual({ power: 50, water: 0.5, source: 'keyboard' });
  expect(thrown!.bottle.vy).toBeLessThan(0);
  expect(thrown!.bottle.vx).toBeGreaterThan(0);
  expect(thrown!.bottle.omega).toBeGreaterThan(0);

  // Step through the flight one frame at a time and track the highest point.
  const apex = await page.evaluate(() => {
    let highest = Infinity;
    for (let i = 0; i < 240; i++)
      highest = Math.min(highest, window.__FLIPPER__!.step(1)!.bottle.y);
    return highest;
  });
  expect(apex).toBeLessThan(HAND_Y - 1); // it rose well above where it started

  const landed = await stepFrames(page, 240);
  expect(landed.phase).toBe('flying'); // the 'result' phase is a later feature (F005)
  expect(landed.outcome).not.toBeNull(); // but the landing is judged (see outcome.spec.ts)
  expect(landed.lastThrow?.power).toBe(50);
  expect(landed.bottle.angle).toBeGreaterThan(Math.PI / 2); // it turned over in the air
  // It is down on the table, between its ends, not below the top and not hanging in the air.
  expect(landed.bottle.x).toBeGreaterThan(TABLE_LEFT_X);
  expect(landed.bottle.x).toBeLessThan(TABLE_RIGHT_X);
  expect(landed.bottle.y).toBeLessThanOrEqual(TABLE_TOP_Y);
  expect(landed.bottle.y).toBeGreaterThan(TABLE_TOP_Y - BOTTLE_HEIGHT);
  expect(Math.hypot(landed.bottle.vx, landed.bottle.vy)).toBeLessThan(0.5);
  expect(errors).toEqual([]);
});

test('throwBottle clamps power to 0-100 and only throws while aiming', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());

  const first = await page.evaluate(() => window.__FLIPPER__!.throwBottle(250));
  expect(first?.lastThrow?.power).toBe(100);

  // A second throw in flight changes nothing.
  await stepFrames(page, 10);
  const mid = await gameState(page);
  const second = await page.evaluate(() => window.__FLIPPER__!.throwBottle(20));
  expect(second).toEqual(mid);
  expect(second?.lastThrow?.power).toBe(100);
  expect(errors).toEqual([]);
});

test('the browser flight is the same as the core simulation for the same seed and power', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=11');
  // The real-time clock may have stepped the held bottle a few times before the pause took
  // effect, so note how many steps passed before the throw and repeat them in core.
  const heldSteps = await page.evaluate(() => {
    window.__FLIPPER__!.pause();
    const tick = window.__FLIPPER__!.state()!.tick;
    window.__FLIPPER__!.throwBottle(64);
    return tick;
  });
  const inBrowser = await stepFrames(page, 300);

  const sim = new Simulation({ seed: 11 });
  for (let i = 0; i < heldSteps; i++) sim.step();
  sim.throwBottle(64);
  for (let i = 0; i < 300; i++) sim.step();

  // JSON round trip so that -0 and 0 compare equal on both sides.
  const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
  expect(plain(inBrowser)).toEqual(plain(sim.snapshot()));
  expect(inBrowser.tick).toBe(heldSteps + 300);
  expect(errors).toEqual([]);
});
