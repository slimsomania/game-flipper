import { expect, test } from '@playwright/test';
import { BOTTLE_BODY_WIDTH } from '../../src/core/bottleShape';
import { TABLE_CENTER_X, TABLE_RIGHT_X, TABLE_TOP_Y } from '../../src/core/table';
import { gameState, openGame, stepFrames, stepUntilOutcome } from './helpers';

const HALF_WIDTH = BOTTLE_BODY_WIDTH / 2;

test('a bottle placed upright just above the table is judged a success once it stood still for half a second', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());
  expect((await gameState(page)).outcome).toBeNull();

  const placed = await page.evaluate(
    // One turn is credited: an upright landing needs a full turn to succeed (see flipRule.spec.ts).
    ([x, y]) => window.__FLIPPER__!.placeBottle({ x, y, angle: 0, turns: 1 }),
    [TABLE_CENTER_X, TABLE_TOP_Y - 0.05],
  );
  expect(placed?.phase).toBe('flying');
  expect(placed?.outcome).toBeNull();

  // Not decided while it is still settling...
  const early = await stepFrames(page, 25);
  expect(early.outcome).toBeNull();
  // ...and judged once it has stood still for half a second (30 steps), within 90 frames of the start.
  const done = await stepUntilOutcome(page, 120);
  expect(done.tick - placed!.tick).toBeGreaterThan(30);
  expect(done.tick - placed!.tick).toBeLessThanOrEqual(90);
  expect(done.phase).toBe('result');
  expect(done.outcome).toMatchObject({
    result: 'success',
    reason: 'upright',
    turns: 1,
    points: 1,
  });
  expect(done.score).toBe(1);
  expect(errors).toEqual([]);
});

test('a bottle placed on its side is judged a fail', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());

  const side = await page.evaluate(
    ([x, y]) => window.__FLIPPER__!.placeBottle({ x, y, angle: Math.PI / 2 }),
    [TABLE_CENTER_X, TABLE_TOP_Y - HALF_WIDTH - 0.05],
  );
  expect(side?.outcome).toBeNull();
  const done = await stepUntilOutcome(page);
  expect(done.outcome).toMatchObject({ result: 'fail', reason: 'side' });
  expect(errors).toEqual([]);
});

test('a bottle placed beyond the end of the table falls off, and one thrown sideways leaves the screen', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());
  await page.evaluate(
    ([x, y]) => window.__FLIPPER__!.placeBottle({ x, y, angle: 0 }),
    [TABLE_RIGHT_X + 0.6, TABLE_TOP_Y - 0.5],
  );
  expect((await stepUntilOutcome(page)).outcome).toMatchObject({
    result: 'fail',
    reason: 'offTable',
  });

  // A fresh game for the second case: a placement only works while a bottle is held.
  await page.evaluate(() => window.__FLIPPER__!.startScene('Game', { seed: 7 }));
  await page.waitForFunction(() => window.__FLIPPER__!.state()?.phase === 'aiming');
  await page.evaluate(() => window.__FLIPPER__!.pause());
  await page.evaluate(() => window.__FLIPPER__!.placeBottle({ x: 8, y: 2, angle: 0, vx: 40 }));
  expect((await stepUntilOutcome(page)).outcome).toMatchObject({
    result: 'fail',
    reason: 'offScreen',
  });
  expect(errors).toEqual([]);
});

test('every throw gets an outcome within the timeout, which stays the same through the result', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => {
    window.__FLIPPER__!.pause();
    window.__FLIPPER__!.throwBottle(50);
  });
  // 5 s after release is 300 steps.
  const first = await stepUntilOutcome(page, 300);
  expect(first.outcome).not.toBeNull();
  expect(Number.isInteger(first.outcome!.turns)).toBe(true);
  expect(first.outcome!.rotation).toBeGreaterThan(0); // thrown with a clockwise spin

  // Still the same 59 steps later, when the result is about to give way to the next bottle.
  const later = await stepFrames(page, 59);
  expect(later.phase).toBe('result');
  expect(later.outcome).toEqual(first.outcome);
  expect(errors).toEqual([]);
});

test('placeBottle does nothing once a bottle is in flight', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => {
    window.__FLIPPER__!.pause();
    window.__FLIPPER__!.throwBottle(50);
  });
  const mid = await stepFrames(page, 10);
  const after = await page.evaluate(() =>
    window.__FLIPPER__!.placeBottle({ x: 6, y: 1, angle: 0 }),
  );
  expect(after).toEqual(mid);
  expect(errors).toEqual([]);
});
