import { expect, test, type Page } from '@playwright/test';
import { FLIPPED, SIDE, flipped } from '../shared';
import { gameState, openGame, settleInput, visibleTexts } from './helpers';
import { land, next } from './roundHelpers';

/** The three HUD lines, as the player sees them. */
const HUD = ['Throw ', 'Score: ', 'Streak: '];
async function hud(page: Page): Promise<string[]> {
  const texts = await visibleTexts(page);
  return HUD.map((start) => texts.find((text) => text.startsWith(start)) ?? `(no "${start}" line)`);
}

/** Press R and wait until the game has restarted the round (`expect.poll` on the throw number). */
async function pressR(page: Page): Promise<void> {
  await page.keyboard.press('KeyR');
  await settleInput(page);
}

test('the HUD shows "Throw 1 / 10", "Score: 0" and "Streak: 0" at the start', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  expect(await hud(page)).toEqual(['Throw 1 / 10', 'Score: 0', 'Streak: 0']);
  expect(await gameState(page)).toMatchObject({
    phase: 'aiming',
    throwNumber: 1,
    throwsPerRound: 10,
    score: 0,
    landings: 0,
    streak: 0,
  });
  expect(errors).toEqual([]);
});

test('the HUD updates after each throw: a landing, a double, a fail and the next bottle', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');

  // A single flip: score and streak change at the result; the throw number when the next bottle comes.
  expect((await land(page, FLIPPED)).outcome).toMatchObject({ result: 'success' });
  expect(await hud(page)).toEqual(['Throw 1 / 10', 'Score: 1', 'Streak: 1']);
  await next(page);
  expect(await hud(page)).toEqual(['Throw 2 / 10', 'Score: 1', 'Streak: 1']);

  // A double adds 2, and the streak counts landings, not points.
  await land(page, flipped(2));
  expect(await hud(page)).toEqual(['Throw 2 / 10', 'Score: 3', 'Streak: 2']);
  await next(page);
  expect(await hud(page)).toEqual(['Throw 3 / 10', 'Score: 3', 'Streak: 2']);

  // A fail resets the streak and keeps the score.
  expect((await land(page, SIDE)).outcome).toMatchObject({ result: 'fail' });
  expect(await hud(page)).toEqual(['Throw 3 / 10', 'Score: 3', 'Streak: 0']);
  await next(page);
  expect(await hud(page)).toEqual(['Throw 4 / 10', 'Score: 3', 'Streak: 0']);

  // The result wait ends by itself too: the next bottle comes after 1.5 s of simulation.
  await land(page, FLIPPED);
  expect(await hud(page)).toEqual(['Throw 4 / 10', 'Score: 4', 'Streak: 1']);
  await page.evaluate(() => window.__FLIPPER__!.step(90));
  expect(await hud(page)).toEqual(['Throw 5 / 10', 'Score: 4', 'Streak: 1']);
  expect(await gameState(page)).toMatchObject({ phase: 'aiming', landings: 3, throwNumber: 5 });
  expect(errors).toEqual([]);
});

test('pressing R mid-round puts the HUD back to the start, with a new bottle in the hand', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await land(page, FLIPPED);
  await next(page);
  await land(page, flipped(2));
  await next(page);
  expect(await hud(page)).toEqual(['Throw 3 / 10', 'Score: 3', 'Streak: 2']);
  const before = await gameState(page);

  await pressR(page);

  expect(await hud(page)).toEqual(['Throw 1 / 10', 'Score: 0', 'Streak: 0']);
  const after = await gameState(page);
  expect(after).toMatchObject({
    phase: 'aiming',
    throwNumber: 1,
    score: 0,
    landings: 0,
    streak: 0,
    outcome: null,
    dragging: false,
    seed: before.seed, // the same game carries on: not a new simulation
  });
  expect([after.bottle.x, after.bottle.y, after.bottle.angle]).toEqual([
    before.bottle.x,
    before.bottle.y,
    0,
  ]);
  expect(after.bottle.water).not.toBe(before.bottle.water); // the seed's next bottle
  expect(errors).toEqual([]);
});

