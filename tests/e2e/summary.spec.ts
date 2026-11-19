import { expect, test } from '@playwright/test';
import { SIDE, flipped } from '../shared';
import { gameState, openGame, settleInput, visibleTexts } from './helpers';
import { activeScenes, land, next, playThrows } from './roundHelpers';
import {
  LANDINGS,
  POINTS,
  ROUND,
  expectBackInGame,
  playAgainPoint,
  playToLastResult,
  playToSummary,
} from './summaryHelpers';

/*
 * What the round summary shows and when it opens and closes. How Play again is chosen (click,
 * keys, auto-repeat, carried-over presses, the cursor) is in `summaryInput.spec.ts`.
 */

test('after the 10th throw the Summary shows the round’s points and its landings', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await playToSummary(page);

  expect(await gameState(page)).toMatchObject({
    phase: 'roundOver',
    score: POINTS,
    landings: LANDINGS,
    throwsPerRound: 10,
  });
  // Points and landings differ (the doubles and the triple), and each line shows its own.
  expect(POINTS).not.toBe(LANDINGS);
  const texts = await visibleTexts(page);
  expect(texts).toContain(`Score: ${POINTS}`);
  expect(texts).toContain(`Landed ${LANDINGS} / 10`);
  expect(texts).toContain('Play again');
  // Nothing of the round's HUD is on show next to it.
  expect(texts.filter((text) => text.startsWith('Throw '))).toEqual([]);
  expect(texts.filter((text) => text.startsWith('Streak: '))).toEqual([]);
  expect(await activeScenes(page)).toEqual(['Summary']);
  expect(errors).toEqual([]);
});

test('the summary also opens when the 10th result’s wait runs out', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  await playToLastResult(page);
  await page.evaluate(() => window.__FLIPPER__!.step(60));
  await expect.poll(() => activeScenes(page)).toEqual(['Summary']);
  expect(await visibleTexts(page)).toEqual(
    expect.arrayContaining([`Score: ${POINTS}`, `Landed ${LANDINGS} / 10`]),
  );
  expect(errors).toEqual([]);
});

test('the summary does not appear before the 10th result is over', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  const notSummary = async (): Promise<void> => {
    await settleInput(page);
    expect(await activeScenes(page)).toEqual(['Game']);
    expect((await visibleTexts(page)).some((text) => text.startsWith('Landed '))).toBe(false);
  };

  // Not after the first nine results, nor while their waits run.
  for (let i = 0; i < 9; i++) {
    await land(page, ROUND[i]);
    await notSummary();
    await next(page);
    await notSummary();
  }
  // Not during the 10th throw's flight and result either: only when its wait ends.
  await land(page, ROUND[9]);
  await page.evaluate(() => window.__FLIPPER__!.step(30));
  expect((await gameState(page)).phase).toBe('result');
  await notSummary();
  await page.evaluate(() => window.__FLIPPER__!.step(30));
  await expect.poll(() => activeScenes(page)).toEqual(['Summary']);
  expect(errors).toEqual([]);
});

test('clicking Play again starts a new round in the Game scene', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  await playToSummary(page);
  const before = await gameState(page);

  const at = await playAgainPoint(page);
  await page.mouse.click(at.x, at.y);

  await expectBackInGame(page);
  const after = await gameState(page);
  // The same game carries on (same seed, the seed's next bottle, throws counted since the start).
  expect(after).toMatchObject({ seed: before.seed, throws: 10 });
  expect(after.bottle.water).not.toBe(before.bottle.water);
  expect(await visibleTexts(page)).toEqual(
    expect.arrayContaining(['Throw 1 / 10', 'Score: 0', 'Streak: 0']),
  );
  expect(await visibleTexts(page)).not.toContain('Play again');
  expect(errors).toEqual([]);
});

test('the summary closes when something else starts a round again', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  await playToSummary(page);

  await page.evaluate(() => window.__FLIPPER__!.restartRound());

  await expectBackInGame(page);
  expect(errors).toEqual([]);
});

test('a second round ends in a summary of its own, with its own points', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  await playToSummary(page);
  await page.keyboard.press('Enter');
  await expectBackInGame(page);

  // Ten fails: no points and no landings.
  await playThrows(page, Array<typeof SIDE>(10).fill(SIDE));
  await next(page);
  await expect.poll(() => activeScenes(page)).toEqual(['Summary']);
  expect(await gameState(page)).toMatchObject({ phase: 'roundOver', score: 0, landings: 0 });
  const texts = await visibleTexts(page);
  expect(texts).toContain('Score: 0');
  expect(texts).toContain('Landed 0 / 10');
  expect(texts).not.toContain(`Score: ${POINTS}`);

  // And again from the button.
  const at = await playAgainPoint(page);
  await page.mouse.click(at.x, at.y);
  await expectBackInGame(page);
  expect(errors).toEqual([]);
});

test('a round that scores far above 10 points is summarized in full', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  // Ten landings worth 9 turns each: 90 points from 10 landings.
  await playThrows(page, Array(10).fill(flipped(9)));
  await next(page);
  await expect.poll(() => activeScenes(page)).toEqual(['Summary']);
  expect(await visibleTexts(page)).toEqual(expect.arrayContaining(['Score: 90', 'Landed 10 / 10']));
  expect(errors).toEqual([]);
});
