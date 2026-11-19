import { expect, test } from '@playwright/test';
import { HAND_X, HAND_Y } from '../../src/core/bottle';
import { FLIPPED, waterSequence } from '../shared';
import { gameState, openGame, settleInput, stepFrames } from './helpers';
import { land } from './roundHelpers';

// F030 (design section 2): after an upright landing the next bottle comes about 1 s after the
// result (it was 1.5 s), and Space or a click still skips the wait. Everything here counts fixed
// steps with the clock paused, so nothing depends on how fast the machine is.

test('the next bottle appears 60 steps (1 s) after the outcome, not before', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  const [, nextWater] = waterSequence(7, 2);
  const decided = await land(page, FLIPPED);
  expect(decided).toMatchObject({ phase: 'result', outcome: { result: 'success' } });

  const waiting = await stepFrames(page, 59);
  expect(waiting).toMatchObject({ phase: 'result', tick: decided.tick + 59 });
  expect(waiting.outcome).toEqual(decided.outcome);

  const next = await stepFrames(page, 1);
  expect(next).toMatchObject({ phase: 'aiming', outcome: null, tick: decided.tick + 60 });
  expect(next.bottle.water).toBe(nextWater);
  expect([next.bottle.x, next.bottle.y]).toEqual([HAND_X, HAND_Y]);
  expect(errors).toEqual([]);
});

test('Space skips the wait at once, with the clock paused', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  const decided = await land(page, FLIPPED);
  const waiting = await stepFrames(page, 10);
  expect(waiting.phase).toBe('result');

  await page.keyboard.press('Space');
  await expect.poll(async () => (await gameState(page)).phase).toBe('aiming');
  // Nothing was stepped to get there: the skip, not the 60-step wait, brought the bottle.
  expect(await gameState(page)).toMatchObject({
    phase: 'aiming',
    outcome: null,
    throws: 1,
    tick: decided.tick + 10,
  });
  expect(errors).toEqual([]);
});

test('a click on the empty canvas skips the wait at once, with the clock paused', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  const decided = await land(page, FLIPPED);
  expect((await stepFrames(page, 10)).phase).toBe('result');

  await page.mouse.click(640, 150);
  await settleInput(page);
  expect(await gameState(page)).toMatchObject({
    phase: 'aiming',
    outcome: null,
    throws: 1,
    tick: decided.tick + 10,
  });
  expect(errors).toEqual([]);
});
