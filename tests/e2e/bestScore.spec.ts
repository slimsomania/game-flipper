import { expect, test, type Page } from '@playwright/test';
import { SIDE, flipped, type PlacedPose } from '../shared';
import { openGame } from './helpers';
import { activeScenes, next, playThrows } from './roundHelpers';
import { POINTS, ROUND, expectBackInGame, playToSummary } from './summaryHelpers';

/*
 * The best round score: kept in one versioned localStorage entry, shown on the summary as "Best: N"
 * with "New best!" when the round beat the saved best. Rounds here are short (`throwsPerRound` is
 * set to the number of bottles thrown) so a test can play several of them; the full 10-throw round
 * has its own test.
 */

const SAVE_KEY = 'flipper.save.v1';

/** What is stored under the save key, parsed, or null when there is no entry. */
async function savedEntry(page: Page): Promise<unknown> {
  const text = await page.evaluate((key) => window.localStorage.getItem(key), SAVE_KEY);
  return text === null ? null : JSON.parse(text);
}

/** Play a round made of one throw per pose, and stop with the round summary open. */
async function playRound(page: Page, poses: readonly PlacedPose[]): Promise<void> {
  await page.evaluate((n) => window.__FLIPPER__!.setTuningValue('throwsPerRound', n), poses.length);
  await playThrows(page, poses);
  await next(page);
  await expect.poll(() => activeScenes(page)).toEqual(['Summary']);
}

/** Leave the summary with Enter (Play again). */
async function playAgain(page: Page): Promise<void> {
  await page.keyboard.press('Enter');
  await expectBackInGame(page);
}

/** Visit the page again: a new game in the same browser, with the same localStorage. */
async function reload(page: Page): Promise<void> {
  await page.reload();
  await page.waitForFunction(() => window.__FLIPPER__?.ready === true);
}

/** Wait for the summary's text, then check its score and best lines and whether "New best!" is shown. */
async function expectSummary(
  page: Page,
  expected: { score: number; best: number; newBest: boolean },
): Promise<void> {
  const texts = () => page.evaluate(() => window.__FLIPPER__!.texts());
  await expect.poll(texts).toContain('Round over');
  const shown = await texts();
  expect(shown.filter((text) => text.startsWith('Score: '))).toEqual([`Score: ${expected.score}`]);
  expect(shown.filter((text) => text.startsWith('Best: '))).toEqual([`Best: ${expected.best}`]);
  expect(shown.filter((text) => text === 'New best!')).toEqual(
    expected.newBest ? ['New best!'] : [],
  );
}

test('a first round that scores 3 points shows Best: 3 and New best!', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  await playRound(page, [flipped(3)]);

  await expectSummary(page, { score: 3, best: 3, newBest: true });
  expect(errors).toEqual([]);
});

test('the best score is stored under the versioned localStorage key', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  expect(await savedEntry(page)).toBeNull();

  await playRound(page, [flipped(3)]);

  expect(await savedEntry(page)).toEqual({ version: 1, best: 3 });
  // One entry for the save, and it is the versioned one.
  const keys = await page.evaluate(() => Object.keys(window.localStorage));
  expect(keys.filter((key) => key.startsWith('flipper.save'))).toEqual([SAVE_KEY]);
  expect(errors).toEqual([]);
});

test('the best score carries over a reload: 3, then 2 (no new best), then 12 (new best)', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await playRound(page, [flipped(3)]);
  await expectSummary(page, { score: 3, best: 3, newBest: true });

  // A new visit: the saved best is still 3, and a round of 2 points doesn't beat it.
  await reload(page);
  await playRound(page, [flipped(2)]);
  await expectSummary(page, { score: 2, best: 3, newBest: false });
  expect(await savedEntry(page)).toEqual({ version: 1, best: 3 });

  // Play again in the same visit: a round of 12 points (six doubles) beats it.
  await playAgain(page);
  await playRound(page, Array(6).fill(flipped(2)));
  await expectSummary(page, { score: 12, best: 12, newBest: true });
  expect(await savedEntry(page)).toEqual({ version: 1, best: 12 });

  // And the new best is the one a later visit starts from.
  await reload(page);
  await playRound(page, [flipped(1)]);
  await expectSummary(page, { score: 1, best: 12, newBest: false });
  expect(errors).toEqual([]);
});

test('a round that only ties the best is not a new best', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  await playRound(page, [flipped(3)]);
  await expectSummary(page, { score: 3, best: 3, newBest: true });

  await playAgain(page);
  await playRound(page, [flipped(3)]);
  await expectSummary(page, { score: 3, best: 3, newBest: false });
  expect(errors).toEqual([]);
});

test('a round with no points is no new best, even with no saved best', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  await playRound(page, [SIDE, SIDE]);

  await expectSummary(page, { score: 0, best: 0, newBest: false });
  expect(errors).toEqual([]);
});

test('a full 10-throw round saves its points as the best', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  await playToSummary(page);

  expect(ROUND).toHaveLength(10);
  await expectSummary(page, { score: POINTS, best: POINTS, newBest: true });
  expect(await savedEntry(page)).toEqual({ version: 1, best: POINTS });
  expect(errors).toEqual([]);
});

test('a damaged save is ignored and then replaced', async ({ page }) => {
  await page.addInitScript((key) => {
    if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, '{"version":1,"best":');
  }, SAVE_KEY);
  const errors = await openGame(page, '?seed=7');

  await playRound(page, [flipped(1)]);
  await expectSummary(page, { score: 1, best: 1, newBest: true });
  expect(await savedEntry(page)).toEqual({ version: 1, best: 1 });
  expect(errors).toEqual([]);
});

test('a save for another version is ignored', async ({ page }) => {
  await page.addInitScript((key) => {
    if (!window.localStorage.getItem(key)) {
      window.localStorage.setItem(key, JSON.stringify({ version: 2, best: 50 }));
    }
  }, SAVE_KEY);
  const errors = await openGame(page, '?seed=7');

  await playRound(page, [flipped(2)]);
  await expectSummary(page, { score: 2, best: 2, newBest: true });
  expect(errors).toEqual([]);
});

test('with localStorage blocked the game still plays and keeps the best for the visit', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    Storage.prototype.getItem = blocked;
    Storage.prototype.setItem = blocked;
    Storage.prototype.removeItem = blocked;
  });
  const errors = await openGame(page, '?seed=7');

  await playRound(page, [flipped(3)]);
  await expectSummary(page, { score: 3, best: 3, newBest: true });

  await playAgain(page);
  await playRound(page, [flipped(2)]);
  await expectSummary(page, { score: 2, best: 3, newBest: false });
  expect(errors).toEqual([]);
});
