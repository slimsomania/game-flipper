import { expect, test, type Page } from '@playwright/test';
import { BOTTLE_HEIGHT } from '../../src/core/bottleShape';
import { TABLE_CENTER_X, TABLE_TOP_Y } from '../../src/core/table';
import { COLORS } from '../../src/game/theme';
import { SIDE, UPRIGHT, flipped, type PlacedPose } from '../shared';
import { openGame, stepUntilOutcome, visibleFlash, visibleTexts } from './helpers';

/*
 * The scoring rules decided on 2026-11-16: an upright landing needs a full turn (otherwise it is a
 * "No flip!" fail), and an upright landing scores one point per turn, with a message that names
 * the flip and the points. The turns are credited with `placeBottle({ ..., turns })`.
 */

/** Release the bottle at `pose` and step to the step that decides its outcome (clock paused). */
async function land(page: Page, pose: PlacedPose) {
  await page.evaluate(() => window.__FLIPPER__!.pause());
  await page.evaluate((p) => window.__FLIPPER__!.placeBottle(p), pose);
  return stepUntilOutcome(page);
}

const RESULT_MESSAGES = [
  'Nailed it!',
  'Double!',
  'Triple!',
  'Flip ×',
  'Cap landing!',
  'No flip!',
  'Down!',
];
const messagesIn = (texts: string[]) =>
  texts.filter((text) => RESULT_MESSAGES.some((message) => text.startsWith(message)));

test('an upright landing with no turn shows the red fail flash and "No flip!", and the score stays', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  const decided = await land(page, UPRIGHT);
  expect(decided.phase).toBe('result');
  expect(decided.outcome).toMatchObject({
    result: 'fail',
    reason: 'noFlip',
    turns: 0,
    points: 0,
  });
  expect(decided.score).toBe(0);

  const texts = await visibleTexts(page);
  expect(messagesIn(texts)).toEqual(['No flip!']); // that message only, not "Down!"
  expect(texts).toContain('Score: 0');
  const flash = await visibleFlash(page);
  expect(flash?.color).toBe(COLORS.failFlash);
  expect(flash?.alpha).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('a no flip after a success leaves the score where it was', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  await land(page, flipped(1));
  expect(await visibleTexts(page)).toContain('Score: 1');
  await page.evaluate(() => window.__FLIPPER__!.skip());

  const decided = await land(page, UPRIGHT);
  expect(decided).toMatchObject({ score: 1, outcome: { reason: 'noFlip' } });
  const texts = await visibleTexts(page);
  expect(messagesIn(texts)).toEqual(['No flip!']);
  expect(texts).toContain('Score: 1');
  expect(errors).toEqual([]);
});

// Design section 2 (2026-11-26): resting on the cap is a success worth 5, or 1 for a half-turn
// tip-over with no full turn (F051). Placed upside down on the table, with 0 and with 2 turns.
test('a landing on the cap shows "Cap landing!" with the green flash and scores 5 (1 for a tip-over)', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  const onCap: PlacedPose = {
    x: TABLE_CENTER_X,
    y: TABLE_TOP_Y - BOTTLE_HEIGHT - 0.02,
    angle: Math.PI,
  };
  const first = await land(page, onCap);
  expect(first.outcome).toMatchObject({ result: 'success', reason: 'cap', points: 1 });
  expect(first.score).toBe(1);
  expect(messagesIn(await visibleTexts(page))).toEqual(['Cap landing! +1']);
  expect((await visibleFlash(page))?.color).toBe(COLORS.successFlash);

  await page.evaluate(() => window.__FLIPPER__!.skip());
  const second = await land(page, { ...onCap, turns: 2 });
  // After full turns the cap scores a flat 5 (F051), not its turns.
  expect(second.outcome).toMatchObject({ result: 'success', reason: 'cap', turns: 2, points: 5 });
  expect(second.score).toBe(6);
  expect(messagesIn(await visibleTexts(page))).toEqual(['Cap landing! +5']);
  expect(errors).toEqual([]);
});

