import { expect, test, type Page } from '@playwright/test';
import { HAND_X } from '../../src/core/bottle';
import { GAME_WIDTH, PIXELS_PER_METER } from '../../src/core/constants';
import { TABLE_LEFT_X, TABLE_RIGHT_X } from '../../src/core/table';
import { BAR_LEFT, BAR_WIDTH } from '../../src/game/view/powerBarLayout';
import { FLIPPED } from '../shared';
import { gameState, openTitle, settleInput, stepFrames } from './helpers';

/*
 * F060: in a duel Player 2's throw is simulated from the left hand like any other and only drawn
 * mirrored at the right end of the table. Read from the hooks `drawnBottle()` and `powerBar()`.
 */

const PPM = PIXELS_PER_METER;
const HAND_PX = HAND_X * PPM;

async function startDuel(page: Page): Promise<void> {
  await openTitle(page, '?seed=7', true);
  await page.evaluate(() => window.__FLIPPER__!.startScene('Game', { players: 2 }));
  await page.waitForFunction(() => window.__FLIPPER__!.state()?.players === 2);
  await page.evaluate(() => window.__FLIPPER__!.lockWater(0.5));
}

const drawn = (page: Page) => page.evaluate(() => window.__FLIPPER__!.drawnBottle());
const bar = (page: Page) => page.evaluate(() => window.__FLIPPER__!.powerBar());

/** The bottle drawn right now, against the pose (or replay frame) the snapshot shows. */
async function expectDrawn(page: Page, mirrored: boolean): Promise<void> {
  await settleInput(page);
  const state = await gameState(page);
  const pose = state.replay ?? state.bottle;
  const d = (await drawn(page))!;
  expect(d.x).toBeCloseTo(mirrored ? GAME_WIDTH - pose.x * PPM : pose.x * PPM, 3);
  expect(d.y).toBeCloseTo(pose.y * PPM, 3);
  // Phaser keeps a rotation within a turn: compare the angles modulo a full turn.
  const want = mirrored ? -pose.angle : pose.angle;
  expect(Math.sin(d.angle)).toBeCloseTo(Math.sin(want), 5);
  expect(Math.cos(d.angle)).toBeCloseTo(Math.cos(want), 5);
}

async function playThrow(page: Page, mirrored: boolean, power: number): Promise<void> {
  await page.evaluate(() => window.__FLIPPER__!.pause());
  await expectDrawn(page, mirrored);
  await page.evaluate((p) => window.__FLIPPER__!.throwBottle(p), power);
  let state = await gameState(page);
  for (let i = 0; i < 100 && state.phase !== 'result'; i++) {
    state = await stepFrames(page, 4);
    if (i % 3 === 0) await expectDrawn(page, mirrored);
  }
  expect(state.phase).toBe('result');
  await expectDrawn(page, mirrored);
  // The replay, when it plays, is drawn mirrored too.
  for (let i = 0; i < 30 && !(await gameState(page)).replay; i++) await stepFrames(page, 4);
  for (let i = 0; i < 6 && (await gameState(page)).replay; i++) {
    await expectDrawn(page, mirrored);
    await stepFrames(page, 8);
  }
}

test('Player 2 is drawn mirrored in every phase of the throw, Player 1 as is', async ({ page }) => {
  await startDuel(page);
  await page.evaluate(() => window.__FLIPPER__!.setTuningValue('replaySpeed', 0.4));
  expect((await gameState(page)).duel!.active).toBe(1);
  await playThrow(page, false, 36);
  // Player 1's bottle comes down on the table, right of the hand it left.
  expect((await drawn(page))!.x).toBeGreaterThan(HAND_PX);

  await page.evaluate(() => window.__FLIPPER__!.skip());
  const second = await gameState(page);
  expect(second.duel!.active).toBe(2);
  expect(second.phase).toBe('aiming');
  await playThrow(page, true, 36);
  const landed = (await drawn(page))!;
  // It comes down on the table, left of the right hand it left.
  expect(landed.x).toBeLessThan(GAME_WIDTH - HAND_PX);
  expect(landed.x).toBeGreaterThan(TABLE_LEFT_X * PPM);
  expect(landed.x).toBeLessThan(TABLE_RIGHT_X * PPM);
});

test('the power bar is left of the left hand for Player 1 and mirrored by the right hand for Player 2', async ({
  page,
}) => {
  await startDuel(page);
  await page.evaluate(() => window.__FLIPPER__!.setPower(30));
  await settleInput(page);
  const first = (await bar(page))!;
  expect(first.right).toBeLessThan(HAND_PX);
  expect(first.left).toBe(BAR_LEFT);
  expect(first.value).toBe(30);

  await page.evaluate(() => {
    window.__FLIPPER__!.pause();
    window.__FLIPPER__!.throwBottle(36);
    window.__FLIPPER__!.step(400);
    window.__FLIPPER__!.skip();
    window.__FLIPPER__!.setPower(70);
  });
  expect((await gameState(page)).duel!.active).toBe(2);
  await settleInput(page);
  const second = (await bar(page))!;
  expect(second.left).toBeCloseTo(GAME_WIDTH - BAR_LEFT - BAR_WIDTH, 6);
  expect(second.right).toBeCloseTo(GAME_WIDTH - BAR_LEFT, 6);
  expect(second.left).toBeGreaterThan(GAME_WIDTH - HAND_PX);
  expect(second.top).toBe(first.top);
  expect(second.value).toBe(70);
});

test('a success on Player 2 bursts at the mirrored base', async ({ page }) => {
  await startDuel(page);
  await page.evaluate(
    (pose) => {
      window.__FLIPPER__!.pause();
      window.__FLIPPER__!.throwBottle(36);
      window.__FLIPPER__!.step(400);
      window.__FLIPPER__!.skip();
      window.__FLIPPER__!.placeBottle(pose);
    },
    { ...FLIPPED, x: 8 },
  );
  let state = await gameState(page);
  for (let i = 0; i < 400 && state.outcome === null; i++) state = await stepFrames(page, 1);
  expect(state.duel!.active).toBe(2);
  expect(state.outcome?.result).toBe('success');
  const burst = (await page.evaluate(() => window.__FLIPPER__!.effects())).find(
    (effect) => effect.name === 'burst',
  );
  expect(burst).toBeDefined();
  expect(burst!.x).toBeCloseTo(GAME_WIDTH - state.bottle.x * PPM, 3);
  expect(burst!.x).not.toBeCloseTo(state.bottle.x * PPM, 0);
});

test('startScene without data after a duel starts a solo game', async ({ page }) => {
  await startDuel(page);
  await page.evaluate(() => window.__FLIPPER__!.startScene('Game'));
  await page.waitForFunction(() => window.__FLIPPER__!.state()?.players === 1);
  expect((await gameState(page)).duel).toBeNull();
  await page.evaluate(() => {
    window.__FLIPPER__!.pause();
    window.__FLIPPER__!.throwBottle(36);
  });
  await stepFrames(page, 30);
  await expectDrawn(page, false);
});