test('pressing R works in the middle of a flight and during a result', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());

  // Mid-flight.
  await page.evaluate(() => window.__FLIPPER__!.throwBottle(50));
  await page.evaluate(() => window.__FLIPPER__!.step(15));
  expect((await gameState(page)).phase).toBe('flying');
  await pressR(page);
  expect(await gameState(page)).toMatchObject({ phase: 'aiming', throwNumber: 1, outcome: null });
  expect(await hud(page)).toEqual(['Throw 1 / 10', 'Score: 0', 'Streak: 0']);

  // During a result, after a landing.
  await land(page, FLIPPED);
  expect(await hud(page)).toEqual(['Throw 1 / 10', 'Score: 1', 'Streak: 1']);
  await pressR(page);
  expect(await gameState(page)).toMatchObject({ phase: 'aiming', score: 0, streak: 0 });
  expect(await hud(page)).toEqual(['Throw 1 / 10', 'Score: 0', 'Streak: 0']);
  // The old result doesn't come back when time passes.
  await page.evaluate(() => window.__FLIPPER__!.step(200));
  expect(await gameState(page)).toMatchObject({ phase: 'aiming', throwNumber: 1, outcome: null });
  expect(errors).toEqual([]);
});

test('after the 10th throw the round is over: no new bottle, throws and clicks do nothing, R restarts', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  // Nine landings and a fail; the score is the sum of the turns of the landings.
  for (let i = 0; i < 9; i++) {
    expect(await hud(page)).toEqual([`Throw ${i + 1} / 10`, `Score: ${i}`, `Streak: ${i}`]);
    await land(page, FLIPPED);
    await next(page);
  }
  expect(await hud(page)).toEqual(['Throw 10 / 10', 'Score: 9', 'Streak: 9']);
  await land(page, SIDE);
  expect(await hud(page)).toEqual(['Throw 10 / 10', 'Score: 9', 'Streak: 0']);

  // The wait ends: the round is over and the last bottle stays on the table.
  await page.evaluate(() => window.__FLIPPER__!.step(90));
  const over = await gameState(page);
  expect(over).toMatchObject({ phase: 'roundOver', throws: 10, throwNumber: 10, score: 9 });
  expect(over.landings).toBe(9);
  // The round summary has taken the HUD's place (see summary.spec.ts for it in full).
  expect(await visibleTexts(page)).toContain('Score: 9');
  expect(await visibleTexts(page)).toContain('Landed 9 / 10');

  // Nothing can be thrown or skipped: not by hook or mouse. (Space now chooses Play again on the
  // summary: summary.spec.ts.)
  await page.evaluate(() => window.__FLIPPER__!.throwBottle(60));
  await page.mouse.click(640, 300);
  await page.mouse.click(280, 400);
  await page.evaluate(() => window.__FLIPPER__!.step(120));
  expect(await gameState(page)).toMatchObject({ phase: 'roundOver', throws: 10, score: 9 });

  // R starts the next round.
  await pressR(page);
  expect(await hud(page)).toEqual(['Throw 1 / 10', 'Score: 0', 'Streak: 0']);
  expect(await gameState(page)).toMatchObject({ phase: 'aiming', landings: 0, throwNumber: 1 });
  expect(errors).toEqual([]);
});

test('the 10th result can be skipped straight to the end of the round', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  for (let i = 0; i < 10; i++) {
    await land(page, FLIPPED);
    await next(page);
  }
  expect(await gameState(page)).toMatchObject({ phase: 'roundOver', score: 10, landings: 10 });
  // The summary shows the round's end (the HUD is under it, in the paused Game scene).
  expect(await visibleTexts(page)).toEqual(expect.arrayContaining(['Score: 10', 'Landed 10 / 10']));
  expect(errors).toEqual([]);
});

test('window.__FLIPPER__.restartRound() restarts like R, in any phase', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  await land(page, FLIPPED);
  const restarted = await page.evaluate(() => window.__FLIPPER__!.restartRound());
  expect(restarted).toMatchObject({ phase: 'aiming', throwNumber: 1, score: 0, streak: 0 });
  expect(await hud(page)).toEqual(['Throw 1 / 10', 'Score: 0', 'Streak: 0']);
  expect(errors).toEqual([]);
});