test('a landing on its side still shows "Down!" with the red flash, even with turns', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  const decided = await land(page, { ...SIDE, turns: 2 });
  expect(decided.outcome).toMatchObject({ result: 'fail', reason: 'side', points: 0 });
  expect(decided.score).toBe(0);

  const texts = await visibleTexts(page);
  expect(messagesIn(texts)).toEqual(['Down!']);
  expect(texts).toContain('Score: 0');
  expect((await visibleFlash(page))?.color).toBe(COLORS.failFlash);
  expect(errors).toEqual([]);
});

test('upright landings with 1 and 2 turns show "Nailed it! +1" and "Double! +2" and raise the score by 1 and 2', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');

  const single = await land(page, flipped(1));
  expect(single.outcome).toMatchObject({ result: 'success', turns: 1, points: 1 });
  expect(single.score).toBe(1);
  let texts = await visibleTexts(page);
  expect(messagesIn(texts)).toEqual(['Nailed it! +1']);
  expect(texts).toContain('Score: 1');
  expect((await visibleFlash(page))?.color).toBe(COLORS.successFlash);

  await page.evaluate(() => window.__FLIPPER__!.skip());
  const double = await land(page, flipped(2));
  expect(double.outcome).toMatchObject({ result: 'success', turns: 2, points: 2 });
  expect(double.score).toBe(3); // 1 + 2
  texts = await visibleTexts(page);
  expect(messagesIn(texts)).toEqual(['Double! +2']);
  expect(texts).toContain('Score: 3');
  expect((await visibleFlash(page))?.color).toBe(COLORS.successFlash);
  expect(errors).toEqual([]);
});

test('three and more turns show "Triple! +3" and "Flip ×N! +N", and score N', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  let score = 0;
  for (const [turns, message] of [
    [3, 'Triple! +3'],
    [4, 'Flip ×4! +4'],
    [6, 'Flip ×6! +6'],
  ] as const) {
    const decided = await land(page, flipped(turns));
    score += turns;
    expect(decided.outcome).toMatchObject({ result: 'success', turns, points: turns });
    expect(decided.score).toBe(score);
    const texts = await visibleTexts(page);
    expect(messagesIn(texts)).toEqual([message]);
    expect(texts).toContain(`Score: ${score}`);
    await page.evaluate(() => window.__FLIPPER__!.skip());
  }
  expect(errors).toEqual([]);
});

test('a real throw lands by the same rules: its message and score follow its turns', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());
  await page.evaluate(() => window.__FLIPPER__!.throwBottle(80));
  const decided = await stepUntilOutcome(page);
  const { result, reason, turns, points } = decided.outcome!;

  // A real throw has no credit: its points are its own turns, and 0 turns can never land upright.
  // On the cap it scores a flat 5, or 1 for a tip-over with no full turn (F051).
  if (reason === 'cap') {
    expect(points).toBe(turns === 0 ? 1 : 5);
  } else {
    expect(points).toBe(result === 'success' ? turns : 0);
    if (result === 'success') expect(turns).toBeGreaterThanOrEqual(1);
  }
  expect(decided.score).toBe(points);
  const texts = await visibleTexts(page);
  expect(messagesIn(texts)).toHaveLength(1);
  if (result === 'success') expect(messagesIn(texts)[0]).toMatch(new RegExp(`\\+${points}$`));
  else expect(messagesIn(texts)).toEqual([reason === 'noFlip' ? 'No flip!' : 'Down!']);
  expect(errors).toEqual([]);
});

test('a power-0 throw is a plain drop: "No flip!", not a point', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());
  await page.evaluate(() => window.__FLIPPER__!.throwBottle(0));
  const decided = await stepUntilOutcome(page);
  expect(decided.outcome).toMatchObject({ result: 'fail', reason: 'noFlip', turns: 0, points: 0 });
  expect(decided.score).toBe(0);
  expect(messagesIn(await visibleTexts(page))).toEqual(['No flip!']);
  expect(errors).toEqual([]);
});
