/*
 * Helpers for the e2e tests of the round summary (`summary.spec.ts`, `summaryInput.spec.ts`).
 *
 * The round they play is scripted so that points and landings differ: singles, doubles, a triple,
 * two kinds of fail. Points are the turns of the landings (written out here, not computed):
 * 1 + 2 + 0 + 1 + 3 + 0 + 1 + 1 + 0 + 2 = 11, from 7 landings.
 */
import { expect, type Page } from '@playwright/test';
import { SUMMARY_LAYOUT } from '../../src/game/view/summaryLayout';
import { FLIPPED, SIDE, UPRIGHT, flipped } from '../shared';
import { gameState } from './helpers';
import { gamePoint } from './mouseHelpers';
import { activeScenes, next, playThrows } from './roundHelpers';

export const ROUND = [
  FLIPPED, //     1: single, +1
  flipped(2), //  2: double, +2
  SIDE, //        3: fail
  FLIPPED, //     4: +1
  flipped(3), //  5: triple, +3
  UPRIGHT, //     6: "No flip!" (an upright bottle with no turn): fail
  FLIPPED, //     7: +1
  FLIPPED, //     8: +1
  SIDE, //        9: fail
  flipped(2), // 10: double, +2
];
export const POINTS = 11;
export const LANDINGS = 7;

export const { playAgain } = SUMMARY_LAYOUT;

/** Play the whole scripted round and stop in the 10th throw's result. */
export async function playToLastResult(page: Page): Promise<void> {
  await playThrows(page, ROUND);
  expect(await gameState(page)).toMatchObject({ phase: 'result', throws: 10, throwNumber: 10 });
}

/** Play the whole round and let the 10th result end, so the summary is open. */
export async function playToSummary(page: Page): Promise<void> {
  await playToLastResult(page);
  await next(page);
  await expect.poll(() => activeScenes(page)).toContain('Summary');
}

/** Wait until the summary has closed and the Game scene runs again, on throw 1 of a new round. */
export async function expectBackInGame(page: Page): Promise<void> {
  await expect.poll(() => activeScenes(page)).toEqual(['Game']);
  expect(await gameState(page)).toMatchObject({
    phase: 'aiming',
    throwNumber: 1,
    score: 0,
    landings: 0,
    streak: 0,
    outcome: null,
  });
}

/** The page position of the middle of the Play again button. */
export const playAgainPoint = (page: Page) => gamePoint(page, playAgain.x, playAgain.y);
