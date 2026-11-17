import { expect, test } from '@playwright/test';
import { HAND_X, HAND_Y } from '../../src/core/bottle';
import { SIDE, FLIPPED, waterSequence } from '../shared';
import { gameState, openGame, stepFrames, stepUntilOutcome } from './helpers';

test('after a throw resolves and 90 more frames pass, the next bottle waits in the hand', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  const [firstWater, nextWater] = waterSequence(7, 2);
  await page.evaluate(() => window.__FLIPPER__!.pause());
  expect((await gameState(page)).bottle.water).toBe(firstWater);

  await page.evaluate(() => window.__FLIPPER__!.throwBottle(50));
  const decided = await stepUntilOutcome(page);
  expect(decided.phase).toBe('result');
  const earned = decided.outcome!.points; // the turns of an upright landing, else 0
  expect(decided).toMatchObject({ score: earned, throws: 1 });
  expect(decided.bottle.water).toBe(firstWater); // still the bottle that was thrown

  // 89 frames later it is still the result; the 90th brings the next bottle.
  const waiting = await stepFrames(page, 89);
  expect(waiting.phase).toBe('result');
  expect(waiting.outcome).toEqual(decided.outcome);
  expect(waiting.bottle.water).toBe(firstWater);

  const next = await stepFrames(page, 1);
  expect(next.phase).toBe('aiming');
  expect(next.outcome).toBeNull();
  expect(next.bottle.water).toBe(nextWater);
  expect([next.bottle.x, next.bottle.y, next.bottle.angle]).toEqual([HAND_X, HAND_Y, 0]);
  expect([next.bottle.vx, next.bottle.vy, next.bottle.omega]).toEqual([0, 0, 0]);
  expect(next).toMatchObject({ score: earned, throws: 1 });
  expect(errors).toEqual([]);
});

test('a success adds a point, a fail does not, and the bottles follow the seed', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=9');
  await page.evaluate(() => window.__FLIPPER__!.pause());

  const results: string[] = [];
  const scores: number[] = [];
  for (const pose of [FLIPPED, SIDE, FLIPPED]) {
    await page.evaluate((p) => window.__FLIPPER__!.placeBottle(p), pose);
    const decided = await stepUntilOutcome(page);
    results.push(decided.outcome!.result);
    scores.push(decided.score);
    await stepFrames(page, 90);
  }
  expect(results).toEqual(['success', 'fail', 'success']);
  expect(scores).toEqual([1, 1, 2]);

  const end = await gameState(page);
  expect(end).toMatchObject({ phase: 'aiming', score: 2, throws: 3 });
  expect(end.bottle.water).toBe(waterSequence(9, 4)[3]); // the fourth bottle of the seed
  expect(errors).toEqual([]);
});

test('skip() brings the next bottle at once during a result, and changes nothing otherwise', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  const [, nextWater] = waterSequence(7, 2);
  await page.evaluate(() => window.__FLIPPER__!.pause());

  // While aiming.
  const aiming = await gameState(page);
  expect(await page.evaluate(() => window.__FLIPPER__!.skip())).toEqual(aiming);

  // While flying.
  await page.evaluate(() => window.__FLIPPER__!.throwBottle(50));
  const flying = await stepFrames(page, 10);
  expect(flying.phase).toBe('flying');
  expect(await page.evaluate(() => window.__FLIPPER__!.skip())).toEqual(flying);

  // During the result: the next bottle appears without waiting for the delay.
  const decided = await stepUntilOutcome(page);
  expect(decided.phase).toBe('result');
  const skipped = await page.evaluate(() => window.__FLIPPER__!.skip());
  expect(skipped).toMatchObject({ phase: 'aiming', outcome: null, tick: decided.tick });
  expect(skipped!.bottle.water).toBe(nextWater);
  expect([skipped!.bottle.x, skipped!.bottle.y]).toEqual([HAND_X, HAND_Y]);
  expect(skipped!.throws).toBe(1);

  // A second skip does nothing.
  expect(await page.evaluate(() => window.__FLIPPER__!.skip())).toEqual(skipped);
  expect(errors).toEqual([]);
});

test('the real-time clock brings the next bottle by itself', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  const [, nextWater] = waterSequence(7, 2);
  await page.evaluate((pose) => window.__FLIPPER__!.placeBottle(pose), FLIPPED);
  // About 1 s to stand still plus the 1.5 s wait, in real time.
  await page.waitForFunction(() => window.__FLIPPER__!.state()?.phase === 'result', null, {
    timeout: 10_000,
  });
  await page.waitForFunction(() => window.__FLIPPER__!.state()?.phase === 'aiming', null, {
    timeout: 10_000,
  });
  const state = await gameState(page);
  expect(state).toMatchObject({ score: 1, throws: 1, outcome: null });
  expect(state.bottle.water).toBe(nextWater);
  expect(errors).toEqual([]);
});
