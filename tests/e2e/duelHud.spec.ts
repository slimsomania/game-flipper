import { expect, test, type Page } from '@playwright/test';
import { HAND_X, HAND_Y } from '../../src/core/bottle';
import { GAME_WIDTH, PIXELS_PER_METER } from '../../src/core/constants';
import { FLIPPED, UPRIGHT } from '../shared';
import { land, next } from './roundHelpers';
import { gameState, openTitle, settleInput, stepFrames } from './helpers';

/*
 * F061: in a duel the solo HUD gives way to one stack per side, the waiting side is grayed (its
 * bar and a picture of its bottle at its hand), and a banner says whose turn it is.
 */

const PPM = PIXELS_PER_METER;

async function startDuel(page: Page, query = '?seed=7'): Promise<void> {
  await openTitle(page, query, true);
  await page.evaluate(() => window.__FLIPPER__!.startScene('Game', { players: 2 }));
  await page.waitForFunction(() => window.__FLIPPER__!.state()?.players === 2);
}

const sides = async (page: Page) => {
  await settleInput(page);
  return (await page.evaluate(() => window.__FLIPPER__!.duelSides()))!;
};
const texts = (page: Page) => page.evaluate(() => window.__FLIPPER__!.texts());

/** Throw the active player's bottle at `power`, let it settle and move to the next turn. */
async function passTurn(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__FLIPPER__!.pause();
    window.__FLIPPER__!.throwBottle(36);
    window.__FLIPPER__!.step(400);
    window.__FLIPPER__!.skip();
  });
}

test('a duel shows both labels, scores, streaks and the banner, and no solo throw line', async ({
  page,
}) => {
  await startDuel(page);
  await settleInput(page);
  const shown = await texts(page);
  for (const line of [
    'Player 1',
    'Player 2',
    "Player 1's turn · Throw 1 / 10",
    'Score: 0',
    'Streak: 0',
  ]) {
    expect(shown, line).toContain(line);
  }
  expect(shown.filter((t) => t === 'Score: 0')).toHaveLength(2);
  expect(shown.filter((t) => t === 'Streak: 0')).toHaveLength(2);
  expect(shown.filter((t) => /^Throw \d+ \/ \d+$/.test(t))).toEqual([]);
});

test('a single for Player 1 and a failure for Player 2 give each side its own books', async ({
  page,
}) => {
  await startDuel(page);
  let state = await land(page, FLIPPED);
  expect(state.outcome?.result).toBe('success');
  await next(page);
  expect((await gameState(page)).duel!.active).toBe(2);
  state = await land(page, UPRIGHT); // no flip: a fail
  expect(state.outcome?.result).toBe('fail');
  const [one, two] = await sides(page);
  expect(one.scoreLine).toBe('Score: 1');
  expect(one.streakLine).toBe('Streak: 1');
  expect(two.scoreLine).toBe('Score: 0');
  expect(two.streakLine).toBe('Streak: 0');
  const shown = await texts(page);
  expect(shown).toContain('Score: 1');
  expect(shown).toContain('Streak: 1');
  expect(shown).toContain('Score: 0');
  expect(shown).toContain("Player 2's turn · Throw 1 / 10");
});

test('the active side is in full color and the other grayed, swapping with the turn', async ({
  page,
}) => {
  await startDuel(page);
  await page.evaluate(() => window.__FLIPPER__!.lockWater(0.5));
  await page.evaluate(() => window.__FLIPPER__!.setPower(30));
  let [one, two] = await sides(page);
  expect([one.look, two.look]).toEqual(['active', 'grayed']);
  expect(one.labelColor).not.toBe(two.labelColor);
  expect(one.barValue).toBe(30);
  // Player 2's picture is at the right hand, with the water Player 2's bottle will get and the
  // bar shows Player 2's kept value.
  const state = await gameState(page);
  expect(two.barValue).toBe(state.duel!.sides[1].power);
  expect(two.picture).not.toBeNull();
  expect(two.picture!.water).toBe(state.duel!.waitingWater);
  const handX = GAME_WIDTH - HAND_X * PPM;
  expect(two.picture!.left).toBeLessThan(handX);
  expect(two.picture!.right).toBeGreaterThan(handX);
  expect(two.picture!.bottom).toBeCloseTo(HAND_Y * PPM + 2, 0);
  expect(two.bar.left).toBeGreaterThan(handX);
  expect(one.picture).toBeNull();

  await passTurn(page);
  await page.evaluate(() => window.__FLIPPER__!.setPower(70));
  [one, two] = await sides(page);
  expect([one.look, two.look]).toEqual(['grayed', 'active']);
  expect(two.barValue).toBe(70);
  expect(one.barValue).toBe(30);
  // Player 1's grayed bar and picture are back at the left hand.
  expect(one.bar.right).toBeLessThan(HAND_X * PPM);
  expect(one.picture).not.toBeNull();
  expect(one.picture!.left).toBeLessThan(HAND_X * PPM);
  expect(one.picture!.right).toBeGreaterThan(HAND_X * PPM);
  expect(one.picture!.water).toBe((await gameState(page)).duel!.waitingWater);
});

test('the waiting picture has no bottle once the waiting player has no throws left', async ({
  page,
}) => {
  await startDuel(page, '?seed=7');
  // Play ten pairs quickly; Player 1 has nothing left during Player 2's last throw.
  for (let pair = 0; pair < 10; pair++) {
    await passTurn(page);
    if (pair < 9) await passTurn(page);
  }
  const state = await gameState(page);
  expect(state.duel!.active).toBe(2);
  expect(state.duel!.waitingWater).toBeNull();
  const [one] = await sides(page);
  expect(one.look).toBe('grayed');
  expect(one.picture).toBeNull();
});

test('a bottle flying through the picture follows the same path as in solo', async ({ page }) => {
  const pose = { x: GAME_WIDTH / PPM - HAND_X, y: HAND_Y - 0.5, angle: 0.4 };
  const path = async (players: 1 | 2): Promise<number[][]> => {
    await openTitle(page, '?seed=7', true);
    await page.evaluate((n) => window.__FLIPPER__!.startScene('Game', { players: n }), players);
    await page.waitForFunction((n) => window.__FLIPPER__!.state()?.players === n, players);
    await page.evaluate(() => window.__FLIPPER__!.lockWater(0.5));
    await page.evaluate((p) => {
      window.__FLIPPER__!.pause();
      window.__FLIPPER__!.placeBottle(p);
    }, pose);
    const out: number[][] = [];
    for (let i = 0; i < 6; i++) {
      const s = await stepFrames(page, 10);
      out.push([s.bottle.x, s.bottle.y, s.bottle.angle]);
    }
    return out;
  };
  const solo = await path(1);
  const duel = await path(2);
  expect(duel).toEqual(solo);
});
