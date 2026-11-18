import { expect, test } from '@playwright/test';
import { SUMMARY_LAYOUT } from '../../src/game/view/summaryLayout';
import { gameState, openGame, recordKeydownRepeats, settleInput } from './helpers';
import { gamePoint } from './mouseHelpers';
import { activeScenes } from './roundHelpers';
import {
  POINTS,
  expectBackInGame,
  playAgain,
  playAgainPoint,
  playToLastResult,
  playToSummary,
} from './summaryHelpers';

/*
 * How Play again is chosen on the round summary: Enter, Space and R, a click on the button, and
 * the presses that must not choose it (an auto-repeated key, a click that began in the Game scene,
 * a press released away from the button). What the summary shows is in `summary.spec.ts`.
 */

for (const [name, key] of [
  ['Enter', 'Enter'],
  ['Space', 'Space'],
  ['R', 'KeyR'],
] as const) {
  test(`pressing ${name} on the summary starts a new round`, async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await playToSummary(page);

    await page.keyboard.press(key);

    await expectBackInGame(page);
    // The key only chose Play again: it did not also throw the first bottle of the new round.
    await settleInput(page);
    expect(await gameState(page)).toMatchObject({ phase: 'aiming', throws: 10 });
    // And the Game scene hears the keyboard again: a Space throws.
    await page.keyboard.press('Space');
    await expect.poll(async () => (await gameState(page)).phase).toBe('flying');
    expect(errors).toEqual([]);
  });
}

test('the Space press that skips the 10th result does not also start a new round', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  const repeats = await recordKeydownRepeats(page);
  await playToLastResult(page);

  // Press Space and keep it down: the first keydown skips the result and ends the round...
  await page.keyboard.down('Space');
  await expect.poll(() => activeScenes(page)).toEqual(['Summary']);
  // ...and the browser's auto-repeat keydowns that follow reach the summary but do nothing.
  for (let i = 0; i < 4; i++) {
    await page.keyboard.down('Space');
    await settleInput(page);
  }
  expect(await repeats()).toEqual([false, true, true, true, true]);
  expect(await activeScenes(page)).toEqual(['Summary']);
  expect(await gameState(page)).toMatchObject({ phase: 'roundOver', score: POINTS });

  // Letting go and pressing again is a new press: now it chooses Play again.
  await page.keyboard.up('Space');
  await settleInput(page);
  expect(await activeScenes(page)).toEqual(['Summary']);
  await page.keyboard.press('Space');
  await expectBackInGame(page);
  expect(errors).toEqual([]);
});

test('a click that skips the 10th result does not also press Play again', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  await playToLastResult(page);

  // Press where the button will be, during the result: the press skips the result. The summary
  // opens under the pointer while the button is still down; releasing there is not a click on it.
  const at = await playAgainPoint(page);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await expect.poll(() => activeScenes(page)).toEqual(['Summary']);
  await page.mouse.up();
  await settleInput(page);
  expect(await activeScenes(page)).toEqual(['Summary']);
  expect(await gameState(page)).toMatchObject({ phase: 'roundOver', score: POINTS });

  // A whole click afterwards does choose it.
  await page.mouse.click(at.x, at.y);
  await expectBackInGame(page);
  expect(errors).toEqual([]);
});

test('a press on Play again that is released somewhere else is not a click', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  await playToSummary(page);

  const at = await playAgainPoint(page);
  const away = await gamePoint(page, SUMMARY_LAYOUT.card.x, SUMMARY_LAYOUT.scoreY);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(away.x, away.y);
  await page.mouse.up();
  await settleInput(page);
  expect(await activeScenes(page)).toEqual(['Summary']);
  expect((await gameState(page)).phase).toBe('roundOver');

  // Clicks next to the button, on the card's lines or on the empty background do nothing either.
  // "Next to" is its left side and the gap between it and the Title button (F018 put that button
  // on its right, so a spot 30 px to the right is now on the Title button).
  const { title } = SUMMARY_LAYOUT;
  const gapMiddle = (playAgain.x + playAgain.width / 2 + (title.x - title.width / 2)) / 2;
  for (const [x, y] of [
    [SUMMARY_LAYOUT.card.x, SUMMARY_LAYOUT.scoreY],
    [playAgain.x - playAgain.width / 2 - 20, playAgain.y],
    [gapMiddle, playAgain.y],
    [60, 60],
  ]) {
    const point = await gamePoint(page, x, y);
    await page.mouse.click(point.x, point.y);
  }
  await settleInput(page);
  expect(await activeScenes(page)).toEqual(['Summary']);
  expect((await gameState(page)).phase).toBe('roundOver');
  expect(errors).toEqual([]);
});

test('the pointer is a hand over Play again and an arrow elsewhere and afterwards', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await playToSummary(page);
  const cursor = () => page.locator('canvas').evaluate((el) => getComputedStyle(el).cursor);

  const away = await gamePoint(page, 60, 60);
  await page.mouse.move(away.x, away.y);
  await settleInput(page);
  expect(await cursor()).toBe('auto');

  const at = await playAgainPoint(page);
  await page.mouse.move(at.x, at.y);
  await expect.poll(cursor).toBe('pointer');
  await page.mouse.move(away.x, away.y);
  await expect.poll(cursor).toBe('auto');

  // Choosing Play again from the button gives the arrow back, with the pointer still on its spot.
  await page.mouse.move(at.x, at.y);
  await expect.poll(cursor).toBe('pointer');
  await page.mouse.down();
  await page.mouse.up();
  await expectBackInGame(page);
  expect(await cursor()).toBe('auto');
  expect(errors).toEqual([]);
});
